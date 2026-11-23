import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import storageManager, {
  type StorageBreakdown,
  type StorageUsage,
  type StorageCategory,
  formatBytes,
} from '../../services/storageManager.service';
import LoadingSpinner from '../LoadingSpinner';
import Icon from '../ui/Icon';

/**
 * SVG Icons
 */
const Icons = {
  Warning: ({ className }: { className?: string }) => (
    <Icon name="alert" className={className} />
  ),
  X: ({ className }: { className?: string }) => (
    <Icon name="close" className={className} />
  ),
  Trash: ({ className }: { className?: string }) => (
    <Icon name="delete" className={className} />
  ),
  HardDrive: ({ className }: { className?: string }) => (
    <Icon name="storage" className={className} />
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <Icon name="chevronRight" className={className} />
  ),
  Settings: ({ className }: { className?: string }) => (
    <Icon name="settings" className={className} />
  ),
};

/**
 * Category labels and clear actions
 */
const QUICK_CLEAR_CATEGORIES: {
  key: StorageCategory;
  label: string;
  description: string;
}[] = [
  {
    key: 'photoThumbnails',
    label: 'Thumbnails',
    description: 'Safe to clear - will re-download as needed',
  },
  {
    key: 'mapTiles',
    label: 'Map tiles',
    description: 'Safe to clear - will re-download when viewing maps',
  },
  {
    key: 'immichCache',
    label: 'Immich cache',
    description: 'Safe to clear - will re-download from your Immich server',
  },
  {
    key: 'videoCache',
    label: 'Video cache',
    description: 'Safe to clear - videos can be re-downloaded',
  },
];

export interface StorageQuotaWarningProps {
  /** Threshold percentage to show warning (default: 80) */
  warningThreshold?: number;
  /** Threshold percentage for critical state (default: 95) */
  criticalThreshold?: number;
  /** Whether the banner can be dismissed */
  dismissible?: boolean;
  /** Duration in ms before dismissed banner reappears (default: 1 hour) */
  dismissDuration?: number;
  /** Path to full storage management page */
  settingsPath?: string;
  /** Custom class name */
  className?: string;
  /** Callback when storage is cleared */
  onStorageCleared?: () => void;
}

const DISMISS_KEY = 'travel-life-storage-warning-dismissed';

/**
 * StorageQuotaWarning displays a warning banner when storage is nearly full (>80%).
 *
 * Features:
 * - Shows what's using the most space
 * - Quick actions to free space
 * - Link to full storage management
 * - Dismissible with timeout
 * - Critical state for >95% usage
 *
 * @example
 * ```tsx
 * // Basic usage
 * <StorageQuotaWarning />
 *
 * // With custom thresholds and settings link
 * <StorageQuotaWarning
 *   warningThreshold={75}
 *   criticalThreshold={90}
 *   settingsPath="/settings/storage"
 * />
 *
 * // Non-dismissible critical warning
 * <StorageQuotaWarning
 *   warningThreshold={90}
 *   dismissible={false}
 * />
 * ```
 */
export default function StorageQuotaWarning({
  warningThreshold = 80,
  criticalThreshold = 95,
  dismissible = true,
  dismissDuration = 60 * 60 * 1000, // 1 hour
  settingsPath = '/settings',
  className = '',
  onStorageCleared,
}: StorageQuotaWarningProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [clearing, setClearing] = useState<StorageCategory | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Check if warning was recently dismissed
  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < dismissDuration) {
        setDismissed(true);
        // Set timeout to show again
        const timeout = setTimeout(() => setDismissed(false), dismissDuration - elapsed);
        return () => clearTimeout(timeout);
      } else {
        localStorage.removeItem(DISMISS_KEY);
      }
    }
  }, [dismissDuration]);

  // Load storage data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usageData, breakdownData] = await Promise.all([
        storageManager.getStorageUsage(),
        storageManager.getStorageBreakdown(),
      ]);
      setUsage(usageData);
      setBreakdown(breakdownData);
    } catch (error) {
      console.error('Failed to load storage data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle dismiss
  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  // Handle quick clear action
  const handleQuickClear = async (category: StorageCategory) => {
    setClearing(category);
    try {
      await storageManager.clearCategory(category);
      await loadData();
      onStorageCleared?.();
    } catch (error) {
      console.error(`Failed to clear ${category}:`, error);
    } finally {
      setClearing(null);
    }
  };

  // Get largest categories for display
  const getLargestCategories = () => {
    if (!breakdown) return [];

    return QUICK_CLEAR_CATEGORIES
      .filter((cat) => breakdown[cat.key] > 0)
      .sort((a, b) => breakdown[b.key] - breakdown[a.key])
      .slice(0, 3);
  };

  // Don't show if loading, dismissed, or below threshold
  if (loading) return null;
  if (dismissed && usage && usage.percentUsed < criticalThreshold) return null;
  if (!usage || usage.percentUsed < warningThreshold) return null;

  const isCritical = usage.percentUsed >= criticalThreshold;
  const largestCategories = getLargestCategories();

  return (
    <div
      className={`
        relative overflow-hidden
        ${isCritical
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }
        border rounded-xl
        animate-fade-in
        ${className}
      `}
      role="alert"
      aria-live="polite"
    >
      {/* Main content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={`
              flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full
              ${isCritical
                ? 'bg-red-100 dark:bg-red-900/40'
                : 'bg-amber-100 dark:bg-amber-900/40'
              }
            `}
          >
            {isCritical ? (
              <Icons.Warning className="w-5 h-5 text-red-600 dark:text-red-400" />
            ) : (
              <Icons.HardDrive className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            )}
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <h4
              className={`
                font-semibold
                ${isCritical
                  ? 'text-red-800 dark:text-red-200'
                  : 'text-amber-800 dark:text-amber-200'
                }
              `}
            >
              {isCritical ? 'Storage Almost Full' : 'Storage Running Low'}
            </h4>
            <p
              className={`
                mt-1 text-sm
                ${isCritical
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-amber-700 dark:text-amber-300'
                }
              `}
            >
              {Math.round(usage.percentUsed)}% of storage used ({formatBytes(usage.used)} of{' '}
              {formatBytes(usage.quota)}).
              {isCritical
                ? ' Clear some data to continue using offline features.'
                : ' Consider clearing some cached data to free up space.'}
            </p>

            {/* Largest categories */}
            {largestCategories.length > 0 && !expanded && (
              <div className="mt-2 flex flex-wrap gap-2">
                {largestCategories.slice(0, 2).map((cat) => (
                  <span
                    key={cat.key}
                    className={`
                      inline-flex items-center px-2 py-1 rounded-md text-xs font-medium
                      ${isCritical
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      }
                    `}
                  >
                    {cat.label}: {formatBytes(breakdown?.[cat.key] || 0)}
                  </span>
                ))}
              </div>
            )}

            {/* Expand button */}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={`
                mt-2 flex items-center gap-1 text-sm font-medium
                ${isCritical
                  ? 'text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200'
                  : 'text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200'
                }
                transition-colors duration-200
              `}
            >
              {expanded ? 'Show less' : 'Quick actions'}
              <Icons.ChevronRight
                className={`w-4 h-4 transition-transform duration-200 ${
                  expanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          </div>

          {/* Dismiss button */}
          {dismissible && !isCritical && (
            <button
              type="button"
              onClick={handleDismiss}
              className={`
                flex-shrink-0 p-1.5 rounded-lg
                ${isCritical
                  ? 'text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
                  : 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                }
                transition-colors duration-200
                min-w-[36px] min-h-[36px]
                flex items-center justify-center
              `}
              aria-label="Dismiss warning"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expanded quick actions */}
        {expanded && (
          <div className="mt-4 space-y-2 animate-fade-in">
            <p className="text-xs text-slate dark:text-warm-gray/70 mb-2">
              These caches can be safely cleared and will re-download as needed:
            </p>

            {largestCategories.map((cat) => (
              <div
                key={cat.key}
                className={`
                  flex items-center justify-between p-3 rounded-lg
                  ${isCritical
                    ? 'bg-red-100/50 dark:bg-red-900/20'
                    : 'bg-amber-100/50 dark:bg-amber-900/20'
                  }
                `}
              >
                <div className="flex-1 min-w-0">
                  <span
                    className={`
                      text-sm font-medium
                      ${isCritical
                        ? 'text-red-800 dark:text-red-200'
                        : 'text-amber-800 dark:text-amber-200'
                      }
                    `}
                  >
                    {cat.label}
                  </span>
                  <span className="ml-2 text-xs text-slate dark:text-warm-gray/70">
                    {formatBytes(breakdown?.[cat.key] || 0)}
                  </span>
                  <p className="text-xs text-slate dark:text-warm-gray/70 mt-0.5">
                    {cat.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleQuickClear(cat.key)}
                  disabled={clearing !== null}
                  className={`
                    ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                    text-xs font-medium
                    ${isCritical
                      ? 'bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-800'
                      : 'bg-amber-500 dark:bg-amber-600 text-white hover:bg-amber-600 dark:hover:bg-amber-700'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                    min-h-[36px]
                  `}
                >
                  {clearing === cat.key ? (
                    <LoadingSpinner.Inline className="text-white" />
                  ) : (
                    <>
                      <Icons.Trash className="w-3.5 h-3.5" />
                      Clear
                    </>
                  )}
                </button>
              </div>
            ))}

            {/* Link to full settings */}
            <Link
              to={settingsPath}
              className={`
                flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg
                text-sm font-medium
                ${isCritical
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                }
                transition-colors duration-200
                min-h-[44px]
              `}
            >
              <Icons.Settings className="w-4 h-4" />
              Manage storage settings
            </Link>
          </div>
        )}
      </div>

      {/* Progress bar at bottom */}
      <div
        className={`
          h-1 w-full
          ${isCritical ? 'bg-red-200 dark:bg-red-900/50' : 'bg-amber-200 dark:bg-amber-900/50'}
        `}
      >
        <div
          className={`
            h-full transition-all duration-500
            ${isCritical ? 'bg-red-500' : 'bg-amber-500'}
          `}
          style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}
