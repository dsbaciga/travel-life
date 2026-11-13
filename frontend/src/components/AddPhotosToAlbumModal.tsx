import { useState, useEffect, useRef } from "react";
import type { Photo } from "../types/photo";
import photoService from "../services/photo.service";
import { getFullAssetUrl } from "../lib/config";
import { getAccessToken } from "../lib/axios";
import ProgressiveImage from "./ProgressiveImage";

interface AddPhotosToAlbumModalProps {
  tripId: number;
  albumId: number;
  albumName: string;
  existingPhotoIds: Set<number>;
  onClose: () => void;
  onPhotosAdded: () => void;
}

interface ThumbnailCache {
  [photoId: number]: string;
}

export default function AddPhotosToAlbumModal({
  tripId,
  albumId,
  albumName,
  existingPhotoIds,
  onClose,
  onPhotosAdded,
}: AddPhotosToAlbumModalProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(
    new Set()
  );
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null
  );
  const [isAdding, setIsAdding] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<ThumbnailCache>({});
  const fetchingPhotos = useRef<Set<number>>(new Set());
  const thumbnailCacheRef = useRef<ThumbnailCache>({});

  // Keep cache ref in sync with state
  useEffect(() => {
    thumbnailCacheRef.current = thumbnailCache;
  }, [thumbnailCache]);

  // Load all photos from the trip (excluding those already in the album)
  useEffect(() => {
    const loadPhotos = async () => {
      try {
        setLoading(true);
        // Load all photos at once for this modal
        const result = await photoService.getPhotosByTrip(tripId, {
          skip: 0,
          take: 1000, // Load up to 1000 photos
        });

        // Filter out photos already in the album
        const availablePhotos = result.photos.filter(
          (p) => !existingPhotoIds.has(p.id)
        );
        setPhotos(availablePhotos);
      } catch (error) {
        console.error("Failed to load photos:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPhotos();
  }, [tripId, existingPhotoIds]);

  // Load thumbnails for Immich photos
  useEffect(() => {
    const loadThumbnails = async () => {
      const token = getAccessToken();
      if (!token) return;

      for (const photo of photos) {
        if (
          thumbnailCache[photo.id] ||
          fetchingPhotos.current.has(photo.id) ||
          photo.source !== "immich" ||
          !photo.thumbnailPath
        ) {
          continue;
        }

        fetchingPhotos.current.add(photo.id);

        try {
          const fullUrl = getFullAssetUrl(photo.thumbnailPath);
          if (!fullUrl) continue;

          const response = await fetch(fullUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            fetchingPhotos.current.delete(photo.id);
            continue;
          }

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          setThumbnailCache((prev) => ({
            ...prev,
            [photo.id]: blobUrl,
          }));

          fetchingPhotos.current.delete(photo.id);
        } catch (error) {
          console.error(`Error loading thumbnail for photo ${photo.id}:`, error);
          fetchingPhotos.current.delete(photo.id);
        }
      }
    };

    if (photos.length > 0) {
      loadThumbnails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]); // thumbnailCache excluded to avoid infinite loop

  // Cleanup blob URLs on unmount
  useEffect(() => {
    const currentFetchingPhotos = fetchingPhotos.current;
    return () => {
      Object.values(thumbnailCacheRef.current).forEach((url) =>
        URL.revokeObjectURL(url)
      );
      currentFetchingPhotos.clear();
    };
  }, []);

  const getThumbnailUrl = (photo: Photo): string | null => {
    if (photo.source === "local" && photo.thumbnailPath) {
      return getFullAssetUrl(photo.thumbnailPath);
    }
    if (photo.source === "immich") {
      return thumbnailCache[photo.id] || null;
    }
    return null;
  };

  const togglePhotoSelection = (photoId: number, shiftKey: boolean = false) => {
    const photoIndex = photos.findIndex((p) => p.id === photoId);

    if (shiftKey && lastSelectedIndex !== null) {
      const newSelection = new Set(selectedPhotoIds);
      const start = Math.min(lastSelectedIndex, photoIndex);
      const end = Math.max(lastSelectedIndex, photoIndex);

      for (let i = start; i <= end; i++) {
        newSelection.add(photos[i].id);
      }

      setSelectedPhotoIds(newSelection);
      setLastSelectedIndex(photoIndex);
    } else {
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

  const selectAll = () => {
    setSelectedPhotoIds(new Set(photos.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedPhotoIds(new Set());
    setLastSelectedIndex(null);
  };

  const handleAddToAlbum = async () => {
    if (selectedPhotoIds.size === 0) return;

    try {
      setIsAdding(true);
      await photoService.addPhotosToAlbum(albumId, {
        photoIds: Array.from(selectedPhotoIds),
      });
      onPhotosAdded();
      onClose();
    } catch (error) {
      console.error("Failed to add photos to album:", error);
      alert("Failed to add photos to album");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-dusk-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dusk-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Add Photos to Album
            </h2>
            <p className="text-sm text-gray-600 dark:text-dusk-400 mt-1">
              Select photos to add to "{albumName}"
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-dusk-700 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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

        {/* Selection Toolbar */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dusk-700">
          {/* Selection Status Badge */}
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
            selectedPhotoIds.size > 0
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "bg-gray-100 dark:bg-dusk-700 text-gray-600 dark:text-dusk-400"
          }`}>
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {selectedPhotoIds.size} of {photos.length} selected
          </span>

          {/* Selection Controls */}
          <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-dusk-700 bg-white dark:bg-dusk-800 shadow-sm ml-auto">
            <button
              onClick={selectAll}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-dusk-300 hover:bg-gray-50 dark:hover:bg-dusk-700 rounded-l-lg transition-colors"
              title={`Select all ${photos.length} photos`}
            >
              All
            </button>
            {selectedPhotoIds.size > 0 && (
              <>
                <span className="w-px h-6 bg-gray-200 dark:bg-dusk-700"></span>
                <button
                  onClick={deselectAll}
                  className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-dusk-300 hover:bg-gray-50 dark:hover:bg-dusk-700 rounded-r-lg transition-colors"
                  title="Deselect all photos"
                >
                  None
                </button>
              </>
            )}
          </div>
        </div>

        {/* Photo Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-dusk-400">
              <svg
                className="w-16 h-16 mb-4"
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
              <p className="text-lg font-medium">No photos available</p>
              <p className="text-sm mt-1">
                All photos are already in this album
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {photos.map((photo) => {
                const thumbnailUrl = getThumbnailUrl(photo);
                const isSelected = selectedPhotoIds.has(photo.id);
                return (
                  <div
                    key={photo.id}
                    className={`relative aspect-square cursor-pointer rounded-lg overflow-hidden transition-all duration-200 ${
                      isSelected
                        ? "ring-4 ring-blue-500 dark:ring-blue-400 scale-95"
                        : "hover:ring-2 hover:ring-gray-300 dark:hover:ring-dusk-600"
                    }`}
                    onClick={(e) => togglePhotoSelection(photo.id, e.shiftKey)}
                  >
                    {thumbnailUrl ? (
                      <ProgressiveImage
                        src={thumbnailUrl}
                        alt={photo.caption || "Photo"}
                        aspectRatio="1/1"
                        lazy={true}
                        rootMargin="200px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-dusk-700 text-gray-400">
                        <svg
                          className="w-8 h-8"
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

                    {/* Selection checkbox */}
                    <div className="absolute top-2 left-2">
                      <div
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? "bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500"
                            : "bg-white/80 dark:bg-dusk-800/80 border-gray-300 dark:border-dusk-600 backdrop-blur-sm"
                        }`}
                      >
                        {isSelected && (
                          <svg
                            className="w-4 h-4 text-white"
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

                    {/* Photo info overlay on hover */}
                    {photo.caption && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 hover:opacity-100 transition-opacity">
                        <p className="text-white text-xs truncate">
                          {photo.caption}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-dusk-700 bg-gray-50 dark:bg-dusk-900/50">
          <p className="text-sm text-gray-600 dark:text-dusk-400">
            Tip: Hold Shift and click to select a range of photos
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleAddToAlbum}
              disabled={selectedPhotoIds.size === 0 || isAdding}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdding
                ? "Adding..."
                : `Add ${selectedPhotoIds.size} Photo${
                    selectedPhotoIds.size !== 1 ? "s" : ""
                  }`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
