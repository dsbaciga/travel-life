/**
 * SkeletonLoader Component
 *
 * Reusable skeleton loading component with different variants
 * for displaying loading states throughout the application.
 *
 * Features:
 * - Multiple variants (card, list, grid, text, etc.)
 * - Shimmer animation effect
 * - Dark mode support
 * - Customizable dimensions
 *
 * Usage:
 * <SkeletonLoader variant="card" count={3} />
 * <SkeletonLoader variant="text" lines={4} />
 */

interface SkeletonLoaderProps {
  variant?: 'card' | 'list' | 'grid' | 'text' | 'avatar' | 'image' | 'button' | 'input';
  count?: number;
  lines?: number;
  className?: string;
}

export default function SkeletonLoader({
  variant = 'card',
  count = 1,
  lines = 3,
  className = '',
}: SkeletonLoaderProps) {
  const baseClasses = 'animate-pulse bg-gray-200 dark:bg-dusk-700 rounded';

  const shimmerClasses = 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent';

  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <div className={`${baseClasses} ${shimmerClasses} p-6 space-y-4 ${className}`}>
            <div className="h-6 bg-gray-300 dark:bg-dusk-600 rounded w-3/4" />
            <div className="h-4 bg-gray-300 dark:bg-dusk-600 rounded w-full" />
            <div className="h-4 bg-gray-300 dark:bg-dusk-600 rounded w-5/6" />
            <div className="flex gap-2 mt-4">
              <div className="h-8 bg-gray-300 dark:bg-dusk-600 rounded w-20" />
              <div className="h-8 bg-gray-300 dark:bg-dusk-600 rounded w-20" />
            </div>
          </div>
        );

      case 'list':
        return (
          <div className={`${baseClasses} ${shimmerClasses} flex items-center gap-4 p-4 ${className}`}>
            <div className="w-12 h-12 bg-gray-300 dark:bg-dusk-600 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-300 dark:bg-dusk-600 rounded w-3/4" />
              <div className="h-3 bg-gray-300 dark:bg-dusk-600 rounded w-1/2" />
            </div>
          </div>
        );

      case 'grid':
        return (
          <div className={`${baseClasses} ${shimmerClasses} aspect-square ${className}`}>
            <div className="w-full h-full bg-gray-300 dark:bg-dusk-600 rounded" />
          </div>
        );

      case 'text':
        return (
          <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }).map((_, index) => (
              <div
                key={index}
                className={`${baseClasses} ${shimmerClasses} h-4 ${
                  index === lines - 1 ? 'w-3/4' : 'w-full'
                }`}
              />
            ))}
          </div>
        );

      case 'avatar':
        return (
          <div className={`${baseClasses} ${shimmerClasses} w-12 h-12 rounded-full ${className}`} />
        );

      case 'image':
        return (
          <div className={`${baseClasses} ${shimmerClasses} w-full h-48 ${className}`} />
        );

      case 'button':
        return (
          <div className={`${baseClasses} ${shimmerClasses} h-10 w-24 ${className}`} />
        );

      case 'input':
        return (
          <div className={`${baseClasses} ${shimmerClasses} h-10 w-full ${className}`} />
        );

      default:
        return (
          <div className={`${baseClasses} ${shimmerClasses} h-20 ${className}`} />
        );
    }
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>{renderSkeleton()}</div>
      ))}
    </>
  );
}

/**
 * Specialized skeleton components for common use cases
 */

export function TripCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-white dark:bg-dusk-800 rounded-lg shadow-md overflow-hidden animate-pulse"
        >
          {/* Cover Image */}
          <div className="h-48 bg-gray-200 dark:bg-dusk-700" />

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Title */}
            <div className="h-6 bg-gray-200 dark:bg-dusk-700 rounded w-3/4" />

            {/* Status badge */}
            <div className="h-6 bg-gray-200 dark:bg-dusk-700 rounded w-24" />

            {/* Description */}
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-full" />
              <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-5/6" />
            </div>

            {/* Dates */}
            <div className="flex gap-4">
              <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-32" />
              <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-32" />
            </div>

            {/* Tags */}
            <div className="flex gap-2">
              <div className="h-6 bg-gray-200 dark:bg-dusk-700 rounded w-16" />
              <div className="h-6 bg-gray-200 dark:bg-dusk-700 rounded w-20" />
              <div className="h-6 bg-gray-200 dark:bg-dusk-700 rounded w-18" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export function PhotoGallerySkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="aspect-square bg-gray-200 dark:bg-dusk-700 rounded-lg animate-pulse relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent"
        />
      ))}
    </div>
  );
}

export function TimelineEventSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex gap-4">
          {/* Time indicator */}
          <div className="flex-shrink-0 w-20">
            <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-full animate-pulse" />
          </div>

          {/* Event card */}
          <div className="flex-1 bg-white dark:bg-dusk-800 rounded-lg shadow p-4 animate-pulse">
            <div className="space-y-3">
              <div className="h-5 bg-gray-200 dark:bg-dusk-700 rounded w-1/2" />
              <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-full" />
              <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListItemSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-white dark:bg-dusk-800 rounded-lg shadow p-6 animate-pulse"
        >
          <div className="flex items-start gap-4">
            {/* Icon/Avatar */}
            <div className="w-10 h-10 bg-gray-200 dark:bg-dusk-700 rounded-full flex-shrink-0" />

            {/* Content */}
            <div className="flex-1 space-y-3">
              <div className="h-5 bg-gray-200 dark:bg-dusk-700 rounded w-1/3" />
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-dusk-700 rounded w-5/6" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <div className="h-8 w-16 bg-gray-200 dark:bg-dusk-700 rounded" />
              <div className="h-8 w-16 bg-gray-200 dark:bg-dusk-700 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
