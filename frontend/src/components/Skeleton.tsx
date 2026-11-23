interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

/**
 * Base skeleton element for loading states
 */
export function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return (
    <div
      className={`bg-primary-100 dark:bg-navy-700 rounded ${animate ? 'animate-pulse' : ''} ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton placeholder for a text line
 */
export function SkeletonText({ width = 'w-full', className = '' }: { width?: string; className?: string }) {
  return <Skeleton className={`h-4 ${width} ${className}`} />;
}

/**
 * Skeleton placeholder for a title/heading
 */
export function SkeletonTitle({ width = 'w-1/2', className = '' }: { width?: string; className?: string }) {
  return <Skeleton className={`h-6 ${width} ${className}`} />;
}

/**
 * Skeleton placeholder for an avatar/image
 */
export function SkeletonAvatar({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };
  return <Skeleton className={`${sizeClasses[size]} rounded-full ${className}`} />;
}

interface SkeletonCardProps {
  hasImage?: boolean;
  lines?: number;
  className?: string;
}

/**
 * Skeleton card for trip/entity cards
 *
 * @example
 * ```tsx
 * // Basic card skeleton
 * <SkeletonCard />
 *
 * // With image placeholder
 * <SkeletonCard hasImage />
 *
 * // Custom number of text lines
 * <SkeletonCard lines={4} />
 *
 * // Grid of skeleton cards
 * <div className="grid grid-cols-3 gap-4">
 *   {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
 * </div>
 * ```
 */
export function SkeletonCard({ hasImage = false, lines = 3, className = '' }: SkeletonCardProps) {
  return (
    <div
      className={`bg-white/80 dark:bg-navy-800/80 rounded-2xl p-6 border-2 border-primary-500/10 dark:border-sky/10 ${className}`}
      aria-hidden="true"
    >
      {hasImage && (
        <Skeleton className="h-40 w-full rounded-lg mb-4" />
      )}
      <SkeletonTitle className="mb-4" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonText
            key={i}
            width={i === lines - 1 ? 'w-2/3' : 'w-full'}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for a list item
 */
export function SkeletonListItem({ hasIcon = false, className = '' }: { hasIcon?: boolean; className?: string }) {
  return (
    <div
      className={`flex items-center gap-4 p-4 bg-white/80 dark:bg-navy-800/80 rounded-lg ${className}`}
      aria-hidden="true"
    >
      {hasIcon && <SkeletonAvatar size="sm" />}
      <div className="flex-1 space-y-2">
        <SkeletonText width="w-1/3" />
        <SkeletonText width="w-2/3" />
      </div>
    </div>
  );
}

/**
 * Skeleton for a form field
 */
export function SkeletonFormField({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}

/**
 * Skeleton grid for multiple cards
 */
export function SkeletonGrid({
  count = 6,
  columns = 3,
  hasImage = false,
}: {
  count?: number;
  columns?: 1 | 2 | 3 | 4;
  hasImage?: boolean;
}) {
  const gridClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  return (
    <div className={`grid ${gridClasses[columns]} gap-6`} role="status" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} hasImage={hasImage} />
      ))}
      <span className="sr-only">Loading content…</span>
    </div>
  );
}

export default {
  Base: Skeleton,
  Text: SkeletonText,
  Title: SkeletonTitle,
  Avatar: SkeletonAvatar,
  Card: SkeletonCard,
  ListItem: SkeletonListItem,
  FormField: SkeletonFormField,
  Grid: SkeletonGrid,
};
