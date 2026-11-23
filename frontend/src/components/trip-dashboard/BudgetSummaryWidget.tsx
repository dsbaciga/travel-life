import { useState, useCallback } from 'react';
import { ChevronRightIcon, ChevronDownIcon } from '../icons';
import { formatCurrency as formatCurrencyValue } from '../../utils/formatCurrency';

interface BudgetSummaryWidgetProps {
  budget: number | null; // Total budget, null if not set
  spent: number; // Total spent
  breakdown: {
    lodging: number;
    transportation: number;
    activities: number;
    food: number;
    other: number;
  };
  currency: string; // e.g., 'USD', 'EUR'
  onNavigateToBudget: () => void;
}

/**
 * Wallet/budget icon for visual identification
 */
function WalletIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  );
}

/**
 * Warning/alert icon for over-budget state
 */
function AlertIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

/**
 * Checkmark icon for under-budget state
 */
function CheckCircleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Category icon components for breakdown display
 */
const CategoryIcons: Record<string, React.FC<{ className?: string }>> = {
  lodging: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  transportation: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),
  activities: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  food: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  other: ({ className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
    </svg>
  ),
};

/**
 * Progress bar component with budget status colors
 */
interface BudgetProgressBarProps {
  percentage: number;
  status: 'good' | 'warning' | 'over';
}

function BudgetProgressBar({ percentage, status }: BudgetProgressBarProps) {
  const colorClass = {
    good: 'bg-green-500 dark:bg-green-400',
    warning: 'bg-amber-500 dark:bg-amber-400',
    over: 'bg-red-500 dark:bg-red-400',
  }[status];

  // Cap display at 100% but still show full color
  const displayPercentage = Math.min(percentage, 100);

  return (
    <div
      className="h-3 bg-slate/10 dark:bg-navy-700 rounded-full overflow-hidden"
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Budget progress"
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${colorClass}`}
        style={{ width: `${displayPercentage}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Category breakdown row
 */
interface CategoryRowProps {
  name: string;
  amount: number;
  total: number;
  formatCurrency: (amount: number) => string;
}

function CategoryRow({ name, amount, total, formatCurrency }: CategoryRowProps) {
  const percentage = total > 0 ? Math.round((amount / total) * 100) : 0;
  const IconComponent = CategoryIcons[name] || CategoryIcons.other;

  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-shrink-0 text-slate dark:text-warm-gray/70">
        <IconComponent className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-charcoal dark:text-warm-gray truncate">
            {displayName}
          </span>
          <span className="text-sm font-medium tabular-nums text-charcoal dark:text-warm-gray flex-shrink-0">
            {formatCurrency(amount)}
          </span>
        </div>
      </div>
      <div className="flex-shrink-0 w-10 text-right">
        <span className="text-xs text-slate dark:text-warm-gray/60">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

/**
 * BudgetSummaryWidget - Dashboard widget showing budget overview and spending
 *
 * Features:
 * - Total budget vs. amount spent with progress bar
 * - Color-coded status: green (good), amber (>80%), red (over budget)
 * - Collapsible breakdown by category
 * - Currency formatting with Intl.NumberFormat
 * - Empty state when no budget is set
 * - Dark mode support
 */
export default function BudgetSummaryWidget({
  budget,
  spent,
  breakdown,
  currency,
  onNavigateToBudget,
}: BudgetSummaryWidgetProps) {
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);

  // Format currency via the shared guarded helper. Constructing an
  // Intl.NumberFormat here directly would throw a RangeError during render for
  // an unrecognised currency code, taking the whole dashboard down.
  const formatCurrency = useCallback(
    (amount: number) => formatCurrencyValue(amount, currency),
    [currency]
  );

  // Calculate budget status
  const percentage = budget && budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const remaining = budget ? budget - spent : 0;
  const isOverBudget = budget !== null && spent > budget;
  const isNearBudget = budget !== null && !isOverBudget && percentage >= 80;

  const status: 'good' | 'warning' | 'over' = isOverBudget
    ? 'over'
    : isNearBudget
    ? 'warning'
    : 'good';

  // Calculate breakdown total for percentages
  const breakdownTotal = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

  // Check if there's any spending data
  const hasSpendingData = spent > 0 || breakdownTotal > 0;

  // No budget set - empty state
  if (budget === null && !hasSpendingData) {
    return (
      <div className="card animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
            Budget
          </h3>
          <button
            onClick={onNavigateToBudget}
            className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
              hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
            aria-label="Go to Budget"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Empty State */}
        <div className="text-center py-6">
          <div className="mb-2">
            <WalletIcon className="w-12 h-12 mx-auto text-primary-300 dark:text-gold/40" />
          </div>
          <p className="text-sm text-slate dark:text-warm-gray/70 mb-3">
            No budget set for this trip
          </p>
          <button
            onClick={onNavigateToBudget}
            className="text-sm font-medium text-primary-600 dark:text-gold hover:underline"
          >
            Set a budget
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
            Budget
          </h3>
          {isOverBudget && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <AlertIcon className="w-3 h-3" />
              Over budget
            </span>
          )}
          {!isOverBudget && budget !== null && percentage === 100 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              At limit
            </span>
          )}
          {!isOverBudget && budget !== null && status === 'good' && percentage > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircleIcon className="w-3 h-3" />
              On track
            </span>
          )}
        </div>
        <button
          onClick={onNavigateToBudget}
          className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
            hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
          aria-label="Go to Budget"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Main Budget Display */}
      <div className="mb-4">
        {/* Amount Display */}
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <span className={`text-2xl font-bold font-display tabular-nums ${
              isOverBudget
                ? 'text-red-600 dark:text-red-400'
                : isNearBudget
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-charcoal dark:text-warm-gray'
            }`}>
              {formatCurrency(spent)}
            </span>
            {budget !== null && (
              <span className="text-sm text-slate dark:text-warm-gray/70 ml-1">
                of {formatCurrency(budget)}
              </span>
            )}
          </div>
          {budget !== null && (
            <span className={`text-sm font-medium ${
              isOverBudget
                ? 'text-red-600 dark:text-red-400'
                : isNearBudget
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-green-600 dark:text-green-400'
            }`}>
              {percentage}%
            </span>
          )}
        </div>

        {/* Progress Bar */}
        {budget !== null && (
          <BudgetProgressBar percentage={percentage} status={status} />
        )}

        {/* Remaining / Over Amount */}
        {budget !== null && (
          <div className="mt-2 text-right">
            <span className={`text-sm tabular-nums ${
              isOverBudget
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate dark:text-warm-gray/70'
            }`}>
              {isOverBudget
                ? `${formatCurrency(Math.abs(remaining))} over budget`
                : `${formatCurrency(remaining)} remaining`}
            </span>
          </div>
        )}
      </div>

      {/* Breakdown Toggle */}
      {breakdownTotal > 0 && (
        <>
          <button
            onClick={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
            className="w-full flex items-center justify-between py-2 px-1 -mx-1 text-left transition-colors duration-200
              hover:bg-primary-50/30 dark:hover:bg-navy-700/30 rounded-lg border-t border-slate/10 dark:border-warm-gray/10"
            aria-expanded={isBreakdownExpanded}
          >
            <span className="text-sm font-medium text-slate dark:text-warm-gray/70">
              Spending Breakdown
            </span>
            <div className="text-slate dark:text-warm-gray/50">
              {isBreakdownExpanded ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronRightIcon className="w-4 h-4" />
              )}
            </div>
          </button>

          {/* Breakdown Content */}
          {isBreakdownExpanded && (
            <div className="animate-fade-in pt-1 pb-2">
              <div className="space-y-0.5">
                {Object.entries(breakdown)
                  .filter(([, amount]) => amount > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, amount]) => (
                    <CategoryRow
                      key={category}
                      name={category}
                      amount={amount}
                      total={breakdownTotal}
                      formatCurrency={formatCurrency}
                    />
                  ))}
              </div>

              {/* Total */}
              <div className="mt-3 pt-2 border-t border-slate/10 dark:border-warm-gray/10 flex items-center justify-between">
                <span className="text-sm font-medium text-charcoal dark:text-warm-gray">
                  Total Spent
                </span>
                <span className="text-sm font-bold tabular-nums text-charcoal dark:text-warm-gray">
                  {formatCurrency(breakdownTotal)}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* No spending yet state */}
      {budget !== null && !hasSpendingData && (
        <div className="text-center py-4 border-t border-slate/10 dark:border-warm-gray/10">
          <p className="text-sm text-slate dark:text-warm-gray/70">
            No expenses recorded yet
          </p>
        </div>
      )}

      {/* Footer Link */}
      <div className="mt-4 pt-3 border-t border-slate/10 dark:border-warm-gray/10">
        <button
          onClick={onNavigateToBudget}
          className="w-full text-center text-sm font-medium text-primary-600 dark:text-gold hover:underline
            py-1.5 rounded-lg hover:bg-primary-50/50 dark:hover:bg-navy-700/30 transition-colors duration-200"
        >
          View budget details
        </button>
      </div>
    </div>
  );
}
