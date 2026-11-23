import { useState, useEffect, useCallback } from 'react';
import { useIOSDetection } from '../../hooks/useIOSDetection';
import { useStorageEstimate } from '../../hooks/useStorageEstimate';
import Icon from '../ui/Icon';

const LAST_OPEN_KEY = 'last-app-open';
const WARNING_DISMISSED_KEY = 'ios-storage-warning-dismissed';
const DAYS_BEFORE_EVICTION_WARNING = 5; // Warn at 5 days since iOS evicts at 7

export interface IOSStorageWarningProps {
  /** Custom class name */
  className?: string;
  /** Whether to show the inactivity warning (7-day eviction risk) */
  showInactivityWarning?: boolean;
  /** Whether to show the storage limit warning */
  showStorageLimitWarning?: boolean;
  /** Callback when warning is dismissed */
  onDismiss?: () => void;
  /** Link to storage management (optional) */
  storageManagementLink?: string;
}

/**
 * IOSStorageWarning displays warnings about iOS storage limitations.
 *
 * iOS Safari has two critical limitations:
 * 1. 50MB Cache API limit - Less photo caching possible
 * 2. 7-day eviction - Cache deleted if app unused for 7 days
 *
 * This component warns users about both:
 * - Storage running low (>40MB used of 50MB limit)
 * - Risk of cache eviction (>5 days since last open)
 *
 * @example
 * ```tsx
 * // Show all warnings
 * <IOSStorageWarning />
 *
 * // Only show storage limit warning
 * <IOSStorageWarning
 *   showInactivityWarning={false}
 *   showStorageLimitWarning={true}
 * />
 *
 * // With storage management link
 * <IOSStorageWarning
 *   storageManagementLink="/settings/storage"
 * />
 * ```
 */
export default function IOSStorageWarning({
  className = '',
  showInactivityWarning = true,
  showStorageLimitWarning = true,
  onDismiss,
  storageManagementLink,
}: IOSStorageWarningProps) {
  const { isIOS, isStandalone } = useIOSDetection();
  const { percentUsed, isLow, usageFormatted, quotaFormatted } = useStorageEstimate();

  const [showStorageWarning, setShowStorageWarning] = useState(false);
  const [showEvictionWarning, setShowEvictionWarning] = useState(false);
  const [daysSinceLastOpen, setDaysSinceLastOpen] = useState(0);

  // Check for storage and eviction warnings
  useEffect(() => {
    if (!isIOS) return;

    // Storage limit warning
    if (showStorageLimitWarning && isLow) {
      const dismissed = localStorage.getItem(WARNING_DISMISSED_KEY);
      if (!dismissed || Date.now() - parseInt(dismissed, 10) > 24 * 60 * 60 * 1000) {
        // Show if not dismissed or dismissed > 24 hours ago
        setShowStorageWarning(true);
      }
    }

    // Inactivity/eviction warning
    if (showInactivityWarning) {
      const lastOpenStr = localStorage.getItem(LAST_OPEN_KEY);
      const lastOpen = lastOpenStr ? parseInt(lastOpenStr, 10) : null;

      // Update last opened time
      localStorage.setItem(LAST_OPEN_KEY, Date.now().toString());

      if (lastOpen) {
        const daysSince = Math.floor((Date.now() - lastOpen) / (24 * 60 * 60 * 1000));
        setDaysSinceLastOpen(daysSince);

        if (daysSince >= DAYS_BEFORE_EVICTION_WARNING) {
          setShowEvictionWarning(true);
        }
      }
    }
  }, [isIOS, isLow, showInactivityWarning, showStorageLimitWarning]);

  const handleDismissStorage = useCallback(() => {
    localStorage.setItem(WARNING_DISMISSED_KEY, Date.now().toString());
    setShowStorageWarning(false);
    onDismiss?.();
  }, [onDismiss]);

  const handleDismissEviction = useCallback(() => {
    setShowEvictionWarning(false);
    onDismiss?.();
  }, [onDismiss]);

  // Don't show on non-iOS devices
  if (!isIOS) return null;

  // Don't show if no warnings to display
  if (!showStorageWarning && !showEvictionWarning) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Storage Limit Warning */}
      {showStorageWarning && (
        <WarningCard
          title="Storage running low"
          icon={<StorageIcon />}
          onDismiss={handleDismissStorage}
        >
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
            You're using {usageFormatted} of the {quotaFormatted} available on iOS.
            Consider removing some cached data to ensure the app works offline.
          </p>

          {/* Storage progress bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400 mb-1">
              <span>{usageFormatted} used</span>
              <span>{Math.round(percentUsed)}%</span>
            </div>
            <div className="h-2 bg-amber-200 dark:bg-amber-900/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  percentUsed > 90 ? 'bg-red-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, percentUsed)}%` }}
              />
            </div>
          </div>

          {/* Recommendations */}
          <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
            <p className="font-medium">Recommendations:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>Clear old trip caches you no longer need</li>
              <li>Reduce photo quality for offline viewing</li>
              <li>Cache only essential trips</li>
            </ul>
          </div>

          {/* Storage management link */}
          {storageManagementLink && (
            <a
              href={storageManagementLink}
              className="
                mt-3 inline-flex items-center gap-1.5
                text-sm font-medium text-amber-700 dark:text-amber-300
                hover:text-amber-800 dark:hover:text-amber-200
                transition-colors
              "
            >
              Manage storage
              <Icon name="chevronRight" size={16} />
            </a>
          )}
        </WarningCard>
      )}

      {/* Eviction Warning */}
      {showEvictionWarning && (
        <WarningCard
          title="Keep your data safe"
          icon={<ClockIcon />}
          onDismiss={handleDismissEviction}
        >
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
            {daysSinceLastOpen >= 7 ? (
              <>
                It's been over a week since you last opened Travel Life.
                Your cached data may have been cleared by iOS.
              </>
            ) : (
              <>
                On iOS, Safari may delete cached data if the app isn't used for 7 days.
                You haven't opened Travel Life in {daysSinceLastOpen} days.
              </>
            )}
          </p>

          <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
            <p className="font-medium">To keep your offline trips available:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>Open Travel Life at least once a week</li>
              {isStandalone ? (
                <li>The app is installed - just tap the icon!</li>
              ) : (
                <li>Add to Home Screen for easier access</li>
              )}
              <li>Your data is always safe in the cloud</li>
            </ul>
          </div>
        </WarningCard>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface WarningCardProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onDismiss: () => void;
}

function WarningCard({ title, icon, children, onDismiss }: WarningCardProps) {
  return (
    <div
      className="
        bg-amber-50 dark:bg-amber-900/20
        border border-amber-200 dark:border-amber-700
        rounded-lg p-4
        animate-fade-in
      "
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-amber-500 mt-0.5">
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-medium text-amber-800 dark:text-amber-200">
              {title}
            </h4>
            <button
              onClick={onDismiss}
              className="
                flex-shrink-0 p-1 -m-1 rounded
                text-amber-500 hover:text-amber-700
                dark:text-amber-400 dark:hover:text-amber-200
                transition-colors
              "
              aria-label="Dismiss warning"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

function StorageIcon() {
  return (
    <Icon name="storage" />
  );
}

function ClockIcon() {
  return (
    <Icon name="schedule" />
  );
}
