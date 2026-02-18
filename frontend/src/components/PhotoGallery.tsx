import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Photo, PhotoAlbum } from "../types/photo";
import { stripMarkdown } from "../utils/stripMarkdown";
import photoService from "../services/photo.service";
import toast from "react-hot-toast";
import { getFullAssetUrl } from "../lib/config";
import { getAccessToken } from "../lib/axios";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import PhotoLightbox from "./PhotoLightbox";
import ProgressiveImage from "./ProgressiveImage";
import EntityPickerModal from "./EntityPickerModal";
import BatchPhotoToolbar from "./BatchPhotoToolbar";
import EmptyState, { EmptyIllustrations } from "./EmptyState";
import { formatDuration } from "../utils/duration";

/** Number of photos beyond which we enable virtual scrolling for the grid */
const VIRTUALIZATION_THRESHOLD = 50;
/** Fixed column count used for virtualization row calculation */
const VIRTUAL_GRID_COLUMNS = 4;
/** Estimated row height in pixels (square aspect ratio items + gap) */
const VIRTUAL_ROW_HEIGHT = 260;
/** Number of rows to render outside the visible area */
const VIRTUAL_OVERSCAN = 3;

/**
 * PhotoGallery displays a collection of photos in grid or list view with
 * support for both local uploads and Immich-sourced photos. Provides batch
 * selection, album management, entity linking, and photo editing capabilities.
 *
 * Features:
 * - Grid and list view modes
 * - Sorting by date, name, or location
 * - Batch selection with shift-click range selection
 * - Add photos to existing or new albums
 * - Remove photos from current album
 * - Bulk delete selected photos
 * - Entity linking (link photos to locations, activities, etc.)
 * - Cover photo designation
 * - Immich thumbnail caching with retry logic for rate limiting
 * - Video support with duration display
 * - Photo lightbox with edit capabilities
 *
 * @param props - Component props
 * @param props.photos - Array of photos to display
 * @param props.albums - Optional array of available albums for batch operations
 * @param props.onPhotoDeleted - Callback when a photo is deleted
 * @param props.onPhotoUpdated - Callback when a photo is edited (caption, date)
 * @param props.onSetCoverPhoto - Callback to set a photo as album/trip cover
 * @param props.onPhotosAddedToAlbum - Callback when photos are added to an album
 * @param props.coverPhotoId - ID of the current cover photo (shows badge)
 * @param props.totalPhotosInView - Total photo count for "Select All" functionality
 * @param props.onLoadAllPhotos - Callback to load all photos (for selecting all)
 * @param props.currentAlbumId - ID of current album (enables "Remove from album")
 * @param props.onPhotosRemovedFromAlbum - Callback when photos are removed from album
 * @param props.onSortChange - Callback when sort options change (for server-side sorting)
 * @param props.initialSortBy - Initial sort field ("date", "name", "location")
 * @param props.initialSortOrder - Initial sort order ("asc", "desc")
 * @param props.tripId - Trip ID for entity linking operations
 *
 * @example
 * ```tsx
 * <PhotoGallery
 *   photos={albumPhotos}
 *   albums={tripAlbums}
 *   coverPhotoId={album.coverPhotoId}
 *   currentAlbumId={album.id}
 *   onPhotoDeleted={() => refetch()}
 *   onPhotoUpdated={() => refetch()}
 *   onSetCoverPhoto={(id) => setCover(id)}
 *   tripId={tripId}
 * />
 * ```
 */
interface PhotoGalleryProps {
  photos: Photo[];
  albums?: PhotoAlbum[];
  onPhotoDeleted?: () => void;
  onPhotoUpdated?: () => void;
  onSetCoverPhoto?: (photoId: number) => void;
  onPhotosAddedToAlbum?: () => void;
  coverPhotoId?: number | null;
  totalPhotosInView?: number;
  onLoadAllPhotos?: () => Promise<void>;
  currentAlbumId?: number | null;
  onPhotosRemovedFromAlbum?: () => void;
  onSortChange?: (sortBy: string, sortOrder: string) => void;
  initialSortBy?: string;
  initialSortOrder?: string;
  tripId?: number;
}

interface ThumbnailCache {
  [photoId: number]: string; // Maps photo ID to blob URL
}

interface FailedThumbnails {
  [photoId: number]: number; // Maps photo ID to retry count
}

// Helper function for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Maximum number of retry attempts for failed thumbnails (to avoid infinite loops)
const MAX_THUMBNAIL_RETRIES = 2;

/**
 * Fetches a URL with exponential backoff retry logic for handling rate limiting.
 * Specifically designed to handle Immich API 429 responses gracefully.
 * @param url - The URL to fetch
 * @param options - Standard fetch options (headers, etc.)
 * @param maxRetries - Maximum number of retry attempts (default: 4)
 * @param initialDelay - Initial delay in ms before first retry (default: 1000, doubles each retry)
 * @returns The fetch Response object
 * @throws Error if all retries fail
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 4,
  initialDelay = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If rate limited, wait and retry
      if (response.status === 429 && attempt < maxRetries) {
        const retryDelay = initialDelay * Math.pow(2, attempt);
        console.log(`[PhotoGallery] Rate limited (429). Retrying in ${retryDelay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await delay(retryDelay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const retryDelay = initialDelay * Math.pow(2, attempt);
        console.log(`[PhotoGallery] Fetch error. Retrying in ${retryDelay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await delay(retryDelay);
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

/**
 * Individual photo grid item extracted as a separate component to be shared
 * between the simple grid and the virtualized grid renderers.
 */
function PhotoGridItem({
  photo,
  index,
  thumbnailUrl,
  isSelected,
  selectionMode,
  coverPhotoId,
  onToggleSelection,
  onSelectPhoto,
}: {
  photo: Photo;
  index: number;
  thumbnailUrl: string | null;
  isSelected: boolean;
  selectionMode: boolean;
  coverPhotoId?: number | null;
  onToggleSelection: (photoId: number, shiftKey: boolean) => void;
  onSelectPhoto: (photo: Photo) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={photo.caption || `Photo ${index + 1}`}
      {...(selectionMode && { 'aria-pressed': isSelected })}
      className="relative group cursor-pointer aspect-square overflow-hidden rounded-xl bg-parchment dark:bg-navy-800 shadow-md hover:shadow-2xl transition-all duration-300 hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-sky focus:ring-offset-2"
      onClick={(e) =>
        selectionMode
          ? onToggleSelection(photo.id, e.shiftKey)
          : onSelectPhoto(photo)
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (selectionMode) {
            onToggleSelection(photo.id, e.shiftKey);
          } else {
            onSelectPhoto(photo);
          }
        }
      }}
    >
      {thumbnailUrl ? (
        <ProgressiveImage
          src={thumbnailUrl}
          alt={photo.caption || "Photo"}
          aspectRatio="1/1"
          imgClassName="transform group-hover:scale-110 transition-transform duration-500"
          lazy={index > 20}
          rootMargin="400px"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate/40 dark:text-warm-gray/40">
          <svg
            className="w-16 h-16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}

      {/* Video indicator */}
      {photo.mediaType === 'video' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 rounded-full p-3 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Video duration badge */}
      {photo.mediaType === 'video' && photo.duration && (
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded font-mono z-10">
          {formatDuration(photo.duration)}
        </div>
      )}

      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {photo.caption && (
          <div className="absolute bottom-0 left-0 right-0 p-4 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <p className="text-white font-body text-sm font-medium line-clamp-2">
              {photo.caption}
            </p>
          </div>
        )}
      </div>

      {/* Badges */}
      {coverPhotoId === photo.id && (
        <div className="absolute top-3 left-3 bg-gradient-to-r from-accent-500 to-accent-600 text-white text-xs px-3 py-1.5 rounded-full font-body font-semibold shadow-lg z-10">
          Cover Photo
        </div>
      )}
      {photo.location && (
        <div className="absolute top-3 right-3 bg-primary-500/90 dark:bg-primary-600/90 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full font-body font-medium shadow-lg">
          {photo.location.name}
        </div>
      )}

      {/* Selection checkbox */}
      {selectionMode && (
        <div className="absolute top-3 left-3 z-10">
          <div
            className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shadow-lg transition-all ${
              isSelected
                ? "bg-primary-600 dark:bg-accent-500 border-primary-600 dark:border-accent-500 scale-110"
                : "bg-white/90 dark:bg-navy-800/90 border-primary-200 dark:border-navy-700 backdrop-blur-sm hover:border-primary-400 dark:hover:border-accent-400"
            }`}
          >
            {isSelected && (
              <svg
                className="w-5 h-5 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PhotoGallery({
  photos,
  albums,
  onPhotoDeleted,
  onPhotoUpdated,
  onSetCoverPhoto,
  onPhotosAddedToAlbum,
  coverPhotoId,
  totalPhotosInView = 0,
  onLoadAllPhotos,
  currentAlbumId = null,
  onPhotosRemovedFromAlbum,
  onSortChange,
  initialSortBy = "date",
  initialSortOrder = "desc",
  tripId,
}: PhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editTakenAt, setEditTakenAt] = useState<string | null>(null);
  const [thumbnailCache, setThumbnailCache] = useState<ThumbnailCache>({});
  const [failedThumbnails, setFailedThumbnails] = useState<FailedThumbnails>({});
  const [retryTrigger, setRetryTrigger] = useState(0); // Increment to trigger retry of failed thumbnails
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(
    new Set()
  );
  const [showAlbumSelectModal, setShowAlbumSelectModal] = useState(false);
  const [isAddingToAlbum, setIsAddingToAlbum] = useState(false);
  const [showCreateAlbumForm, setShowCreateAlbumForm] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDescription, setNewAlbumDescription] = useState("");
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [isDeletingPhotos, setIsDeletingPhotos] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null
  );
  const [showEntityPickerModal, setShowEntityPickerModal] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"date" | "name" | "location">(
    initialSortBy as "date" | "name" | "location"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    initialSortOrder as "asc" | "desc"
  );
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Track which photos we're currently fetching to avoid duplicate requests
  const fetchingPhotos = useRef<Set<number>>(new Set());
  // Track photo IDs from previous render to detect which photos were removed
  const previousPhotoIds = useRef<Set<number>>(new Set());
  // Keep a ref to the cache for cleanup purposes (avoids stale closure issues)
  const thumbnailCacheRef = useRef<ThumbnailCache>({});

  // Keep cache ref in sync with state
  useEffect(() => {
    thumbnailCacheRef.current = thumbnailCache;
  }, [thumbnailCache]);

  // Load thumbnails for Immich photos with authentication
  useEffect(() => {
    const currentPhotoIds = new Set(photos.map((p) => p.id));

    // Only revoke blob URLs for photos that were in the previous set but are NOT in the current set
    // Skip cleanup when current photos is empty - this preserves cache when switching views
    // (e.g., All Photos -> Unsorted (0 photos) -> All Photos)
    if (previousPhotoIds.current.size > 0 && currentPhotoIds.size > 0) {
      const removedPhotoIds = [...previousPhotoIds.current].filter(
        (id) => !currentPhotoIds.has(id)
      );
      if (removedPhotoIds.length > 0) {
        console.log(
          "[PhotoGallery] Revoking blob URLs for removed photos:",
          removedPhotoIds
        );
        const cacheSnapshot = thumbnailCacheRef.current;
        removedPhotoIds.forEach((id) => {
          if (cacheSnapshot[id]) {
            URL.revokeObjectURL(cacheSnapshot[id]);
          }
          fetchingPhotos.current.delete(id);
        });
        // Remove revoked entries from cache
        setThumbnailCache((prev) => {
          const newCache = { ...prev };
          removedPhotoIds.forEach((id) => delete newCache[id]);
          return newCache;
        });
      }
    }

    // Update previous photo IDs for next render (only if we have photos)
    if (currentPhotoIds.size > 0) {
      previousPhotoIds.current = currentPhotoIds;
    }

    const loadThumbnails = async () => {
      const token = getAccessToken();
      if (!token) {
        console.log("[PhotoGallery] No access token available");
        return;
      }

      // Small delay between thumbnail fetches to avoid rate limiting
      const THUMBNAIL_FETCH_DELAY = 50; // 50ms between requests

      for (const photo of photos) {
        // Skip if already cached, currently fetching, or not an Immich photo
        if (
          thumbnailCache[photo.id] ||
          fetchingPhotos.current.has(photo.id) ||
          photo.source !== "immich" ||
          !photo.thumbnailPath
        ) {
          continue;
        }

        // Check if this photo has exceeded max retry attempts
        const currentRetryCount = failedThumbnails[photo.id] || 0;
        if (currentRetryCount >= MAX_THUMBNAIL_RETRIES) {
          continue; // Skip - already tried maximum times
        }

        // Mark as fetching
        fetchingPhotos.current.add(photo.id);

        try {
          const fullUrl = getFullAssetUrl(photo.thumbnailPath);
          if (!fullUrl) {
            fetchingPhotos.current.delete(photo.id);
            continue;
          }

          console.log(
            `[PhotoGallery] Fetching thumbnail for photo ${photo.id} (attempt ${currentRetryCount + 1}/${MAX_THUMBNAIL_RETRIES}):`,
            fullUrl
          );

          const response = await fetchWithRetry(fullUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            console.error(
              `[PhotoGallery] Failed to fetch thumbnail for photo ${photo.id}: ${response.status} ${response.statusText}`
            );
            fetchingPhotos.current.delete(photo.id);
            // Track the failure with incremented retry count
            setFailedThumbnails((prev) => ({
              ...prev,
              [photo.id]: (prev[photo.id] || 0) + 1,
            }));
            continue;
          }

          // Add small delay before next fetch to avoid rate limiting
          await delay(THUMBNAIL_FETCH_DELAY);

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          console.log(
            `[PhotoGallery] Successfully loaded thumbnail for photo ${photo.id}, blob URL: ${blobUrl}`
          );

          setThumbnailCache((prev) => ({
            ...prev,
            [photo.id]: blobUrl,
          }));

          // Remove from failed thumbnails on success
          setFailedThumbnails((prev) => {
            const newFailed = { ...prev };
            delete newFailed[photo.id];
            return newFailed;
          });

          // Remove from fetching set after successful load
          fetchingPhotos.current.delete(photo.id);
        } catch (error) {
          console.error(
            `[PhotoGallery] Error loading thumbnail for photo ${photo.id}:`,
            error
          );
          fetchingPhotos.current.delete(photo.id);
          // Track the failure with incremented retry count
          setFailedThumbnails((prev) => ({
            ...prev,
            [photo.id]: (prev[photo.id] || 0) + 1,
          }));
        }
      }
    };

    if (photos.length > 0) {
      loadThumbnails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, retryTrigger]); // thumbnailCache removed - was causing infinite loop; retryTrigger added to allow manual retry

  // Cleanup all blob URLs only when component unmounts
  useEffect(() => {
    const currentFetchingPhotos = fetchingPhotos.current;
    return () => {
      console.log("[PhotoGallery] Component unmounting, revoking blob URLs");
      // Use the ref to access current cache (avoids stale closure)
      Object.values(thumbnailCacheRef.current).forEach((url) =>
        URL.revokeObjectURL(url)
      );
      currentFetchingPhotos.clear();
    };
  }, []); // Empty array - only run cleanup on unmount

  const handleDelete = async (photoId: number) => {
    const confirmed = await confirm({
      title: "Delete Photo",
      message:
        "Are you sure you want to delete this photo? This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await photoService.deletePhoto(photoId);
      setSelectedPhoto(null);
      onPhotoDeleted?.();
    } catch {
      toast.error("Failed to delete photo");
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedPhoto) return;

    try {
      await photoService.updatePhoto(selectedPhoto.id, {
        caption: editCaption || null,
        takenAt: editTakenAt || null,
      });
      setIsEditMode(false);
      onPhotoUpdated?.();
      toast.success("Photo updated");
    } catch {
      toast.error("Failed to update photo");
    }
  };

  const togglePhotoSelection = (photoId: number, shiftKey: boolean = false) => {
    const photoIndex = photos.findIndex((p) => p.id === photoId);

    // Handle shift-click range selection
    if (shiftKey && lastSelectedIndex !== null) {
      const newSelection = new Set(selectedPhotoIds);
      const start = Math.min(lastSelectedIndex, photoIndex);
      const end = Math.max(lastSelectedIndex, photoIndex);

      // Select all photos in the range
      for (let i = start; i <= end; i++) {
        newSelection.add(photos[i].id);
      }

      setSelectedPhotoIds(newSelection);
      setLastSelectedIndex(photoIndex);
    } else {
      // Normal toggle behavior
      const newSelection = new Set(selectedPhotoIds);
      if (newSelection.has(photoId)) {
        newSelection.delete(photoId);
      } else {
        newSelection.add(photoId);
      }
      setSelectedPhotoIds(newSelection);
      setLastSelectedIndex(photoIndex);
    }
  };

  const selectAllLoadedPhotos = () => {
    const allPhotoIds = new Set(photos.map((p) => p.id));
    setSelectedPhotoIds(allPhotoIds);
  };

  // Effect to select all photos after loading completes (handles the case where
  // photos state updates after the onLoadAllPhotos promise resolves)
  // Using a ref instead of state to avoid triggering re-renders during loading
  const pendingSelectAll = useRef(false);

  useEffect(() => {
    if (pendingSelectAll.current && photos.length > 0 && photos.length >= totalPhotosInView) {
      pendingSelectAll.current = false;
      const allPhotoIds = new Set(photos.map((p) => p.id));
      setSelectedPhotoIds(allPhotoIds);
    }
  }, [photos, totalPhotosInView]);

  // Load all photos and select them once complete
  const selectAllPhotosInFolderWithEffect = async () => {
    if (!onLoadAllPhotos) {
      selectAllLoadedPhotos();
      return;
    }

    try {
      pendingSelectAll.current = true;
      await onLoadAllPhotos();
      // The effect will handle selection once photos.length >= totalPhotosInView
    } catch {
      pendingSelectAll.current = false;
      toast.error("Failed to load all photos");
    }
  };

  const deselectAllPhotos = () => {
    setSelectedPhotoIds(new Set());
    setLastSelectedIndex(null);
  };

  const handleAddToAlbum = async (albumId: number) => {
    if (selectedPhotoIds.size === 0) return;

    try {
      setIsAddingToAlbum(true);
      await photoService.addPhotosToAlbum(albumId, {
        photoIds: Array.from(selectedPhotoIds),
      });
      setShowAlbumSelectModal(false);
      setShowCreateAlbumForm(false);
      setSelectionMode(false);
      setSelectedPhotoIds(new Set());
      setLastSelectedIndex(null);
      onPhotosAddedToAlbum?.();
      toast.success(`Successfully added ${selectedPhotoIds.size} photo(s) to album`);
    } catch {
      toast.error("Failed to add photos to album");
    } finally {
      setIsAddingToAlbum(false);
    }
  };

  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim() || selectedPhotoIds.size === 0) return;

    // Get tripId from the first selected photo
    const firstPhotoId = Array.from(selectedPhotoIds)[0];
    const firstPhoto = photos.find((p) => p.id === firstPhotoId);
    if (!firstPhoto) return;

    try {
      setIsCreatingAlbum(true);
      // Create the album
      const newAlbum = await photoService.createAlbum({
        tripId: firstPhoto.tripId,
        name: newAlbumName,
        description: newAlbumDescription || undefined,
      });

      // Add selected photos to the new album
      await photoService.addPhotosToAlbum(newAlbum.id, {
        photoIds: Array.from(selectedPhotoIds),
      });

      // Reset form and close modals
      setNewAlbumName("");
      setNewAlbumDescription("");
      setShowCreateAlbumForm(false);
      setShowAlbumSelectModal(false);
      setSelectionMode(false);
      setSelectedPhotoIds(new Set());
      setLastSelectedIndex(null);
      onPhotosAddedToAlbum?.();
      toast.success(
        `Successfully created album "${newAlbum.name}" with ${selectedPhotoIds.size} photo(s)`
      );
    } catch {
      toast.error("Failed to create album");
    } finally {
      setIsCreatingAlbum(false);
    }
  };

  const handleRemoveFromAlbum = async () => {
    if (selectedPhotoIds.size === 0 || !currentAlbumId) return;

    const confirmed = await confirm({
      title: "Remove Photos",
      message: `Remove ${selectedPhotoIds.size} photo(s) from this album? The photos will not be deleted, only removed from this album.`,
      confirmLabel: "Remove",
      variant: "warning",
    });
    if (!confirmed) return;

    try {
      setIsAddingToAlbum(true);
      // Remove photos one by one (backend doesn't have bulk remove yet)
      const photoIds = Array.from(selectedPhotoIds);
      for (const photoId of photoIds) {
        await photoService.removePhotoFromAlbum(currentAlbumId, photoId);
      }
      setSelectionMode(false);
      setSelectedPhotoIds(new Set());
      setLastSelectedIndex(null);
      onPhotosRemovedFromAlbum?.();
      toast.success(`Successfully removed ${photoIds.length} photo(s) from album`);
    } catch {
      toast.error("Failed to remove photos from album");
    } finally {
      setIsAddingToAlbum(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedPhotoIds.size === 0) return;

    const confirmed = await confirm({
      title: "Delete Photos",
      message: `Are you sure you want to delete ${selectedPhotoIds.size} photo(s)? This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      setIsDeletingPhotos(true);
      const photoIds = Array.from(selectedPhotoIds);
      for (const photoId of photoIds) {
        await photoService.deletePhoto(photoId);
      }
      setSelectionMode(false);
      setSelectedPhotoIds(new Set());
      setLastSelectedIndex(null);
      onPhotoDeleted?.();
    } catch {
      toast.error("Failed to delete photos");
    } finally {
      setIsDeletingPhotos(false);
    }
  };

  const getPhotoUrl = (photo: Photo): string | null => {
    if (photo.source === "local" && photo.localPath && photo.localPath !== "") {
      return getFullAssetUrl(photo.localPath);
    }
    // For Immich photos, use blob URL from cache
    if (photo.source === "immich") {
      return thumbnailCache[photo.id] || null;
    }
    return null;
  };

  const getThumbnailUrl = (photo: Photo): string | null => {
    if (
      photo.source === "local" &&
      photo.thumbnailPath &&
      photo.thumbnailPath !== ""
    ) {
      return getFullAssetUrl(photo.thumbnailPath);
    }
    // For Immich photos, use blob URL from cache
    if (photo.source === "immich") {
      return thumbnailCache[photo.id] || null;
    }
    // Fallback to full photo URL
    return getPhotoUrl(photo);
  };

  // Handle sort change - trigger reload from parent
  const handleSortChange = (newSortBy: string, newSortOrder: string) => {
    setSortBy(newSortBy as "date" | "name" | "location");
    setSortOrder(newSortOrder as "asc" | "desc");

    // Notify parent to reload photos with new sort
    if (onSortChange) {
      onSortChange(newSortBy, newSortOrder);
    }
  };

  // Retry loading failed thumbnails (resets retry count for retryable photos)
  const handleRetryFailedThumbnails = () => {
    // Only reset counts for photos that haven't exceeded max retries
    // This allows one more attempt
    const retryablePhotos = Object.entries(failedThumbnails)
      .filter(([, count]) => count < MAX_THUMBNAIL_RETRIES)
      .map(([id]) => parseInt(id));

    if (retryablePhotos.length === 0) {
      toast.error("All failed thumbnails have reached maximum retry attempts");
      return;
    }

    console.log(`[PhotoGallery] Retrying ${retryablePhotos.length} failed thumbnails`);
    setRetryTrigger((prev) => prev + 1);
    toast.success(`Retrying ${retryablePhotos.length} failed thumbnail(s)...`);
  };

  // Count of photos that can still be retried
  const retryableFailedCount = Object.values(failedThumbnails).filter(
    (count) => count < MAX_THUMBNAIL_RETRIES
  ).length;

  // Count of photos that have permanently failed (max retries exceeded)
  const permanentlyFailedCount = Object.values(failedThumbnails).filter(
    (count) => count >= MAX_THUMBNAIL_RETRIES
  ).length;

  // Photos are already sorted by the backend, no need to sort client-side
  const sortedPhotos = photos;

  const shouldVirtualize = sortedPhotos.length > VIRTUALIZATION_THRESHOLD;

  // Pre-compute index lookup map to avoid O(n) indexOf calls in virtual rows
  const photoIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    sortedPhotos.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [sortedPhotos]);

  // Split photos into rows of VIRTUAL_GRID_COLUMNS for the virtualizer
  const photoRows = useMemo(() => {
    if (!shouldVirtualize) return [];
    const rows: Photo[][] = [];
    for (let i = 0; i < sortedPhotos.length; i += VIRTUAL_GRID_COLUMNS) {
      rows.push(sortedPhotos.slice(i, i + VIRTUAL_GRID_COLUMNS));
    }
    return rows;
  }, [sortedPhotos, shouldVirtualize]);

  // Scrollable container ref for the virtualizer
  const gridScrollContainerRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: photoRows.length,
    getScrollElement: () => gridScrollContainerRef.current,
    estimateSize: useCallback(() => VIRTUAL_ROW_HEIGHT, []),
    overscan: VIRTUAL_OVERSCAN,
  });

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<EmptyIllustrations.NoPhotos />}
        message="Your Photo Journey Begins Here"
        subMessage="Upload photos to capture your travel memories. You can link photos to locations, add them to albums, and create a visual story of your adventures."
      />
    );
  }

  return (
    <div data-testid="photo-gallery" className={selectionMode ? 'pb-36 md:pb-24' : ''}>
      <ConfirmDialogComponent />

      {/* View Controls */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-3 py-2 rounded-md transition-all duration-200 ${
                viewMode === "grid"
                  ? "bg-white dark:bg-gray-800 text-primary-600 dark:text-sky shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
              title="Grid view"
              aria-label="Grid view"
              {...{ 'aria-pressed': viewMode === "grid" }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 rounded-md transition-all duration-200 ${
                viewMode === "list"
                  ? "bg-white dark:bg-gray-800 text-primary-600 dark:text-sky shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
              title="List view"
              aria-label="List view"
              {...{ 'aria-pressed': viewMode === "list" }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>

          {/* Sort Dropdown */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [newSortBy, newSortOrder] = e.target.value.split("-");
              handleSortChange(newSortBy, newSortOrder);
            }}
            className="px-3 py-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-sky transition-all"
            aria-label="Sort photos"
          >
            <option value="date-desc">Latest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="name-asc">Caption A-Z</option>
            <option value="name-desc">Caption Z-A</option>
            <option value="location-asc">Location A-Z</option>
            <option value="location-desc">Location Z-A</option>
          </select>
        </div>

        {/* Photo Count and Failed Thumbnails Info */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {photos.length} photo{photos.length !== 1 ? "s" : ""}
          </span>

          {/* Failed Thumbnails Indicator */}
          {(retryableFailedCount > 0 || permanentlyFailedCount > 0) && (
            <div className="flex items-center gap-2">
              {retryableFailedCount > 0 && (
                <button
                  onClick={handleRetryFailedThumbnails}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-full hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                  title={`${retryableFailedCount} thumbnail(s) failed to load. Click to retry.`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry {retryableFailedCount}
                </button>
              )}
              {permanentlyFailedCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-full"
                  title={`${permanentlyFailedCount} thumbnail(s) failed after maximum retries`}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {permanentlyFailedCount} failed
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Selection Mode Toggle */}
      <div className="mb-4">
        {!selectionMode ? (
          <button
            type="button"
            onClick={() => setSelectionMode(true)}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Select Photos
          </button>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Selection hint */}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Click photos to select. Hold Shift for range selection.
            </span>
            {/* Quick select all if more photos available */}
            {totalPhotosInView > photos.length && onLoadAllPhotos && (
              <button
                type="button"
                onClick={selectAllPhotosInFolderWithEffect}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                Load all {totalPhotosInView} photos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid View */}
      {viewMode === "grid" && !shouldVirtualize && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
          {sortedPhotos.map((photo, index) => (
            <PhotoGridItem
              key={photo.id}
              photo={photo}
              index={index}
              thumbnailUrl={getThumbnailUrl(photo)}
              isSelected={selectedPhotoIds.has(photo.id)}
              selectionMode={selectionMode}
              coverPhotoId={coverPhotoId}
              onToggleSelection={togglePhotoSelection}
              onSelectPhoto={setSelectedPhoto}
            />
          ))}
        </div>
      )}

      {/* Virtualized Grid View (for large galleries) */}
      {viewMode === "grid" && shouldVirtualize && (
        <div
          ref={gridScrollContainerRef}
          className="overflow-auto"
          style={{ height: "calc(100vh - 280px)" }}
        >
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowPhotos = photoRows[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  className="absolute top-0 left-0 w-full grid grid-cols-4 gap-2 sm:gap-4"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {rowPhotos.map((photo) => {
                    const globalIndex = photoIndexMap.get(photo.id) ?? 0;
                    return (
                      <PhotoGridItem
                        key={photo.id}
                        photo={photo}
                        index={globalIndex}
                        thumbnailUrl={getThumbnailUrl(photo)}
                        isSelected={selectedPhotoIds.has(photo.id)}
                        selectionMode={selectionMode}
                        coverPhotoId={coverPhotoId}
                        onToggleSelection={togglePhotoSelection}
                        onSelectPhoto={setSelectedPhoto}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className="space-y-3">
          {sortedPhotos.map((photo, index) => {
            const thumbnailUrl = getThumbnailUrl(photo);
            const isSelected = selectedPhotoIds.has(photo.id);
            return (
              <div
                key={photo.id}
                role="button"
                tabIndex={0}
                aria-label={photo.caption || `Photo ${index + 1}`}
                {...(selectionMode && { 'aria-pressed': isSelected })}
                className="relative group cursor-pointer bg-white dark:bg-navy-800 rounded-xl p-4 shadow-md hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-primary-200 dark:hover:border-sky/30 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-sky focus:ring-offset-2"
                onClick={(e) =>
                  selectionMode
                    ? togglePhotoSelection(photo.id, e.shiftKey)
                    : setSelectedPhoto(photo)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (selectionMode) {
                      togglePhotoSelection(photo.id, e.shiftKey);
                    } else {
                      setSelectedPhoto(photo);
                    }
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <div className="flex-shrink-0">
                      <div
                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shadow-lg transition-all ${
                          isSelected
                            ? "bg-primary-600 dark:bg-accent-500 border-primary-600 dark:border-accent-500 scale-110"
                            : "bg-white/90 dark:bg-navy-800/90 border-primary-200 dark:border-navy-700 backdrop-blur-sm hover:border-primary-400 dark:hover:border-accent-400"
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className="w-5 h-5 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-24 h-24 overflow-hidden rounded-lg">
                    {thumbnailUrl ? (
                      <ProgressiveImage
                        src={thumbnailUrl}
                        alt={photo.caption || "Photo"}
                        aspectRatio="1/1"
                        imgClassName="transform group-hover:scale-110 transition-transform duration-500"
                        lazy={true}
                        rootMargin="400px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400">
                        <svg
                          className="w-10 h-10"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {photo.caption && (
                          <p className="font-medium text-gray-900 dark:text-white line-clamp-2 mb-1">
                            {photo.caption}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                          {photo.takenAt && (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              {new Date(photo.takenAt).toLocaleDateString()}
                            </span>
                          )}
                          {photo.location && (
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                />
                              </svg>
                              {photo.location.name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {photo.mediaType === 'video' && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded text-xs">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            Video
                            {photo.duration && (
                              <span className="font-mono">
                                ({formatDuration(photo.duration)})
                              </span>
                            )}
                          </span>
                        )}
                        {coverPhotoId === photo.id && (
                          <span className="bg-gradient-to-r from-accent-500 to-accent-600 text-white text-xs px-3 py-1.5 rounded-full font-semibold shadow-lg">
                            Cover
                          </span>
                        )}
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
                          {photo.source === "local" ? "Uploaded" : "Immich"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <PhotoLightbox
          photo={selectedPhoto}
          photos={photos}
          getPhotoUrl={getPhotoUrl}
          onClose={() => {
            setSelectedPhoto(null);
            setIsEditMode(false);
          }}
          onNavigate={(photo) => setSelectedPhoto(photo)}
          onEdit={() => {
            setEditCaption(selectedPhoto.caption || "");
            // Format takenAt for datetime-local input (YYYY-MM-DDTHH:mm)
            if (selectedPhoto.takenAt) {
              const date = new Date(selectedPhoto.takenAt);
              const formatted = date.toISOString().slice(0, 16);
              setEditTakenAt(formatted);
            } else {
              setEditTakenAt(null);
            }
            setIsEditMode(true);
          }}
          onDelete={() => handleDelete(selectedPhoto.id)}
          onSetCover={
            onSetCoverPhoto
              ? () => {
                  onSetCoverPhoto(selectedPhoto.id);
                  setSelectedPhoto(null);
                }
              : undefined
          }
          showCoverButton={
            !!onSetCoverPhoto && coverPhotoId !== selectedPhoto.id
          }
          editMode={isEditMode}
          editCaption={editCaption}
          onEditCaptionChange={setEditCaption}
          editTakenAt={editTakenAt}
          onEditTakenAtChange={setEditTakenAt}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={() => setIsEditMode(false)}
          tripId={tripId}
          onPhotoLinksUpdated={onPhotoUpdated}
        />
      )}

      {/* Album Selection Modal */}
      {showAlbumSelectModal && albums && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-[80] flex items-center justify-center p-4"
          onClick={() => {
            setShowAlbumSelectModal(false);
            setShowCreateAlbumForm(false);
            setNewAlbumName("");
            setNewAlbumDescription("");
          }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {showCreateAlbumForm ? "Create New Album" : "Select Album"}
              </h3>
              <button
                onClick={() => {
                  setShowAlbumSelectModal(false);
                  setShowCreateAlbumForm(false);
                  setNewAlbumName("");
                  setNewAlbumDescription("");
                }}
                type="button"
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {!showCreateAlbumForm ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Add {selectedPhotoIds.size} selected photo
                  {selectedPhotoIds.size !== 1 ? "s" : ""} to:
                </p>

                {/* Create New Album Button */}
                <button
                  type="button"
                  onClick={() => setShowCreateAlbumForm(true)}
                  className="w-full p-4 mb-4 rounded-lg border-2 border-dashed border-blue-500 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Create New Album
                </button>

                {/* Existing Albums List */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {albums.map((album) => (
                    <button
                      type="button"
                      key={album.id}
                      onClick={() => handleAddToAlbum(album.id)}
                      disabled={isAddingToAlbum}
                      className="w-full text-left p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-medium text-gray-900 dark:text-white">
                        {album.name}
                      </div>
                      {album.description && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                          {stripMarkdown(album.description)}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {album._count?.photoAssignments || 0} photos
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Create Album Form */}
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Create a new album with {selectedPhotoIds.size} selected
                  photo
                  {selectedPhotoIds.size !== 1 ? "s" : ""}
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Album Name *
                    </label>
                    <input
                      type="text"
                      value={newAlbumName}
                      onChange={(e) => setNewAlbumName(e.target.value)}
                      placeholder="Enter album name"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description (Optional)
                    </label>
                    <textarea
                      value={newAlbumDescription}
                      onChange={(e) => setNewAlbumDescription(e.target.value)}
                      placeholder="Enter album description"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateAlbumForm(false);
                      setNewAlbumName("");
                      setNewAlbumDescription("");
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateAlbum}
                    disabled={
                      !newAlbumName.trim() || isCreatingAlbum || isAddingToAlbum
                    }
                    className="flex-1 btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingAlbum ? "Creating..." : "Create Album"}
                  </button>
                </div>
              </>
            )}

            {!showCreateAlbumForm && (
              <button
                type="button"
                onClick={() => {
                  setShowAlbumSelectModal(false);
                  setShowCreateAlbumForm(false);
                  setNewAlbumName("");
                  setNewAlbumDescription("");
                }}
                className="mt-4 w-full btn btn-secondary"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Entity Picker Modal for Bulk Linking */}
      {showEntityPickerModal && photos.length > 0 && selectedPhotoIds.size > 0 && (
        <EntityPickerModal
          tripId={photos[0].tripId}
          photoIds={Array.from(selectedPhotoIds)}
          onClose={() => setShowEntityPickerModal(false)}
          onSuccess={() => {
            setSelectionMode(false);
            setSelectedPhotoIds(new Set());
          }}
        />
      )}

      {/* Floating Batch Operations Toolbar */}
      {selectionMode && (
        <BatchPhotoToolbar
          selectedCount={selectedPhotoIds.size}
          totalCount={photos.length}
          onSelectAll={selectAllLoadedPhotos}
          onDeselectAll={deselectAllPhotos}
          onExitSelectionMode={() => {
            setSelectionMode(false);
            setSelectedPhotoIds(new Set());
            setLastSelectedIndex(null);
          }}
          onAddToAlbum={() => setShowAlbumSelectModal(true)}
          onLinkToEntity={() => setShowEntityPickerModal(true)}
          onDelete={handleDeleteSelected}
          onRemoveFromAlbum={currentAlbumId ? handleRemoveFromAlbum : undefined}
          isDeleting={isDeletingPhotos}
          isInAlbum={!!currentAlbumId && currentAlbumId > 0}
          hasAlbums={!!albums && albums.length > 0}
        />
      )}
    </div>
  );
}
