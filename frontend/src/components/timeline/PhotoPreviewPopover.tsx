import { useState, useEffect, useRef } from 'react';
import entityLinkService from '../../services/entityLink.service';
import { getFullAssetUrl } from '../../lib/config';
import { getAccessToken } from '../../lib/axios';
import { useDropdownPosition } from '../../hooks/useDropdownPosition';
import type { EntityType } from '../../types/entityLink';
import type { PhotoSource } from '../../types/photo';

interface PhotoPreviewPopoverProps {
  tripId: number;
  entityType: EntityType;
  entityId: number;
  photoCount: number;
  children: React.ReactNode;
  onViewAll: () => void;
}

interface LinkedPhoto {
  id: number;
  thumbnailPath?: string;
  caption?: string;
  source?: PhotoSource;
}

export default function PhotoPreviewPopover({
  tripId,
  entityType,
  entityId,
  photoCount,
  children,
  onViewAll,
}: PhotoPreviewPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [photos, setPhotos] = useState<LinkedPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Record<number, string>>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const blobUrlsRef = useRef<string[]>([]);

  // Use dropdown position hook for optimal popover placement
  const { triggerRef, position } = useDropdownPosition<HTMLDivElement>({
    isOpen,
    dropdownHeight: 180, // Approximate height of popover
    dropdownWidth: 192, // w-48 = 192px
    viewportPadding: 16,
  });

  // Cleanup blob URLs on unmount
  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Fetch photos when popover opens
  useEffect(() => {
    if (isOpen && photos.length === 0 && !loading) {
      setLoading(true);
      entityLinkService
        .getPhotosForEntity(tripId, entityType, entityId)
        .then(async (data) => {
          // Map Photo objects to LinkedPhoto format
          const mappedPhotos = data.slice(0, 6).map((photo) => ({
            id: photo.id,
            thumbnailPath: photo.thumbnailPath || undefined,
            caption: photo.caption || undefined,
            source: photo.source || undefined,
          }));
          setPhotos(mappedPhotos);

          // Load thumbnails for Immich photos (require auth)
          const token = getAccessToken();
          if (token) {
            for (const photo of mappedPhotos.filter(
              (p) => p.source === 'immich' && p.thumbnailPath
            )) {
              try {
                const fullUrl = getFullAssetUrl(photo.thumbnailPath);
                if (!fullUrl) continue;

                const response = await fetch(fullUrl, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (response.ok) {
                  const blob = await response.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  blobUrlsRef.current.push(blobUrl);
                  setThumbnailCache((prev) => ({ ...prev, [photo.id]: blobUrl }));
                }
              } catch {
                // Skip failed thumbnails
              }
            }
          }
        })
        .catch((err) => {
          console.error('Failed to fetch linked photos:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, tripId, entityType, entityId, photos.length, loading]);

  // Helper to get the proper URL for a photo
  const getPhotoUrl = (photo: LinkedPhoto): string | null => {
    if (photo.source === 'local' && photo.thumbnailPath) {
      return getFullAssetUrl(photo.thumbnailPath);
    }
    if (photo.source === 'immich') {
      return thumbnailCache[photo.id] || null;
    }
    // Fallback for photos without source specified
    if (photo.thumbnailPath) {
      // Check if it's an Immich URL that requires authentication
      if (photo.thumbnailPath.includes('/api/immich/')) {
        return thumbnailCache[photo.id] || null;
      }
      return getFullAssetUrl(photo.thumbnailPath);
    }
    return null;
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 300); // 300ms delay before showing
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150); // Small delay before hiding
  };

  const handleClick = () => {
    onViewAll();
  };

  // Build position classes based on calculated position
  const verticalClass = position.openUpward ? 'bottom-full mb-2' : 'top-full mt-2';
  const arrowClass = position.openUpward
    ? 'absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-dusk-800 border-r border-b border-gray-200 dark:border-dusk-700 transform rotate-45'
    : 'absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-dusk-800 border-l border-t border-gray-200 dark:border-dusk-700 transform rotate-45';

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label={`View ${photoCount} photos`}
        className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-sky rounded"
      >
        {children}
      </div>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className={`absolute z-20 ${verticalClass} left-1/2 -translate-x-1/2 w-48 p-2 bg-white dark:bg-dusk-800 rounded-lg shadow-lg border border-gray-200 dark:border-dusk-700`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Arrow */}
          <div className={arrowClass} />

          {loading ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : photos.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-1">
                {photos.map((photo) => {
                  const photoUrl = getPhotoUrl(photo);
                  return (
                    <div
                      key={photo.id}
                      className="aspect-square rounded overflow-hidden bg-gray-100 dark:bg-dusk-700"
                    >
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={photo.caption || 'Photo'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            // Hide broken images
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
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
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {photoCount > 6 && (
                <button
                  type="button"
                  onClick={onViewAll}
                  className="mt-2 w-full text-xs text-center text-blue-600 dark:text-blue-400 hover:underline"
                >
                  +{photoCount - 6} more photos
                </button>
              )}
            </>
          ) : (
            <div className="text-center text-sm text-gray-500 dark:text-dusk-400 py-2">
              No photos available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
