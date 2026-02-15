import { useState, useEffect, useCallback } from 'react';
import {
  ArrowDownTrayIcon,
  CloudIcon,
  CloudArrowDownIcon,
  CheckIcon,
  ArrowPathIcon,
  TrashIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { offlineDownloadService, type OfflineDownloadStatus, type DownloadSizeEstimate } from '../../services/offlineDownload.service';
import OfflineDownloadModal from './OfflineDownloadModal';

export interface OfflineDownloadButtonProps {
  /** Trip ID to download */
  tripId: number;
  /** Trip title for display */
  tripTitle?: string;
  /** Whether to show as compact button */
  compact?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when download completes */
  onDownloadComplete?: () => void;
  /** Callback when offline data is removed */
  onRemove?: () => void;
}

/**
 * Button to trigger offline download for a trip.
 *
 * Shows estimated download size and opens a modal with download options.
 * Displays current offline status (not downloaded, downloading, downloaded, outdated).
 *
 * @example
 * ```tsx
 * <OfflineDownloadButton
 *   tripId={trip.id}
 *   tripTitle={trip.title}
 *   onDownloadComplete={() => refetch()}
 * />
 * ```
 */
export default function OfflineDownloadButton({
  tripId,
  tripTitle,
  compact = false,
  className = '',
  onDownloadComplete,
  onRemove,
}: OfflineDownloadButtonProps) {
  const [status, setStatus] = useState<OfflineDownloadStatus>('not-downloaded');
  const [sizeEstimate, setSizeEstimate] = useState<DownloadSizeEstimate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial status and size estimate
  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const [currentStatus, estimate] = await Promise.all([
        offlineDownloadService.getOfflineStatus(tripId),
        offlineDownloadService.estimateDownloadSize(tripId),
      ]);
      setStatus(currentStatus);
      setSizeEstimate(estimate);
      setError(null);
    } catch (err) {
      console.error('Failed to load offline status:', err);
      setError('Failed to check status');
    } finally {
      setIsLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Handle opening the download modal
  const handleDownloadClick = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // Handle download completion
  const handleDownloadComplete = useCallback(() => {
    setIsModalOpen(false);
    setStatus('downloaded');
    onDownloadComplete?.();
  }, [onDownloadComplete]);

  // Handle remove offline data
  const handleRemove = useCallback(async () => {
    if (!window.confirm('Remove offline data for this trip? You will need to download again to access offline.')) {
      return;
    }

    try {
      setIsRemoving(true);
      await offlineDownloadService.removeOfflineTrip(tripId);
      setStatus('not-downloaded');
      onRemove?.();
    } catch (err) {
      console.error('Failed to remove offline data:', err);
      setError('Failed to remove');
    } finally {
      setIsRemoving(false);
    }
  }, [tripId, onRemove]);

  // Handle refresh (re-download)
  const handleRefresh = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // Format bytes to human-readable string
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Render compact button
  if (compact) {
    return (
      <>
        <button
          onClick={status === 'downloaded' || status === 'outdated' ? handleRemove : handleDownloadClick}
          disabled={isLoading || isRemoving || status === 'downloading'}
          className={`
            inline-flex items-center justify-center
            w-10 h-10 rounded-lg
            transition-all duration-200
            focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
            disabled:opacity-50 disabled:cursor-not-allowed
            ${status === 'downloaded'
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
              : status === 'outdated'
              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60'
              : status === 'downloading'
              ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-gold'
              : 'bg-parchment dark:bg-navy-700 text-slate dark:text-warm-gray hover:bg-primary-100 dark:hover:bg-navy-600'
            }
            ${className}
          `}
          title={
            status === 'downloaded'
              ? 'Available offline - Click to remove'
              : status === 'outdated'
              ? 'Offline data outdated - Click to update'
              : status === 'downloading'
              ? 'Downloading...'
              : 'Download for offline'
          }
          aria-label={
            status === 'downloaded'
              ? 'Remove offline data'
              : status === 'outdated'
              ? 'Update offline data'
              : status === 'downloading'
              ? 'Downloading'
              : 'Download for offline'
          }
        >
          {isLoading || isRemoving ? (
            <ArrowPathIcon className="w-5 h-5 animate-spin" />
          ) : status === 'downloaded' ? (
            <CheckIcon className="w-5 h-5" />
          ) : status === 'outdated' ? (
            <ArrowPathIcon className="w-5 h-5" />
          ) : status === 'downloading' ? (
            <ArrowPathIcon className="w-5 h-5 animate-spin" />
          ) : (
            <ArrowDownTrayIcon className="w-5 h-5" />
          )}
        </button>

        <OfflineDownloadModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          tripId={tripId}
          tripTitle={tripTitle}
          sizeEstimate={sizeEstimate}
          onComplete={handleDownloadComplete}
        />
      </>
    );
  }

  // Render full button
  return (
    <>
      <div
        className={`
          rounded-xl p-4
          bg-white/80 dark:bg-navy-800/90
          border border-primary-100 dark:border-gold/20
          backdrop-blur-sm
          ${className}
        `}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Status info */}
          <div className="flex items-start gap-3">
            {/* Status icon */}
            <div
              className={`
                flex items-center justify-center w-10 h-10 rounded-full
                ${status === 'downloaded' ? 'bg-emerald-100 dark:bg-emerald-900/40' : ''}
                ${status === 'outdated' ? 'bg-amber-100 dark:bg-amber-900/40' : ''}
                ${status === 'downloading' ? 'bg-primary-100 dark:bg-primary-900/40' : ''}
                ${status === 'not-downloaded' ? 'bg-parchment dark:bg-navy-700' : ''}
              `}
            >
              {isLoading ? (
                <ArrowPathIcon className="w-5 h-5 text-slate dark:text-warm-gray animate-spin" />
              ) : status === 'downloaded' ? (
                <CloudArrowDownIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : status === 'outdated' ? (
                <ExclamationCircleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              ) : status === 'downloading' ? (
                <ArrowPathIcon className="w-5 h-5 text-primary-600 dark:text-gold animate-spin" />
              ) : (
                <CloudIcon className="w-5 h-5 text-slate dark:text-warm-gray" />
              )}
            </div>

            {/* Status text */}
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-charcoal dark:text-warm-gray">
                {isLoading
                  ? 'Checking status...'
                  : status === 'downloaded'
                  ? 'Available Offline'
                  : status === 'outdated'
                  ? 'Offline Data Outdated'
                  : status === 'downloading'
                  ? 'Downloading...'
                  : 'Download for Offline'}
              </span>

              {/* Size estimate */}
              {!isLoading && sizeEstimate && status !== 'downloaded' && (
                <span className="text-xs text-slate dark:text-warm-gray/70 mt-0.5">
                  Est. {formatBytes(sizeEstimate.totalSize)} ({sizeEstimate.photoCount} photos)
                </span>
              )}

              {/* Downloaded status details */}
              {status === 'downloaded' && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Trip accessible without internet
                </span>
              )}

              {/* Outdated warning */}
              {status === 'outdated' && (
                <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Data may be out of sync. Consider updating.
                </span>
              )}

              {/* Error message */}
              {error && (
                <span className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  {error}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {status === 'not-downloaded' && (
              <button
                onClick={handleDownloadClick}
                disabled={isLoading}
                className="
                  inline-flex items-center gap-1.5 px-3 py-1.5
                  text-sm font-medium rounded-lg
                  bg-primary-500 dark:bg-gold
                  text-white dark:text-navy-900
                  hover:bg-primary-600 dark:hover:bg-amber-400
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors duration-200
                  focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
                  min-w-[44px] min-h-[44px]
                "
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Download
              </button>
            )}

            {status === 'downloaded' && (
              <>
                <button
                  onClick={handleRefresh}
                  disabled={isRemoving}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1.5
                    text-sm font-medium rounded-lg
                    bg-primary-100 dark:bg-navy-700
                    text-primary-700 dark:text-gold
                    hover:bg-primary-200 dark:hover:bg-navy-600
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                    focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
                    min-w-[44px] min-h-[44px]
                  "
                  title="Update offline data"
                  aria-label="Update offline data"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRemove}
                  disabled={isRemoving}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1.5
                    text-sm font-medium rounded-lg
                    bg-red-100 dark:bg-red-900/30
                    text-red-700 dark:text-red-300
                    hover:bg-red-200 dark:hover:bg-red-900/50
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                    focus-visible:ring-2 focus-visible:ring-red-500/50
                    min-w-[44px] min-h-[44px]
                  "
                  title="Remove offline data"
                  aria-label="Remove offline data"
                >
                  {isRemoving ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <TrashIcon className="w-4 h-4" />
                  )}
                </button>
              </>
            )}

            {status === 'outdated' && (
              <>
                <button
                  onClick={handleRefresh}
                  disabled={isRemoving}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1.5
                    text-sm font-medium rounded-lg
                    bg-amber-500 dark:bg-amber-600
                    text-white
                    hover:bg-amber-600 dark:hover:bg-amber-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                    focus-visible:ring-2 focus-visible:ring-amber-500/50
                    min-w-[44px] min-h-[44px]
                  "
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  Update
                </button>
                <button
                  onClick={handleRemove}
                  disabled={isRemoving}
                  className="
                    p-2 rounded-lg
                    text-slate dark:text-warm-gray/70
                    hover:bg-parchment dark:hover:bg-navy-700
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                    focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
                    min-w-[44px] min-h-[44px]
                    flex items-center justify-center
                  "
                  title="Remove offline data"
                  aria-label="Remove offline data"
                >
                  {isRemoving ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <TrashIcon className="w-4 h-4" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <OfflineDownloadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tripId={tripId}
        tripTitle={tripTitle}
        sizeEstimate={sizeEstimate}
        onComplete={handleDownloadComplete}
      />
    </>
  );
}
