import { useState, useEffect, useCallback } from 'react';
import { XMarkIcon, CheckIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import type { MigrationResult } from '../../lib/localStorageMigration';

interface MigrationNoticeProps {
  /** Migration result from initializePWAMigration() */
  result: MigrationResult | null;
  /** Duration to auto-dismiss (ms). Set to 0 to disable auto-dismiss. Default: 5000 */
  autoDismissMs?: number;
  /** Callback when notice is dismissed */
  onDismiss?: () => void;
}

/**
 * Toast-style notification that shows after draft migration completes.
 *
 * Only displays if drafts were actually migrated. Shows count and auto-dismisses.
 *
 * @example
 * ```tsx
 * const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
 *
 * useEffect(() => {
 *   initializePWAMigration().then(setMigrationResult);
 * }, []);
 *
 * return (
 *   <>
 *     <MigrationNotice result={migrationResult} />
 *     <App />
 *   </>
 * );
 * ```
 */
export function MigrationNotice({
  result,
  autoDismissMs = 5000,
  onDismiss,
}: MigrationNoticeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    // Wait for exit animation before hiding
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      onDismiss?.();
    }, 200);
  }, [onDismiss]);

  useEffect(() => {
    // Only show if drafts were migrated
    if (result && result.draftsMigrated > 0) {
      setIsVisible(true);

      // Auto-dismiss after delay
      if (autoDismissMs > 0) {
        const timer = setTimeout(() => {
          handleDismiss();
        }, autoDismissMs);

        return () => clearTimeout(timer);
      }
    }
  }, [result, autoDismissMs, handleDismiss]);

  // Don't render if no result, no migrations, or not visible
  if (!result || result.draftsMigrated === 0 || !isVisible) {
    return null;
  }

  const hasErrors = result.errors.length > 0;

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-[100]
        max-w-sm w-full
        transform transition-all duration-200 ease-out
        ${isExiting ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}
      `}
      role="status"
      aria-live="polite"
    >
      <div
        className={`
          rounded-lg shadow-lg border
          bg-white dark:bg-navy-800
          border-gray-200 dark:border-navy-600
          overflow-hidden
        `}
      >
        {/* Progress bar */}
        <div className="h-1 bg-primary-100 dark:bg-navy-700">
          <div
            className="h-full bg-primary-500 dark:bg-gold transition-all duration-300"
            style={{
              width: autoDismissMs > 0 ? '0%' : '100%',
              animation: autoDismissMs > 0 ? `shrink ${autoDismissMs}ms linear forwards` : 'none',
            }}
          />
        </div>

        <div className="p-4 flex items-start gap-3">
          {/* Icon */}
          <div
            className={`
              flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
              ${hasErrors
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              }
            `}
          >
            {hasErrors ? (
              <CircleStackIcon className="w-4 h-4" />
            ) : (
              <CheckIcon className="w-4 h-4" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-dusk-100">
              {result.draftsMigrated} draft{result.draftsMigrated !== 1 ? 's' : ''} migrated
            </p>
            <p className="text-xs text-gray-500 dark:text-dusk-400 mt-0.5">
              {hasErrors
                ? 'Moved to offline storage with some errors'
                : 'Now available offline'
              }
            </p>
          </div>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className={`
              flex-shrink-0 p-1 rounded
              text-gray-400 hover:text-gray-600
              dark:text-dusk-400 dark:hover:text-dusk-300
              hover:bg-gray-100 dark:hover:bg-navy-700
              transition-colors
            `}
            aria-label="Dismiss notification"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Keyframe animation for progress bar */}
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export default MigrationNotice;
