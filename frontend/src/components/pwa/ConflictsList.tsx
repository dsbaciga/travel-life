import { useState } from 'react';
import Icon from '../ui/Icon';
import type { SyncConflict, ConflictResolution, SyncConflictEntityType } from '../../types/sync.types';
import { ENTITY_TYPE_LABELS, getFieldDiffs } from '../../types/sync.types';
import ConflictResolutionModal from './ConflictResolutionModal';

/**
 * Icon mapping for entity types
 */
const ENTITY_ICONS: Record<SyncConflictEntityType, React.ReactNode> = {
  TRIP: <Icon name="trip" size={16} />,
  LOCATION: <Icon name="place" size={16} />,
  ACTIVITY: <Icon name="calendar" size={16} />,
  TRANSPORTATION: <Icon name="transportation" size={16} />,
  LODGING: <Icon name="lodging" size={16} />,
  JOURNAL: <Icon name="journal" size={16} />,
  CHECKLIST_ITEM: <Icon name="check" size={16} />,
};

export interface ConflictsListProps {
  /** List of pending conflicts */
  conflicts: SyncConflict[];
  /** Callback when a conflict is resolved */
  onResolve: (
    conflictId: number,
    resolution: ConflictResolution,
    resolvedData: Record<string, unknown>
  ) => void;
  /** Callback when all conflicts are resolved with the same resolution */
  onResolveAll?: (resolution: 'keep-local' | 'keep-server') => void;
  /** Whether any resolution is in progress */
  isResolving?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ConflictsList displays all pending sync conflicts with options to resolve them.
 *
 * Features:
 * - List of all pending conflicts with entity type, name, and timestamp
 * - Click to open resolution modal for individual conflicts
 * - "Resolve All" buttons to batch resolve (keep all local or all server)
 * - Badge showing count of unresolved conflicts
 * - Empty state when no conflicts exist
 *
 * @example
 * ```tsx
 * <ConflictsList
 *   conflicts={pendingConflicts}
 *   onResolve={handleResolve}
 *   onResolveAll={handleResolveAll}
 * />
 * ```
 */
export default function ConflictsList({
  conflicts,
  onResolve,
  onResolveAll,
  isResolving = false,
  className = '',
}: ConflictsListProps) {
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [showResolveAllConfirm, setShowResolveAllConfirm] = useState<'keep-local' | 'keep-server' | null>(null);

  // Handle opening a conflict for resolution
  const handleOpenConflict = (conflict: SyncConflict) => {
    setSelectedConflict(conflict);
  };

  // Handle closing the resolution modal
  const handleCloseModal = () => {
    setSelectedConflict(null);
  };

  // Handle resolving a single conflict
  const handleResolve = (
    conflictId: number,
    resolution: ConflictResolution,
    resolvedData: Record<string, unknown>
  ) => {
    onResolve(conflictId, resolution, resolvedData);
    setSelectedConflict(null);
  };

  // Handle resolve all confirmation
  const handleResolveAllClick = (resolution: 'keep-local' | 'keep-server') => {
    setShowResolveAllConfirm(resolution);
  };

  // Handle confirming resolve all
  const handleConfirmResolveAll = () => {
    if (showResolveAllConfirm && onResolveAll) {
      onResolveAll(showResolveAllConfirm);
    }
    setShowResolveAllConfirm(null);
  };

  // Get entity name from conflict data
  const getEntityName = (conflict: SyncConflict): string => {
    const data = conflict.localData;
    return (
      (data.title as string) ||
      (data.name as string) ||
      (data.text as string) ||
      `${ENTITY_TYPE_LABELS[conflict.entityType]} #${conflict.entityId}`
    );
  };

  // Format relative time
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Empty state
  if (conflicts.length === 0) {
    return (
      <div
        className={`
          rounded-xl bg-white/80 dark:bg-navy-800/90 border border-primary-100 dark:border-gold/20
          backdrop-blur-sm p-8 text-center
          ${className}
        `}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <Icon name="success" size={28} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-charcoal dark:text-warm-gray">No sync conflicts</h3>
            <p className="text-sm text-slate dark:text-warm-gray/70 mt-1">
              All your data is synchronized with the server
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`
          rounded-xl bg-white/80 dark:bg-navy-800/90 border border-primary-100 dark:border-gold/20
          backdrop-blur-sm overflow-hidden
          ${className}
        `}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-warm-gray/20 dark:border-navy-600 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40">
                <Icon name="alert" size={16} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-charcoal dark:text-warm-gray">
                  Sync conflicts
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'} need resolution
                </p>
              </div>
            </div>

            {/* Resolve All Buttons */}
            {onResolveAll && conflicts.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleResolveAllClick('keep-local')}
                  disabled={isResolving}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                    bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-gold
                    hover:bg-primary-200 dark:hover:bg-primary-900/60
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                  "
                >
                  <Icon name="smartphone" size={14} />
                  Keep all local
                </button>
                <button
                  type="button"
                  onClick={() => handleResolveAllClick('keep-server')}
                  disabled={isResolving}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                    bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400
                    hover:bg-blue-200 dark:hover:bg-blue-900/60
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                  "
                >
                  <Icon name="computer" size={14} />
                  Keep all server
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Conflicts List */}
        <div className="divide-y divide-warm-gray/20 dark:divide-navy-600">
          {conflicts.map((conflict) => {
            const entityName = getEntityName(conflict);
            const fieldDiffs = getFieldDiffs(conflict.localData, conflict.serverData);

            return (
              <button
                key={conflict.id}
                type="button"
                onClick={() => handleOpenConflict(conflict)}
                disabled={isResolving}
                className="
                  w-full px-4 py-3 text-left
                  hover:bg-parchment dark:hover:bg-navy-700/50
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-inset
                  focus-visible:ring-primary-500 dark:focus-visible:ring-gold
                "
              >
                <div className="flex items-center gap-3">
                  {/* Entity Icon */}
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex-shrink-0">
                    {ENTITY_ICONS[conflict.entityType]}
                  </div>

                  {/* Conflict Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-charcoal dark:text-warm-gray truncate">
                        {entityName}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                        {ENTITY_TYPE_LABELS[conflict.entityType]}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-slate dark:text-warm-gray/70">
                      <span>{fieldDiffs.length} {fieldDiffs.length === 1 ? 'field' : 'fields'} changed</span>
                      <span className="text-warm-gray/50 dark:text-navy-500">|</span>
                      <span>Detected {formatRelativeTime(conflict.conflictDetectedAt)}</span>
                    </div>
                  </div>

                  {/* Chevron */}
                  <Icon name="chevronRight" className="text-slate dark:text-warm-gray/50 flex-shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution Modal */}
      {selectedConflict && (
        <ConflictResolutionModal
          conflict={selectedConflict}
          isOpen={true}
          onClose={handleCloseModal}
          onResolve={handleResolve}
          isResolving={isResolving}
        />
      )}

      {/* Resolve All Confirmation Dialog */}
      {showResolveAllConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowResolveAllConfirm(null)}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div className="relative bg-white dark:bg-navy-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-primary-100 dark:border-gold/20">
            <div className="flex items-start gap-4">
              <div
                className={`
                  flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0
                  ${showResolveAllConfirm === 'keep-local'
                    ? 'bg-primary-100 dark:bg-primary-900/40'
                    : 'bg-blue-100 dark:bg-blue-900/40'
                  }
                `}
              >
                {showResolveAllConfirm === 'keep-local' ? (
                  <Icon name="smartphone" size={24} className="text-primary-600 dark:text-gold" />
                ) : (
                  <Icon name="computer" size={24} className="text-blue-600 dark:text-blue-400" />
                )}
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-display font-semibold text-charcoal dark:text-warm-gray">
                  Resolve All Conflicts?
                </h3>
                <p className="text-sm text-slate dark:text-warm-gray/80 mt-2">
                  {showResolveAllConfirm === 'keep-local'
                    ? `This will keep your offline changes for all ${conflicts.length} conflicts and overwrite the server versions.`
                    : `This will use the server versions for all ${conflicts.length} conflicts and discard your offline changes.`
                  }
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowResolveAllConfirm(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResolveAll}
                className={`
                  px-4 py-2.5 rounded-lg font-medium transition-all
                  ${showResolveAllConfirm === 'keep-local'
                    ? 'bg-gradient-to-r from-primary-500 to-primary-600 dark:from-accent-400 dark:to-accent-600 text-white shadow-lg shadow-primary-500/20'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                  }
                  hover:-translate-y-0.5
                `}
              >
                {showResolveAllConfirm === 'keep-local' ? 'Keep all local' : 'Keep all server'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * ConflictsBadge shows a count badge for unresolved conflicts.
 */
ConflictsList.Badge = function ConflictsBadge({
  count,
  onClick,
  className = '',
}: {
  count: number;
  onClick?: () => void;
  className?: string;
}) {
  if (count === 0) return null;

  const content = (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
        bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400
        ${onClick ? 'cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors' : ''}
        ${className}
      `}
    >
      <Icon name="alert" size={12} />
      {count} {count === 1 ? 'conflict' : 'conflicts'}
    </span>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="focus:outline-none">
        {content}
      </button>
    );
  }

  return content;
};

/**
 * ConflictsIndicator shows a minimal indicator that conflicts exist.
 */
ConflictsList.Indicator = function ConflictsIndicator({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        relative inline-flex items-center justify-center w-8 h-8 rounded-full
        bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400
        hover:bg-amber-200 dark:hover:bg-amber-900/60
        transition-colors duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500
      "
      title={`${count} sync ${count === 1 ? 'conflict' : 'conflicts'}`}
    >
      <Icon name="alert" size={16} />
      <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">
        {count > 9 ? '9+' : count}
      </span>
    </button>
  );
};
