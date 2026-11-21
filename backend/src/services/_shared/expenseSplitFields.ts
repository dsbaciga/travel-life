import { Prisma } from '@prisma/client';
import { OWNER_KEY, companionKey } from './settleUp';
import { withLinkedEntity } from './bookingCost';

/** The payer column of a TripExpense row. */
export interface ExpensePayerColumns {
  paidByCompanionId: number | null;
}

export interface ExpenseSplitRow {
  companionId: number;
  amount: Prisma.Decimal;
  percentage: Prisma.Decimal | null;
}

/**
 * Participant key of a companion. The trip owner's "myself" companion (`ownerCompanionId`) is the
 * `owner` key, so the API and settle-up keep speaking `owner` / `companion:<id>` exactly as before
 * the owner became an ordinary companion in storage.
 */
export function participantKey(companionId: number, ownerCompanionId: number | null): string {
  return ownerCompanionId !== null && companionId === ownerCompanionId
    ? OWNER_KEY
    : companionKey(companionId);
}

/** Participant key of whoever paid, or null when no payer is recorded. */
export function payerKey(
  expense: ExpensePayerColumns,
  ownerCompanionId: number | null
): string | null {
  return expense.paidByCompanionId === null
    ? null
    : participantKey(expense.paidByCompanionId, ownerCompanionId);
}

export function splitRowKey(
  split: Pick<ExpenseSplitRow, 'companionId'>,
  ownerCompanionId: number | null
): string {
  return participantKey(split.companionId, ownerCompanionId);
}

/**
 * Rewrites an expense row's payer/split columns into the API shape: a single
 * `paidBy` participant key and a `splits` list keyed the same way, plus the derived booleans
 * `paidByOwner` and (per split) `isOwner` that older clients read. Decimals are left for
 * convertDecimals to flatten. `ownerCompanionId` is the TRIP OWNER's "myself" companion.
 */
export function withSplitFields<T extends ExpensePayerColumns & { splits?: ExpenseSplitRow[] }>(
  expense: T,
  ownerCompanionId: number | null
) {
  // The booking relation objects (when loaded) become a small `linkedEntity`; ordinary expenses read null.
  const { paidByCompanionId, splits, ...rest } = withLinkedEntity(expense);
  const paidBy = payerKey({ paidByCompanionId }, ownerCompanionId);
  return {
    ...rest,
    paidBy,
    paidByOwner: paidBy === OWNER_KEY,
    splits: (splits ?? []).map((s) => {
      const participant = splitRowKey(s, ownerCompanionId);
      return {
        participant,
        isOwner: participant === OWNER_KEY,
        amount: s.amount,
        percentage: s.percentage,
      };
    }),
  };
}
