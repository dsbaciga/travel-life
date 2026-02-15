import { useEffect, useState } from 'react';

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
      <div className="bg-white/95 dark:bg-navy-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-700 shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 py-3 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left section: Selection info */}
            <div className="flex items-center gap-3">
              {/* Checkmark indicator */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40">
                <svg
                  className="w-5 h-5 text-primary-600 dark:text-primary-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              {/* Selection count */}
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedCount} photo{selectedCount !== 1 ? 's' : ''} selected
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
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
                    className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  >
                    Deselect
                  </button>
                )}
              </div>
            </div>

            {/* Right section: Actions */}
            <div className="flex items-center gap-2">
              {/* Mobile: Select All / Clear */}
              <div className="flex sm:hidden items-center gap-1 mr-2">
                {selectedCount < totalCount && (
                  <button
                    onClick={onSelectAll}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                    title="Select all"
                    aria-label="Select all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}
              </div>

              {isInAlbum && onRemoveFromAlbum ? (
                // Album view: Show remove from album button
                <button
                  onClick={onRemoveFromAlbum}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors min-w-[44px] justify-center"
                  title="Remove from album"
                  aria-label="Remove from album"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="hidden sm:inline">Remove</span>
                </button>
              ) : (
                // Regular view: Show all action buttons
                <>
                  {/* Add to Album */}
                  {hasAlbums && (
                    <button
                      onClick={onAddToAlbum}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors min-w-[44px] justify-center"
                      title="Add to album"
                      aria-label="Add to album"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <span className="hidden sm:inline">Album</span>
                    </button>
                  )}

                  {/* Link to Entity */}
                  <button
                    onClick={onLinkToEntity}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors min-w-[44px] justify-center"
                    title="Link to location, activity, or lodging"
                    aria-label="Link to location, activity, or lodging"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span className="hidden sm:inline">Link</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] justify-center"
                    title="Delete selected photos"
                    aria-label="Delete selected photos"
                  >
                    {isDeleting ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                    <span className="hidden sm:inline">{isDeleting ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </>
              )}

              {/* Close / Done button */}
              <button
                onClick={onExitSelectionMode}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ml-1"
                title="Exit selection mode"
                aria-label="Exit selection mode"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden sm:inline">Done</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
