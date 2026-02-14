/**
 * usePullToRefresh Hook
 *
 * Provides pull-to-refresh functionality for mobile devices
 * Detects pull-down gesture and triggers refresh callback
 */

import { useRef, useEffect, useState } from 'react';
import type { RefObject } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // Distance to pull before triggering refresh
  resistance?: number; // How much to slow down the pull (higher = slower)
  enabled?: boolean;
}

interface PullToRefreshState {
  pullDistance: number;
  isRefreshing: boolean;
  canPull: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePullToRefresh<T extends HTMLElement>(
  options: PullToRefreshOptions
): [RefObject<T | null>, PullToRefreshState] {
  const {
    onRefresh,
    threshold = 80,
    resistance = 2.5,
    enabled = true,
  } = options;

  const containerRef = useRef<T>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canPull, setCanPull] = useState(false);

  const touchStartY = useRef(0);
  const scrollStartY = useRef(0);
  const isPulling = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: globalThis.TouchEvent) => {
      // Only allow pull-to-refresh if scrolled to top
      if (container.scrollTop === 0) {
        setCanPull(true);
        touchStartY.current = e.touches[0].clientY;
        scrollStartY.current = container.scrollTop;
        isPulling.current = false;
      }
    };

    const handleTouchMove = (e: globalThis.TouchEvent) => {
      if (!canPull || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartY.current;

      // Only pull down when at top of scroll
      if (deltaY > 0 && container.scrollTop === 0) {
        isPulling.current = true;

        // Apply resistance to the pull
        const distance = Math.min(deltaY / resistance, threshold * 1.5);
        setPullDistance(distance);

        // Prevent default scrolling if pulling
        if (distance > 5) {
          e.preventDefault();
        }
      } else {
        isPulling.current = false;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (!canPull || isRefreshing) return;

      setCanPull(false);

      // Trigger refresh if pulled past threshold
      if (isPulling.current && pullDistance >= threshold) {
        setIsRefreshing(true);
        setPullDistance(threshold); // Lock at threshold during refresh

        try {
          await onRefresh();
        } catch (error) {
          console.error('Pull-to-refresh failed:', error);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        // Reset if not pulled enough
        setPullDistance(0);
      }

      isPulling.current = false;
    };

    // Add event listeners
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [canPull, isRefreshing, pullDistance, onRefresh, threshold, resistance, enabled]);

  return [
    containerRef,
    {
      pullDistance,
      isRefreshing,
      canPull: canPull && !isRefreshing,
    },
  ];
}

/**
 * PullToRefreshIndicator Component
 *
 * Visual indicator to show pull-to-refresh state
 */

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;

  // Only show when pulling or refreshing
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    // Dynamic pull refresh dimensions require CSS variables - cannot be moved to static CSS
    <div
      className="absolute top-0 left-0 right-0 flex items-center justify-center transition-opacity pull-refresh-container"
      style={{
        '--pull-height': `${Math.max(pullDistance, isRefreshing ? threshold : 0)}px`,
        '--pull-opacity': pullDistance > 10 || isRefreshing ? 1 : 0,
      }}
    >
      <div className="relative">
        {isRefreshing ? (
          // Spinning loader when refreshing
          <div className="w-8 h-8 border-4 border-primary-200 dark:border-sky/30 border-t-primary-600 dark:border-t-sky rounded-full animate-spin" />
        ) : (
          // Rotating arrow when pulling
          // Dynamic rotation requires CSS variable - cannot be moved to static CSS
          <svg
            className="w-8 h-8 text-primary-600 dark:text-sky transition-transform pull-refresh-arrow"
            style={{ '--arrow-rotation': `${rotation}deg` }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        )}
        {/* Progress text */}
        {!isRefreshing && pullDistance > 20 && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
            {pullDistance >= threshold ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        )}
      </div>
    </div>
  );
}
