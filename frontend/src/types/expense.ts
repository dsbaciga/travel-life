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
  transportation: 'Transportation',
  lodging: 'Lodging',
  activities: 'Activities',
  shopping: 'Shopping',
  other: 'Other',
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
  /** Stored receipt photo ("/uploads/receipts/..."), or null. Load it with getFullAssetUrl. */
  receiptPath?: string | null;
  receiptUploadedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

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
