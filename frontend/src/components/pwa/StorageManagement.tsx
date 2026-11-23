import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import storageManager, {
  type StorageBreakdown,
  type StorageUsage,
  type CachedTripInfo,
  type StorageCategory,
  type AutoCleanupSettings,
  formatBytes,
} from '../../services/storageManager.service';
import StorageUsageBar from './StorageUsageBar';
import ConfirmDialog from '../ConfirmDialog';
import LoadingSpinner from '../LoadingSpinner';
import Icon from '../ui/Icon';

/**
 * SVG Icons
 */
const Icons = {
  HardDrive: ({ className }: { className?: string }) => (
    <Icon name="storage" className={className} />
  ),
  Trash: ({ className }: { className?: string }) => (
    <Icon name="delete" className={className} />
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
  Refresh: ({ className }: { className?: string }) => (
    <Icon name="refresh" className={className} />
  ),
  Shield: ({ className }: { className?: string }) => (
    <Icon name="shieldCheck" className={className} />
  ),
  Clock: ({ className }: { className?: string }) => (
    <Icon name="schedule" className={className} />
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <Icon name="chevronRight" className={className} />
  ),
  Warning: ({ className }: { className?: string }) => (
    <Icon name="alert" className={className} />
  ),
};

/**
 * Storage category configuration
 */
const CATEGORY_CONFIG: Record<
  StorageCategory,
  { label: string; icon: (props: { className?: string }) => ReactNode; clearLabel: string; description: string }
> = {
  trips: {
    label: 'Trips Data',
    icon: Icons.Database,
    clearLabel: 'Clear Trip Data',
    description: 'Trip details, locations, activities, lodging, and other trip information',
  },
  photoThumbnails: {
    label: 'Photo Thumbnails',
    icon: Icons.Image,
    clearLabel: 'Clear Thumbnails',
    description: 'Cached thumbnail images for offline viewing',
  },
  photoFull: {
    label: 'Full Photos',
    icon: Icons.Image,
    clearLabel: 'Clear Full Photos',
    description: 'Full-resolution photos saved for offline access',
  },
  mapTiles: {
    label: 'Map Tiles',
    icon: Icons.Map,
    clearLabel: 'Clear Map Tiles',
    description: 'Cached map tiles for offline map viewing',
  },
  immichCache: {
    label: 'Immich Cache',
    icon: Icons.Image,
    clearLabel: 'Clear Immich Cache',
    description: 'Cached photos from your Immich server',
  },
  videoCache: {
    label: 'Video Cache',
    icon: Icons.Video,
    clearLabel: 'Clear Video Cache',
    description: 'Cached videos for offline playback',
  },
  other: {
    label: 'Other Data',
    icon: Icons.Folder,
    clearLabel: 'Clear Other Data',
    description: 'Sync queue, drafts, search index, and metadata',
  },
};

export interface StorageManagementProps {
  /** Custom class name */
  className?: string;
  /** Callback when storage is cleared */
  onStorageCleared?: () => void;
}

/**
 * StorageManagement provides a full storage management panel for the Settings page.
 *
 * Features:
 * - Storage breakdown chart/bars
 * - List of cached trips with sizes
 * - "Clear" buttons per category
 * - "Clear All Offline Data" button with confirmation
 * - Auto-cleanup settings (clear items older than X days)
 * - Request persistent storage button
 *
 * @example
 * ```tsx
 * <StorageManagement onStorageCleared={() => refetchData()} />
 * ```
 */
export default function StorageManagement({
  className = '',
  onStorageCleared,
}: StorageManagementProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [cachedTrips, setCachedTrips] = useState<CachedTripInfo[]>([]);
  const [autoCleanup, setAutoCleanup] = useState<AutoCleanupSettings>(() =>
    storageManager.getAutoCleanupSettings()
  );
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant: 'danger' | 'warning';
  } | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('breakdown');

  // Load storage data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usageData, breakdownData, tripsData] = await Promise.all([
        storageManager.getStorageUsage(),
        storageManager.getStorageBreakdown(),
        storageManager.getCachedTrips(),
      ]);

      setUsage(usageData);
      setBreakdown(breakdownData);
      setCachedTrips(tripsData);
    } catch (error) {
      console.error('Failed to load storage data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle clearing a category
  const handleClearCategory = async (category: StorageCategory) => {
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

  // Handle clearing all data
  const handleClearAll = async () => {
    setClearing('all');
    try {
      await storageManager.clearAllOfflineData();
      await loadData();
      onStorageCleared?.();
    } catch (error) {
      console.error('Failed to clear all data:', error);
    } finally {
      setClearing(null);
    }
  };

  // Handle clearing a specific trip
  const handleClearTrip = async (tripId: string) => {
    setClearing(tripId);
    try {
      await storageManager.clearTripData(tripId);
      await loadData();
      onStorageCleared?.();
    } catch (error) {
      console.error(`Failed to clear trip ${tripId}:`, error);
    } finally {
      setClearing(null);
    }
  };

  // Handle clearing old data
  const handleClearOldData = async () => {
    setClearing('old');
    try {
      const freedBytes = await storageManager.clearOldData(autoCleanup.maxAgeInDays);
      console.log(`Freed ${formatBytes(freedBytes)}`);
      await loadData();
      onStorageCleared?.();
    } catch (error) {
      console.error('Failed to clear old data:', error);
    } finally {
      setClearing(null);
    }
  };

  // Handle requesting persistent storage
  const handleRequestPersistent = async () => {
    const result = await storageManager.requestPersistentStorage();
    if (result) {
      await loadData();
    }
  };

  // Handle auto-cleanup settings change
  const handleAutoCleanupChange = (settings: Partial<AutoCleanupSettings>) => {
    const updated = { ...autoCleanup, ...settings };
    setAutoCleanup(updated);
    storageManager.setAutoCleanupSettings(updated);
  };

  // Confirm dialog helpers
  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    variant: 'danger' | 'warning' = 'danger'
  ) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm, variant });
  };

  const closeConfirm = () => {
    setConfirmDialog(null);
  };

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (loading && !breakdown) {
    return (
      <div className={`${className}`}>
        <LoadingSpinner.FullPage message="Loading storage information..." />
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40">
            <Icons.HardDrive className="w-5 h-5 text-primary-600 dark:text-gold" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-charcoal dark:text-warm-gray">
              Storage Management
            </h3>
            <p className="text-sm text-slate dark:text-warm-gray/70">
              Manage offline data and cache
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="
            p-2 rounded-lg
            text-slate dark:text-warm-gray/70
            hover:bg-parchment dark:hover:bg-navy-700
            disabled:opacity-50
            transition-colors duration-200
            min-w-[44px] min-h-[44px]
            flex items-center justify-center
          "
          aria-label="Refresh storage data"
        >
          <Icons.Refresh className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Storage Usage Bar */}
      <div className="p-4 rounded-xl bg-white/80 dark:bg-navy-800/90 border border-primary-100 dark:border-gold/20 backdrop-blur-sm">
        <StorageUsageBar showLegend barHeight="lg" />
      </div>

      {/* Persistent Storage */}
      {usage && !usage.isPersisted && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <Icons.Shield className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-amber-800 dark:text-amber-200">
                Enable Persistent Storage
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Your browser may automatically clear offline data when storage is low.
                Request persistent storage to prevent automatic deletion.
              </p>
              <button
                onClick={handleRequestPersistent}
                className="
                  mt-3 px-4 py-2 rounded-lg
                  bg-amber-500 dark:bg-amber-600
                  text-white font-medium text-sm
                  hover:bg-amber-600 dark:hover:bg-amber-700
                  transition-colors duration-200
                  min-h-[44px]
                "
              >
                Request Persistent Storage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storage Breakdown Section */}
      <div className="rounded-xl bg-white/80 dark:bg-navy-800/90 border border-primary-100 dark:border-gold/20 backdrop-blur-sm overflow-hidden">
        <button
          onClick={() => toggleSection('breakdown')}
          className="
            w-full flex items-center justify-between p-4
            hover:bg-parchment/50 dark:hover:bg-navy-700/50
            transition-colors duration-200
          "
        >
          <h4 className="font-semibold text-charcoal dark:text-warm-gray">
            Storage by Category
          </h4>
          <Icons.ChevronRight
            className={`w-5 h-5 text-slate dark:text-warm-gray/70 transition-transform duration-200 ${
              expandedSection === 'breakdown' ? 'rotate-90' : ''
            }`}
          />
        </button>

        {expandedSection === 'breakdown' && breakdown && (
          <div className="px-4 pb-4 space-y-2">
            {(Object.keys(CATEGORY_CONFIG) as StorageCategory[]).map((category) => {
              const config = CATEGORY_CONFIG[category];
              const Icon = config.icon;
              const size = breakdown[category];

              if (size === 0) return null;

              return (
                <div
                  key={category}
                  className="
                    flex items-center justify-between p-3 rounded-lg
                    bg-parchment/50 dark:bg-navy-700/50
                    hover:bg-parchment dark:hover:bg-navy-700
                    transition-colors duration-200
                  "
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-slate dark:text-warm-gray/70" />
                    <div>
                      <span className="text-sm font-medium text-charcoal dark:text-warm-gray">
                        {config.label}
                      </span>
                      <span className="ml-2 text-xs text-slate dark:text-warm-gray/70">
                        {formatBytes(size)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      showConfirm(
                        config.clearLabel,
                        `This will clear all ${config.label.toLowerCase()}. ${config.description}. This action cannot be undone.`,
                        () => handleClearCategory(category)
                      )
                    }
                    disabled={clearing !== null}
                    className="
                      px-3 py-1.5 rounded-lg
                      text-xs font-medium
                      text-red-600 dark:text-red-400
                      hover:bg-red-50 dark:hover:bg-red-900/30
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors duration-200
                      min-h-[36px]
                    "
                  >
                    {clearing === category ? (
                      <LoadingSpinner.Inline />
                    ) : (
                      'Clear'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cached Trips Section */}
      {cachedTrips.length > 0 && (
        <div className="rounded-xl bg-white/80 dark:bg-navy-800/90 border border-primary-100 dark:border-gold/20 backdrop-blur-sm overflow-hidden">
          <button
            onClick={() => toggleSection('trips')}
            className="
              w-full flex items-center justify-between p-4
              hover:bg-parchment/50 dark:hover:bg-navy-700/50
              transition-colors duration-200
            "
          >
            <h4 className="font-semibold text-charcoal dark:text-warm-gray">
              Cached Trips ({cachedTrips.length})
            </h4>
            <Icons.ChevronRight
              className={`w-5 h-5 text-slate dark:text-warm-gray/70 transition-transform duration-200 ${
                expandedSection === 'trips' ? 'rotate-90' : ''
              }`}
            />
          </button>

          {expandedSection === 'trips' && (
            <div className="px-4 pb-4 space-y-2">
              {cachedTrips.map((trip) => (
                <div
                  key={trip.tripId}
                  className="
                    flex items-center justify-between p-3 rounded-lg
                    bg-parchment/50 dark:bg-navy-700/50
                    hover:bg-parchment dark:hover:bg-navy-700
                    transition-colors duration-200
                  "
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-charcoal dark:text-warm-gray truncate block">
                      {trip.tripTitle}
                    </span>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate dark:text-warm-gray/70">
                      <span>{formatBytes(trip.size)}</span>
                      {trip.photoCount > 0 && (
                        <span>{trip.photoCount} photos</span>
                      )}
                      <span>
                        Synced{' '}
                        {trip.lastSynced.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      showConfirm(
                        'Remove Trip Data',
                        `This will remove all offline data for "${trip.tripTitle}". You can re-download it later.`,
                        () => handleClearTrip(trip.tripId),
                        'warning'
                      )
                    }
                    disabled={clearing !== null}
                    className="
                      ml-3 p-2 rounded-lg
                      text-slate dark:text-warm-gray/70
                      hover:bg-red-50 dark:hover:bg-red-900/30
                      hover:text-red-600 dark:hover:text-red-400
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors duration-200
                      min-w-[44px] min-h-[44px]
                      flex items-center justify-center
                    "
                    aria-label={`Remove ${trip.tripTitle} from offline storage`}
                  >
                    {clearing === trip.tripId ? (
                      <LoadingSpinner.Inline />
                    ) : (
                      <Icons.Trash className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-Cleanup Settings Section */}
      <div className="rounded-xl bg-white/80 dark:bg-navy-800/90 border border-primary-100 dark:border-gold/20 backdrop-blur-sm overflow-hidden">
        <button
          onClick={() => toggleSection('autocleanup')}
          className="
            w-full flex items-center justify-between p-4
            hover:bg-parchment/50 dark:hover:bg-navy-700/50
            transition-colors duration-200
          "
        >
          <div className="flex items-center gap-2">
            <Icons.Clock className="w-5 h-5 text-slate dark:text-warm-gray/70" />
            <h4 className="font-semibold text-charcoal dark:text-warm-gray">
              Auto-Cleanup Settings
            </h4>
          </div>
          <Icons.ChevronRight
            className={`w-5 h-5 text-slate dark:text-warm-gray/70 transition-transform duration-200 ${
              expandedSection === 'autocleanup' ? 'rotate-90' : ''
            }`}
          />
        </button>

        {expandedSection === 'autocleanup' && (
          <div className="px-4 pb-4 space-y-4">
            {/* Enable toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-charcoal dark:text-warm-gray">
                Enable automatic cleanup
              </span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={autoCleanup.enabled}
                  onChange={(e) =>
                    handleAutoCleanupChange({ enabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div
                  className="
                    w-11 h-6 rounded-full
                    bg-parchment dark:bg-navy-700
                    peer-checked:bg-primary-500 dark:peer-checked:bg-gold
                    transition-colors duration-200
                  "
                />
                <div
                  className="
                    absolute left-0.5 top-0.5
                    w-5 h-5 rounded-full bg-white shadow
                    peer-checked:translate-x-5
                    transition-transform duration-200
                  "
                />
              </div>
            </label>

            {/* Max age setting */}
            <div className="space-y-2">
              <label className="text-sm text-charcoal dark:text-warm-gray">
                Clear data older than
              </label>
              <select
                value={autoCleanup.maxAgeInDays}
                onChange={(e) =>
                  handleAutoCleanupChange({
                    maxAgeInDays: parseInt(e.target.value, 10),
                  })
                }
                disabled={!autoCleanup.enabled}
                className="
                  w-full px-3 py-2 rounded-lg
                  bg-white dark:bg-navy-700
                  border border-primary-100 dark:border-gold/20
                  text-charcoal dark:text-warm-gray
                  disabled:opacity-50 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-primary-500/50 dark:focus:ring-gold/50
                "
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>

            {/* Manual cleanup button */}
            <button
              onClick={() =>
                showConfirm(
                  'Clear Old Data',
                  `This will clear all cached data older than ${autoCleanup.maxAgeInDays} days. This includes thumbnails, map tiles, and Immich cache.`,
                  handleClearOldData,
                  'warning'
                )
              }
              disabled={clearing !== null}
              className="
                w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                text-sm font-medium
                bg-parchment dark:bg-navy-700
                text-charcoal dark:text-warm-gray
                hover:bg-primary-50 dark:hover:bg-navy-600
                border border-primary-100 dark:border-gold/20
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200
                min-h-[44px]
              "
            >
              {clearing === 'old' ? (
                <LoadingSpinner.Inline />
              ) : (
                <>
                  <Icons.Clock className="w-4 h-4" />
                  Clear Data Older Than {autoCleanup.maxAgeInDays} Days
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Clear All Data */}
      <div className="pt-4 border-t border-primary-100 dark:border-gold/20">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <Icons.Warning className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-red-800 dark:text-red-200">
              Clear All Offline Data
            </h4>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              This will remove all cached trips, photos, map tiles, and other offline data.
              You will need to re-download trips for offline access.
            </p>
            <button
              onClick={() =>
                showConfirm(
                  'Clear All Offline Data',
                  'This will permanently delete all offline data including cached trips, photos, map tiles, and sync queue. You will need to re-download trips for offline access. This action cannot be undone.',
                  handleClearAll
                )
              }
              disabled={clearing !== null}
              className="
                mt-3 flex items-center gap-2 px-4 py-2 rounded-lg
                bg-red-600 dark:bg-red-700
                text-white font-medium text-sm
                hover:bg-red-700 dark:hover:bg-red-800
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200
                min-h-[44px]
              "
            >
              {clearing === 'all' ? (
                <LoadingSpinner.Inline className="text-white" />
              ) : (
                <>
                  <Icons.Trash className="w-4 h-4" />
                  Clear All Offline Data
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={closeConfirm}
          onConfirm={() => {
            confirmDialog.onConfirm();
            closeConfirm();
          }}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel="Clear"
          variant={confirmDialog.variant}
          isLoading={clearing !== null}
        />
      )}
    </div>
  );
}
