import { useState } from 'react';
import type { FieldDiff } from '../../types/sync.types';
import { formatValueForDisplay } from '../../types/sync.types';
import Icon from '../ui/Icon';

export interface ConflictFieldDiffProps {
  /** The field difference to display */
  diff: FieldDiff;
  /** Whether merge mode is enabled (shows radio buttons) */
  mergeMode?: boolean;
  /** Callback when selection changes (in merge mode) */
  onSelectionChange?: (field: string, source: 'local' | 'server') => void;
  /** Currently selected source (in merge mode) */
  selectedSource?: 'local' | 'server';
}

/**
 * ConflictFieldDiff displays a single field difference between local and server versions.
 *
 * Features:
 * - Side-by-side comparison of local vs server values
 * - Visual diff with color coding (gold for local, blue for server)
 * - Radio buttons for field-by-field selection in merge mode
 * - Handles various data types (strings, numbers, dates, booleans)
 *
 * @example
 * ```tsx
 * <ConflictFieldDiff
 *   diff={{
 *     field: 'title',
 *     label: 'Title',
 *     localValue: 'My Updated Trip',
 *     serverValue: 'Original Trip Name'
 *   }}
 *   mergeMode={true}
 *   selectedSource="local"
 *   onSelectionChange={(field, source) => handleSelection(field, source)}
 * />
 * ```
 */
export default function ConflictFieldDiff({
  diff,
  mergeMode = false,
  onSelectionChange,
  selectedSource,
}: ConflictFieldDiffProps) {
  const [expanded, setExpanded] = useState(false);

  const localDisplay = formatValueForDisplay(diff.localValue);
  const serverDisplay = formatValueForDisplay(diff.serverValue);

  // Determine if values are long and need expansion
  const isLongValue =
    localDisplay.length > 50 || serverDisplay.length > 50 || localDisplay.includes('\n') || serverDisplay.includes('\n');

  const handleLocalSelect = () => {
    onSelectionChange?.(diff.field, 'local');
  };

  const handleServerSelect = () => {
    onSelectionChange?.(diff.field, 'server');
  };

  return (
    <div className="border border-warm-gray/30 dark:border-navy-600 rounded-xl overflow-hidden bg-white dark:bg-navy-800">
      {/* Field Header */}
      <div className="bg-parchment dark:bg-navy-700/50 px-4 py-2.5 border-b border-warm-gray/30 dark:border-navy-600">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-charcoal dark:text-warm-gray">
            {diff.label}
          </span>
          {isLongValue && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary-600 dark:text-gold hover:underline focus:outline-none"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>
      </div>

      {/* Values Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-warm-gray/30 dark:divide-navy-600">
        {/* Local Value (Your Changes) */}
        <div
          className={`p-4 transition-colors ${
            mergeMode && selectedSource === 'local'
              ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-inset ring-primary-500 dark:ring-gold'
              : ''
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40">
              <Icon name="smartphone" size={14} className="text-primary-600 dark:text-gold" />
            </div>
            <span className="text-xs font-medium text-primary-700 dark:text-gold">
              Your changes
            </span>
            {mergeMode && (
              <label className="ml-auto flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`field-${diff.field}`}
                  checked={selectedSource === 'local'}
                  onChange={handleLocalSelect}
                  className="w-4 h-4 text-primary-600 dark:text-gold border-gray-300 dark:border-navy-600
                             focus:ring-primary-500 dark:focus:ring-gold cursor-pointer"
                />
                <span className="text-xs text-charcoal dark:text-warm-gray">Use this</span>
              </label>
            )}
          </div>

          <div
            className={`text-sm text-charcoal dark:text-warm-gray bg-primary-50/50 dark:bg-primary-900/10
                        rounded-lg p-3 ${isLongValue && !expanded ? 'line-clamp-2' : ''}`}
          >
            {localDisplay === '(empty)' ? (
              <span className="text-slate dark:text-warm-gray/60 italic">(empty)</span>
            ) : (
              <span className="whitespace-pre-wrap break-words">{localDisplay}</span>
            )}
          </div>
        </div>

        {/* Server Value */}
        <div
          className={`p-4 transition-colors ${
            mergeMode && selectedSource === 'server'
              ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-500 dark:ring-blue-400'
              : ''
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40">
              <Icon name="computer" size={14} className="text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
              Server version
            </span>
            {mergeMode && (
              <label className="ml-auto flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`field-${diff.field}`}
                  checked={selectedSource === 'server'}
                  onChange={handleServerSelect}
                  className="w-4 h-4 text-blue-600 border-gray-300 dark:border-navy-600
                             focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs text-charcoal dark:text-warm-gray">Use this</span>
              </label>
            )}
          </div>

          <div
            className={`text-sm text-charcoal dark:text-warm-gray bg-blue-50/50 dark:bg-blue-900/10
                        rounded-lg p-3 ${isLongValue && !expanded ? 'line-clamp-2' : ''}`}
          >
            {serverDisplay === '(empty)' ? (
              <span className="text-slate dark:text-warm-gray/60 italic">(empty)</span>
            ) : (
              <span className="whitespace-pre-wrap break-words">{serverDisplay}</span>
            )}
          </div>
        </div>
      </div>

      {/* Visual Diff Indicator */}
      {!mergeMode && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-warm-gray/30 dark:border-navy-600">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <Icon name="alert" size={16} />
            <span>This field was changed in both places</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version of ConflictFieldDiff for lists and summaries.
 */
ConflictFieldDiff.Compact = function CompactConflictFieldDiff({
  diff,
  selectedSource,
}: Pick<ConflictFieldDiffProps, 'diff' | 'selectedSource'>) {
  const localDisplay = formatValueForDisplay(diff.localValue);
  const serverDisplay = formatValueForDisplay(diff.serverValue);

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-parchment dark:bg-navy-700/30 rounded-lg">
      <span className="text-sm font-medium text-charcoal dark:text-warm-gray min-w-[100px]">
        {diff.label}
      </span>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Local value */}
        <span
          className={`text-xs px-2 py-0.5 rounded-full truncate max-w-[120px] ${
            selectedSource === 'local'
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-gold font-medium'
              : 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-300 line-through'
          }`}
          title={localDisplay}
        >
          {localDisplay.length > 20 ? localDisplay.substring(0, 20) + '...' : localDisplay}
        </span>

        <Icon name="forward" size={16} className="text-slate dark:text-warm-gray/50" />

        {/* Server value */}
        <span
          className={`text-xs px-2 py-0.5 rounded-full truncate max-w-[120px] ${
            selectedSource === 'server'
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-medium'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 line-through'
          }`}
          title={serverDisplay}
        >
          {serverDisplay.length > 20 ? serverDisplay.substring(0, 20) + '...' : serverDisplay}
        </span>
      </div>
    </div>
  );
};
