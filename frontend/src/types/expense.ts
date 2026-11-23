export const EXPENSE_CATEGORIES = [
  'food',
  'transportation',
  'lodging',
  'activities',
  'shopping',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'Food & Drink',
  transportation: 'Transport',
  lodging: 'Stays',
  activities: 'Activities',
  shopping: 'Shopping',
  other: 'Other',
};

/** How a split expense is shared out. */
export type SplitMethod = 'equal' | 'amount' | 'percentage';

/** `owner` for the trip owner, `companion:<id>` for a companion. */
export type ParticipantKey = string;

/** One person's share of an expense, in the expense's own currency. */
export type ExpenseSplitShare = {
  participant: ParticipantKey;
  amount: number;
  /** Only set for percentage splits. */
  percentage: number | null;
};

export type ExpenseParticipant = {
  key: ParticipantKey;
  label: string;
  kind: 'owner' | 'companion';
};

/** The booking an expense is the cost of (the cost of an activity, leg, stay or custom item). */
export type LinkedExpenseEntity = {
  type: 'activity' | 'transportation' | 'lodging' | 'customItem';
  id: number;
  name: string;
};

export type TripExpense = {
  id: number;
  tripId: number;
  description: string;
  category: ExpenseCategory;
  amount: number;
  currency: string | null;
  /** Rate frozen at the expense's date; null when none could be obtained. */
  exchangeRate: number | null;
  /** `amount` converted into `baseCurrency` at `exchangeRate`. */
  baseAmount: number | null;
  /** Currency `baseAmount` is expressed in. */
  baseCurrency: string | null;
  date: string | null;
  notes: string | null;
  /** Who paid; null when not recorded. */
  paidBy: ParticipantKey | null;
  splitMethod: SplitMethod | null;
  splits: ExpenseSplitShare[];
  /** Stored receipt photo ("/uploads/receipts/..."), or null. Load it with getFullAssetUrl. */
  receiptPath?: string | null;
  receiptUploadedAt?: string | null;
  /** Set when this expense is a booking's cost (the booking's own cost field is this row). */
  linkedEntity?: LinkedExpenseEntity | null;
  activityId?: number | null;
  transportationId?: number | null;
  lodgingId?: number | null;
  customItemId?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SetExpenseSplitInput = {
  /** null clears the payer and the split. */
  paidBy: ParticipantKey | null;
  method?: SplitMethod | null;
  participants?: Array<{
    participant: ParticipantKey;
    amount?: number;
    percentage?: number;
  }>;
};

export type SettleUpBalance = {
  participant: ParticipantKey;
  label: string;
  paid: number;
  owed: number;
  /** Recorded settlement payments this person has made. */
  settledOut: number;
  /** Recorded settlement payments this person has received. */
  settledIn: number;
  /** paid - owed + settledOut - settledIn; positive means this person is still owed money. */
  net: number;
};

export type SettleUpTransfer = {
  from: ParticipantKey;
  fromLabel: string;
  to: ParticipantKey;
  toLabel: string;
  amount: number;
};

export type SettleUpExpenseRef = { expenseId: number; description: string };

export type SettleUpSummary = {
  /** Currency every amount below is expressed in. */
  currency: string;
  balances: SettleUpBalance[];
  transfers: SettleUpTransfer[];
  /** Split expenses with no exchange rate — excluded from balances. */
  unconverted: Array<SettleUpExpenseRef & { currency: string | null; amount: number }>;
  /** Recorded payments with no exchange rate — excluded from balances. */
  unconvertedSettlements: Array<{
    settlementId: number;
    from: ParticipantKey;
    fromLabel: string;
    to: ParticipantKey;
    toLabel: string;
    currency: string;
    /** In `currency`, not the settle-up currency. */
    amount: number;
  }>;
  /** Expenses with no payer or split — excluded from balances. */
  unsplit: SettleUpExpenseRef[];
  isComplete: boolean;
};

/** A recorded payment from one person to another that settles split expenses. */
export type TripSettlement = {
  id: number;
  tripId: number;
  from: ParticipantKey;
  fromLabel: string;
  to: ParticipantKey;
  toLabel: string;
  amount: number;
  currency: string;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSettlementInput = {
  from: ParticipantKey;
  to: ParticipantKey;
  amount: number;
  currency: string;
  date: string;
  notes?: string | null;
};

export type UpdateSettlementInput = Partial<CreateSettlementInput>;

export type CreateExpenseInput = {
  description: string;
  category: ExpenseCategory;
  amount: number;
  currency?: string | null;
  date?: string;
  notes?: string;
};

export type UpdateExpenseInput = {
  description?: string;
  category?: ExpenseCategory;
  amount?: number;
  currency?: string | null;
  date?: string | null;
  notes?: string | null;
};

/** An amount the backend could not convert, in its own currency. */
export type UnconvertedAmount = {
  currency: string;
  /** Sum in `currency` — NOT in the summary's base currency. */
  amount: number;
  count: number;
};

/** How the reported totals were arrived at. */
export type BudgetConversionInfo = {
  /** Currency `spent` and `breakdown` are expressed in. */
  baseCurrency: string;
  /** Converted at the rate for the record's own date, or already in base. */
  exactCount: number;
  /** No date on the record, so the latest rate stood in for the correct one. */
  estimatedCount: number;
  /** No currency recorded; counted at face value as already being in base. */
  assumedBaseCount: number;
  /** Excluded from `spent` — no rate available. */
  unconverted: UnconvertedAmount[];
  /** True when nothing was excluded and nothing was estimated. */
  isComplete: boolean;
};

export type BudgetSummary = {
  /**
   * The budget expressed in `currency`, directly comparable with `spent`.
   * Null when no budget is set OR its currency could not be converted —
   * `budgetOriginal` tells the two cases apart.
   */
  budget: number | null;
  /** The budget exactly as entered, before conversion. */
  budgetOriginal: number | null;
  /** Currency the budget was entered in. */
  budgetCurrency: string | null;
  /** Currency `budget`, `spent` and `breakdown` are expressed in. */
  currency: string;
  spent: number;
  breakdown: {
    lodging: number;
    transportation: number;
    activities: number;
    food: number;
    other: number;
  };
  conversion: BudgetConversionInfo;
};
