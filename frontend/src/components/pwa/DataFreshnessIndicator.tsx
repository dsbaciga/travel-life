import { useCallback } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineReady } from '../../hooks/useOfflineReady';
import Icon from '../ui/Icon';

/**
 * Staleness threshold in milliseconds (24 hours)
 */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface DataFreshnessIndicatorProps {
  /** Trip ID to show freshness for */
  tripId?: string;
  /** Callback to trigger refresh/sync */
  onRefresh?: () => Promise<void>;
  /** Custom staleness threshold in milliseconds (default: 24 hours) */
  staleThresholdMs?: number;
  /** Whether to show refresh button */
  showRefreshButton?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * DataFreshnessIndicator shows when data was last synced with appropriate styling.
 *
 * Features:
 * - Shows "Last synced X ago" text
 * - Warning style if data is stale (>24 hours by default)
 * - Refresh button to trigger sync
 * - Compact inline display
 *
 * @example
 * ```tsx
 * // Basic usage
 * <DataFreshnessIndicator tripId={tripId} />
 *
 * // With custom threshold and refresh handler
 * <DataFreshnessIndicator
 *   tripId={tripId}
 *   staleThresholdMs={12 * 60 * 60 * 1000} // 12 hours
 *   onRefresh={handleRefresh}
 * />
 * ```
 */
export default function DataFreshnessIndicator({
  tripId,
  onRefresh,
  staleThresholdMs = STALE_THRESHOLD_MS,
  showRefreshButton = true,
  className = '',
}: DataFreshnessIndicatorProps) {
  const { isOnline } = useNetworkStatus();
  const { lastSynced, isSyncing } = useOfflineReady(tripId);

  // Calculate staleness
  const isStale = lastSynced
    ? new Date().getTime() - lastSynced.getTime() > staleThresholdMs
    : false;

  // Handle refresh action
  const handleRefresh = useCallback(async () => {
    if (!isOnline || isSyncing || !onRefresh) return;
    await onRefresh();
  }, [isOnline, isSyncing, onRefresh]);

  // Don't render if no sync data
  if (!lastSynced && !isSyncing) {
    return null;
  }

  return (
    <div
      className={`
        inline-flex items-center gap-2 text-xs font-body
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      {/* Status icon */}
      {isSyncing ? (
        <Icon name="spinner" size={14} className="text-primary-500 dark:text-gold animate-spin" />
      ) : isStale ? (
        <Icon name="alert" size={14} className="text-amber-500 dark:text-amber-400" />
      ) : (
        <Icon name="check" size={14} className="text-emerald-500 dark:text-emerald-400" />
      )}

      {/* Status text */}
      <span
        className={`
          ${isSyncing ? 'text-primary-600 dark:text-gold' : ''}
          ${!isSyncing && isStale ? 'text-amber-600 dark:text-amber-400' : ''}
          ${!isSyncing && !isStale ? 'text-slate dark:text-warm-gray/70' : ''}
        `}
      >
        {isSyncing ? (
          'Syncing...'
        ) : lastSynced ? (
          <>
            {isStale && (
              <span className="font-medium mr-1">Data may be outdated.</span>
            )}
            Last synced {formatTimeAgo(lastSynced)}
          </>
        ) : (
          'Not synced'
        )}
      </span>

      {/* Refresh button */}
      {showRefreshButton && onRefresh && !isSyncing && (
        <button
          onClick={handleRefresh}
          disabled={!isOnline || isSyncing}
          className={`
            inline-flex items-center justify-center
            p-1 rounded
            transition-colors duration-200
            focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isStale
              ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              : 'text-slate dark:text-warm-gray/70 hover:bg-parchment dark:hover:bg-navy-700'
            }
          `}
          title={isOnline ? 'Refresh data' : 'Cannot refresh while offline'}
          aria-label="Refresh data"
        >
          <Icon name="refresh" size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Detailed variant with more information
 */
DataFreshnessIndicator.Detailed = function DetailedFreshnessIndicator({
  tripId,
  onRefresh,
  staleThresholdMs = STALE_THRESHOLD_MS,
  className = '',
}: DataFreshnessIndicatorProps) {
  const { isOnline } = useNetworkStatus();
  const { lastSynced, isSyncing, pendingChanges } = useOfflineReady(tripId);

  // Calculate staleness
  const isStale = lastSynced
    ? new Date().getTime() - lastSynced.getTime() > staleThresholdMs
    : false;

  // Handle refresh action
  const handleRefresh = useCallback(async () => {
    if (!isOnline || isSyncing || !onRefresh) return;
    await onRefresh();
  }, [isOnline, isSyncing, onRefresh]);

  return (
    <div
      className={`
        flex items-center justify-between gap-4 p-3 rounded-lg
        ${isStale
          ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30'
          : 'bg-parchment dark:bg-navy-700/50'
        }
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className={`
            flex items-center justify-center w-8 h-8 rounded-full
            ${isStale
              ? 'bg-amber-100 dark:bg-amber-900/40'
              : 'bg-white dark:bg-navy-800'
            }
          `}
        >
          {isSyncing ? (
            <Icon name="spinner" size={16} className="text-primary-500 dark:text-gold animate-spin" />
          ) : isStale ? (
            <Icon name="schedule" size={16} className="text-amber-600 dark:text-amber-400" />
          ) : (
            <Icon name="schedule" size={16} className="text-slate dark:text-warm-gray" />
          )}
        </div>

        {/* Text content */}
        <div className="flex flex-col">
          <span
            className={`
              text-sm font-medium
              ${isStale
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-charcoal dark:text-warm-gray'
              }
            `}
          >
            {isSyncing
              ? 'Syncing data...'
              : isStale
                ? 'Data may be outdated'
                : 'Data is up to date'
            }
          </span>

          <span className="text-xs text-slate dark:text-warm-gray/70">
            {lastSynced ? (
              <>
                Last synced {formatTimeAgo(lastSynced)}
                {pendingChanges > 0 && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    ({pendingChanges} pending)
                  </span>
                )}
              </>
            ) : (
              'Never synced'
            )}
          </span>
        </div>
      </div>

      {/* Refresh button */}
      {onRefresh && !isSyncing && (
        <button
          onClick={handleRefresh}
          disabled={!isOnline || isSyncing}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5
            text-sm font-medium rounded-lg
            transition-colors duration-200
            focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
            disabled:opacity-50 disabled:cursor-not-allowed
            min-w-[44px] min-h-[44px]
            ${isStale
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50'
              : 'bg-white dark:bg-navy-800 text-charcoal dark:text-warm-gray hover:bg-parchment dark:hover:bg-navy-700'
            }
          `}
          title={isOnline ? 'Refresh data' : 'Cannot refresh while offline'}
          aria-label={isOnline ? 'Refresh data' : 'Cannot refresh while offline'}
        >
          <Icon name="refresh" size={16} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      )}
    </div>
  );
};

/**
 * Format a date as relative time (e.g., "5 minutes ago")
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    return date.toLocaleDateString();
  }
}
