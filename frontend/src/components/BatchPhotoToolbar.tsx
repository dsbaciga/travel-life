import { useEffect, useState } from 'react';
import Icon from './ui/Icon';

interface BatchPhotoToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onExitSelectionMode: () => void;
  onAddToAlbum: () => void;
  onLinkToEntity: () => void;
  onDelete: () => void;
  onRemoveFromAlbum?: () => void;
  isDeleting?: boolean;
  isInAlbum?: boolean;
  hasAlbums?: boolean;
}

export default function BatchPhotoToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onExitSelectionMode,
  onAddToAlbum,
  onLinkToEntity,
  onDelete,
  onRemoveFromAlbum,
  isDeleting = false,
  isInAlbum = false,
  hasAlbums = false,
}: BatchPhotoToolbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle mount/unmount animation
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (selectedCount > 0) {
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
  }, [selectedCount]);

  if (!shouldRender) return null;

  return (
    <div
      className={`fixed bottom-16 md:bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Backdrop blur effect */}
      <div className="bg-white/95 dark:bg-navy-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-dusk-700 shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 py-3 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left section: Selection info */}
            <div className="flex items-center gap-3">
              {/* Checkmark indicator */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40">
                <Icon name="check" className="text-primary-600 dark:text-primary-400" />
              </div>

              {/* Selection count */}
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedCount} photo{selectedCount !== 1 ? 's' : ''} selected
                </span>
                <span className="text-xs text-gray-500 dark:text-dusk-400">
                  of {totalCount} total
                </span>
              </div>

              {/* Select All / Deselect buttons (desktop) */}
              <div className="hidden sm:flex items-center gap-1 ml-2">
                {selectedCount < totalCount && (
                  <button
                    onClick={onSelectAll}
                    className="px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                  >
                    Select all
                  </button>
                )}
                {selectedCount > 0 && (
                  <button
                    onClick={onDeselectAll}
                    className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-800 rounded transition-colors"
                  >
                    Deselect
                  </button>
                )}
              </div>
            </div>

            {/* Right section: Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Mobile: Select All / Clear */}
              <div className="flex sm:hidden items-center gap-1 mr-1">
                {selectedCount < totalCount && (
                  <button
                    onClick={onSelectAll}
                    className="px-1.5 py-1.5 min-w-[44px] min-h-[44px] flex flex-col gap-0.5 items-center justify-center text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                    title="Select all"
                    aria-label="Select all"
                  >
                    <Icon name="success" />
                    <span className="text-[11px] leading-none whitespace-nowrap">All</span>
                  </button>
                )}
              </div>

              {isInAlbum && onRemoveFromAlbum ? (
                // Album view: Show remove from album button
                <button
                  onClick={onRemoveFromAlbum}
                  className="inline-flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 px-1.5 sm:px-4 py-1.5 sm:py-2.5 text-sm font-medium rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors min-w-[44px] justify-center"
                  title="Remove from album"
                  aria-label="Remove from album"
                >
                  <Icon name="delete" size={16} />
                  <span className="text-[11px] leading-none sm:text-sm whitespace-nowrap">Remove</span>
                </button>
              ) : (
                // Regular view: Show all action buttons
                <>
                  {/* Add to Album */}
                  {hasAlbums && (
                    <button
                      onClick={onAddToAlbum}
                      className="inline-flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 px-1.5 sm:px-4 py-1.5 sm:py-2.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-dusk-800 text-gray-700 dark:text-dusk-300 hover:bg-gray-200 dark:hover:bg-dusk-700 transition-colors min-w-[44px] justify-center"
                      title="Add to album"
                      aria-label="Add to album"
                    >
                      <Icon name="album" size={16} />
                      <span className="text-[11px] leading-none sm:text-sm whitespace-nowrap">Album</span>
                    </button>
                  )}

                  {/* Link to Entity */}
                  <button
                    onClick={onLinkToEntity}
                    className="inline-flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 px-1.5 sm:px-4 py-1.5 sm:py-2.5 text-sm font-medium rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors min-w-[44px] justify-center"
                    title="Link to location, activity, or stay"
                    aria-label="Link to location, activity, or stay"
                  >
                    <Icon name="link" size={16} />
                    <span className="text-[11px] leading-none sm:text-sm whitespace-nowrap">Link</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="inline-flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 px-1.5 sm:px-4 py-1.5 sm:py-2.5 text-sm font-medium rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] justify-center"
                    title="Delete selected photos"
                    aria-label="Delete selected photos"
                  >
                    {isDeleting ? (
                      <Icon name="spinner" size={16} className="animate-spin" />
                    ) : (
                      <Icon name="delete" size={16} />
                    )}
                    <span className="text-[11px] leading-none sm:text-sm whitespace-nowrap">{isDeleting ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </>
              )}

              {/* Close / Done button */}
              <button
                onClick={onExitSelectionMode}
                className="inline-flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 px-1.5 sm:px-4 py-1.5 sm:py-2.5 text-sm font-medium rounded-lg text-gray-600 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-800 transition-colors sm:ml-1"
                title="Exit selection mode"
                aria-label="Exit selection mode"
              >
                <Icon name="close" size={16} />
                <span className="text-[11px] leading-none sm:text-sm whitespace-nowrap">Done</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
