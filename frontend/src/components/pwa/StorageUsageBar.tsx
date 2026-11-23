import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import Icon from '../ui/Icon';
import storageManager, {
  type StorageBreakdown,
  type StorageUsage,
  formatBytes,
} from '../../services/storageManager.service';

/**
 * SVG Icons for storage categories
 */
const Icons = {
  HardDrive: ({ className }: { className?: string }) => (
    <Icon name="storage" className={className} />
  ),
  Database: ({ className }: { className?: string }) => (
    <Icon name="storage" className={className} />
  ),
  Image: ({ className }: { className?: string }) => (
    <Icon name="photo" className={className} />
  ),
  Map: ({ className }: { className?: string }) => (
    <Icon name="map" className={className} />
  ),
  Video: ({ className }: { className?: string }) => (
    <Icon name="video" className={className} />
  ),
  Folder: ({ className }: { className?: string }) => (
    <Icon name="folder" className={className} />
  ),
  Check: ({ className }: { className?: string }) => (
    <Icon name="check" className={className} />
  ),
  Warning: ({ className }: { className?: string }) => (
    <Icon name="alert" className={className} />
  ),
};

/**
 * Storage category configuration with colors and icons
 */
/**
 * The breakdown's per-category keys. Derived from StorageBreakdown rather than
 * from CATEGORY_CONFIG so the config below must cover every category the storage
 * model reports — adding one there fails the build here until it gets a config
 * entry — and so `breakdown[key]` type-checks.
 */
type CategoryKey = Exclude<keyof StorageBreakdown, 'total'>;

const CATEGORY_CONFIG: Record<CategoryKey, {
  label: string;
  color: string;
  textColor: string;
  icon: (props: { className?: string }) => ReactNode;
}> = {
  trips: {
    label: 'Trips data',
    color: 'bg-primary-500 dark:bg-primary-400',
    textColor: 'text-primary-600 dark:text-primary-400',
    icon: Icons.Database,
  },
  photoThumbnails: {
    label: 'Photo thumbnails',
    color: 'bg-accent-500 dark:bg-accent-400',
    textColor: 'text-accent-600 dark:text-accent-400',
    icon: Icons.Image,
  },
  photoFull: {
    label: 'Full photos',
    color: 'bg-amber-500 dark:bg-amber-400',
    textColor: 'text-amber-600 dark:text-amber-400',
    icon: Icons.Image,
  },
  mapTiles: {
    label: 'Map tiles',
    color: 'bg-emerald-500 dark:bg-emerald-400',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    icon: Icons.Map,
  },
  immichCache: {
    label: 'Immich cache',
    color: 'bg-purple-500 dark:bg-purple-400',
    textColor: 'text-purple-600 dark:text-purple-400',
    icon: Icons.Image,
  },
  videoCache: {
    label: 'Video cache',
    color: 'bg-rose-500 dark:bg-rose-400',
    textColor: 'text-rose-600 dark:text-rose-400',
    icon: Icons.Video,
  },
  other: {
    label: 'Other',
    color: 'bg-navy-400 dark:bg-navy-500',
    textColor: 'text-navy-500 dark:text-navy-400',
    icon: Icons.Folder,
  },
};

export interface StorageUsageBarProps {
  /** Whether to show detailed legend */
  showLegend?: boolean;
  /** Custom class name */
  className?: string;
  /** Height of the bar */
  barHeight?: 'sm' | 'md' | 'lg';
  /** Callback when storage data is loaded */
  onDataLoaded?: (usage: StorageUsage, breakdown: StorageBreakdown) => void;
}

/**
 * StorageUsageBar displays a visual bar showing storage breakdown by category.
 *
 * Features:
 * - Color-coded segments for each category
 * - Tooltip showing exact values on hover
 * - Warning state when near quota (>80%)
 * - Optional legend with category details
 * - Responsive design
 *
 * @example
 * ```tsx
 * // Basic usage
 * <StorageUsageBar />
 *
 * // With legend and large bar
 * <StorageUsageBar showLegend barHeight="lg" />
 *
 * // With data callback
 * <StorageUsageBar onDataLoaded={(usage, breakdown) => console.log(usage)} />
 * ```
 */
export default function StorageUsageBar({
  showLegend = false,
  className = '',
  barHeight = 'md',
  onDataLoaded,
}: StorageUsageBarProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<CategoryKey | null>(null);
  const [loading, setLoading] = useState(true);

  // Load storage data
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      try {
        const [usageData, breakdownData] = await Promise.all([
          storageManager.getStorageUsage(),
          storageManager.getStorageBreakdown(),
        ]);

        if (mounted) {
          setUsage(usageData);
          setBreakdown(breakdownData);
          onDataLoaded?.(usageData, breakdownData);
        }
      } catch (error) {
        console.error('Failed to load storage data:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [onDataLoaded]);

  // Calculate segment widths
  const segments = useMemo(() => {
    if (!breakdown || breakdown.total === 0) return [];

    const categoryOrder: CategoryKey[] = [
      'trips',
      'photoThumbnails',
      'photoFull',
      'mapTiles',
      'immichCache',
      'videoCache',
      'other',
    ];

    return categoryOrder
      .filter((key) => breakdown[key] > 0)
      .map((key) => ({
        key,
        size: breakdown[key],
        percentage: (breakdown[key] / breakdown.total) * 100,
        ...CATEGORY_CONFIG[key],
      }));
  }, [breakdown]);

  // Bar height classes
  const heightClasses = {
    sm: 'h-2',
    md: 'h-4',
    lg: 'h-6',
  };

  // Warning state
  const isWarning = usage && usage.percentUsed > 80;
  const isCritical = usage && usage.percentUsed > 95;

  if (loading) {
    return (
      <div className={`${className}`}>
        <div
          className={`${heightClasses[barHeight]} bg-parchment dark:bg-navy-700 rounded-full overflow-hidden animate-pulse`}
        />
      </div>
    );
  }

  if (!usage || !breakdown) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Overall usage stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icons.HardDrive
            className={`w-4 h-4 ${
              isCritical
                ? 'text-red-500'
                : isWarning
                  ? 'text-amber-500'
                  : 'text-primary-500 dark:text-gold'
            }`}
          />
          <span className="font-medium text-charcoal dark:text-warm-gray">
            {formatBytes(usage.used)} used
          </span>
        </div>
        <span className="text-slate dark:text-warm-gray/70">
          {formatBytes(usage.quota)} available
        </span>
      </div>

      {/* Main progress bar */}
      <div
        className={`
          relative ${heightClasses[barHeight]} rounded-full overflow-hidden
          bg-parchment dark:bg-navy-700
          ${isCritical ? 'ring-2 ring-red-500/50' : ''}
          ${isWarning && !isCritical ? 'ring-2 ring-amber-500/30' : ''}
        `}
        role="progressbar"
        aria-valuenow={usage.percentUsed}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Storage usage: ${Math.round(usage.percentUsed)}% used`}
      >
        {/* Category segments */}
        <div className="absolute inset-0 flex">
          {segments.map((segment) => (
            <div
              key={segment.key}
              className={`
                ${segment.color}
                transition-all duration-300
                ${hoveredCategory === segment.key ? 'opacity-100 brightness-110' : 'opacity-90'}
                ${hoveredCategory && hoveredCategory !== segment.key ? 'opacity-60' : ''}
              `}
              style={{ width: `${segment.percentage}%` }}
              onMouseEnter={() => setHoveredCategory(segment.key)}
              onMouseLeave={() => setHoveredCategory(null)}
              role="presentation"
            />
          ))}
        </div>

        {/* Tooltip for hovered segment */}
        {hoveredCategory && (
          <div
            className="
              absolute -top-10 left-1/2 transform -translate-x-1/2
              px-2 py-1 rounded-lg
              bg-navy-800 dark:bg-navy-900
              text-white text-xs font-medium
              whitespace-nowrap
              shadow-lg
              pointer-events-none
              animate-fade-in
            "
          >
            {CATEGORY_CONFIG[hoveredCategory].label}:{' '}
            {formatBytes(breakdown[hoveredCategory])}
          </div>
        )}
      </div>

      {/* Percentage indicator */}
      <div className="flex justify-between items-center text-xs">
        <span
          className={`font-medium ${
            isCritical
              ? 'text-red-600 dark:text-red-400'
              : isWarning
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate dark:text-warm-gray/70'
          }`}
        >
          {Math.round(usage.percentUsed)}% used
        </span>
        {usage.isPersisted && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Icons.Check className="w-3 h-3" />
            Persistent storage
          </span>
        )}
      </div>

      {/* Legend */}
      {showLegend && segments.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {segments.map((segment) => {
            const Icon = segment.icon;
            return (
              <div
                key={segment.key}
                className={`
                  flex items-center gap-2 p-2 rounded-lg
                  transition-colors duration-200
                  ${
                    hoveredCategory === segment.key
                      ? 'bg-parchment dark:bg-navy-700'
                      : ''
                  }
                `}
                onMouseEnter={() => setHoveredCategory(segment.key)}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <div
                  className={`
                    flex items-center justify-center w-6 h-6 rounded-md
                    ${segment.color}
                  `}
                >
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-charcoal dark:text-warm-gray truncate">
                    {segment.label}
                  </span>
                  <span className="text-xs text-slate dark:text-warm-gray/70">
                    {formatBytes(segment.size)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Warning messages */}
      {isCritical && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <Icons.Warning className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">
            Storage is almost full. Clear some data to continue using offline features.
          </p>
        </div>
      )}
      {isWarning && !isCritical && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <Icons.Warning className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Storage is running low. Consider clearing old cached data.
          </p>
        </div>
      )}
    </div>
  );
}
