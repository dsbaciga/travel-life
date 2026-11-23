import { useEffect, useState } from 'react';
import Icon from './ui/Icon';

/**
 * Entity types that support bulk operations
 */
export type BulkEntityType =
  | 'activity'
  | 'location'
  | 'transportation'
  | 'lodging'
  | 'link'
  | 'customItem';

/**
 * Singular/plural labels per entity type.
 *
 * Explicit rather than derived: capitalising the union member and appending "s"
 * produced "Activitys", and would produce "CustomItems" for the camelCase member.
 */
const ENTITY_LABELS: Record<BulkEntityType, { singular: string; plural: string }> = {
  activity: { singular: 'Activity', plural: 'Activities' },
  location: { singular: 'Location', plural: 'Locations' },
  transportation: { singular: 'Transportation', plural: 'Transportation' },
  lodging: { singular: 'Lodging', plural: 'Lodging' },
  link: { singular: 'Link', plural: 'Links' },
  customItem: { singular: 'Custom item', plural: 'Custom items' },
};

interface BulkActionBarProps {
  /** Type of entity being selected */
  entityType: BulkEntityType;
  /** Number of selected items */
  selectedCount: number;
  /** Total number of items in the list */
  totalCount: number;
  /** Callback when "Select All" is clicked */
  onSelectAll: () => void;
  /** Callback when "Deselect All" is clicked */
  onDeselectAll: () => void;
  /** Callback when exiting selection mode */
  onExitSelectionMode: () => void;
  /** Callback when bulk delete is clicked */
  onBulkDelete: () => void;
  /** Callback when bulk edit is clicked */
  onBulkEdit?: () => void;
  /** Whether delete operation is in progress */
  isDeleting?: boolean;
  /** Whether edit operation is in progress */
  isEditing?: boolean;
  /** Custom action buttons to render */
  customActions?: React.ReactNode;
}

/**
 * BulkActionBar provides a floating action bar for bulk operations on entities.
 * Appears at the bottom of the screen when items are selected, similar to BatchPhotoToolbar.
 *
 * Features:
 * - Shows selection count
 * - Select all / Deselect all buttons
 * - Bulk delete action
 * - Bulk edit action (optional)
 * - Custom action buttons support
 * - Animated enter/exit transitions
 * - Responsive design for mobile/desktop
 *
 * @example
 * ```tsx
 * {selectionMode && (
 *   <BulkActionBar
 *     entityType="activity"
 *     selectedCount={selectedIds.size}
 *     totalCount={activities.length}
 *     onSelectAll={() => selectAll(activities)}
 *     onDeselectAll={deselectAll}
 *     onExitSelectionMode={exitSelectionMode}
 *     onBulkDelete={handleBulkDelete}
 *     onBulkEdit={handleBulkEdit}
 *     isDeleting={isDeleting}
 *   />
 * )}
 * ```
 */
export default function BulkActionBar({
  entityType,
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onExitSelectionMode,
  onBulkDelete,
  onBulkEdit,
  isDeleting = false,
  isEditing = false,
  customActions,
}: BulkActionBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle mount/unmount animation
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (selectedCount > 0) {
      setShouldRender(true);
      // Small delay to trigger animation
      timer = setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      // Wait for animation to complete before unmounting
      timer = setTimeout(() => setShouldRender(false), 300);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [selectedCount]);

  if (!shouldRender) return null;

  const entityLabel = ENTITY_LABELS[entityType].singular;
  const pluralLabel =
    selectedCount === 1 ? entityLabel : ENTITY_LABELS[entityType].plural;

  return (
    <>
    {/* Keeps the last item clear of the fixed bar when scrolled to the end. */}
    <div aria-hidden="true" className="h-32 sm:h-24" />
    <div
      className={`fixed bottom-16 md:bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Backdrop blur effect */}
      <div className="bg-white/95 dark:bg-navy-900/95 backdrop-blur-lg border-t border-warm-gray dark:border-gold/20 shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 py-3 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left section: Selection info */}
            <div className="flex items-center gap-3">
              {/* Checkmark indicator */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40">
                <Icon name="check" className="text-primary-600 dark:text-primary-400" />
              </div>

              {/* Selection count */}
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-charcoal dark:text-warm-gray">
                  {selectedCount} {pluralLabel.toLowerCase()} selected
                </span>
                <span className="text-xs text-slate dark:text-warm-gray/70">
                  of {totalCount} total
                </span>
              </div>

              {/* Select All / Deselect buttons (desktop) */}
              <div className="hidden sm:flex items-center gap-1 ml-2">
                {selectedCount < totalCount && (
                  <button
                    onClick={onSelectAll}
                    className="px-2 py-1 text-xs font-medium text-primary-600 dark:text-gold hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
                  >
                    Select all
                  </button>
                )}
                {selectedCount > 0 && (
                  <button
                    onClick={onDeselectAll}
                    className="px-2 py-1 text-xs font-medium text-slate dark:text-warm-gray/70 hover:bg-parchment dark:hover:bg-navy-700 rounded transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
                  >
                    Deselect
                  </button>
                )}
              </div>
            </div>

            {/* Right section: Actions */}
            <div className="flex items-center gap-2">
              {/* Mobile: Select All / Clear */}
              <div className="flex sm:hidden items-center gap-1 mr-2">
                {selectedCount < totalCount && (
                  <button
                    onClick={onSelectAll}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-primary-600 dark:text-gold hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
                    title="Select all"
                    aria-label="Select all"
                  >
                    <Icon name="success" />
                  </button>
                )}
              </div>

              {/* Custom Actions */}
              {customActions}

              {/* Bulk Edit */}
              {onBulkEdit && (
                <button
                  onClick={onBulkEdit}
                  disabled={isEditing || selectedCount === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-gold hover:bg-primary-200 dark:hover:bg-primary-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] justify-center focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
                  title="Edit selected items"
                  aria-label="Edit selected items"
                >
                  {isEditing ? (
                    <Icon name="spinner" size={16} className="animate-spin" />
                  ) : (
                    <Icon name="edit" size={16} />
                  )}
                  <span className="hidden sm:inline">{isEditing ? 'Editing...' : 'Edit'}</span>
                </button>
              )}

              {/* Bulk Delete */}
              <button
                onClick={onBulkDelete}
                disabled={isDeleting || selectedCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] justify-center focus-visible:ring-2 focus-visible:ring-red-500/50"
                title="Delete selected items"
                aria-label="Delete selected items"
              >
                {isDeleting ? (
                  <Icon name="spinner" size={16} className="animate-spin" />
                ) : (
                  <Icon name="delete" size={16} />
                )}
                <span className="hidden sm:inline">{isDeleting ? 'Deleting...' : 'Delete'}</span>
              </button>

              {/* Close / Done button */}
              <button
                onClick={onExitSelectionMode}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg text-slate dark:text-warm-gray/70 hover:bg-parchment dark:hover:bg-navy-700 transition-colors ml-1 focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
                title="Exit selection mode"
                aria-label="Exit selection mode"
              >
                <Icon name="close" size={16} />
                <span className="hidden sm:inline">Done</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
