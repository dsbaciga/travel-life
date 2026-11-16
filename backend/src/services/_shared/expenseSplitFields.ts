import { Prisma } from '@prisma/client';
import { OWNER_KEY, companionKey } from './settleUp';

/** The split-related columns of a TripExpense row. */
export interface ExpensePayerColumns {
  paidByOwner: boolean;
  paidByCompanionId: number | null;
}

export interface ExpenseSplitRow {
  isOwner: boolean;
  companionId: number | null;
  amount: Prisma.Decimal;
  percentage: Prisma.Decimal | null;
}

/** Participant key of whoever paid, or null when no payer is recorded. */
export function payerKey(expense: ExpensePayerColumns): string | null {
  if (expense.paidByOwner) return OWNER_KEY;
  if (expense.paidByCompanionId !== null) return companionKey(expense.paidByCompanionId);
  return null;
}

export function splitRowKey(split: Pick<ExpenseSplitRow, 'isOwner' | 'companionId'>): string {
  return split.isOwner || split.companionId === null ? OWNER_KEY : companionKey(split.companionId);
}

/**
 * Rewrites an expense row's payer/split columns into the API shape: a single
 * `paidBy` participant key and a `splits` list keyed the same way. Decimals are
 * left for convertDecimals to flatten.
 */
export function withSplitFields<
  T extends ExpensePayerColumns & { splits?: ExpenseSplitRow[] },
>(expense: T) {
  const { paidByOwner, paidByCompanionId, splits, ...rest } = expense;
  return {
    ...rest,
    paidBy: payerKey({ paidByOwner, paidByCompanionId }),
    splits: (splits ?? []).map((s) => ({
      participant: splitRowKey(s),
      amount: s.amount,
      percentage: s.percentage,
    })),
  };
}
