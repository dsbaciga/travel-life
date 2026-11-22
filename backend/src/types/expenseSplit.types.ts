import { z } from 'zod';

export const SPLIT_METHODS = ['equal', 'amount', 'percentage'] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/** `owner` for the trip owner, `companion:<id>` for a TravelCompanion. */
const participantKeySchema = z.string().regex(/^(owner|companion:\d+)$/, 'Invalid participant');

/**
 * Sets (or clears) who paid an expense and how it is shared.
 *
 * - `paidBy: null` clears the payer AND the split.
 * - `method` is required whenever `paidBy` is set; `participants` must then be non-empty.
 * - `equal` needs only participant keys; `amount` needs `amount` on each, summing to the
 *   expense amount; `percentage` needs `percentage` on each, summing to 100.
 */
export const setExpenseSplitSchema = z.object({
  paidBy: participantKeySchema.nullable(),
  method: z.enum(SPLIT_METHODS).nullable().optional(),
  participants: z
    .array(
      z.object({
        participant: participantKeySchema,
        amount: z.number().min(0).optional(),
        percentage: z.number().min(0).max(100).optional(),
      })
    )
    .max(100)
    .optional(),
});

export type SetExpenseSplitInput = z.infer<typeof setExpenseSplitSchema>;

export interface ExpenseParticipant {
  key: string;
  label: string;
  kind: 'owner' | 'companion';
}

export interface SettleUpBalance {
  participant: string;
  label: string;
  /** Fronted, in `currency`. */
  paid: number;
  /** Share of the split expenses, in `currency`. */
  owed: number;
  /** Recorded settlement payments this person has made, in `currency`. */
  settledOut: number;
  /** Recorded settlement payments this person has received, in `currency`. */
  settledIn: number;
  /** paid - owed + settledOut - settledIn; positive = is still owed money. */
  net: number;
}

export interface SettleUpTransfer {
  from: string;
  fromLabel: string;
  to: string;
  toLabel: string;
  amount: number;
}

export interface SettleUpExpenseRef {
  expenseId: number;
  description: string;
}

export interface SettleUpUnconvertedItem extends SettleUpExpenseRef {
  currency: string | null;
  amount: number;
}

export interface SettleUpUnconvertedSettlement {
  settlementId: number;
  from: string;
  fromLabel: string;
  to: string;
  toLabel: string;
  currency: string;
  /** In `currency`, not the settle-up currency. */
  amount: number;
}

export interface SettleUpSummary {
  /** Currency every figure below is expressed in. */
  currency: string;
  balances: SettleUpBalance[];
  transfers: SettleUpTransfer[];
  /** Split expenses with no exchange rate; excluded from balances and transfers. */
  unconverted: SettleUpUnconvertedItem[];
  /** Recorded payments with no exchange rate; excluded from balances and transfers. */
  unconvertedSettlements: SettleUpUnconvertedSettlement[];
  /** Expenses with no payer / split (or a split that no longer adds up); excluded. */
  unsplit: SettleUpExpenseRef[];
  /** True when nothing relevant was left out. */
  isComplete: boolean;
}
