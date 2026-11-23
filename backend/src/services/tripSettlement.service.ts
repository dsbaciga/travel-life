import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { SettlementPayment, roundMoney } from './_shared/settleUp';
import { participantKey } from './_shared/expenseSplitFields';
import { ensureOwnerCompanionId, findOwnerCompanionId } from './_shared/ownerCompanion';
import { companionIdOf, loadTripParticipants, participantLabels } from './_shared/tripParticipants';
import { tripDateTransformer } from './_shared/prismaUpdateData';
import exchangeRateService, { normalizeCurrency } from './exchangeRate.service';
import {
  CreateSettlementInput,
  TripSettlementDto,
  UpdateSettlementInput,
} from '../types/tripSettlement.types';

type SettlementRow = Prisma.TripSettlementGetPayload<Record<string, never>>;

const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Settlement payments: money one person paid another to settle up a trip's split expenses.
 * People are `owner` / `companion:<id>` keys on the API and companion rows in storage (the trip
 * owner is their "myself" companion), exactly as in expense splits. Settle-up itself lives in
 * expenseSplit.service.ts and reads these through `loadForSettleUp`.
 */
class TripSettlementService {
  async list(userId: number, tripId: number): Promise<TripSettlementDto[]> {
    const access = await verifyTripAccessWithPermission(userId, tripId, 'view');
    const rows = await prisma.tripSettlement.findMany({
      where: { tripId },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    return this.toDtos(rows, tripId, access.trip.userId);
  }

  async create(userId: number, tripId: number, input: CreateSettlementInput) {
    const access = await verifyTripAccessWithPermission(userId, tripId, 'edit');
    this.assertDistinct(input.from, input.to);
    await this.assertOnTrip(tripId, access.trip.userId, [input.from, input.to]);

    const row = await prisma.$transaction(async (tx) => {
      const resolve = this.resolver(tx, access.trip.userId);
      return tx.tripSettlement.create({
        data: {
          tripId,
          fromCompanionId: await resolve(input.from),
          toCompanionId: await resolve(input.to),
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency.toUpperCase(),
          date: tripDateTransformer(input.date) as Date,
          notes: input.notes?.trim() || null,
        },
      });
    });
    return (await this.toDtos([row], tripId, access.trip.userId))[0];
  }

  async update(userId: number, tripId: number, id: number, input: UpdateSettlementInput) {
    const access = await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const existing = await this.findInTrip(id, tripId);
    const ownerCompanionId = await findOwnerCompanionId(prisma, access.trip.userId);

    const currentFrom = participantKey(existing.fromCompanionId, ownerCompanionId);
    const currentTo = participantKey(existing.toCompanionId, ownerCompanionId);
    const from = input.from ?? currentFrom;
    const to = input.to ?? currentTo;
    this.assertDistinct(from, to);
    // Only a person who is being newly chosen has to still be on the trip: a payment whose
    // companion has since left the trip can still have its amount, date or note corrected.
    const changed = [from, to].filter((key) => key !== currentFrom && key !== currentTo);
    await this.assertOnTrip(tripId, access.trip.userId, changed);

    const row = await prisma.$transaction(async (tx) => {
      const resolve = this.resolver(tx, access.trip.userId);
      return tx.tripSettlement.update({
        where: { id },
        data: {
          ...(input.from !== undefined ? { fromCompanionId: await resolve(from) } : {}),
          ...(input.to !== undefined ? { toCompanionId: await resolve(to) } : {}),
          ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
          ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
          ...(input.date !== undefined ? { date: tripDateTransformer(input.date) as Date } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        },
      });
    });
    return (await this.toDtos([row], tripId, access.trip.userId))[0];
  }

  async remove(userId: number, tripId: number, id: number): Promise<void> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await this.findInTrip(id, tripId);
    await prisma.tripSettlement.delete({ where: { id } });
  }

  /**
   * The trip's settlements in settle-up's currency. A payment in another currency is converted at
   * its own date's rate like an expense; one with no available rate comes back with a null
   * `baseAmount` so settle-up lists it instead of guessing.
   */
  async loadForSettleUp(
    tripId: number,
    ownerCompanionId: number | null,
    reportingCurrency: string
  ): Promise<Array<SettlementPayment & { amount: Prisma.Decimal; currency: string }>> {
    const rows = await prisma.tripSettlement.findMany({
      where: { tripId },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const payments: Array<SettlementPayment & { amount: Prisma.Decimal; currency: string }> = [];
    for (const row of rows) {
      payments.push({
        id: row.id,
        from: participantKey(row.fromCompanionId, ownerCompanionId),
        to: participantKey(row.toCompanionId, ownerCompanionId),
        baseAmount: await this.toBaseAmount(row, reportingCurrency),
        amount: row.amount,
        currency: row.currency,
      });
    }
    return payments;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async toBaseAmount(row: SettlementRow, reportingCurrency: string) {
    const currency = normalizeCurrency(row.currency);
    if (!currency || currency === reportingCurrency) return roundMoney(row.amount);
    const conversion = await exchangeRateService.convert(
      row.amount,
      currency,
      reportingCurrency,
      row.date
    );
    return conversion ? roundMoney(conversion.baseAmount) : null;
  }

  private assertDistinct(from: string, to: string) {
    if (from === to) throw new AppError('A payment needs two different people', 400);
  }

  private async assertOnTrip(tripId: number, ownerId: number, keys: string[]) {
    if (keys.length === 0) return;
    const allowed = new Set((await loadTripParticipants(tripId, ownerId)).map((p) => p.key));
    for (const key of keys) {
      if (!allowed.has(key)) {
        throw new AppError('Both people must be the trip owner or a companion on this trip', 400);
      }
    }
  }

  private async findInTrip(id: number, tripId: number) {
    const row = await prisma.tripSettlement.findFirst({ where: { id, tripId } });
    if (!row) throw new AppError("We couldn't find that payment on this trip.", 404);
    return row;
  }

  /** Resolves a participant key to a companion id, creating the owner's "myself" companion on demand. */
  private resolver(tx: Parameters<typeof ensureOwnerCompanionId>[0], ownerId: number) {
    let ownerCompanionId: number | null = null;
    return async (key: string): Promise<number> => {
      const id = companionIdOf(key);
      if (id !== null) return id;
      ownerCompanionId ??= await ensureOwnerCompanionId(tx, ownerId);
      return ownerCompanionId;
    };
  }

  private async toDtos(
    rows: SettlementRow[],
    tripId: number,
    ownerId: number
  ): Promise<TripSettlementDto[]> {
    const ownerCompanionId = await findOwnerCompanionId(prisma, ownerId);
    const keyed = rows.map((row) => ({
      row,
      from: participantKey(row.fromCompanionId, ownerCompanionId),
      to: participantKey(row.toCompanionId, ownerCompanionId),
    }));
    const labelOf = await participantLabels(
      tripId,
      ownerId,
      keyed.flatMap((k) => [k.from, k.to])
    );
    return keyed.map(({ row, from, to }) => ({
      id: row.id,
      tripId: row.tripId,
      from,
      fromLabel: labelOf(from),
      to,
      toLabel: labelOf(to),
      amount: roundMoney(row.amount).toNumber(),
      currency: row.currency,
      date: dateOnly(row.date),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}

export default new TripSettlementService();
