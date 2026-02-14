import { useCallback, useEffect, useState, useId, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import type { AlbumWithPhotos, Photo } from "../types/photo";
import type { Trip } from "../types/trip";
import photoService from "../services/photo.service";
import tripService from "../services/trip.service";
import PhotoGallery from "../components/PhotoGallery";
import Breadcrumbs from "../components/Breadcrumbs";
import LinkButton from "../components/LinkButton";
import LinkedEntitiesDisplay from "../components/LinkedEntitiesDisplay";
import { usePagedPagination } from "../hooks/usePagedPagination";
import Pagination from "../components/Pagination";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTripLinkSummary } from "../hooks/useTripLinkSummary";
import { getFullAssetUrl } from "../lib/config";
import { getAccessToken } from "../lib/axios";
import MarkdownRenderer from "../components/MarkdownRenderer";
import toast from "react-hot-toast";

export default function AlbumDetailPage() {
  const { tripId, albumId } = useParams<{ tripId: string; albumId: string }>();
  const { ConfirmDialogComponent } = useConfirmDialog();
  const parsedTripId = tripId ? parseInt(tripId) : undefined;
  const { getLinkSummary, invalidate: invalidateLinkSummary } = useTripLinkSummary(parsedTripId);
  const [album, setAlbum] = useState<AlbumWithPhotos | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [albumDescription, setAlbumDescription] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [showPhotoSelector, setShowPhotoSelector] = useState(false);
  const [availablePhotos, setAvailablePhotos] = useState<Photo[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(new Set());
  const [isAddingPhotos, setIsAddingPhotos] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<{ [key: number]: string }>({});
  const blobUrlsRef = useRef<string[]>([]);
  const thumbnailCacheRef = useRef(thumbnailCache);
  thumbnailCacheRef.current = thumbnailCache;

  useEffect(() => {
    const loadThumbnails = async () => {
      const token = getAccessToken();
      if (!token) return;

      const currentCache = thumbnailCacheRef.current;
      const newUrls: { [key: number]: string } = {};
      const newBlobUrls: string[] = [];

      for (const photo of availablePhotos) {
        if (photo.source !== "immich" || !photo.thumbnailPath || currentCache[photo.id]) {
          continue;
        }

        try {
          const fullUrl = getFullAssetUrl(photo.thumbnailPath);
          if (!fullUrl) continue;

          const response = await fetch(fullUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            newUrls[photo.id] = blobUrl;
            newBlobUrls.push(blobUrl);
          }
        } catch (error) {
          console.error(`Failed to load selection thumbnail for photo ${photo.id}:`, error);
        }
      }

      if (Object.keys(newUrls).length > 0) {
        blobUrlsRef.current = [...blobUrlsRef.current, ...newBlobUrls];
        setThumbnailCache(prev => ({ ...prev, ...newUrls }));
      }
    };

    if (showPhotoSelector && availablePhotos.length > 0) {
      loadThumbnails();
    }
  }, [availablePhotos, showPhotoSelector]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);
  const albumNameId = useId();
  const albumDescriptionId = useId();

  // Photo sorting state
  const sortByRef = useRef<string>("date");
  const sortOrderRef = useRef<string>("desc");

  // Paged pagination hook for album photos - replaces items instead of accumulating
  const photosPagination = usePagedPagination<Photo>(
    async (skip, take) => {
      if (!albumId) return { items: [], total: 0, hasMore: false };

      const data = await photoService.getAlbumById(parseInt(albumId), {
        skip,
        take,
        sortBy: sortByRef.current,
        sortOrder: sortOrderRef.current,
      });

      return {
        items: data.photos.map(p => p.photo),
        total: data.total || 0,
        hasMore: data.hasMore || false,
      };
    },
    { pageSize: 40 }
  );

  const paginationRef = useRef(photosPagination);
  paginationRef.current = photosPagination;

  const loadTripData = useCallback(async () => {
    if (!tripId) return;
    try {
      const tripData = await tripService.getTripById(parseInt(tripId));
      setTrip(tripData);
    } catch (err) {
      console.error("Failed to load trip data:", err);
    }
  }, [tripId]);

  const loadAlbum = useCallback(async () => {
    if (!albumId) return;

    setIsLoading(true);

    try {
      const data = await photoService.getAlbumById(parseInt(albumId), {
        skip: 0,
        take: 40,
      });

      setAlbum(data);
      setAlbumName(data.name);
      setAlbumDescription(data.description || "");
    } catch (err) {
      console.error("Failed to load album:", err);
    } finally {
      setIsLoading(false);
      paginationRef.current.loadInitial();
    }
  }, [albumId]);

  useEffect(() => {
    paginationRef.current.clear();
    loadTripData();
    loadAlbum();
  }, [loadTripData, loadAlbum]);

  const handleUpdateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!albumId || !albumName.trim()) return;

    try {
      await photoService.updateAlbum(parseInt(albumId), {
        name: albumName,
        description: albumDescription || null,
      });

      setIsEditMode(false);
      loadAlbum();
      toast.success("Album updated");
    } catch {
      toast.error("Failed to update album");
    }
  };

  const loadAvailablePhotos = async () => {
    if (!tripId || !albumId) return;

    try {
      // Get all photos for the trip
      const result = await photoService.getPhotosByTrip(parseInt(tripId));

      // Get current album photo IDs
      const currentPhotoIds = new Set(
        photosPagination.items.map(p => p.id)
      );

      // Filter out photos already in the album
      const available = result.photos.filter(p => !currentPhotoIds.has(p.id));
      setAvailablePhotos(available);
    } catch (err) {
      console.error("Failed to load available photos:", err);
      toast.error("Failed to load photos");
    }
  };

  const handleOpenPhotoSelector = () => {
    setShowPhotoSelector(true);
    setSelectedPhotoIds(new Set());
    loadAvailablePhotos();
  };

  const togglePhotoSelection = (photoId: number) => {
    const newSelection = new Set(selectedPhotoIds);
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId);
    } else {
      newSelection.add(photoId);
    }
    setSelectedPhotoIds(newSelection);
  };

  const handleAddSelectedPhotos = async () => {
    if (!albumId || selectedPhotoIds.size === 0) return;

    try {
      setIsAddingPhotos(true);
      await photoService.addPhotosToAlbum(parseInt(albumId), {
        photoIds: Array.from(selectedPhotoIds),
      });

      toast.success(`Added ${selectedPhotoIds.size} photo(s) to album`);
      setShowPhotoSelector(false);
      setSelectedPhotoIds(new Set());

      // Reload album to show new photos
      photosPagination.clear();
      await loadAlbum();
    } catch (err) {
      console.error("Failed to add photos:", err);
      toast.error("Failed to add photos to album");
    } finally {
      setIsAddingPhotos(false);
    }
  };

  const handleSetCoverPhoto = async (photoId: number) => {
    if (!albumId) return;
    try {
      await photoService.updateAlbum(parseInt(albumId), {
        coverPhotoId: photoId,
      });
      toast.success("Cover photo updated");
      await loadAlbum();
    } catch (err) {
      console.error("Failed to set cover photo", err);
      toast.error("Failed to set cover photo");
    }
  };

  const handlePhotoSortChange = (sortBy: string, sortOrder: string) => {
    sortByRef.current = sortBy;
    sortOrderRef.current = sortOrder;

    // Reload photos with new sort
    photosPagination.clear();
    photosPagination.loadInitial();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-[1600px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
          Loading...
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-[1600px] mx-auto px-6 py-8 text-gray-900 dark:text-white">
          Album not found
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <Breadcrumbs
          items={[
            { label: 'Trips', href: '/trips' },
            { label: trip?.title || 'Trip', href: `/trips/${tripId}` },
            { label: album.name }
          ]}
        />

        {isEditMode ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Edit Album
            </h2>
            <form onSubmit={handleUpdateAlbum} className="space-y-4">
              <div>
                <label
                  htmlFor={albumNameId}
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Album Name *
                </label>
                <input
                  type="text"
                  id={albumNameId}
                  value={albumName}
                  onChange={(e) => setAlbumName(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor={albumDescriptionId}
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Description
                </label>
                <textarea
                  id={albumDescriptionId}
                  value={albumDescription}
                  onChange={(e) => setAlbumDescription(e.target.value)}
                  rows={3}
                  className="input"
                />
              </div>

              {/* Entity Linking Info */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  💡 Use the link button in the album header to connect this album to locations, activities, and other trip entities.
                </p>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditMode(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {album.name}
                </h1>
                {album.description && (
                  <div className="text-gray-600 dark:text-gray-400 mb-4">
                    <MarkdownRenderer content={album.description} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-gray-500 dark:text-gray-400">
                    {photosPagination.total} photo
                    {photosPagination.total !== 1 ? "s" : ""}
                  </p>
                  {tripId && albumId && (
                    <LinkButton
                      tripId={parseInt(tripId)}
                      entityType="PHOTO_ALBUM"
                      entityId={parseInt(albumId)}
                      linkSummary={getLinkSummary('PHOTO_ALBUM', parseInt(albumId))}
                      onUpdate={() => {
                        invalidateLinkSummary();
                        loadAlbum();
                      }}
                      size="sm"
                    />
                  )}
                </div>

                {/* Linked Entities */}
                {tripId && albumId && (
                  <LinkedEntitiesDisplay
                    tripId={parseInt(tripId)}
                    entityType="PHOTO_ALBUM"
                    entityId={parseInt(albumId)}
                    excludeTypes={['PHOTO']}
                    compact
                  />
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0 items-center">
                <button
                  onClick={handleOpenPhotoSelector}
                  className="btn btn-primary w-full sm:w-auto"
                >
                  + Add Photos
                </button>
                <LinkButton
                  tripId={parseInt(tripId!)}
                  entityType="PHOTO_ALBUM"
                  entityId={parseInt(albumId!)}
                  linkSummary={getLinkSummary('PHOTO_ALBUM', parseInt(albumId!))}
                  onUpdate={() => {
                    invalidateLinkSummary();
                    loadAlbum();
                  }}
                  size="md"
                />
                <button
                  onClick={() => setIsEditMode(true)}
                  className="btn btn-secondary w-full sm:w-auto"
                >
                  Edit Album
                </button>
              </div>
            </div>
          </div>
        )}

        {photosPagination.items.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No photos in this album yet.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleOpenPhotoSelector}
                className="btn btn-primary"
              >
                + Add Photos
              </button>
              <Link
                to={`/trips/${tripId}`}
                className="btn btn-secondary"
              >
                Go to Trip Gallery
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <PhotoGallery
              photos={photosPagination.items}
              onPhotoDeleted={() => loadAlbum()}
              onPhotoUpdated={() => loadAlbum()}
              coverPhotoId={album.coverPhotoId}
              onSetCoverPhoto={handleSetCoverPhoto}
              onSortChange={handlePhotoSortChange}
              initialSortBy={sortByRef.current}
              initialSortOrder={sortOrderRef.current}
              tripId={tripId ? parseInt(tripId) : undefined}
            />

            {/* Pagination controls */}
            <div className="mt-6">
              <Pagination
                currentPage={photosPagination.currentPage}
                totalPages={photosPagination.totalPages}
                pageNumbers={photosPagination.pageNumbers}
                onPageChange={photosPagination.goToPage}
                onPrevious={photosPagination.previousPage}
                onNext={photosPagination.nextPage}
                hasPreviousPage={photosPagination.hasPreviousPage}
                hasNextPage={photosPagination.hasNextPage}
                loading={photosPagination.loading}
                rangeStart={photosPagination.rangeStart}
                rangeEnd={photosPagination.rangeEnd}
                total={photosPagination.total}
              />
            </div>

            {/* Debug info */}
            <div className="mt-4 text-xs text-gray-400 text-center">
              Page {photosPagination.currentPage}/{photosPagination.totalPages} | Photos: {photosPagination.items.length}/{photosPagination.total}
            </div>
          </div>
        )}

        {/* Photo Selector Modal */}
        {showPhotoSelector && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Add Photos to Album
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {selectedPhotoIds.size} photo{selectedPhotoIds.size !== 1 ? 's' : ''} selected
                  </p>
                </div>
                <button
                  onClick={() => setShowPhotoSelector(false)}
                  type="button"
                  aria-label="Close"
                  className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Photo Grid */}
              <div className="flex-1 overflow-y-auto p-6">
                {availablePhotos.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">
                      No more photos available to add to this album.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                    {availablePhotos.map((photo) => {
                      const isSelected = selectedPhotoIds.has(photo.id);
                      let photoUrl: string | null = null;
                      
                      if (photo.source === "immich") {
                        photoUrl = thumbnailCache[photo.id] || null;
                      } else {
                        photoUrl = getFullAssetUrl(photo.thumbnailPath);
                      }

                      return (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => togglePhotoSelection(photo.id)}
                          className={`relative aspect-square rounded-lg overflow-hidden border-4 transition-all ${
                            isSelected
                              ? "border-blue-500 ring-2 ring-blue-500"
                              : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={photo.caption || "Photo"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 bg-blue-500 bg-opacity-30 flex items-center justify-center">
                              <svg
                                className="w-8 h-8 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPhotoIds.size === availablePhotos.length) {
                      setSelectedPhotoIds(new Set());
                    } else {
                      setSelectedPhotoIds(new Set(availablePhotos.map(p => p.id)));
                    }
                  }}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  {selectedPhotoIds.size === availablePhotos.length ? "Deselect All" : "Select All"}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPhotoSelector(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddSelectedPhotos}
                    disabled={selectedPhotoIds.size === 0 || isAddingPhotos}
                    className="btn btn-primary"
                  >
                    {isAddingPhotos
                      ? "Adding..."
                      : `Add ${selectedPhotoIds.size} Photo${selectedPhotoIds.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialogComponent />
      </div>
    </div>
  );
}
