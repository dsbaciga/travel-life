import Icon from '../ui/Icon';
import { useState, useCallback } from 'react';
import { ChevronRightIcon, ChevronDownIcon } from '../icons';
import type { Checklist } from '../../types/checklist';

interface ChecklistsWidgetProps {
  checklists: Checklist[];
  onToggleItem: (checklistId: number, itemId: number, completed: boolean) => void;
  onNavigateToChecklists: () => void;
  isLoading?: boolean;
}

/**
 * Checklist icon for visual identification
 */
function ChecklistIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <Icon name="checklist" className={className} />
  );
}

/**
 * Checkmark icon for completed checklists
 */
function CheckCircleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <Icon name="success" className={className} />
  );
}

/**
 * Individual checklist item with checkbox
 */
interface ChecklistItemRowProps {
  item: { id: number; name: string; isChecked: boolean };
  checklistId: number;
  onToggle: (checklistId: number, itemId: number, completed: boolean) => void;
  isToggling: boolean;
}

function ChecklistItemRow({
  item,
  checklistId,
  onToggle,
  isToggling,
}: ChecklistItemRowProps) {
  const handleChange = () => {
    onToggle(checklistId, item.id, !item.isChecked);
  };

  return (
    <label
      className={`flex items-center gap-3 min-w-0 py-2 px-3 rounded-lg cursor-pointer transition-all duration-200
        hover:bg-primary-50/50 dark:hover:bg-navy-700/50
        ${isToggling ? 'opacity-60' : ''}
      `}
    >
      <div className="relative flex-shrink-0">
        <input
          type="checkbox"
          checked={item.isChecked}
          onChange={handleChange}
          disabled={isToggling}
          className="peer sr-only"
        />
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200
            ${
              item.isChecked
                ? 'bg-accent-500 border-accent-500 dark:bg-accent-400 dark:border-accent-400'
                : 'border-slate/30 dark:border-warm-gray/30'
            }
            peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500/50 peer-focus-visible:ring-offset-2
            dark:peer-focus-visible:ring-gold/50
          `}
        >
          {item.isChecked && (
            <Icon name="check" className="w-3 h-3 text-white animate-scale-in" />
          )}
        </div>
      </div>
      <span
        className={`min-w-0 break-words [overflow-wrap:anywhere] text-sm font-body transition-all duration-200 ${
          item.isChecked
            ? 'text-slate line-through dark:text-warm-gray/60'
            : 'text-charcoal dark:text-warm-gray'
        }`}
      >
        {item.name}
      </span>
    </label>
  );
}

/**
 * Progress bar component
 */
interface ProgressBarProps {
  percentage: number;
  isComplete: boolean;
}

function ProgressBar({ percentage, isComplete }: ProgressBarProps) {
  return (
    <div className="h-2 bg-slate/10 dark:bg-navy-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${
          isComplete
            ? 'bg-green-500 dark:bg-green-400'
            : 'bg-accent-500 dark:bg-accent-400'
        }`}
        style={{ width: `${percentage}%` }}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

/**
 * Individual checklist accordion item
 */
interface ChecklistAccordionProps {
  checklist: Checklist;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleItem: (checklistId: number, itemId: number, completed: boolean) => void;
  togglingItemIds: Set<number>;
}

function ChecklistAccordion({
  checklist,
  isExpanded,
  onToggleExpand,
  onToggleItem,
  togglingItemIds,
}: ChecklistAccordionProps) {
  const items = checklist.items || [];
  const checkedCount = items.filter((item) => item.isChecked).length;
  const totalCount = items.length;
  const percentage = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const isComplete = checkedCount === totalCount && totalCount > 0;

  return (
    <div className="border-b border-slate/10 dark:border-warm-gray/10 last:border-b-0">
      {/* Checklist Header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 py-3 px-1 text-left transition-colors duration-200
          hover:bg-primary-50/30 dark:hover:bg-navy-700/30 rounded-lg -mx-1"
        aria-expanded={isExpanded}
      >
        {/* Icon */}
        <div
          className={`flex-shrink-0 ${
            isComplete
              ? 'text-green-500 dark:text-green-400'
              : 'text-primary-500 dark:text-gold'
          }`}
        >
          {isComplete ? (
            <CheckCircleIcon className="w-5 h-5" />
          ) : (
            <ChecklistIcon className="w-5 h-5" />
          )}
        </div>

        {/* Name and Progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-medium text-sm text-charcoal dark:text-warm-gray truncate">
              {checklist.name}
            </span>
            <span
              className={`text-xs font-medium flex-shrink-0 ${
                isComplete
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-slate dark:text-warm-gray/70'
              }`}
            >
              {checkedCount}/{totalCount}
            </span>
          </div>
          <ProgressBar percentage={percentage} isComplete={isComplete} />
        </div>

        {/* Expand/Collapse Icon */}
        <div
          className={`flex-shrink-0 text-slate dark:text-warm-gray/50 transition-transform duration-200 ${
            isExpanded ? 'rotate-0' : ''
          }`}
        >
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expanded Items */}
      {isExpanded && items.length > 0 && (
        <div className="pb-3 pl-8 pr-2 animate-fade-in">
          <div className="space-y-0.5">
            {items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                checklistId={checklist.id}
                onToggle={onToggleItem}
                isToggling={togglingItemIds.has(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty items state */}
      {isExpanded && items.length === 0 && (
        <div className="pb-3 pl-8 pr-2 animate-fade-in">
          <p className="text-sm text-slate dark:text-warm-gray/60 italic py-2">
            No items in this checklist
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * ChecklistsWidget - Dashboard widget showing checklist progress with expandable items
 *
 * Features:
 * - Compact view with progress bars
 * - Expandable accordion for each checklist
 * - Optimistic UI updates on check/uncheck
 * - Visual feedback with animations
 * - Empty state handling
 * - Dark mode support
 */
export default function ChecklistsWidget({
  checklists,
  onToggleItem,
  onNavigateToChecklists,
  isLoading = false,
}: ChecklistsWidgetProps) {
  // Track which checklists are expanded
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Track items currently being toggled (for loading state)
  const [togglingItemIds, setTogglingItemIds] = useState<Set<number>>(new Set());

  // Toggle expand/collapse for a checklist
  const toggleExpand = useCallback((checklistId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(checklistId)) {
        next.delete(checklistId);
      } else {
        next.add(checklistId);
      }
      return next;
    });
  }, []);

  // Handle item toggle with optimistic update tracking
  const handleToggleItem = useCallback(
    async (checklistId: number, itemId: number, completed: boolean) => {
      // Mark item as toggling
      setTogglingItemIds((prev) => new Set(prev).add(itemId));

      try {
        await onToggleItem(checklistId, itemId, completed);
      } finally {
        // Remove toggling state
        setTogglingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [onToggleItem]
  );

  // Calculate overall progress
  const overallStats = checklists.reduce(
    (acc, checklist) => {
      const items = checklist.items || [];
      acc.total += items.length;
      acc.checked += items.filter((item) => item.isChecked).length;
      return acc;
    },
    { total: 0, checked: 0 }
  );

  const overallPercentage =
    overallStats.total > 0
      ? Math.round((overallStats.checked / overallStats.total) * 100)
      : 0;

  const isAllComplete =
    overallStats.checked === overallStats.total && overallStats.total > 0;

  // Loading state
  if (isLoading) {
    return (
      <div className="card animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-slate/10 dark:bg-navy-700 rounded w-24 animate-pulse" />
          <div className="h-4 w-4 bg-slate/10 dark:bg-navy-700 rounded animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-slate/10 dark:bg-navy-700 rounded w-3/4 animate-pulse" />
              <div className="h-2 bg-slate/10 dark:bg-navy-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (checklists.length === 0) {
    return (
      <div className="card animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
            Checklists
          </h3>
          <button
            onClick={onNavigateToChecklists}
            className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
              hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
            aria-label="Go to checklists"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Empty State */}
        <div className="text-center py-6">
          <div className="text-4xl mb-2">
            <ChecklistIcon className="w-12 h-12 mx-auto text-primary-300 dark:text-gold/40" />
          </div>
          <p className="text-sm text-slate dark:text-warm-gray/70 mb-3">
            No checklists for this trip
          </p>
          <button
            onClick={onNavigateToChecklists}
            className="text-sm font-medium text-primary-600 dark:text-gold hover:underline"
          >
            Create a checklist
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
            Checklists
          </h3>
          {isAllComplete && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              All done!
            </span>
          )}
        </div>
        <button
          onClick={onNavigateToChecklists}
          className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
            hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
          aria-label="Go to checklists"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Overall Progress */}
      {checklists.length > 1 && (
        <div className="mb-4 pb-4 border-b border-slate/10 dark:border-warm-gray/10">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate dark:text-warm-gray/70">
              Overall progress
            </span>
            <span
              className={`text-xs font-medium ${
                isAllComplete
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-slate dark:text-warm-gray/70'
              }`}
            >
              {overallStats.checked}/{overallStats.total} ({overallPercentage}%)
            </span>
          </div>
          <ProgressBar percentage={overallPercentage} isComplete={isAllComplete} />
        </div>
      )}

      {/* Checklists List */}
      <div className="space-y-1">
        {checklists.map((checklist) => (
          <ChecklistAccordion
            key={checklist.id}
            checklist={checklist}
            isExpanded={expandedIds.has(checklist.id)}
            onToggleExpand={() => toggleExpand(checklist.id)}
            onToggleItem={handleToggleItem}
            togglingItemIds={togglingItemIds}
          />
        ))}
      </div>

      {/* Footer Link */}
      <div className="mt-4 pt-3 border-t border-slate/10 dark:border-warm-gray/10">
        <button
          onClick={onNavigateToChecklists}
          className="w-full text-center text-sm font-medium text-primary-600 dark:text-gold hover:underline
            py-1.5 rounded-lg hover:bg-primary-50/50 dark:hover:bg-navy-700/30 transition-colors duration-200"
        >
          View all checklists
        </button>
      </div>
    </div>
  );
}
