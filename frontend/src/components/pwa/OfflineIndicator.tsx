import { useState, useEffect } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useTotalPendingChanges } from '../../hooks/useOfflineReady';
import Icon from '../ui/Icon';

export interface OfflineIndicatorProps {
  /** Position of the indicator */
  position?: 'top' | 'bottom';
  /** Whether to show pending changes count */
  showPendingChanges?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * OfflineIndicator displays a banner when the user is offline.
 *
 * Features:
 * - Appears when offline with smooth animation
 * - Shows pending changes count if enabled
 * - Styled with Travel Life design (navy/gold colors)
 * - Fixed position at top (below the navbar) or bottom of screen
 * - Respects reduced motion preferences
 *
 * @example
 * ```tsx
 * // Basic usage - appears at bottom when offline
 * <OfflineIndicator />
 *
 * // At top with pending changes
 * <OfflineIndicator position="top" showPendingChanges />
 * ```
 */
export default function OfflineIndicator({
  position = 'bottom',
  showPendingChanges = true,
  className = '',
}: OfflineIndicatorProps) {
  const { isOnline, isSlowConnection } = useNetworkStatus();
  const { totalPendingChanges } = useTotalPendingChanges();

  // Track visibility for animation
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle mount/unmount animation
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const shouldShow = !isOnline || isSlowConnection;

    if (shouldShow) {
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
  }, [isOnline, isSlowConnection]);

  // The top banner is fixed under the navbar, so the page content is pushed
  // down by the banner's height while it shows (see `.offline-banner-top` in index.css).
  const pushesContent = shouldRender && position === 'top';
  useEffect(() => {
    if (!pushesContent) return;
    document.documentElement.classList.add('offline-banner-top');
    return () => document.documentElement.classList.remove('offline-banner-top');
  }, [pushesContent]);

  if (!shouldRender) return null;

  const positionClasses = position === 'top'
    ? 'top-16 sm:top-20'
    : 'bottom-16 md:bottom-0';

  const animationClasses = isVisible
    ? position === 'top'
      ? 'translate-y-0'
      : 'translate-y-0'
    : position === 'top'
      ? '-translate-y-full'
      : 'translate-y-full';

  return (
    <div
      className={`
        fixed left-0 right-0 z-50
        ${positionClasses}
        transition-transform duration-300 ease-out motion-reduce:transition-none
        ${animationClasses}
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="bg-navy-800 dark:bg-navy-900 border-t border-b border-gold/30 dark:border-gold/20">
        <div className="max-w-7xl mx-auto px-4 py-2 sm:px-6">
          <div className="flex items-center justify-center gap-3">
            {/* Offline icon with pulse */}
            <div className="relative">
              <Icon name={!isOnline ? 'offline' : 'alert'} className="text-gold" />
              {/* Pulsing dot indicator */}
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse-subtle" />
            </div>

            {/* Status text */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="text-sm font-medium text-gold">
                {!isOnline ? "You're offline" : 'Slow connection'}
              </span>

              {/* Pending changes badge */}
              {showPendingChanges && totalPendingChanges > 0 && (
                <span className="text-xs text-warm-gray/80">
                  <span className="hidden sm:inline"> - </span>
                  {totalPendingChanges} pending {totalPendingChanges === 1 ? 'change' : 'changes'}
                </span>
              )}
            </div>

            {/* Subtext */}
            <span className="hidden sm:inline text-xs text-warm-gray/60">
              {!isOnline
                ? "Changes are saved on this device and sync when you're back online."
                : 'Some features need a connection.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
