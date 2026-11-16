import { useCallback, useEffect, useRef, useState } from "react";
import CurrencySelect from "./CurrencySelect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { formatCurrency as sharedFormatCurrency } from "../utils/formatCurrency";
import expenseService from "../services/expense.service";
import tripService from "../services/trip.service";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type TripExpense,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from "../types/expense";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import EmptyState from "./EmptyState";
import { ListItemSkeleton } from "./SkeletonLoader";
import { formatDateOnly } from "../utils/timezone";
import ExpenseSplitFields from "./ExpenseSplitFields";
import SettleUpPanel from "./SettleUpPanel";
import {
  buildSplitInput,
  emptySplitState,
  splitStateFromExpense,
  type SplitFormState,
} from "../utils/expenseSplit";
import ReceiptScanButton, { ScanBadge } from "./ReceiptScanButton";
import ReceiptViewer from "./ReceiptViewer";
import { getFullAssetUrl } from "../lib/config";
import type { ReceiptScanResult } from "../services/receiptScan.service";
import { receiptToExpenseForm, type ScannedField } from "../utils/receiptPrefill";

/**
 * BudgetManager handles the trip budget and expense tracking tab.
 *
 * Features:
 * - Set / edit / clear the total trip budget (amount + currency)
 * - Budget progress with remaining / over-budget indicator
 * - Expense CRUD (description, category, amount, currency, date, notes)
 * - Per-category spending totals (includes activity/transportation/lodging
 *   costs via the backend budget summary)
 *
 * Currency: the backend converts every costed record into one base currency
 * (the trip owner's home currency, else the trip's budget currency) using the
 * rate frozen at each record's own date. Amounts it could not convert are
 * excluded from the totals and surfaced here explicitly, so a mixed-currency
 * trip never shows a silently wrong number.
 */
interface BudgetManagerProps {
  tripId: number;
  budget: number | null;
  budgetCurrency: string | null;
  onUpdate?: () => void;
}

interface ExpenseFormState {
  description: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  date: string;
  notes: string;
}

const EMPTY_EXPENSE_FORM: ExpenseFormState = {
  description: "",
  category: "food",
  amount: "",
  currency: "",
  date: "",
  notes: "",
};

function isExpenseCategory(value: string): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.some((category) => category === value);
}

export default function BudgetManager({
  tripId,
  budget,
  budgetCurrency,
  onUpdate,
}: BudgetManagerProps) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Budget editing state
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrencyInput, setBudgetCurrencyInput] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  // Expense form state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(EMPTY_EXPENSE_FORM);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [splitForm, setSplitForm] = useState<SplitFormState>(emptySplitState);
  // Receipt scan: which form fields were pre-filled from the photo (marked for review)
  const [scannedFields, setScannedFields] = useState<ScannedField[]>([]);
  const [currencyDefaulted, setCurrencyDefaulted] = useState(false);
  // Receipt photo: a file picked or scanned and held in memory until the expense is saved,
  // the receipt already stored on the expense being edited, and whether to remove it.
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [pendingReceiptUrl, setPendingReceiptUrl] = useState<string | null>(null);
  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null);
  const [removeExistingReceipt, setRemoveExistingReceipt] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<{ path: string; title: string } | null>(null);
  // A ref, not state: a second click in the same tick must not save (or upload) twice.
  const submitLock = useRef(false);

  useEffect(() => {
    if (!pendingReceipt) {
      setPendingReceiptUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingReceipt);
    setPendingReceiptUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingReceipt]);

  const { data: expenses = [], isLoading: isExpensesLoading } = useQuery({
    queryKey: ["expenses", tripId],
    queryFn: () => expenseService.getExpensesByTrip(tripId),
    enabled: !!tripId,
  });

  // The owner plus the trip's companions: who can pay and who can share an expense.
  const { data: participants = [] } = useQuery({
    queryKey: ["expense-participants", tripId],
    queryFn: () => expenseService.getParticipants(tripId),
    enabled: !!tripId,
  });
  const participantLabels = new Map(participants.map((p) => [p.key, p.label]));

  const { data: summary } = useQuery({
    queryKey: ["budget-summary", tripId],
    queryFn: () => expenseService.getBudgetSummary(tripId),
    enabled: !!tripId,
  });

  // The backend is authoritative about which currency the totals are in.
  // Only fall back to the trip's own currency while the summary is loading.
  const displayCurrency = summary?.currency || budgetCurrency || "USD";

  // Delegates to the shared guarded formatter so every call site in the app
  // handles an invalid currency code identically.
  const formatCurrency = useCallback(
    (amount: number, currency?: string | null) =>
      sharedFormatCurrency(amount, currency || displayCurrency),
    [displayCurrency]
  );

  const spent = summary?.spent ?? 0;
  const conversion = summary?.conversion;

  // Compare like with like: `summary.budget` is the budget restated in the
  // same base currency as `spent`. Falls back to the raw prop only while the
  // summary is still loading.
  const comparableBudget = summary ? summary.budget : budget;

  // A budget exists but could not be expressed in the base currency, so no
  // progress figure is meaningful.
  const budgetNotComparable =
    summary !== undefined && summary.budgetOriginal !== null && summary.budget === null;

  // The budget was entered in a different currency than the totals are shown in.
  const budgetWasConverted =
    summary !== undefined &&
    summary.budget !== null &&
    summary.budgetCurrency !== null &&
    summary.budgetCurrency !== summary.currency;

  const remaining = comparableBudget !== null ? comparableBudget - spent : null;
  const percentage =
    comparableBudget && comparableBudget > 0
      ? Math.round((spent / comparableBudget) * 100)
      : 0;
  const isOverBudget = comparableBudget !== null && spent > comparableBudget;
  const isNearBudget = comparableBudget !== null && !isOverBudget && percentage >= 80;

  const unconverted = conversion?.unconverted ?? [];
  const hasEstimates = (conversion?.estimatedCount ?? 0) > 0;

  const progressColor = isOverBudget
    ? "bg-red-500 dark:bg-red-400"
    : isNearBudget
    ? "bg-amber-500 dark:bg-amber-400"
    : "bg-green-500 dark:bg-green-400";

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses", tripId] });
    queryClient.invalidateQueries({ queryKey: ["budget-summary", tripId] });
    queryClient.invalidateQueries({ queryKey: ["settle-up", tripId] });
    queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
    onUpdate?.();
  };

  // -------------------------------------------------------------------------
  // Budget handlers
  // -------------------------------------------------------------------------

  const openBudgetEditor = () => {
    setBudgetAmount(budget !== null ? String(budget) : "");
    setBudgetCurrencyInput(budgetCurrency || displayCurrency);
    setIsEditingBudget(true);
  };

  const handleSaveBudget = async () => {
    const parsedAmount = budgetAmount.trim() === "" ? null : Number(budgetAmount);
    if (parsedAmount !== null && (isNaN(parsedAmount) || parsedAmount < 0)) {
      toast.error("Budget must be a positive number");
      return;
    }
    const currency = budgetCurrencyInput.trim().toUpperCase();
    if (parsedAmount !== null && currency.length !== 3) {
      toast.error("Choose a currency");
      return;
    }

    setIsSavingBudget(true);
    try {
      await tripService.updateTrip(tripId, {
        budget: parsedAmount,
        budgetCurrency: parsedAmount !== null ? currency : null,
      });
      toast.success(parsedAmount !== null ? "Budget saved" : "Budget removed");
      setIsEditingBudget(false);
      refreshData();
    } catch {
      toast.error("Failed to save budget");
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleRemoveBudget = async () => {
    const confirmed = await confirm({
      title: "Remove Budget",
      message: "Remove the budget for this trip? Expenses will be kept.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsSavingBudget(true);
    try {
      await tripService.updateTrip(tripId, { budget: null, budgetCurrency: null });
      toast.success("Budget removed");
      setIsEditingBudget(false);
      refreshData();
    } catch {
      toast.error("Failed to remove budget");
    } finally {
      setIsSavingBudget(false);
    }
  };

  // -------------------------------------------------------------------------
  // Expense handlers
  // -------------------------------------------------------------------------

  const openCreateExpenseForm = () => {
    setEditingExpenseId(null);
    setScannedFields([]);
    setCurrencyDefaulted(false);
    resetReceiptState();
    setExpenseForm({ ...EMPTY_EXPENSE_FORM, currency: displayCurrency });
    setSplitForm(emptySplitState());
    setShowExpenseForm(true);
  };

  const openEditExpenseForm = (expense: TripExpense) => {
    setEditingExpenseId(expense.id);
    setScannedFields([]);
    setCurrencyDefaulted(false);
    resetReceiptState();
    setExistingReceiptPath(expense.receiptPath ?? null);
    setExpenseForm({
      description: expense.description,
      category: expense.category,
      amount: String(expense.amount),
      currency: expense.currency || "",
      date: expense.date ? expense.date.substring(0, 10) : "",
      notes: expense.notes || "",
    });
    setSplitForm(splitStateFromExpense(expense));
    setShowExpenseForm(true);
  };

  const closeExpenseForm = () => {
    setShowExpenseForm(false);
    setEditingExpenseId(null);
    setExpenseForm(EMPTY_EXPENSE_FORM);
    setSplitForm(emptySplitState());
    setScannedFields([]);
    setCurrencyDefaulted(false);
    resetReceiptState();
  };

  function resetReceiptState() {
    setPendingReceipt(null);
    setExistingReceiptPath(null);
    setRemoveExistingReceipt(false);
  }

  // Open the normal "Add Expense" form pre-filled from a scanned receipt.
  // Nothing is saved here; the user reviews and submits as usual.
  const handleReceiptScanned = (result: ReceiptScanResult, file: File) => {
    const prefill = receiptToExpenseForm(result, {
      category: EMPTY_EXPENSE_FORM.category,
      currency: displayCurrency,
    });
    setEditingExpenseId(null);
    setExpenseForm({
      ...EMPTY_EXPENSE_FORM,
      description: prefill.description,
      category: prefill.category,
      amount: prefill.amount,
      currency: prefill.currency,
      date: prefill.date,
    });
    setSplitForm(emptySplitState());
    setScannedFields(prefill.scanned);
    setCurrencyDefaulted(prefill.currencyDefaulted);
    // Keep the photo in memory; it is uploaded only once the expense is saved.
    resetReceiptState();
    setPendingReceipt(file);
    setShowExpenseForm(true);
  };

  const isScanned = (field: ScannedField) => scannedFields.includes(field);
  const scannedRing = (field: ScannedField) =>
    isScanned(field) ? " ring-2 ring-gold/60" : "";

  const handleSubmitExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitLock.current) return;

    const amount = Number(expenseForm.amount);
    if (!expenseForm.description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (isNaN(amount) || amount < 0) {
      toast.error("Amount must be a positive number");
      return;
    }
    const currency = expenseForm.currency.trim().toUpperCase();
    if (currency && currency.length !== 3) {
      toast.error("Choose a currency");
      return;
    }

    // Built before saving so a bad split is refused without creating a half-saved expense.
    const editingExpense = expenses.find((item) => item.id === editingExpenseId);
    const splitResult = buildSplitInput(
      splitForm,
      participants.map((p) => p.key),
      amount,
      !!editingExpense && (editingExpense.paidBy !== null || editingExpense.splits.length > 0)
    );
    if (!splitResult.ok) {
      toast.error(splitResult.error);
      return;
    }

    // Fixed now: the receipt belongs to the expense saved by THIS submit, even if the
    // form state is reset (or reused for another expense) before the upload finishes.
    const receiptFile = pendingReceipt;
    const removeReceipt = removeExistingReceipt && !receiptFile;

    submitLock.current = true;
    setIsSavingExpense(true);
    try {
      let savedExpenseId: number;
      if (editingExpenseId) {
        const updateData: UpdateExpenseInput = {
          description: expenseForm.description.trim(),
          category: expenseForm.category,
          amount,
          currency: currency || null,
          date: expenseForm.date || null,
          notes: expenseForm.notes.trim() || null,
        };
        await expenseService.updateExpense(tripId, editingExpenseId, updateData);
        savedExpenseId = editingExpenseId;
        toast.success("Expense updated");
      } else {
        const createData: CreateExpenseInput = {
          description: expenseForm.description.trim(),
          category: expenseForm.category,
          amount,
          currency: currency || null,
          date: expenseForm.date || undefined,
          notes: expenseForm.notes.trim() || undefined,
        };
        const created = await expenseService.createExpense(tripId, createData);
        savedExpenseId = created.id;
        toast.success("Expense added");
      }
      // Each follow-up runs on its own: one failing never skips the other or loses the expense.
      if (splitResult.input) {
        try {
          await expenseService.setExpenseSplit(tripId, savedExpenseId, splitResult.input);
        } catch {
          toast.error("Expense saved, but the split could not be saved");
        }
      }
      if (receiptFile || removeReceipt) {
        try {
          if (receiptFile) {
            await expenseService.uploadReceipt(tripId, savedExpenseId, receiptFile);
          } else {
            await expenseService.deleteReceipt(tripId, savedExpenseId);
          }
        } catch {
          toast.error(
            receiptFile
              ? "The expense was saved, but the receipt photo was not attached. Edit the expense and choose Attach receipt to try again."
              : "The expense was saved, but the receipt photo could not be removed. Edit the expense and try Remove again."
          );
        }
      }
      closeExpenseForm();
      refreshData();
    } catch {
      toast.error(editingExpenseId ? "Failed to update expense" : "Failed to add expense");
    } finally {
      submitLock.current = false;
      setIsSavingExpense(false);
    }
  };

  const handleReceiptPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingReceipt(file);
    setRemoveExistingReceipt(false);
  };

  const handleRemoveReceipt = () => {
    setPendingReceipt(null);
    if (existingReceiptPath) setRemoveExistingReceipt(true);
  };

  const shownReceiptUrl =
    pendingReceiptUrl ?? (existingReceiptPath && !removeExistingReceipt ? getFullAssetUrl(existingReceiptPath) : null);

  const handleDeleteExpense = async (expense: TripExpense) => {
    const confirmed = await confirm({
      title: "Delete Expense",
      message: `Delete "${expense.description}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await expenseService.deleteExpense(tripId, expense.id);
      toast.success("Expense deleted");
      if (editingExpenseId === expense.id) closeExpenseForm();
      refreshData();
    } catch {
      toast.error("Failed to delete expense");
    }
  };

  const formatExpenseDate = (date: string | null) =>
    // An expense date is a calendar date, not an instant — see formatDateOnly.
    formatDateOnly(date, { year: "numeric", month: "short", day: "numeric" });

  const breakdownEntries = summary
    ? Object.entries(summary.breakdown).filter(([, amount]) => amount > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Budget &amp; Expenses
        </h2>
        <div className="flex flex-wrap gap-2">
          <ReceiptScanButton
            tripId={tripId}
            disabled={editingExpenseId !== null || isSavingExpense}
            onScanned={handleReceiptScanned}
          />
          <button
            type="button"
            onClick={showExpenseForm ? closeExpenseForm : openCreateExpenseForm}
            className="btn-primary"
          >
            {showExpenseForm ? "Cancel" : "+ Add Expense"}
          </button>
        </div>
      </div>

      {/* Budget Overview */}
      <div className="bg-parchment dark:bg-navy-700/50 rounded-2xl border border-primary-100 dark:border-gold/20 p-6">
        {!isEditingBudget ? (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate dark:text-warm-gray/70 mb-1">
                  Trip Budget
                </p>
                {budget !== null ? (
                  <>
                    <p className="text-3xl font-bold font-display text-charcoal dark:text-warm-gray">
                      {formatCurrency(budget, budgetCurrency)}
                      <span className="text-sm font-body font-normal text-slate dark:text-warm-gray/70 ml-2">
                        {budgetCurrency || displayCurrency}
                      </span>
                    </p>
                    {budgetWasConverted && summary?.budget !== null && (
                      <p className="text-sm text-slate dark:text-warm-gray/70 mt-1">
                        ≈ {formatCurrency(summary?.budget ?? 0)} {displayCurrency}
                        <span className="ml-1 text-xs">(at today&apos;s rate)</span>
                      </p>
                    )}
                    {budgetNotComparable && (
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                        Could not be converted to {displayCurrency} — progress
                        below is unavailable.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-slate dark:text-warm-gray/70">
                    No budget set for this trip
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={openBudgetEditor}
                  className="btn-secondary"
                >
                  {budget !== null ? "Edit Budget" : "Set Budget"}
                </button>
                {budget !== null && (
                  <button
                    type="button"
                    onClick={handleRemoveBudget}
                    disabled={isSavingBudget}
                    className="px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Progress / remaining indicator */}
            <div className="mt-4">
              <div className="flex items-baseline justify-between mb-2">
                <span
                  className={`text-lg font-semibold ${
                    isOverBudget
                      ? "text-red-600 dark:text-red-400"
                      : isNearBudget
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-charcoal dark:text-warm-gray"
                  }`}
                >
                  {formatCurrency(spent)} spent
                  <span className="ml-2 text-sm font-normal text-slate dark:text-warm-gray/70">
                    {displayCurrency}
                    {hasEstimates && " (estimated)"}
                  </span>
                </span>
                {comparableBudget !== null && (
                  <span
                    className={`text-sm font-medium ${
                      isOverBudget
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate dark:text-warm-gray/70"
                    }`}
                  >
                    {remaining !== null && remaining >= 0
                      ? `${formatCurrency(remaining)} remaining`
                      : `${formatCurrency(Math.abs(remaining ?? 0))} over budget`}
                  </span>
                )}
              </div>
              {comparableBudget !== null && comparableBudget > 0 && (
                <div
                  className="h-3 bg-slate/10 dark:bg-navy-900 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Budget used"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${progressColor}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              )}
              <p className="mt-2 text-xs text-slate dark:text-warm-gray/60">
                Includes activity, transportation, and lodging costs plus
                recorded expenses, converted to {displayCurrency} at the rate
                in effect on each item&apos;s date.
              </p>

              {/* Conversion caveats — never let a total look more precise than it is */}
              {unconverted.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-900/20">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Not included in the total
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/90">
                    No exchange rate was available for these amounts, so they
                    are listed separately rather than added in:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {unconverted.map((item) => (
                      <li
                        key={item.currency}
                        className="text-sm text-amber-800 dark:text-amber-300"
                      >
                        {formatCurrency(item.amount, item.currency)}{" "}
                        {item.currency}
                        <span className="ml-1 text-xs text-amber-700 dark:text-amber-400/90">
                          ({item.count} {item.count === 1 ? "item" : "items"})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasEstimates && unconverted.length === 0 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {conversion?.estimatedCount}{" "}
                  {conversion?.estimatedCount === 1 ? "amount has" : "amounts have"}{" "}
                  no date recorded, so today&apos;s rate was used instead of the
                  rate on the day — the total is approximate.
                </p>
              )}

              {(conversion?.assumedBaseCount ?? 0) > 0 && (
                <p className="mt-2 text-xs text-slate dark:text-warm-gray/60">
                  {conversion?.assumedBaseCount}{" "}
                  {conversion?.assumedBaseCount === 1 ? "item has" : "items have"}{" "}
                  no currency recorded and {conversion?.assumedBaseCount === 1 ? "is" : "are"}{" "}
                  counted as {displayCurrency}.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate dark:text-warm-gray/70 mb-3">
              {budget !== null ? "Edit Trip Budget" : "Set Trip Budget"}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label htmlFor="budget-amount" className="label">
                  Amount
                </label>
                <input
                  id="budget-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="input w-full"
                  placeholder="e.g. 2500"
                />
              </div>
              <div className="w-full sm:w-56">
                <label htmlFor="budget-currency" className="label">
                  Currency
                </label>
                <CurrencySelect
                  id="budget-currency"
                  value={budgetCurrencyInput}
                  onChange={setBudgetCurrencyInput}
                  className="input w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setIsEditingBudget(false)}
                className="btn-secondary"
                disabled={isSavingBudget}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBudget}
                className="btn-primary"
                disabled={isSavingBudget}
              >
                {isSavingBudget ? "Saving..." : "Save Budget"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Category Totals */}
      {breakdownEntries.length > 0 && (
        <div>
          <h3 className="font-body font-semibold text-lg text-charcoal dark:text-warm-gray mb-3">
            Spending by Category
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {breakdownEntries.map(([category, amount]) => (
              <div
                key={category}
                className="bg-white dark:bg-navy-700/50 rounded-xl border border-primary-100 dark:border-gold/20 p-3"
              >
                <p className="text-xs font-medium text-slate dark:text-warm-gray/70 capitalize mb-1">
                  {category}
                </p>
                <p className="text-lg font-semibold text-charcoal dark:text-warm-gray">
                  {formatCurrency(amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Who owes whom */}
      <SettleUpPanel tripId={tripId} />

      {/* Expense Form */}
      {showExpenseForm && (
        <form
          onSubmit={handleSubmitExpense}
          className="bg-white dark:bg-navy-700/50 rounded-2xl border border-primary-100 dark:border-gold/20 p-6 space-y-4 animate-fade-in"
        >
          <h3 className="font-body font-semibold text-lg text-charcoal dark:text-warm-gray">
            {editingExpenseId ? "Edit Expense" : "Add Expense"}
          </h3>

          {scannedFields.length > 0 && (
            <p
              role="status"
              className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-charcoal dark:text-warm-gray"
            >
              Filled in from your receipt. Fields marked &quot;From receipt&quot; were read
              automatically and can be wrong, so check them before saving.
              {currencyDefaulted && " The receipt showed no currency, so check the currency too."}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="expense-description" className="label label-required">
                Description{isScanned("description") && <ScanBadge />}
              </label>
              <input
                id="expense-description"
                type="text"
                required
                maxLength={500}
                value={expenseForm.description}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, description: e.target.value })
                }
                className={`input w-full${scannedRing("description")}`}
                placeholder="e.g. Dinner at trattoria"
              />
            </div>

            <div>
              <label htmlFor="expense-category" className="label">
                Category{isScanned("category") && <ScanBadge />}
              </label>
              <select
                id="expense-category"
                value={expenseForm.category}
                onChange={(e) => {
                  const value = e.target.value;
                  if (isExpenseCategory(value)) {
                    setExpenseForm({ ...expenseForm, category: value });
                  }
                }}
                className={`input w-full${scannedRing("category")}`}
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {EXPENSE_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="expense-amount" className="label label-required">
                  Amount{isScanned("amount") && <ScanBadge />}
                </label>
                <input
                  id="expense-amount"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, amount: e.target.value })
                  }
                  className={`input w-full${scannedRing("amount")}`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label htmlFor="expense-currency" className="label">
                  Currency{isScanned("currency") && <ScanBadge />}
                </label>
                <CurrencySelect
                  id="expense-currency"
                  value={expenseForm.currency}
                  onChange={(currency) => setExpenseForm({ ...expenseForm, currency })}
                  className={`input w-full${scannedRing("currency")}`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="expense-date" className="label">
                Date
                {isScanned("date") && (
                  <ScanBadge detail={formatExpenseDate(expenseForm.date) ?? undefined} />
                )}
              </label>
              <input
                id="expense-date"
                type="date"
                value={expenseForm.date}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, date: e.target.value })
                }
                className={`input w-full${scannedRing("date")}`}
              />
            </div>

            {participants.length > 1 && (
              <ExpenseSplitFields
                participants={participants}
                state={splitForm}
                onChange={setSplitForm}
                total={Number(expenseForm.amount) || 0}
                currency={expenseForm.currency}
              />
            )}

            <div className="sm:col-span-2">
              <label htmlFor="expense-notes" className="label">
                Notes
              </label>
              <textarea
                id="expense-notes"
                rows={2}
                value={expenseForm.notes}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, notes: e.target.value })
                }
                className="input w-full"
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div>
            <span className="label">Receipt photo</span>
            <div className="flex items-center gap-3">
              {shownReceiptUrl && (
                <img
                  src={shownReceiptUrl}
                  alt="Receipt thumbnail"
                  className="h-16 w-16 rounded-lg border border-primary-100 object-cover dark:border-gold/20"
                />
              )}
              <label className="btn-secondary cursor-pointer">
                {shownReceiptUrl ? "Replace receipt" : "Attach receipt"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="expense-receipt-input"
                  onChange={handleReceiptPicked}
                />
              </label>
              {shownReceiptUrl && (
                <button type="button" className="btn-secondary" onClick={handleRemoveReceipt}>
                  Remove receipt
                </button>
              )}
            </div>
            {pendingReceipt && (
              <p className="mt-1 text-xs text-slate dark:text-warm-gray/70">
                The photo is attached when you save.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeExpenseForm}
              className="btn-secondary"
              disabled={isSavingExpense}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSavingExpense}>
              {isSavingExpense
                ? "Saving..."
                : editingExpenseId
                ? "Update Expense"
                : "Add Expense"}
            </button>
          </div>
        </form>
      )}

      {/* Expense List */}
      <div>
        <h3 className="font-body font-semibold text-lg text-charcoal dark:text-warm-gray mb-3">
          Expenses{expenses.length > 0 ? ` (${expenses.length})` : ""}
        </h3>

        {isExpensesLoading ? (
          <ListItemSkeleton count={3} />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="💰"
            message="No expenses recorded yet"
            subMessage="Track your trip spending by adding expenses"
            actionLabel="Add Expense"
            onAction={openCreateExpenseForm}
          />
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-start justify-between gap-4 bg-white dark:bg-navy-700/50 rounded-xl border border-primary-100 dark:border-gold/20 p-4 hover:shadow-md transition-shadow duration-200"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-charcoal dark:text-warm-gray break-words">
                      {expense.description}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 dark:bg-navy-900 dark:text-gold capitalize">
                      {EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate dark:text-warm-gray/70 flex items-center gap-2 flex-wrap">
                    {expense.date && <span>{formatExpenseDate(expense.date)}</span>}
                    {expense.paidBy && (
                      <span>
                        Paid by {participantLabels.get(expense.paidBy) ?? "someone"}
                        {expense.splits.length > 1 && ` · split ${expense.splits.length} ways`}
                      </span>
                    )}
                    {expense.notes && (
                      <span className="truncate max-w-xs" title={expense.notes}>
                        {expense.notes}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <span className="block font-semibold text-charcoal dark:text-warm-gray whitespace-nowrap">
                      {formatCurrency(expense.amount, expense.currency)}
                    </span>
                    {expense.currency &&
                      expense.currency !== displayCurrency &&
                      (expense.baseAmount !== null &&
                      expense.baseCurrency === displayCurrency ? (
                        <span className="block text-xs text-slate dark:text-warm-gray/60 whitespace-nowrap">
                          ≈ {formatCurrency(expense.baseAmount, expense.baseCurrency)}
                        </span>
                      ) : (
                        <span className="block text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">
                          not converted
                        </span>
                      ))}
                  </div>
                  <div className="flex gap-1">
                    {expense.receiptPath && (
                      <button
                        type="button"
                        onClick={() =>
                          setViewingReceipt({ path: expense.receiptPath as string, title: expense.description })
                        }
                        className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors"
                        aria-label={`View receipt for ${expense.description}`}
                        title="View receipt"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditExpenseForm(expense)}
                      className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors"
                      aria-label={`Edit ${expense.description}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(expense)}
                      className="p-1.5 rounded-lg text-slate hover:text-red-600 dark:text-warm-gray/50 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      aria-label={`Delete ${expense.description}`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingReceipt && (
        <ReceiptViewer
          path={viewingReceipt.path}
          title={viewingReceipt.title}
          onClose={() => setViewingReceipt(null)}
        />
      )}
      <ConfirmDialogComponent />
    </div>
  );
}
