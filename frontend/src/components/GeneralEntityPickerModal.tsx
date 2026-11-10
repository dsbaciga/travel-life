import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { EntityType } from '../types/entityLink';
import { ENTITY_TYPE_CONFIG, LINKABLE_ENTITY_TYPES } from '../lib/entityConfig';
import { useEntityFetcher, useEntityFilter } from '../hooks/useEntityFetcher';
import { useInvalidateEntityLinks } from '../hooks/useInvalidateEntityLinks';
import entityLinkService from '../services/entityLink.service';
import { getFullAssetUrl } from '../lib/config';
import { getAccessToken } from '../lib/axios';
import toast from 'react-hot-toast';

// Threshold for showing search bar
const SEARCH_THRESHOLD = 5;

/** Selector for all focusable elements within a modal */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface GeneralEntityPickerModalProps {
  tripId: number;
  sourceEntityType: EntityType;
  sourceEntityId: number;
  existingLinksByType?: Map<EntityType, Set<number>>; // IDs of already-linked entities grouped by type
  onClose: () => void;
  onSuccess?: () => void;
}

export default function GeneralEntityPickerModal({
  tripId,
  sourceEntityType,
  sourceEntityId,
  existingLinksByType = new Map(),
  onClose,
  onSuccess,
}: GeneralEntityPickerModalProps) {
  const [selectedType, setSelectedType] = useState<EntityType | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [linking, setLinking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Record<number, string>>({});
  const invalidateEntityLinks = useInvalidateEntityLinks();
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  // Handle keyboard events including focus trap
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Escape to close
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    // Focus trap - keep Tab navigation within the modal
    if (e.key === 'Tab' && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, [onClose]);

  // Focus management and keyboard handling
  useEffect(() => {
    // Store the currently focused element to restore later
    triggerElementRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element
    setTimeout(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      firstFocusable?.focus();
    }, 0);

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Return focus to the trigger element
      triggerElementRef.current?.focus();
    };
  }, [handleKeyDown]);

  // Use shared hook for entity fetching (with pagination support for photos)
  const { entities, loading, loadingMore, hasMore, total, loadMore } = useEntityFetcher(tripId, selectedType);

  // Filter out the source entity itself and already-linked entities
  const availableEntities = useMemo(() => {
    return entities.filter((entity) => {
      // Don't show the source entity itself
      if (selectedType === sourceEntityType && entity.id === sourceEntityId) {
        return false;
      }
      // Don't show already-linked entities of the selected type
      if (selectedType && existingLinksByType.get(selectedType)?.has(entity.id)) {
        return false;
      }
      return true;
    });
  }, [entities, selectedType, sourceEntityType, sourceEntityId, existingLinksByType]);

  // Apply search filter to available entities
  const filteredEntities = useEntityFilter(availableEntities, searchQuery);

  // Load thumbnails for Immich photos with authentication
  useEffect(() => {
    if (selectedType !== 'PHOTO') return;

    const loadThumbnails = async () => {
      const token = getAccessToken();
      if (!token) return;

      for (const entity of filteredEntities) {
        // Skip if already cached or not an Immich photo
        if (
          thumbnailCache[entity.id] ||
          !entity.thumbnailPath ||
          !entity.thumbnailPath.includes('/api/immich/')
        ) {
          continue;
        }

        try {
          const fullUrl = getFullAssetUrl(entity.thumbnailPath);
          if (!fullUrl) continue;

          const response = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);
            setThumbnailCache((prev) => ({ ...prev, [entity.id]: blobUrl }));
          }
        } catch {
          // Skip failed thumbnails
        }
      }
    };

    loadThumbnails();
  }, [selectedType, filteredEntities, thumbnailCache]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleSingleLink = async (targetEntityId: number) => {
    if (!selectedType) return;

    setLinking(true);
    try {
      await entityLinkService.createLink(tripId, {
        sourceType: sourceEntityType,
        sourceId: sourceEntityId,
        targetType: selectedType,
        targetId: targetEntityId,
      });

      toast.success('Link created');
      // Both ends of the link need refreshing, not just the entity this modal
      // was opened from.
      invalidateEntityLinks(tripId);
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      console.error('Failed to create link:', error);
      const message = error instanceof Error ? error.message : 'Failed to create link';
      toast.error(message);
    } finally {
      setLinking(false);
    }
  };

  const handleBulkLink = async () => {
    if (!selectedType || selectedIds.size === 0) return;

    setLinking(true);
    try {
      const result = await entityLinkService.bulkCreateLinks(tripId, {
        sourceType: sourceEntityType,
        sourceId: sourceEntityId,
        targets: Array.from(selectedIds).map((id) => ({
          targetType: selectedType,
          targetId: id,
        })),
      });

      if (result.created > 0) {
        toast.success(`${result.created} link${result.created > 1 ? 's' : ''} created`);
      }
      if (result.skipped > 0) {
        toast(`${result.skipped} already linked`, { icon: 'ℹ️' });
      }
      invalidateEntityLinks(tripId);
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      console.error('Failed to create links:', error);
      const message = error instanceof Error ? error.message : 'Failed to create links';
      toast.error(message);
    } finally {
      setLinking(false);
    }
  };

  const toggleSelection = (entityId: number) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(entityId)) {
      newSelection.delete(entityId);
    } else {
      newSelection.add(entityId);
    }
    setSelectedIds(newSelection);
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredEntities.map((e) => e.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBack = () => {
    setSelectedType(null);
    setSearchQuery('');
    setSelectedIds(new Set());
    setMultiSelectMode(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entity-picker-title"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 id="entity-picker-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Link to...
            </h3>
            {selectedType && (
              <button
                onClick={handleBack}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                ← Back to types
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedType ? (
            // Entity Type Selection
            <div className="grid grid-cols-2 gap-3">
              {LINKABLE_ENTITY_TYPES.map((type) => {
                const config = ENTITY_TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <span className="text-2xl">{config.emoji}</span>
                    <span className="font-medium text-gray-900 dark:text-white text-center sm:text-left">{config.label}</span>
                  </button>
                );
              })}
            </div>
          ) : loading ? (
            // Loading State
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : availableEntities.length === 0 ? (
            // Empty State
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400">
                No available {ENTITY_TYPE_CONFIG[selectedType].pluralLabel.toLowerCase()} to link.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                All items may already be linked or none exist yet.
              </p>
            </div>
          ) : (
            // Entity Selection
            <>
              {/* Search bar, multi-select toggle, and count indicator */}
              <div className="mb-3 space-y-2">
                <div className="flex items-center gap-2">
                  {availableEntities.length > SEARCH_THRESHOLD && (
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search..."
                      className="input flex-1"
                    />
                  )}
                  {availableEntities.length > 1 && (
                    <button
                      onClick={() => {
                        setMultiSelectMode(!multiSelectMode);
                        if (multiSelectMode) {
                          setSelectedIds(new Set());
                        }
                      }}
                      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        multiSelectMode
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      title={multiSelectMode ? 'Switch to single select' : 'Switch to multi-select'}
                    >
                      {multiSelectMode ? 'Multi' : 'Single'}
                    </button>
                  )}
                </div>

                {/* Multi-select controls */}
                {multiSelectMode && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {selectedIds.size} selected
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAll}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Select all ({filteredEntities.length})
                      </button>
                      {selectedIds.size > 0 && (
                        <button
                          onClick={clearSelection}
                          className="text-gray-600 dark:text-gray-400 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Show count for photos with pagination */}
                {selectedType === 'PHOTO' && total > 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {entities.length} of {total} photos
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {filteredEntities.map((entity) => {
                  const isPhoto = selectedType === 'PHOTO';
                  const isSelected = selectedIds.has(entity.id);

                  return (
                    <button
                      key={entity.id}
                      onClick={() => {
                        if (multiSelectMode) {
                          toggleSelection(entity.id);
                        } else {
                          handleSingleLink(entity.id);
                        }
                      }}
                      disabled={linking && !multiSelectMode}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left disabled:opacity-50 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                      }`}
                    >
                      {/* Checkbox for multi-select mode */}
                      {multiSelectMode && (
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      )}

                      {/* Show thumbnail for photos, emoji for others */}
                      {isPhoto && entity.thumbnailPath ? (
                        // Use cached blob URL for Immich photos, or direct URL for local photos
                        thumbnailCache[entity.id] ? (
                          <img
                            src={thumbnailCache[entity.id]}
                            alt={entity.name}
                            className="w-12 h-12 object-cover rounded flex-shrink-0"
                          />
                        ) : entity.thumbnailPath.includes('/api/immich/') ? (
                          // Immich photo loading placeholder
                          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0 animate-pulse" />
                        ) : (
                          // Local photo - use direct URL
                          <img
                            src={getFullAssetUrl(entity.thumbnailPath) || ''}
                            alt={entity.name}
                            className="w-12 h-12 object-cover rounded flex-shrink-0"
                          />
                        )
                      ) : (
                        <span className="text-lg">
                          {selectedType && ENTITY_TYPE_CONFIG[selectedType].emoji}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate">
                          {entity.name}
                        </div>
                        {entity.subtitle && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {entity.subtitle}
                          </div>
                        )}
                      </div>
                      {linking && !multiSelectMode && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      )}
                    </button>
                  );
                })}
                {filteredEntities.length === 0 && searchQuery && (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                    No matches for "{searchQuery}"
                  </p>
                )}
                {/* Load More button for photos */}
                {selectedType === 'PHOTO' && hasMore && !searchQuery && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full py-3 text-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        Loading
                      </span>
                    ) : (
                      `Load More Photos (${total - entities.length} remaining)`
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          {multiSelectMode && selectedIds.size > 0 ? (
            <div className="flex gap-3">
              <button onClick={onClose} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={handleBulkLink}
                disabled={linking}
                className="btn btn-primary flex-1"
              >
                {linking ? 'Linking...' : `Link ${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''}`}
              </button>
            </div>
          ) : (
            <button onClick={onClose} className="btn btn-secondary w-full">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
