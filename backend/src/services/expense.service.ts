import prisma from '../config/database';
import { AppError } from '../errors/errors';
import {
  CreateExpenseInput,
  UpdateExpenseInput,
  BudgetSummary,
  BudgetConversionInfo,
  UnconvertedAmount,
} from '../types/expense.types';
import { verifyTripAccessWithPermission } from '../services/_shared/tripAccess';
import { tripDateTransformer } from '../services/_shared/prismaUpdateData';
import { convertDecimals } from '../services/_shared/decimalConversion';
import { withSplitFields } from '../services/_shared/expenseSplitFields';
import { findOwnerCompanionId } from '../services/_shared/ownerCompanion';
import { rescaleExpenseSplits } from '../services/_shared/expenseRescale';
import { expenseLinkedEntityInclude, touchLinkedBooking } from '../services/_shared/bookingCost';
import exchangeRateService, { normalizeCurrency } from './exchangeRate.service';
import { Prisma } from '@prisma/client';
import { deleteReceiptFiles } from './expenseReceipt.service';

/** Buckets the budget summary reports spending under. */
type BudgetBucket = 'lodging' | 'transportation' | 'activities' | 'food' | 'other';

/** The FX snapshot frozen onto a costed record. */
interface FxSnapshot {
  exchangeRate: Prisma.Decimal | null;
  baseAmount: Prisma.Decimal | null;
  baseCurrency: string | null;
}

/** A costed record normalised across the four tables that hold one. */
interface CostedRecord {
  id: number;
  bucket: BudgetBucket;
  amount: Prisma.Decimal;
  currency: string | null;
  exchangeRate: Prisma.Decimal | null;
  baseAmount: Prisma.Decimal | null;
  baseCurrency: string | null;
  /** The date the money was spent, used to pick the historical rate. */
  date: Date | null;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Verifies the expense exists and belongs to the given trip.
 * (TripExpense is not part of the generic VerifiableEntityType helpers,
 * so ownership is checked against the trip directly.)
 */
async function verifyExpenseInTrip(expenseId: number, tripId: number) {
  const expense = await prisma.tripExpense.findFirst({
    where: { id: expenseId, tripId },
  });

  if (!expense) {
    throw new AppError('Expense not found or does not belong to trip', 404);
  }

  return expense;
}

/**
 * The reporting currency as explicitly CONFIGURED, or null if it was never set.
 *
 * The trip OWNER's home currency wins, not the requesting user's: expenses
 * belong to the trip, and their FX snapshots are frozen against one currency.
 * Letting each collaborator impose their own would make every read invalidate
 * and rewrite the snapshots.
 */
async function resolveConfiguredCurrency(
  ownerId: number,
  budgetCurrency: string | null
): Promise<string | null> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { baseCurrency: true },
  });

  return normalizeCurrency(owner?.baseCurrency ?? null) ?? normalizeCurrency(budgetCurrency);
}

/**
 * Resolves which currency a trip's totals should be reported in.
 *
 * Prefers the configured currency; with nothing configured it infers the most
 * common currency among the costed records, and only then falls back to USD.
 */
async function resolveReportingCurrency(
  ownerId: number,
  budgetCurrency: string | null,
  records: CostedRecord[]
): Promise<string> {
  const configured = await resolveConfiguredCurrency(ownerId, budgetCurrency);
  if (configured) return configured;

  const counts = new Map<string, number>();
  for (const record of records) {
    const code = normalizeCurrency(record.currency);
    if (code) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  let mostCommon: string | null = null;
  let mostCommonCount = 0;
  for (const [code, count] of counts) {
    if (count > mostCommonCount) {
      mostCommon = code;
      mostCommonCount = count;
    }
  }

  return mostCommon ?? 'USD';
}

/** Routes an expense category to its budget bucket. */
function bucketForCategory(category: string): BudgetBucket {
  if (
    category === 'lodging' ||
    category === 'transportation' ||
    category === 'activities' ||
    category === 'food'
  ) {
    return category;
  }
  return 'other';
}

/** Rounds a Decimal total to cents and hands it back as a JSON-safe number. */
function toMoneyNumber(value: Prisma.Decimal): number {
  return value.toDecimalPlaces(2).toNumber();
}

class ExpenseService {
  async createExpense(userId: number, tripId: number, data: CreateExpenseInput) {
    // Verify user has edit permission on the trip
    const access = await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const date = data.date ? tripDateTransformer(data.date) : null;
    const snapshot = await this.buildSnapshot(
      access.trip.userId,
      tripId,
      data.amount,
      data.currency ?? null,
      date
    );

    const expense = await prisma.tripExpense.create({
      data: {
        tripId,
        description: data.description,
        category: data.category,
        amount: data.amount,
        currency: data.currency || null,
        date,
        notes: data.notes || null,
        exchangeRate: snapshot.exchangeRate,
        baseAmount: snapshot.baseAmount,
        baseCurrency: snapshot.baseCurrency,
      },
    });

    return convertDecimals(
      withSplitFields(expense, await findOwnerCompanionId(prisma, access.trip.userId))
    );
  }

  async getExpensesByTrip(userId: number, tripId: number) {
    // Verify user has view permission on the trip
    const access = await verifyTripAccessWithPermission(userId, tripId, 'view');

    const expenses = await prisma.tripExpense.findMany({
      where: { tripId },
      orderBy: [{ date: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: { splits: { orderBy: { id: 'asc' } }, ...expenseLinkedEntityInclude },
    });

    const ownerCompanionId = await findOwnerCompanionId(prisma, access.trip.userId);
    return convertDecimals(expenses.map((expense) => withSplitFields(expense, ownerCompanionId)));
  }

  async getExpenseById(userId: number, tripId: number, expenseId: number) {
    // Verify user has view permission on the trip
    const access = await verifyTripAccessWithPermission(userId, tripId, 'view');

    await verifyExpenseInTrip(expenseId, tripId);
    const expense = await prisma.tripExpense.findUniqueOrThrow({
      where: { id: expenseId },
      include: { splits: { orderBy: { id: 'asc' } }, ...expenseLinkedEntityInclude },
    });

    return convertDecimals(
      withSplitFields(expense, await findOwnerCompanionId(prisma, access.trip.userId))
    );
  }

  async updateExpense(
    userId: number,
    tripId: number,
    expenseId: number,
    data: UpdateExpenseInput
  ) {
    // Verify user has edit permission on the trip
    const access = await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const existing = await verifyExpenseInTrip(expenseId, tripId);

    // Build the update object field-by-field so it satisfies Prisma's types
    // directly (only defined fields are applied; description is required in
    // the DB so a null/empty value is ignored rather than clearing it)
    const updateData: Prisma.TripExpenseUncheckedUpdateInput = {};
    if (data.description) {
      updateData.description = data.description;
    }
    if (data.category !== undefined) {
      updateData.category = data.category;
    }
    if (data.amount !== undefined) {
      updateData.amount = data.amount;
    }
    if (data.currency !== undefined) {
      updateData.currency = data.currency || null;
    }
    if (data.date !== undefined) {
      updateData.date = data.date ? tripDateTransformer(data.date) : null;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes || null;
    }

    // The snapshot describes a specific (amount, currency, date) triple. If any
    // of those changed this is a NEW transaction to convert, not a retroactive
    // recompute of an unchanged one — so re-snapshot. Otherwise leave the
    // frozen rate exactly as it is.
    const amountChanged = data.amount !== undefined && data.amount !== Number(existing.amount);
    const currencyChanged =
      data.currency !== undefined && (data.currency || null) !== existing.currency;
    const nextDate =
      data.date !== undefined
        ? data.date
          ? tripDateTransformer(data.date)
          : null
        : existing.date;
    const dateChanged =
      data.date !== undefined && (nextDate?.getTime() ?? null) !== (existing.date?.getTime() ?? null);

    if (amountChanged || currencyChanged || dateChanged) {
      const snapshot = await this.buildSnapshot(
        access.trip.userId,
        tripId,
        data.amount ?? Number(existing.amount),
        data.currency !== undefined ? data.currency ?? null : existing.currency,
        nextDate
      );
      updateData.exchangeRate = snapshot.exchangeRate;
      updateData.baseAmount = snapshot.baseAmount;
      updateData.baseCurrency = snapshot.baseCurrency;
    }

    const updatedExpense = await prisma.tripExpense.update({
      where: { id: expenseId },
      data: updateData,
      include: { splits: { orderBy: { id: 'asc' } }, ...expenseLinkedEntityInclude },
    });
    // A booking's cost is this row: tell delta sync the booking changed too.
    if (amountChanged || currencyChanged || dateChanged || data.description) {
      await touchLinkedBooking(prisma, updatedExpense);
    }

    // Shares are stored in the expense's own currency and must keep summing to the
    // amount, so a new amount re-scales them (proportionally; odd cents land on the
    // largest share). The response then carries the re-scaled shares, as a GET would.
    const ownerCompanionId = await findOwnerCompanionId(prisma, access.trip.userId);
    if (amountChanged) {
      await rescaleExpenseSplits(prisma, expenseId, updatedExpense.amount, ownerCompanionId);
      updatedExpense.splits = await prisma.tripExpenseSplit.findMany({
        where: { expenseId },
        orderBy: { id: 'asc' },
      });
    }

    return convertDecimals(withSplitFields(updatedExpense, ownerCompanionId));
  }

  async deleteExpense(userId: number, tripId: number, expenseId: number) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const expense = await verifyExpenseInTrip(expenseId, tripId);

    // Deleting a booking's cost row clears the booking's cost (same row): the booking itself stays,
    // and delta sync is told it changed.
    if (expense.activityId || expense.transportationId || expense.lodgingId || expense.customItemId) {
      await prisma.$transaction(async (tx) => {
        await tx.tripExpense.delete({ where: { id: expenseId } });
        await touchLinkedBooking(tx, expense);
      });
    } else {
      await prisma.tripExpense.delete({ where: { id: expenseId } });
    }
    // The row is gone; remove its receipt photo too (failures are logged, never thrown).
    await deleteReceiptFiles([expense.receiptPath]);

    return { success: true };
  }

  /**
   * Computes the budget summary for a trip.
   *
   * Breakdown buckets:
   * - lodging / transportation / activities: expenses of that category (a booking's own
   *   cost is one of them: its linked expense row)
   * - food: expenses with category 'food'
   * - other: all remaining expense categories (shopping, other)
   *
   * Currency handling: every costed record is converted into a single
   * reporting currency (the trip owner's `baseCurrency`, else the trip's
   * `budgetCurrency`, else the most common currency among the records, else
   * USD) using the FX rate frozen at the record's own date. Records created
   * before conversion existed are filled in lazily here — the rate is fetched
   * once, written back to the record, and reported as `estimated`. Records for
   * which no rate can be obtained are EXCLUDED from `spent` and listed under
   * `conversion.unconverted`; they are never summed at face value alongside a
   * different currency.
   */
  async getBudgetSummary(userId: number, tripId: number): Promise<BudgetSummary> {
    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    // Every cost, including a booking's, is a trip expense (Step D): one table, one query.
    const [trip, expenses] = await Promise.all([
      prisma.trip.findUnique({
        where: { id: tripId },
        select: { userId: true, budget: true, budgetCurrency: true },
      }),
      prisma.tripExpense.findMany({
        where: { tripId },
        select: {
          id: true,
          amount: true,
          currency: true,
          exchangeRate: true,
          baseAmount: true,
          baseCurrency: true,
          category: true,
          date: true,
        },
      }),
    ]);

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    const records: CostedRecord[] = expenses.map((item): CostedRecord => ({
      id: item.id,
      bucket: bucketForCategory(item.category),
      amount: item.amount,
      currency: item.currency,
      exchangeRate: item.exchangeRate,
      baseAmount: item.baseAmount,
      baseCurrency: item.baseCurrency,
      date: item.date,
    }));

    const reportingCurrency = await resolveReportingCurrency(
      trip.userId,
      trip.budgetCurrency,
      records
    );

    const breakdown: Record<BudgetBucket, Prisma.Decimal> = {
      lodging: ZERO,
      transportation: ZERO,
      activities: ZERO,
      food: ZERO,
      other: ZERO,
    };

    let exactCount = 0;
    let estimatedCount = 0;
    let assumedBaseCount = 0;
    const unconverted = new Map<string, { amount: Prisma.Decimal; count: number }>();

    // Sequential on purpose: the first record of a given (date, pair) warms the
    // rate cache, so the rest resolve without another outbound request.
    for (const record of records) {
      const outcome = await this.resolveRecordAmount(record, reportingCurrency);

      if (outcome.kind === 'unconverted') {
        const existing = unconverted.get(outcome.currency);
        unconverted.set(outcome.currency, {
          amount: (existing?.amount ?? ZERO).add(record.amount),
          count: (existing?.count ?? 0) + 1,
        });
        continue;
      }

      breakdown[record.bucket] = breakdown[record.bucket].add(outcome.amount);

      if (outcome.kind === 'assumed') assumedBaseCount += 1;
      else if (outcome.kind === 'estimated') estimatedCount += 1;
      else exactCount += 1;
    }

    const spent = breakdown.lodging
      .add(breakdown.transportation)
      .add(breakdown.activities)
      .add(breakdown.food)
      .add(breakdown.other);

    const unconvertedList: UnconvertedAmount[] = [...unconverted.entries()]
      .map(([currency, entry]) => ({
        currency,
        amount: toMoneyNumber(entry.amount),
        count: entry.count,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

    const conversion: BudgetConversionInfo = {
      baseCurrency: reportingCurrency,
      exactCount,
      estimatedCount,
      assumedBaseCount,
      unconverted: unconvertedList,
      isComplete: unconvertedList.length === 0 && estimatedCount === 0,
    };

    // The budget must be in the same currency as `spent` or the two cannot be
    // compared. It has no date of its own, so the latest rate is the right one
    // for a forward-looking target.
    const budgetOriginal = trip.budget !== null ? Number(trip.budget) : null;
    const budgetInBase = await this.convertBudget(
      trip.budget,
      trip.budgetCurrency,
      reportingCurrency
    );

    return {
      budget: budgetInBase,
      budgetOriginal,
      budgetCurrency: trip.budgetCurrency,
      currency: reportingCurrency,
      spent: toMoneyNumber(spent),
      breakdown: {
        lodging: toMoneyNumber(breakdown.lodging),
        transportation: toMoneyNumber(breakdown.transportation),
        activities: toMoneyNumber(breakdown.activities),
        food: toMoneyNumber(breakdown.food),
        other: toMoneyNumber(breakdown.other),
      },
      conversion,
    };
  }

  /**
   * Converts one expense into the reporting currency for settle-up, reusing the
   * budget summary's resolution (frozen snapshot, else lazy backfill). Returns
   * null when no exchange rate is available — the caller must exclude it.
   */
  async resolveExpenseBaseAmount(
    expense: {
      id: number;
      category: string;
      amount: Prisma.Decimal;
      currency: string | null;
      exchangeRate: Prisma.Decimal | null;
      baseAmount: Prisma.Decimal | null;
      baseCurrency: string | null;
      date: Date | null;
    },
    reportingCurrency: string
  ): Promise<Prisma.Decimal | null> {
    const outcome = await this.resolveRecordAmount(
      {
        id: expense.id,
        bucket: bucketForCategory(expense.category),
        amount: expense.amount,
        currency: expense.currency,
        exchangeRate: expense.exchangeRate,
        baseAmount: expense.baseAmount,
        baseCurrency: expense.baseCurrency,
        date: expense.date,
      },
      reportingCurrency
    );
    return outcome.kind === 'unconverted' ? null : outcome.amount;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Works out this record's contribution to the totals, filling in and
   * persisting a missing FX snapshot along the way.
   */
  private async resolveRecordAmount(
    record: CostedRecord,
    reportingCurrency: string
  ): Promise<
    | { kind: 'exact' | 'estimated' | 'assumed'; amount: Prisma.Decimal }
    | { kind: 'unconverted'; currency: string }
  > {
    const recordCurrency = normalizeCurrency(record.currency);

    // No currency was ever recorded — the only sane reading is that it is
    // already in the reporting currency. Reported separately as an assumption.
    if (!recordCurrency) {
      return { kind: 'assumed', amount: record.amount };
    }

    // Already in the reporting currency: no conversion, no approximation.
    if (recordCurrency === reportingCurrency) {
      return { kind: 'exact', amount: record.amount };
    }

    // A frozen snapshot against the CURRENT reporting currency is authoritative.
    const snapshotCurrency = normalizeCurrency(record.baseCurrency);
    if (record.baseAmount !== null && snapshotCurrency === reportingCurrency) {
      return { kind: this.precisionFor(record), amount: record.baseAmount };
    }

    // Missing or stale snapshot: fill it in lazily and write it back so the
    // next read is a plain lookup.
    const conversion = await exchangeRateService.convert(
      record.amount,
      recordCurrency,
      reportingCurrency,
      record.date
    );

    if (!conversion) {
      return { kind: 'unconverted', currency: recordCurrency };
    }

    await this.persistSnapshot(record.id, {
      exchangeRate: conversion.exchangeRate,
      baseAmount: conversion.baseAmount,
      baseCurrency: conversion.baseCurrency,
    });

    return { kind: this.precisionFor(record), amount: conversion.baseAmount };
  }

  /**
   * How trustworthy a converted amount is.
   *
   * This depends only on whether the record carries a date, NOT on when the
   * snapshot was taken: a dated record is always converted at that date's
   * published rate, whether that happened on create or during a later backfill.
   * An undated record can only use the latest rate, which is an approximation.
   * Deriving it this way also keeps the answer stable across reads.
   */
  private precisionFor(record: CostedRecord): 'exact' | 'estimated' {
    return record.date ? 'exact' : 'estimated';
  }

  /**
   * Converts the trip budget into the reporting currency.
   * Returns null when there is no budget or no usable rate — the caller keeps
   * `budgetOriginal` so the UI can explain the gap instead of showing a figure
   * that is not comparable with `spent`.
   */
  private async convertBudget(
    budget: Prisma.Decimal | null,
    budgetCurrency: string | null,
    reportingCurrency: string
  ): Promise<number | null> {
    if (budget === null) return null;

    const from = normalizeCurrency(budgetCurrency);
    // No currency on the budget: assume it is already the reporting currency,
    // matching how undated/uncurrencied costed records are treated.
    if (!from || from === reportingCurrency) {
      return toMoneyNumber(budget);
    }

    const conversion = await exchangeRateService.convert(
      budget,
      from,
      reportingCurrency,
      null
    );

    return conversion ? toMoneyNumber(conversion.baseAmount) : null;
  }

  /**
   * Computes the FX snapshot to freeze onto a new/changed costed record.
   *
   * Returns all-null when no rate is available — which reads downstream as
   * "unconverted" rather than as a rate of 1 — and also when no reporting
   * currency has been configured yet. In that case there is nothing meaningful
   * to convert INTO, so the snapshot is deferred to the budget summary, which
   * infers the currency from the trip's records and fills it in there.
   */
  private async buildSnapshot(
    ownerId: number,
    tripId: number,
    amount: number,
    currency: string | null,
    date: Date | null
  ): Promise<FxSnapshot> {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { budgetCurrency: true },
    });

    const reportingCurrency = await resolveConfiguredCurrency(
      ownerId,
      trip?.budgetCurrency ?? null
    );

    if (!reportingCurrency) {
      return { exchangeRate: null, baseAmount: null, baseCurrency: null };
    }

    const conversion = await exchangeRateService.convert(
      amount,
      currency,
      reportingCurrency,
      date
    );

    if (!conversion) {
      return { exchangeRate: null, baseAmount: null, baseCurrency: null };
    }

    return {
      exchangeRate: conversion.exchangeRate,
      baseAmount: conversion.baseAmount,
      baseCurrency: conversion.baseCurrency,
    };
  }

  /**
   * Writes an FX snapshot back to the expense row (a booking's cost is one too).
   * A failure here is non-fatal: the summary is already correct, the write is
   * only a cache of that work.
   */
  private async persistSnapshot(id: number, snapshot: FxSnapshot): Promise<void> {
    try {
      await prisma.tripExpense.update({ where: { id }, data: snapshot });
    } catch (error) {
      console.warn(`[Expense Service] Failed to persist FX snapshot for expense ${id}:`, error);
    }
  }
}

export default new ExpenseService();
