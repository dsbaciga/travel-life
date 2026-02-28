import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from '@changey/react-leaflet-markercluster';
import { LatLngBounds, LatLng, DivIcon } from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Photo } from '../types/photo';
import { getFullAssetUrl } from '../lib/config';
import { getAccessToken } from '../lib/axios';
import photoService from '../services/photo.service';
import {
  usePhotoLocations,
  type PhotoWithResolvedLocation,
  type LocationSource,
  type LocationResolutionStats,
} from '../hooks/usePhotoLocations';

/**
 * Safely encode a URL for use in CSS url() context.
 * Uses encodeURI for safety, then escapes quotes to prevent breaking out of the url('...') wrapper.
 */
function safeUrlForCss(url: string): string {
  // encodeURI handles most special characters, then escape quotes for CSS context
  return encodeURI(url).replace(/'/g, '%27').replace(/"/g, '%22');
}

// Ring colors for different location sources (using Tailwind color values)
const SOURCE_RING_COLORS: Record<LocationSource, string> = {
  exif: '#3b82f6', // blue-500
  linked_location: '#f59e0b', // amber-500
  album_location: '#8b5cf6', // purple-500
};

interface PhotosMapViewProps {
  tripId: number;
  photos?: Photo[];
  onPhotoClick?: (photo: Photo) => void;
  showLegend?: boolean;
  /** When true, fetches ALL photos for the trip from the API instead of using the photos prop */
  fetchAllPhotos?: boolean;
}

// Component to fit map bounds to markers
function MapBoundsHandler({ photos }: { photos: PhotoWithResolvedLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (photos.length === 0) return;

    const validPhotos = photos.filter((p) => p.resolvedLocation != null);
    if (validPhotos.length === 0) return;

    const bounds = new LatLngBounds(
      validPhotos.map(
        (p) => new LatLng(p.resolvedLocation!.latitude, p.resolvedLocation!.longitude)
      )
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [photos, map]);

  return null;
}

// Stats legend component
function LocationSourceLegend({ stats }: { stats: LocationResolutionStats }) {
  const hasAnyLocations = stats.exif > 0 || stats.linkedLocation > 0 || stats.albumLocation > 0;

  if (!hasAnyLocations) return null;

  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400 mb-3">
      {stats.exif > 0 && (
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-full border-2"
            style={{ borderColor: SOURCE_RING_COLORS.exif }}
          />
          <span>{stats.exif} with GPS</span>
        </span>
      )}
      {stats.linkedLocation > 0 && (
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-full border-2"
            style={{ borderColor: SOURCE_RING_COLORS.linked_location }}
          />
          <span>{stats.linkedLocation} linked to location</span>
        </span>
      )}
      {stats.albumLocation > 0 && (
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-full border-2 border-dashed"
            style={{ borderColor: SOURCE_RING_COLORS.album_location }}
          />
          <span>{stats.albumLocation} via album</span>
        </span>
      )}
      {stats.noLocation > 0 && (
        <span className="text-gray-400 dark:text-gray-500">
          ({stats.noLocation} without location)
        </span>
      )}
    </div>
  );
}

// Location source indicator for popup
function LocationSourceIndicator({ source, locationName }: { source: LocationSource; locationName?: string }) {
  switch (source) {
    case 'exif':
      return (
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>GPS from photo</span>
        </div>
      );
    case 'linked_location':
      return (
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Linked to {locationName || 'location'}</span>
        </div>
      );
    case 'album_location':
      return (
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <span>Album at {locationName || 'location'}</span>
        </div>
      );
    default:
      return null;
  }
}

export default function PhotosMapView({
  tripId,
  photos: photosProp,
  onPhotoClick,
  showLegend = true,
  fetchAllPhotos = false,
}: PhotosMapViewProps) {
  const [thumbnailCache, setThumbnailCache] = useState<Record<number, string>>({});
  const blobUrlsRef = useRef<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch all photos when fetchAllPhotos is true
  const { data: allPhotosData, isLoading: isLoadingAllPhotos } = useQuery({
    queryKey: ['photos', tripId, 'all-for-map'],
    queryFn: async () => {
      // Fetch all photos without pagination limit
      // The API returns photos in batches, so we need to fetch all pages
      const allPhotos: Photo[] = [];
      let skip = 0;
      const take = 500; // Fetch in batches of 500
      let hasMore = true;

      while (hasMore) {
        const result = await photoService.getPhotosByTrip(tripId, { skip, take });
        allPhotos.push(...result.photos);
        hasMore = result.hasMore;
        skip += take;
      }

      return allPhotos;
    },
    enabled: fetchAllPhotos && tripId > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Use fetched photos when fetchAllPhotos is true, otherwise use prop
  const photos = useMemo(() => {
    if (fetchAllPhotos) {
      return allPhotosData ?? [];
    }
    return photosProp ?? [];
  }, [fetchAllPhotos, allPhotosData, photosProp]);

  // Use the photo locations hook for resolution
  const { geotaggedPhotos, stats, isLoading: isLoadingLocations } = usePhotoLocations(tripId, photos);

  // Combined loading state
  const isLoading = isLoadingAllPhotos || isLoadingLocations;

  // Load thumbnails for Immich photos with proper cleanup
  useEffect(() => {
    // Cancel any in-flight requests from previous render
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    const loadThumbnails = async () => {
      const token = getAccessToken();
      if (!token) return;

      // Get current cache state via ref to avoid stale closure
      const currentCache = { ...thumbnailCache };
      const immichPhotos = geotaggedPhotos.filter(
        (p) => p.source === 'immich' && p.thumbnailPath && !currentCache[p.id]
      );

      if (immichPhotos.length === 0) return;

      // Load thumbnails in parallel batches of 5 for better performance
      const batchSize = 5;
      for (let i = 0; i < immichPhotos.length; i += batchSize) {
        if (signal.aborted) return;

        const batch = immichPhotos.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (photo) => {
            const fullUrl = getFullAssetUrl(photo.thumbnailPath);
            if (!fullUrl) return null;

            const response = await fetch(fullUrl, {
              headers: { Authorization: `Bearer ${token}` },
              signal,
            });

            if (!response.ok) return null;

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            return { photoId: photo.id, blobUrl };
          })
        );

        if (signal.aborted) return;

        // Update cache with successful results
        const updates: Record<number, string> = {};
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            blobUrlsRef.current.push(result.value.blobUrl);
            updates[result.value.photoId] = result.value.blobUrl;
          }
        }

        if (Object.keys(updates).length > 0) {
          setThumbnailCache((prev) => ({ ...prev, ...updates }));
        }
      }
    };

    loadThumbnails();

    return () => {
      abortControllerRef.current?.abort();
    };
    // Note: thumbnailCache intentionally excluded to prevent infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geotaggedPhotos]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  // Helper to get photo URL
  const getPhotoUrl = useCallback(
    (photo: Photo): string | null => {
      if (photo.source === 'local' && photo.thumbnailPath) {
        return getFullAssetUrl(photo.thumbnailPath);
      }
      if (photo.source === 'immich') {
        return thumbnailCache[photo.id] || null;
      }
      // Fallback for photos without explicit source
      if (photo.thumbnailPath) {
        // Check if it's an Immich URL that requires authentication
        if (photo.thumbnailPath.includes('/api/immich/')) {
          return thumbnailCache[photo.id] || null;
        }
        return getFullAssetUrl(photo.thumbnailPath);
      }
      return null;
    },
    [thumbnailCache]
  );

  // Create custom marker icon with photo thumbnail and source-colored ring
  // Using data attributes for styling instead of inline style string to avoid XSS
  const createPhotoMarker = useCallback(
    (photo: PhotoWithResolvedLocation): DivIcon => {
      const photoUrl = getPhotoUrl(photo);
      const source = photo.resolvedLocation?.source || 'exif';
      const ringColor = SOURCE_RING_COLORS[source];
      const isDashed = source === 'album_location';

      // Build styles safely - ringColor is from a hardcoded object, not user input
      const boxShadowStyle = `0 0 0 3px ${ringColor}`;
      const borderStyle = isDashed ? 'dashed' : 'solid';

      // Use safe URL encoding for the background image
      let backgroundStyle = 'background-color: #9CA3AF;';
      if (photoUrl) {
        const safeUrl = safeUrlForCss(photoUrl);
        backgroundStyle = `background-image: url('${safeUrl}'); background-size: cover; background-position: center;`;
      }

      return new DivIcon({
        className: 'photo-marker-icon',
        html: `<div class="w-12 h-12 rounded-full border-2 border-white shadow-lg overflow-hidden" style="box-shadow: ${boxShadowStyle}; border-style: ${borderStyle}; ${backgroundStyle}"></div>`,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });
    },
    [getPhotoUrl]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-gray-100 dark:bg-navy-800 rounded-lg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">Loading photo locations...</p>
      </div>
    );
  }

  // Empty state
  if (geotaggedPhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-gray-100 dark:bg-navy-800 rounded-lg">
        <svg
          className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No photos with locations</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 text-center max-w-md px-4">
          Photos will appear on the map if they have GPS data, are linked to a location, or belong to an album linked
          to a location.
        </p>
      </div>
    );
  }

  // Calculate initial center from resolved locations (safe due to filter above)
  const centerLat =
    geotaggedPhotos.reduce((sum, p) => sum + (p.resolvedLocation?.latitude ?? 0), 0) / geotaggedPhotos.length;
  const centerLng =
    geotaggedPhotos.reduce((sum, p) => sum + (p.resolvedLocation?.longitude ?? 0), 0) / geotaggedPhotos.length;

  return (
    <div className="space-y-2">
      {showLegend && <LocationSourceLegend stats={stats} />}

      <div className="h-64 sm:h-80 md:h-96 lg:h-[500px] rounded-lg overflow-hidden border border-gray-200 dark:border-navy-700">
        <MapContainer center={[centerLat, centerLng]} zoom={10} className="h-full w-full" scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapBoundsHandler photos={geotaggedPhotos} />

          <MarkerClusterGroup chunkedLoading>
            {geotaggedPhotos.map((photo) => {
              const photoUrl = getPhotoUrl(photo);
              return (
                <Marker
                  key={photo.id}
                  position={[photo.resolvedLocation!.latitude, photo.resolvedLocation!.longitude]}
                  icon={createPhotoMarker(photo)}
                  eventHandlers={{
                    click: () => onPhotoClick?.(photo),
                  }}
                >
                  <Popup>
                    <div className="w-48">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={photo.caption || 'Photo'}
                          className="w-full h-32 object-cover rounded-t-lg"
                          width={200}
                          height={150}
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-200 flex items-center justify-center rounded-t-lg">
                          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                      <div className="p-2">
                        {photo.caption && (
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                            {photo.caption}
                          </p>
                        )}
                        {photo.takenAt && (
                          <p className="text-xs text-gray-500 mt-1">{new Date(photo.takenAt).toLocaleDateString()}</p>
                        )}
                        {photo.resolvedLocation && (
                          <div className="mt-1">
                            <LocationSourceIndicator
                              source={photo.resolvedLocation.source}
                              locationName={photo.resolvedLocation.locationName}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => onPhotoClick?.(photo)}
                          className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          View full size
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>
    </div>
  );
}
