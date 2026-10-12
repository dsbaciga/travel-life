import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import entityLinkService from '../services/entityLink.service';
import { useInvalidateEntityLinks } from '../hooks/useInvalidateEntityLinks';
import GeneralEntityPickerModal from './GeneralEntityPickerModal';
import LinkEditModal from './LinkEditModal';
import PhotoLightbox from './PhotoLightbox';
import photoService from '../services/photo.service';
import { useImmichThumbnailCache, isImmichPhoto } from '../hooks/useImmichThumbnail';
import type { Photo } from '../types/photo';
import { getFullAssetUrl } from '../lib/config';
import { getAccessToken } from '../lib/axios';
import type {
  EntityType,
  EnrichedEntityLink,
} from '../types/entityLink';
import {
  ENTITY_TYPE_CONFIG,
  ENTITY_TYPE_DISPLAY_ORDER,
  ENTITY_TYPE_TO_TAB,
  getEntityColorClasses,
  getRelationshipLabel,
  getEntityDisplayName,
} from '../lib/entityConfig';

/** Selector for all focusable elements within a modal */
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * LinkPanel is a modal component for viewing and managing entity links.
 * It displays all entities linked to a source entity, grouped by type,
 * and allows users to add new links, edit existing link metadata,
 * delete links, and navigate to linked entities.
 *
 * Features:
 * - Bidirectional link display (shows both links FROM and TO the entity)
 * - Photo thumbnail preview with authenticated Immich support
 * - Keyboard navigation and focus trap for accessibility
 * - Link editing (relationship type and notes)
 * - Navigation to linked entities
 *
 * @param props - Component props
 * @param props.tripId - The ID of the trip containing the entity
 * @param props.entityType - The type of the source entity (e.g., "PHOTO", "LOCATION", "ACTIVITY")
 * @param props.entityId - The ID of the source entity
 * @param props.onClose - Callback to close the panel
 * @param props.onUpdate - Optional callback triggered when links are modified
 *
 * @example
 * ```tsx
 * <LinkPanel
 *   tripId={123}
 *   entityType="PHOTO"
 *   entityId={456}
 *   onClose={() => setShowPanel(false)}
 *   onUpdate={() => refetchData()}
 * />
 * ```
 */
interface LinkPanelProps {
  tripId: number;
  entityType: EntityType;
  entityId: number;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function LinkPanel({
  tripId,
  entityType,
  entityId,
  onClose,
  onUpdate,
}: LinkPanelProps) {
  const navigate = useNavigate();
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [editingLink, setEditingLink] = useState<EnrichedEntityLink | null>(null);
  const [thumbnailCache, setThumbnailCache] = useState<Record<number, string>>({});
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);
  const lightboxThumbnails = useImmichThumbnailCache();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  const invalidateEntityLinks = useInvalidateEntityLinks();

  // Open a linked photo in the lightbox without leaving the panel
  const openPhotoLightbox = async (photoId: number) => {
    try {
      const photo = await photoService.getPhotoById(photoId);
      void lightboxThumbnails.loadThumbnail(photo.id, photo.thumbnailPath, photo.source);
      setLightboxPhoto(photo);
    } catch {
      toast.error('Failed to load photo');
    }
  };

  const getLightboxPhotoUrl = (photo: Photo): string | null => {
    if (photo.source === 'local') {
      return getFullAssetUrl(photo.localPath) || null;
    }
    if (isImmichPhoto(photo.thumbnailPath, photo.source)) {
      return lightboxThumbnails.getThumbnailUrl(photo.id);
    }
    return getFullAssetUrl(photo.thumbnailPath) || null;
  };

  // Navigate to the linked entity's location in the trip detail page
  const handleNavigateToEntity = (linkedEntityType: EntityType, linkedEntityId: number) => {
    // Photos open in the lightbox over the panel instead of navigating away
    if (linkedEntityType === 'PHOTO') {
      void openPhotoLightbox(linkedEntityId);
      return;
    }

    // Close the panel first
    onClose();

    // Albums have their own detail page
    if (linkedEntityType === 'PHOTO_ALBUM') {
      navigate(`/trips/${tripId}/albums/${linkedEntityId}`);
      return;
    }

    const tab = ENTITY_TYPE_TO_TAB[linkedEntityType];
    if (tab) {
      // Navigate to the trip detail page with the appropriate tab
      // Add the entity ID as a hash so it could be used for scrolling/highlighting in the future
      navigate(`/trips/${tripId}?tab=${tab}#${linkedEntityType.toLowerCase()}-${linkedEntityId}`);
    }
  };

  // Fetch all links for this entity
  const {
    data: linksData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['entityLinks', tripId, entityType, entityId],
    queryFn: () => entityLinkService.getAllLinksForEntity(tripId, entityType, entityId),
  });

  // Delete link mutation
  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: number) => entityLinkService.deleteLinkById(tripId, linkId),
    onSuccess: () => {
      refetch();
      // The entity at the other end of the removed link is showing it too.
      invalidateEntityLinks(tripId);
      onUpdate?.();
    },
    onError: (error: Error) => {
      console.error('Failed to delete link:', error);
      toast.error('Failed to remove link');
    },
  });

  // Group links by entity type
  const groupedLinks = useMemo(() => {
    // Listed explicitly so the Record<EntityType, …> annotation makes TypeScript
    // enforce completeness: adding a backend EntityType fails the build here
    // instead of silently leaving a key undefined at runtime. Returning this
    // (rather than a bare `{}`) when there is no data keeps the memo's type a
    // full Record, so callers can index it by EntityType.
    const emptyGroups = (): Record<EntityType, EnrichedEntityLink[]> => ({
      PHOTO: [],
      LOCATION: [],
      ACTIVITY: [],
      LODGING: [],
      TRANSPORTATION: [],
      JOURNAL_ENTRY: [],
      PHOTO_ALBUM: [],
      SAVED_LINK: [],
      PDF_IMPORT: [],
      CUSTOM_ITEM: [],
    });

    if (!linksData) return emptyGroups();

    const groups = emptyGroups();

    const addToGroup = (type: EntityType, link: EnrichedEntityLink) => {
      groups[type].push(link);
    };

    // Links FROM this entity (this entity is the source)
    for (const link of linksData.linksFrom) {
      addToGroup(link.targetType, link);
    }

    // Links TO this entity (this entity is the target)
    for (const link of linksData.linksTo) {
      addToGroup(link.sourceType, link);
    }

    return groups;
  }, [linksData]);

  // Get entity types that have links (in standard display order)
  const linkedEntityTypes = useMemo(() => {
    return ENTITY_TYPE_DISPLAY_ORDER.filter(
      (type) => groupedLinks[type]?.length > 0
    );
  }, [groupedLinks]);

  // Auto-open Add Link modal when there are no existing links
  // This improves UX by skipping the empty list view
  useEffect(() => {
    if (!isLoading && linksData && linksData.summary.totalLinks === 0) {
      setShowAddLinkModal(true);
    }
  }, [isLoading, linksData]);

  // Load thumbnails for linked Immich photos with authentication
  useEffect(() => {
    if (!linksData) return;

    const loadThumbnails = async () => {
      const token = getAccessToken();
      if (!token) return;

      // Get all linked photos from both linksFrom and linksTo
      const photoLinks = [
        ...linksData.linksFrom.filter((l) => l.targetType === 'PHOTO'),
        ...linksData.linksTo.filter((l) => l.sourceType === 'PHOTO'),
      ];

      for (const link of photoLinks) {
        const entity = link.targetType === 'PHOTO' ? link.targetEntity : link.sourceEntity;
        const entityId = link.targetType === 'PHOTO' ? link.targetId : link.sourceId;

        // Skip if already cached or not an Immich photo
        const thumbnailPath = entity?.thumbnailPath;
        if (
          thumbnailCache[entityId] ||
          !thumbnailPath ||
          !thumbnailPath.includes('/api/immich/')
        ) {
          continue;
        }

        try {
          const fullUrl = getFullAssetUrl(thumbnailPath);
          if (!fullUrl) continue;

          const response = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);
            setThumbnailCache((prev) => ({ ...prev, [entityId]: blobUrl }));
          }
        } catch {
          // Skip failed thumbnails
        }
      }
    };

    loadThumbnails();
  }, [linksData, thumbnailCache]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Handle keyboard events including focus trap
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Escape to close (only when sub-modals are closed)
    if (e.key === 'Escape' && !showAddLinkModal && !editingLink && !lightboxPhoto) {
      onClose();
      return;
    }

    // Focus trap - keep Tab navigation within the panel (only when sub-modals are closed)
    if (e.key === 'Tab' && panelRef.current && !showAddLinkModal && !editingLink && !lightboxPhoto) {
      const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
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
  }, [onClose, showAddLinkModal, editingLink, lightboxPhoto]);

  // Focus management and keyboard handling
  useEffect(() => {
    // Store the currently focused element to restore later
    // activeElement is Element | null and can be an SVGElement, so narrow rather
    // than assert — restoring focus is only meaningful on an HTMLElement.
    triggerElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the first focusable element (Add Link button)
    setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
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

  // Get all linked entity IDs grouped by type to filter from picker
  // Uses Map<EntityType, Set<number>> to properly track IDs per entity type
  const existingLinksByType = useMemo(() => {
    const linksByType = new Map<EntityType, Set<number>>();
    if (!linksData) return linksByType;

    const idsFor = (type: EntityType) => {
      let ids = linksByType.get(type);
      if (!ids) {
        ids = new Set();
        linksByType.set(type, ids);
      }
      return ids;
    };

    for (const link of linksData.linksFrom) {
      idsFor(link.targetType).add(link.targetId);
    }
    for (const link of linksData.linksTo) {
      idsFor(link.sourceType).add(link.sourceId);
    }
    return linksByType;
  }, [linksData]);

  const handleDeleteLink = async (linkId: number) => {
    if (window.confirm('Remove this link?')) {
      deleteLinkMutation.mutate(linkId);
    }
  };

  const currentEntityConfig = ENTITY_TYPE_CONFIG[entityType];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-panel-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 id="link-panel-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {currentEntityConfig.emoji} Links
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {linksData?.summary.totalLinks ?? 0} linked items
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddLinkModal(true)}
              type="button"
              aria-label="Add link"
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-md transition-colors"
            >
              + Add Link
            </button>
            <button
              onClick={onClose}
              type="button"
              aria-label="Close"
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-red-600 dark:text-red-400 text-center py-8">
              Failed to load links. Please try again.
            </div>
          ) : linkedEntityTypes.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">🔗</div>
              <p className="text-gray-600 dark:text-gray-400">
                No linked items yet
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                Click "Add Link" above to connect this item to photos, locations, or other entities.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {linkedEntityTypes.map((type) => {
                const links = groupedLinks[type];
                const config = ENTITY_TYPE_CONFIG[type];
                const colors = getEntityColorClasses(type);

                return (
                  <div key={type}>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <span>{config.emoji}</span>
                      <span>{config.pluralLabel}</span>
                      <span className="text-gray-500">({links.length})</span>
                    </h4>
                    <div className="space-y-2">
                      {links.map((link) => {
                        // Determine if this entity is source or target
                        const isSource = link.sourceType === entityType && link.sourceId === entityId;
                        const linkedEntityType = isSource ? link.targetType : link.sourceType;
                        const linkedEntity = isSource ? link.targetEntity : link.sourceEntity;
                        const linkedEntityId = isSource ? link.targetId : link.sourceId;
                        const displayName = getEntityDisplayName(linkedEntity, linkedEntityId);
                        const isPhoto = linkedEntityType === 'PHOTO';
                        const thumbnailUrl = linkedEntity?.thumbnailPath;
                        // Null when no asset URL can be built. Rendering src="" would
                        // make the browser re-request the current page and show a
                        // broken image, so fall through to the placeholder instead.
                        const localPhotoUrl = thumbnailUrl ? getFullAssetUrl(thumbnailUrl) : null;

                        return (
                          <div
                            key={link.id}
                            className={`flex items-center justify-between p-3 rounded-lg ${colors.bg} ${colors.bgDark} border ${colors.border} cursor-pointer hover:shadow-md transition-shadow`}
                            onClick={() => handleNavigateToEntity(linkedEntityType, linkedEntityId)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleNavigateToEntity(linkedEntityType, linkedEntityId);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Show thumbnail for photos, emoji for others */}
                              {isPhoto && thumbnailUrl ? (
                                // Use cached blob URL for Immich photos, or direct URL for local photos
                                thumbnailCache[linkedEntityId] ? (
                                  <img
                                    src={thumbnailCache[linkedEntityId]}
                                    alt={displayName}
                                    className="w-12 h-12 object-cover rounded flex-shrink-0"
                                  />
                                ) : localPhotoUrl && !thumbnailUrl.includes('/api/immich/') ? (
                                  // Local photo - use direct URL
                                  <img
                                    src={localPhotoUrl}
                                    alt={displayName}
                                    className="w-12 h-12 object-cover rounded flex-shrink-0"
                                  />
                                ) : (
                                  // Immich photo still loading, or no resolvable URL
                                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0 animate-pulse" />
                                )
                              ) : (
                                <span className="text-lg flex-shrink-0">
                                  {ENTITY_TYPE_CONFIG[linkedEntityType].emoji}
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className={`font-medium truncate ${colors.text} ${colors.textDark} hover:underline`}>
                                  {displayName}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                  <span>{getRelationshipLabel(link.relationship)}</span>
                                  {link.notes && (
                                    <span className="text-gray-400 dark:text-gray-500" title={link.notes}>
                                      - {link.notes.length > 20 ? link.notes.slice(0, 20) + '...' : link.notes}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Go to icon */}
                              <svg
                                className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                              {/* Edit button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingLink(link);
                                }}
                                className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="Edit link"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </button>
                              {/* Delete button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLink(link.id);
                                }}
                                disabled={deleteLinkMutation.isPending}
                                className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="Remove link"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary w-full">
            Close
          </button>
        </div>
      </div>

      {/* Add Link Modal */}
      {showAddLinkModal && (
        <GeneralEntityPickerModal
          tripId={tripId}
          sourceEntityType={entityType}
          sourceEntityId={entityId}
          existingLinksByType={existingLinksByType}
          onClose={() => setShowAddLinkModal(false)}
          onSuccess={() => {
            refetch();
            onUpdate?.();
          }}
        />
      )}

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <PhotoLightbox
          photo={lightboxPhoto}
          photos={[lightboxPhoto]}
          getPhotoUrl={getLightboxPhotoUrl}
          onClose={() => setLightboxPhoto(null)}
          onNavigate={setLightboxPhoto}
          tripId={tripId}
        />
      )}

      {/* Edit Link Modal */}
      {editingLink && (
        <LinkEditModal
          tripId={tripId}
          link={editingLink}
          onClose={() => setEditingLink(null)}
          onSuccess={() => {
            refetch();
            onUpdate?.();
            setEditingLink(null);
          }}
        />
      )}
    </div>
  );
}
