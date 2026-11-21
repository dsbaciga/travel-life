import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { convertDecimals } from './_shared/decimalConversion';
import {
  OWNER_KEY,
  ShareEntry,
  SettleUpExpense,
  companionKey,
  compareKeys,
  computeSettleUp,
  roundMoney,
  splitByPercentage,
  splitEqually,
  sharesSumTo,
} from './_shared/settleUp';
import { payerKey, splitRowKey, withSplitFields } from './_shared/expenseSplitFields';
import { ensureOwnerCompanionId, findOwnerCompanionId } from './_shared/ownerCompanion';
import expenseService from './expense.service';
import {
  ExpenseParticipant,
  SetExpenseSplitInput,
  SettleUpSummary,
} from '../types/expenseSplit.types';

const toNumber = (value: Prisma.Decimal): number => roundMoney(value).toNumber();

/** Parses `owner` / `companion:<id>` into a companion id (null for the owner). */
function companionIdOf(key: string): number | null {
  return key === OWNER_KEY ? null : Number(key.slice('companion:'.length));
}

/**
 * Participant keys are `owner` or `companion:<id>`. In storage the owner is the TRIP OWNER's
 * "myself" companion, so a key resolves to a companion id (creating that companion on demand).
 */
function companionResolver(tx: Parameters<typeof ensureOwnerCompanionId>[0], ownerId: number) {
  let ownerCompanionId: number | null = null;
  return async (key: string): Promise<number> => {
    const id = companionIdOf(key);
    if (id !== null) return id;
    ownerCompanionId ??= await ensureOwnerCompanionId(tx, ownerId);
    return ownerCompanionId;
  };
}

class ExpenseSplitService {
  /**
   * Everyone an expense can be paid by or shared with: the trip owner plus the
   * companions linked to the trip. The owner's own "myself" companion (`isMyself`)
   * is left out: it is the `owner` entry, so it never appears twice (whether or not
   * it is assigned to the trip).
   */
  async getParticipants(userId: number, tripId: number): Promise<ExpenseParticipant[]> {
    const access = await verifyTripAccessWithPermission(userId, tripId, 'view');
    return this.loadParticipants(tripId, access.trip.userId);
  }

  /** Sets (or clears) who paid an expense and how it is split. */
  async setSplit(userId: number, tripId: number, expenseId: number, input: SetExpenseSplitInput) {
    const access = await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const expense = await prisma.tripExpense.findFirst({ where: { id: expenseId, tripId } });
    if (!expense) {
      throw new AppError('Expense not found or does not belong to trip', 404);
    }

    if (input.paidBy === null) {
      await prisma.$transaction([
        prisma.tripExpenseSplit.deleteMany({ where: { expenseId } }),
        prisma.tripExpense.update({
          where: { id: expenseId },
          data: { paidByCompanionId: null, splitMethod: null },
        }),
      ]);
      return this.loadExpense(expenseId, access.trip.userId);
    }

    const method = input.method;
    const participants = input.participants ?? [];
    if (!method) throw new AppError('A split method is required when a payer is set', 400);
    if (participants.length === 0) {
      throw new AppError('Choose at least one person to split the expense with', 400);
    }

    const keys = participants.map((p) => p.participant);
    if (new Set(keys).size !== keys.length) {
      throw new AppError('A person can only appear once in a split', 400);
    }

    const allowed = new Set(
      (await this.loadParticipants(tripId, access.trip.userId)).map((p) => p.key)
    );
    for (const key of [input.paidBy, ...keys]) {
      if (!allowed.has(key)) {
        throw new AppError('Everyone in a split must be the trip owner or a companion on this trip', 400);
      }
    }

    const shares = this.computeShares(method, expense.amount, participants);
    const percentageByKey = new Map(
      participants.map((p) => [p.participant, p.percentage ?? null])
    );

    // The owner's "myself" companion is created here when the owner has none yet, in the same
    // transaction as the split itself.
    await prisma.$transaction(async (tx) => {
      const resolve = companionResolver(tx, access.trip.userId);
      const paidByCompanionId = await resolve(input.paidBy as string);
      const splitRows: Prisma.TripExpenseSplitUncheckedCreateWithoutExpenseInput[] = [];
      for (const share of shares) {
        const percentage = percentageByKey.get(share.participant);
        splitRows.push({
          companionId: await resolve(share.participant),
          amount: share.amount,
          percentage:
            method === 'percentage' && percentage != null ? new Prisma.Decimal(percentage) : null,
        });
      }
      await tx.tripExpenseSplit.deleteMany({ where: { expenseId } });
      await tx.tripExpense.update({
        where: { id: expenseId },
        data: { paidByCompanionId, splitMethod: method, splits: { create: splitRows } },
      });
    });

    return this.loadExpense(expenseId, access.trip.userId);
  }

  /**
   * Who owes whom across the trip, in the reporting currency of the budget
   * summary. Expenses that could not be converted are excluded and reported.
   */
  async getSettleUp(userId: number, tripId: number): Promise<SettleUpSummary> {
    const access = await verifyTripAccessWithPermission(userId, tripId, 'view');

    // The summary decides the reporting currency (and lazily backfills missing FX
    // snapshots), so settle-up always agrees with the totals shown beside it.
    const summary = await expenseService.getBudgetSummary(userId, tripId);
    const currency = summary.currency;

    const rows = await prisma.tripExpense.findMany({
      where: { tripId },
      include: { splits: true },
      orderBy: [{ date: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });

    const ownerCompanionId = await findOwnerCompanionId(prisma, access.trip.userId);
    const participants = await this.loadParticipants(tripId, access.trip.userId);
    const labels = new Map(participants.map((p) => [p.key, p.label]));
    const descriptions = new Map(rows.map((r) => [r.id, r.description]));

    const expenses: SettleUpExpense[] = [];
    for (const row of rows) {
      const paidBy = payerKey(row, ownerCompanionId);
      const shares: ShareEntry[] = row.splits.map((s) => ({
        participant: splitRowKey(s, ownerCompanionId),
        amount: s.amount,
      }));

      // Only convert expenses that will actually take part; the rest are reported as unsplit.
      const participates = paidBy !== null && shares.length > 0 && sharesSumTo(row.amount, shares);
      const baseAmount = participates
        ? await expenseService.resolveExpenseBaseAmount(row, currency)
        : null;

      expenses.push({
        id: row.id,
        amount: row.amount,
        currency: row.currency,
        baseAmount,
        paidBy,
        shares,
      });
    }

    const result = computeSettleUp(expenses);

    // A companion unlinked from the trip after being used in a split still has a name.
    const unknownIds = result.balances
      .map((b) => b.participant)
      .filter((key) => !labels.has(key))
      .map(companionIdOf)
      .filter((id): id is number => id !== null);
    if (unknownIds.length > 0) {
      const named = await prisma.travelCompanion.findMany({
        where: { id: { in: unknownIds } },
        select: { id: true, name: true },
      });
      for (const c of named) labels.set(companionKey(c.id), c.name);
    }
    const labelOf = (key: string) => labels.get(key) ?? this.fallbackLabel(key);
    const ref = (id: number) => ({ expenseId: id, description: descriptions.get(id) ?? '' });

    return {
      currency,
      balances: result.balances.map((b) => ({
        participant: b.participant,
        label: labelOf(b.participant),
        paid: toNumber(b.paid),
        owed: toNumber(b.owed),
        net: toNumber(b.net),
      })),
      transfers: result.transfers.map((t) => ({
        from: t.from,
        fromLabel: labelOf(t.from),
        to: t.to,
        toLabel: labelOf(t.to),
        amount: toNumber(t.amount),
      })),
      unconverted: result.unconverted.map((u) => ({
        ...ref(u.expenseId),
        currency: u.currency,
        amount: toNumber(u.amount),
      })),
      unsplit: result.unsplitExpenseIds.map(ref),
      isComplete: result.unconverted.length === 0 && result.unsplitExpenseIds.length === 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private computeShares(
    method: NonNullable<SetExpenseSplitInput['method']>,
    amount: Prisma.Decimal,
    participants: NonNullable<SetExpenseSplitInput['participants']>
  ): ShareEntry[] {
    const keys = participants.map((p) => p.participant);

    if (method === 'equal') {
      return splitEqually(amount, keys);
    }

    if (method === 'percentage') {
      if (participants.some((p) => p.percentage === undefined)) {
        throw new AppError('Every person needs a percentage', 400);
      }
      try {
        return splitByPercentage(
          amount,
          participants.map((p) => ({
            participant: p.participant,
            percentage: new Prisma.Decimal(p.percentage ?? 0),
          }))
        );
      } catch (error) {
        if (error instanceof RangeError) throw new AppError(error.message, 400);
        throw error;
      }
    }

    if (participants.some((p) => p.amount === undefined)) {
      throw new AppError('Every person needs an amount', 400);
    }
    const shares = participants
      .map((p) => ({
        participant: p.participant,
        amount: new Prisma.Decimal(p.amount ?? 0).toDecimalPlaces(2),
      }))
      .sort((a, b) => compareKeys(a.participant, b.participant));
    if (!sharesSumTo(amount, shares)) {
      throw new AppError('The amounts must add up to the expense total', 400);
    }
    return shares;
  }

  private async loadExpense(expenseId: number, ownerId: number) {
    const expense = await prisma.tripExpense.findUniqueOrThrow({
      where: { id: expenseId },
      include: { splits: { orderBy: { id: 'asc' } } },
    });
    return convertDecimals(withSplitFields(expense, await findOwnerCompanionId(prisma, ownerId)));
  }

  private fallbackLabel(key: string): string {
    return key === OWNER_KEY ? 'Trip owner' : `Former companion #${companionIdOf(key)}`;
  }

  private async loadParticipants(tripId: number, ownerId: number): Promise<ExpenseParticipant[]> {
    const [owner, links] = await Promise.all([
      prisma.user.findUnique({ where: { id: ownerId }, select: { username: true } }),
      prisma.tripCompanion.findMany({
        where: { tripId, companion: { isMyself: false } },
        select: { companion: { select: { id: true, name: true } } },
        orderBy: { id: 'asc' },
      }),
    ]);

    return [
      { key: OWNER_KEY, label: owner?.username ?? 'Trip owner', kind: 'owner' },
      ...links.map(
        (link): ExpenseParticipant => ({
          key: companionKey(link.companion.id),
          label: link.companion.name,
          kind: 'companion',
        })
      ),
    ];
  }
}

export default new ExpenseSplitService();
