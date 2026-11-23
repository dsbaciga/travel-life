import { useState, useCallback, useEffect } from 'react';
import Icon from '../ui/Icon';
import Modal from '../Modal';
import {
  offlineDownloadService,
  type DownloadOptions,
  type DownloadProgress,
  type DownloadSizeEstimate,
} from '../../services/offlineDownload.service';

export interface OfflineDownloadModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Trip ID to download */
  tripId: number;
  /** Trip title for display */
  tripTitle?: string;
  /** Pre-calculated size estimate (optional, will be fetched if not provided) */
  sizeEstimate?: DownloadSizeEstimate | null;
  /** Callback when download completes successfully */
  onComplete?: () => void;
  /** Callback when download fails */
  onError?: (error: string) => void;
}

/** Default download options */
const DEFAULT_OPTIONS: DownloadOptions = {
  includeFullPhotos: false,
  includeMapTiles: false,
  photoQuality: 'thumbnail',
};

/**
 * Modal for downloading a trip for offline access.
 *
 * Shows download options with size estimates:
 * - Trip details & itinerary (always included)
 * - Photo thumbnails (checkbox, default on)
 * - Full resolution photos (checkbox, default off, shows size)
 * - Map tiles for trip area (checkbox, default off, shows size)
 *
 * Displays storage usage indicator and download progress.
 *
 * @example
 * ```tsx
 * <OfflineDownloadModal
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 *   tripId={trip.id}
 *   tripTitle={trip.title}
 *   onComplete={() => refetch()}
 * />
 * ```
 */
export default function OfflineDownloadModal({
  isOpen,
  onClose,
  tripId,
  tripTitle,
  sizeEstimate: propSizeEstimate,
  onComplete,
  onError,
}: OfflineDownloadModalProps) {
  // Download options state
  const [options, setOptions] = useState<DownloadOptions>(DEFAULT_OPTIONS);

  // Size estimation
  const [sizeEstimate, setSizeEstimate] = useState<DownloadSizeEstimate | null>(
    propSizeEstimate || null
  );
  const [isEstimating, setIsEstimating] = useState(false);

  // Storage info
  const [storageInfo, setStorageInfo] = useState<{
    used: number;
    quota: number;
    percentUsed: number;
  } | null>(null);

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadComplete, setDownloadComplete] = useState(false);

  const loadEstimate = useCallback(async () => {
    try {
      setIsEstimating(true);
      const estimate = await offlineDownloadService.estimateDownloadSize(tripId);
      setSizeEstimate(estimate);
    } catch (err) {
      console.error('Failed to estimate download size:', err);
    } finally {
      setIsEstimating(false);
    }
  }, [tripId]);

  // Load size estimate and storage info when modal opens
  useEffect(() => {
    if (isOpen && !sizeEstimate) {
      loadEstimate();
    }
    if (isOpen) {
      loadStorageInfo();
    }
  }, [isOpen, loadEstimate, sizeEstimate]);

  // Use prop size estimate if provided
  useEffect(() => {
    if (propSizeEstimate) {
      setSizeEstimate(propSizeEstimate);
    }
  }, [propSizeEstimate]);

  const loadStorageInfo = async () => {
    try {
      const info = await offlineDownloadService.getStorageUsage();
      setStorageInfo(info);
    } catch (err) {
      console.error('Failed to get storage info:', err);
    }
  };

  // Calculate total download size based on options
  const calculateTotalSize = useCallback((): number => {
    if (!sizeEstimate) return 0;

    let total = sizeEstimate.metadataSize + sizeEstimate.thumbnailSize;

    if (options.includeFullPhotos) {
      total += sizeEstimate.fullPhotoSize;
    }

    if (options.includeMapTiles) {
      total += sizeEstimate.mapTilesSize;
    }

    return total;
  }, [sizeEstimate, options]);

  // Format bytes to human-readable string
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Format time remaining
  const formatTimeRemaining = (ms: number): string => {
    if (ms < 1000) return 'less than a second';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0
        ? `${minutes}m ${remainingSeconds}s`
        : `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  // Handle download
  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      setError(null);
      setProgress(null);
      setDownloadComplete(false);

      await offlineDownloadService.downloadTripForOffline(tripId, options, (p) => {
        setProgress(p);
      });

      setDownloadComplete(true);
      onComplete?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download failed';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (isDownloading) {
      offlineDownloadService.cancelDownload(tripId);
    }
    onClose();
  };

  // Handle close after completion
  const handleComplete = () => {
    setDownloadComplete(false);
    setProgress(null);
    onClose();
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setOptions(DEFAULT_OPTIONS);
      setError(null);
      setProgress(null);
      setDownloadComplete(false);
    }
  }, [isOpen]);

  // Get phase label for progress display
  const getPhaseLabel = (phase: DownloadProgress['phase']): string => {
    switch (phase) {
      case 'metadata':
        return 'Downloading trip data…';
      case 'photos':
        return 'Downloading photos…';
      case 'maps':
        return 'Downloading map tiles…';
      case 'complete':
        return 'Download complete!';
    }
  };

  // Calculate progress percentage
  const getProgressPercent = (): number => {
    if (!progress) return 0;
    if (progress.phase === 'complete') return 100;
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  // Render download complete state
  if (downloadComplete) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleComplete}
        title="Download Complete"
        icon="success"
        maxWidth="md"
        footer={
          <button
            onClick={handleComplete}
            className="btn-primary min-w-[44px] min-h-[44px]"
          >
            Done
          </button>
        }
      >
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
            <Icon name="check" size={32} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal dark:text-warm-gray mb-2">
            Trip saved for offline use
          </h3>
          <p className="text-sm text-slate dark:text-warm-gray/70 max-w-sm">
            {tripTitle ? `"${tripTitle}"` : 'Your trip'} is now available offline.
            You can access it without an internet connection.
          </p>
          {progress && (
            <p className="text-xs text-slate dark:text-warm-gray/50 mt-3">
              Downloaded {formatBytes(progress.bytesDownloaded)}
            </p>
          )}
        </div>
      </Modal>
    );
  }

  // Render downloading state
  if (isDownloading && progress) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleCancel}
        title="Downloading for Offline"
        icon="download"
        maxWidth="md"
        closeOnBackdropClick={false}
        closeOnEscape={false}
        footer={
          <button
            onClick={handleCancel}
            className="btn-secondary min-w-[44px] min-h-[44px]"
          >
            Cancel
          </button>
        }
      >
        <div className="space-y-6">
          {/* Phase indicator */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
              <Icon name="refresh" className="text-primary-600 dark:text-gold animate-spin" />
            </div>
            <div>
              <p className="text-sm font-medium text-charcoal dark:text-warm-gray">
                {getPhaseLabel(progress.phase)}
              </p>
              {progress.currentItem && (
                <p className="text-xs text-slate dark:text-warm-gray/70 truncate max-w-xs">
                  {progress.currentItem}
                </p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-2 bg-navy-200 dark:bg-navy-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 dark:bg-gold transition-all duration-300 rounded-full"
                style={{ width: `${getProgressPercent()}%` }}
              />
            </div>

            {/* Progress stats */}
            <div className="flex justify-between text-xs text-slate dark:text-warm-gray/70">
              <span>
                {progress.current} / {progress.total}
              </span>
              <span>{formatBytes(progress.bytesDownloaded)}</span>
            </div>

            {/* Time remaining */}
            {progress.estimatedTimeRemaining && progress.estimatedTimeRemaining > 0 && (
              <p className="text-xs text-slate dark:text-warm-gray/50 text-center">
                Estimated time remaining: {formatTimeRemaining(progress.estimatedTimeRemaining)}
              </p>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  // Render options selection state
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Download for Offline"
      icon="download"
      maxWidth="md"
      footer={
        <>
          <button
            onClick={handleCancel}
            className="btn-secondary min-w-[44px] min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={isEstimating}
            className="btn-primary min-w-[44px] min-h-[44px]"
          >
            <Icon name="download" size={16} className="mr-2" />
            Download ({formatBytes(calculateTotalSize())})
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Trip title */}
        {tripTitle && (
          <p className="text-sm text-slate dark:text-warm-gray/70">
            Prepare "{tripTitle}" for offline access
          </p>
        )}

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2">
              <Icon name="alert" className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  Download Failed
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Download options */}
        <div className="space-y-3">
          {/* Always included items */}
          <div className="p-3 rounded-lg bg-parchment dark:bg-navy-700/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Icon name="document" size={16} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-charcoal dark:text-warm-gray">
                  Trip details & itinerary
                </p>
                <p className="text-xs text-slate dark:text-warm-gray/70">
                  Locations, activities, transport, stays, journals, checklists
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-emerald-500" />
                <span className="text-xs text-slate dark:text-warm-gray/70">
                  {sizeEstimate ? formatBytes(sizeEstimate.metadataSize) : '...'}
                </span>
              </div>
            </div>
          </div>

          {/* Photo thumbnails - always included */}
          <div className="p-3 rounded-lg bg-parchment dark:bg-navy-700/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Icon name="photo" size={16} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-charcoal dark:text-warm-gray">
                  Photo thumbnails
                </p>
                <p className="text-xs text-slate dark:text-warm-gray/70">
                  {sizeEstimate?.photoCount || 0} photos
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="check" size={16} className="text-emerald-500" />
                <span className="text-xs text-slate dark:text-warm-gray/70">
                  {sizeEstimate ? formatBytes(sizeEstimate.thumbnailSize) : '...'}
                </span>
              </div>
            </div>
          </div>

          {/* Full resolution photos - optional */}
          <label className="p-3 rounded-lg border border-primary-100 dark:border-gold/20 cursor-pointer hover:bg-parchment/50 dark:hover:bg-navy-700/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                <Icon name="add" size={16} className="text-primary-600 dark:text-gold" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-charcoal dark:text-warm-gray">
                  Full resolution photos
                </p>
                <p className="text-xs text-slate dark:text-warm-gray/70">
                  Download original quality photos
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.includeFullPhotos}
                  onChange={(e) =>
                    setOptions({ ...options, includeFullPhotos: e.target.checked })
                  }
                  className="w-5 h-5 rounded border-primary-300 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold"
                />
                <span className="text-xs text-slate dark:text-warm-gray/70 min-w-[60px] text-right">
                  +{sizeEstimate ? formatBytes(sizeEstimate.fullPhotoSize) : '...'}
                </span>
              </div>
            </div>
          </label>

          {/* Map tiles - optional */}
          <label className="p-3 rounded-lg border border-primary-100 dark:border-gold/20 cursor-pointer hover:bg-parchment/50 dark:hover:bg-navy-700/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                <Icon name="map" size={16} className="text-primary-600 dark:text-gold" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-charcoal dark:text-warm-gray">
                  Map tiles for trip area
                </p>
                <p className="text-xs text-slate dark:text-warm-gray/70">
                  {sizeEstimate?.locationCount || 0} locations at multiple zoom levels
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.includeMapTiles}
                  onChange={(e) =>
                    setOptions({ ...options, includeMapTiles: e.target.checked })
                  }
                  className="w-5 h-5 rounded border-primary-300 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold"
                />
                <span className="text-xs text-slate dark:text-warm-gray/70 min-w-[60px] text-right">
                  +{sizeEstimate ? formatBytes(sizeEstimate.mapTilesSize) : '...'}
                </span>
              </div>
            </div>
          </label>
        </div>

        {/* Storage usage */}
        {storageInfo && (
          <div className="p-3 rounded-lg bg-parchment dark:bg-navy-700/50">
            <div className="flex items-center gap-3 mb-2">
              <Icon name="storage" size={16} className="text-slate dark:text-warm-gray/70" />
              <span className="text-xs font-medium text-slate dark:text-warm-gray/70">
                Storage Usage
              </span>
            </div>
            <div className="h-2 bg-navy-200 dark:bg-navy-600 rounded-full overflow-hidden mb-1">
              <div
                className={`h-full rounded-full transition-all ${
                  storageInfo.percentUsed > 90
                    ? 'bg-red-500'
                    : storageInfo.percentUsed > 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${storageInfo.percentUsed}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate dark:text-warm-gray/70">
              <span>{formatBytes(storageInfo.used)} used</span>
              <span>{formatBytes(storageInfo.quota - storageInfo.used)} available</span>
            </div>
          </div>
        )}

        {/* Estimated total */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-gold/30">
          <span className="text-sm font-medium text-primary-700 dark:text-gold">
            Estimated download
          </span>
          <span className="text-lg font-bold text-primary-700 dark:text-gold">
            {isEstimating ? '...' : formatBytes(calculateTotalSize())}
          </span>
        </div>
      </div>
    </Modal>
  );
}
