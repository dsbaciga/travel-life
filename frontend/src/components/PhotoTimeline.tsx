import { useState, useEffect, useCallback, useRef } from 'react';
import type { Photo } from '../types/photo';
import type { PhotoDateGrouping } from '../services/photo.service';
import photoService from '../services/photo.service';
import { formatTime, getDayNumber } from './timeline/utils';
import { getFullAssetUrl } from '../lib/config';
import { useImmichThumbnailCache, isImmichPhoto } from '../hooks/useImmichThumbnail';
import PhotoLightbox from './PhotoLightbox';
import EmptyState, { EmptyIllustrations } from './EmptyState';
import toast from 'react-hot-toast';

interface PhotoTimelineProps {
  tripId: number;
  tripTimezone?: string;
  tripStartDate?: string;
}

interface DayGroupState {
  dateKey: string; // Formatted display date
  rawDate: string; // YYYY-MM-DD for API calls
  dayNumber: number | null;
  count: number;
  photos: Photo[] | null; // null = not loaded yet
  loading: boolean;
  error: boolean;
}

// Placeholder image for failed loads
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239CA3AF"%3E%3Cpath d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/%3E%3C/svg%3E';

// Maximum number of days to keep photos loaded (memory management)
const MAX_LOADED_DAYS = 10;

export default function PhotoTimeline({
  tripId,
  tripTimezone,
  tripStartDate,
}: PhotoTimelineProps) {
  const [dayGroups, setDayGroups] = useState<DayGroupState[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalWithDates, setTotalWithDates] = useState(0);
  const [totalWithoutDates, setTotalWithoutDates] = useState(0);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  // Thumbnail cache for Immich photos
  const { loadThumbnails, getThumbnailUrl } = useImmichThumbnailCache();

  // Track load order for memory management (LRU-style)
  const loadOrderRef = useRef<string[]>([]);

  // Track pending requests to prevent duplicates
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  // Format date for display using the trip's timezone
  const formatDateForDisplay = useCallback((dateStr: string): string => {
    // Parse the YYYY-MM-DD date and format it for display
    // Use noon UTC to avoid timezone edge cases when formatting
    const date = new Date(dateStr + 'T12:00:00Z');

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC', // Use UTC since we're working with date-only values
    };

    return date.toLocaleDateString('en-US', options);
  }, []);

  // Load date groupings (lightweight - just dates and counts)
  const loadDateGroupings = useCallback(async () => {
    setLoading(true);
    try {
      // Pass timezone to get correct date groupings
      const result = await photoService.getPhotoDateGroupings(tripId, tripTimezone);

      // Convert date groupings to day group state
      const groups: DayGroupState[] = result.groupings.map((g: PhotoDateGrouping) => ({
        dateKey: formatDateForDisplay(g.date),
        rawDate: g.date,
        dayNumber: getDayNumber(g.date, tripStartDate),
        count: g.count,
        photos: null, // Not loaded yet
        loading: false,
        error: false,
      }));

      setDayGroups(groups);
      setTotalWithDates(result.totalWithDates);
      setTotalWithoutDates(result.totalWithoutDates);

      // Reset state when trip changes
      setExpandedDays(new Set());
      loadOrderRef.current = [];
      pendingRequestsRef.current.clear();
      setFailedImages(new Set());
    } catch (error) {
      console.error('Error loading date groupings:', error);
      toast.error('Failed to load photo timeline');
    } finally {
      setLoading(false);
    }
  }, [tripId, tripTimezone, tripStartDate, formatDateForDisplay]);

  useEffect(() => {
    loadDateGroupings();
  }, [loadDateGroupings]);

  // Unload oldest days when we exceed the limit (memory management)
  const manageMemory = useCallback((newlyLoadedDate: string) => {
    // Add to load order
    loadOrderRef.current = loadOrderRef.current.filter(d => d !== newlyLoadedDate);
    loadOrderRef.current.push(newlyLoadedDate);

    // If we exceed the limit, unload the oldest days
    while (loadOrderRef.current.length > MAX_LOADED_DAYS) {
      const oldestDate = loadOrderRef.current.shift();
      if (oldestDate) {
        setDayGroups(prev => prev.map(g =>
          g.rawDate === oldestDate ? { ...g, photos: null } : g
        ));
      }
    }
  }, []);

  // Load photos for a specific day
  const loadPhotosForDay = useCallback(async (rawDate: string) => {
    // Check if already loading (prevent duplicate requests)
    if (pendingRequestsRef.current.has(rawDate)) {
      return;
    }

    // Mark as pending
    pendingRequestsRef.current.add(rawDate);

    // Mark as loading in state
    setDayGroups(prev => prev.map(g =>
      g.rawDate === rawDate ? { ...g, loading: true, error: false } : g
    ));

    try {
      // Pass timezone to get photos for the correct day
      const result = await photoService.getPhotosByDate(tripId, rawDate, tripTimezone);

      // Sort photos: no-time photos first, then by time
      // Use defensive checks to handle potential null/undefined takenAt
      const sortedPhotos = [...result.photos].sort((a, b) => {
        // Handle null/undefined takenAt defensively
        if (!a.takenAt && !b.takenAt) return 0;
        if (!a.takenAt) return -1;
        if (!b.takenAt) return 1;

        const aDate = new Date(a.takenAt);
        const bDate = new Date(b.takenAt);

        // Check for invalid dates
        if (isNaN(aDate.getTime()) && isNaN(bDate.getTime())) return 0;
        if (isNaN(aDate.getTime())) return -1;
        if (isNaN(bDate.getTime())) return 1;

        const aHasTime = aDate.getUTCHours() !== 0 || aDate.getUTCMinutes() !== 0;
        const bHasTime = bDate.getUTCHours() !== 0 || bDate.getUTCMinutes() !== 0;

        if (!aHasTime && bHasTime) return -1;
        if (aHasTime && !bHasTime) return 1;
        return aDate.getTime() - bDate.getTime();
      });

      // Update the day group with loaded photos
      setDayGroups(prev => prev.map(g =>
        g.rawDate === rawDate ? { ...g, photos: sortedPhotos, loading: false } : g
      ));

      // Load thumbnails for Immich photos
      const immichPhotos = sortedPhotos.filter(p => isImmichPhoto(p.thumbnailPath, p.source));
      if (immichPhotos.length > 0) {
        loadThumbnails(immichPhotos);
      }

      // Manage memory (unload old days if needed)
      manageMemory(rawDate);
    } catch (error) {
      console.error(`Error loading photos for ${rawDate}:`, error);
      setDayGroups(prev => prev.map(g =>
        g.rawDate === rawDate ? { ...g, loading: false, error: true } : g
      ));
      toast.error(`Failed to load photos for ${rawDate}`);
    } finally {
      // Remove from pending
      pendingRequestsRef.current.delete(rawDate);
    }
  }, [tripId, tripTimezone, manageMemory, loadThumbnails]);

  // Toggle day expansion - fixed to avoid stale closure issues
  const toggleDay = useCallback((rawDate: string) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rawDate)) {
        newSet.delete(rawDate);
      } else {
        newSet.add(rawDate);
      }
      return newSet;
    });
  }, []);

  // Effect to load photos when a day is expanded
  useEffect(() => {
    expandedDays.forEach(rawDate => {
      const group = dayGroups.find(g => g.rawDate === rawDate);
      if (group && group.photos === null && !group.loading && !group.error) {
        loadPhotosForDay(rawDate);
      }
    });
  }, [expandedDays, dayGroups, loadPhotosForDay]);

  // Expand all days
  const expandAllDays = useCallback(() => {
    const allDates = dayGroups.map(g => g.rawDate);
    setExpandedDays(new Set(allDates));
    // Photos will be loaded by the useEffect above
  }, [dayGroups]);

  // Collapse all days
  const collapseAllDays = useCallback(() => {
    setExpandedDays(new Set());
  }, []);

  // Get all loaded photos for lightbox navigation
  const getAllLoadedPhotos = useCallback((): Photo[] => {
    const allPhotos: Photo[] = [];
    dayGroups.forEach(group => {
      if (group.photos) {
        allPhotos.push(...group.photos);
      }
    });
    return allPhotos;
  }, [dayGroups]);

  // Get photo URL
  const getPhotoUrl = (photo: Photo, thumbnail = true): string => {
    if (photo.source === 'local') {
      const path = thumbnail && photo.thumbnailPath ? photo.thumbnailPath : photo.localPath;
      return getFullAssetUrl(path) || '';
    }
    // For Immich photos, use cached blob URL
    if (isImmichPhoto(photo.thumbnailPath, photo.source)) {
      return getThumbnailUrl(photo.id) || '';
    }
    return getFullAssetUrl(photo.thumbnailPath) || '';
  };

  // Handle photo click
  const handlePhotoClick = (photo: Photo) => {
    setSelectedPhoto(photo);
  };

  // Handle keyboard interaction
  const handlePhotoKeyDown = (event: React.KeyboardEvent, photo: Photo) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePhotoClick(photo);
    }
  };

  // Handle lightbox navigation
  const handleNavigate = (photo: Photo) => {
    setSelectedPhoto(photo);
  };

  // Get full photo URL for lightbox
  const getLightboxPhotoUrl = (photo: Photo): string | null => {
    if (photo.source === 'local') {
      return getFullAssetUrl(photo.localPath) || null;
    }
    // For Immich photos, use cached blob URL (thumbnail for now, could fetch original)
    if (isImmichPhoto(photo.thumbnailPath, photo.source)) {
      return getThumbnailUrl(photo.id) || null;
    }
    return getFullAssetUrl(photo.thumbnailPath) || null;
  };

  // Handle image error
  const handleImageError = (photoId: number) => {
    setFailedImages(prev => {
      const newSet = new Set(prev);
      // Limit failed images set size to prevent unbounded growth
      if (newSet.size > 500) {
        const arr = Array.from(newSet);
        arr.splice(0, 100); // Remove oldest 100 entries
        return new Set([...arr, photoId]);
      }
      return newSet.add(photoId);
    });
  };

  // Format time for display
  const getTimeDisplay = (photo: Photo): string | null => {
    if (!photo.takenAt) return null;
    const photoDate = new Date(photo.takenAt);
    if (isNaN(photoDate.getTime())) return null;
    if (photoDate.getUTCHours() === 0 && photoDate.getUTCMinutes() === 0) {
      return null;
    }
    return formatTime(photoDate, tripTimezone);
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-900 dark:text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading photo timeline...</p>
      </div>
    );
  }

  if (dayGroups.length === 0) {
    return (
      <EmptyState
        icon={<EmptyIllustrations.NoPhotos />}
        message="No dated photos"
        subMessage={`Photos need a "taken at" date to appear in the timeline. Upload photos with EXIF data or manually set the date.${totalWithoutDates > 0 ? ` (${totalWithoutDates} photos without dates are not shown)` : ''}`}
      />
    );
  }

  const allLoadedPhotos = getAllLoadedPhotos();

  return (
    <div className="photo-timeline">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {totalWithDates} {totalWithDates === 1 ? 'photo' : 'photos'} across{' '}
          {dayGroups.length} {dayGroups.length === 1 ? 'day' : 'days'}
          {totalWithoutDates > 0 && (
            <span className="ml-2 text-gray-400">
              ({totalWithoutDates} undated)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAllDays}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAllDays}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Day Groups */}
      <div className="space-y-6">
        {dayGroups.map((dayGroup) => {
          const isExpanded = expandedDays.has(dayGroup.rawDate);
          const dayContentId = `day-content-${dayGroup.rawDate}`;

          return (
            <div
              key={dayGroup.rawDate}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Day Header */}
              <button
                type="button"
                onClick={() => toggleDay(dayGroup.rawDate)}
                {...{ 'aria-expanded': isExpanded }}
                aria-controls={dayContentId}
                className="w-full bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-700 px-4 py-3 text-left hover:from-gray-100 hover:to-gray-150 dark:hover:from-gray-750 dark:hover:to-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {dayGroup.dayNumber && dayGroup.dayNumber > 0
                        ? `Day ${dayGroup.dayNumber} - `
                        : ''}
                      {dayGroup.dateKey}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {dayGroup.count} {dayGroup.count === 1 ? 'photo' : 'photos'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {dayGroup.loading && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    )}
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Photo Grid */}
              {isExpanded && (
                <div id={dayContentId} className="p-4">
                  {dayGroup.loading && !dayGroup.photos && (
                    <div className="text-center py-8 text-gray-500">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-sm">Loading photos...</p>
                    </div>
                  )}

                  {dayGroup.error && (
                    <div className="text-center py-8 text-red-500">
                      <p className="text-sm">Failed to load photos</p>
                      <button
                        type="button"
                        onClick={() => loadPhotosForDay(dayGroup.rawDate)}
                        className="mt-2 text-sm text-blue-600 hover:underline"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {dayGroup.photos && dayGroup.photos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {dayGroup.photos.map((photo) => {
                        const timeDisplay = getTimeDisplay(photo);
                        const hasFailed = failedImages.has(photo.id);

                        return (
                          <div
                            key={photo.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handlePhotoClick(photo)}
                            onKeyDown={(e) => handlePhotoKeyDown(e, photo)}
                            className="group relative aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-transform"
                            aria-label={photo.caption || `Photo from ${dayGroup.dateKey}${timeDisplay ? ` at ${timeDisplay}` : ''}`}
                          >
                            <img
                              src={hasFailed ? PLACEHOLDER_IMAGE : getPhotoUrl(photo, true)}
                              alt={photo.caption || 'Trip photo'}
                              className={`w-full h-full object-cover ${hasFailed ? 'p-4 bg-gray-200 dark:bg-gray-600' : ''}`}
                              width={300}
                              height={300}
                              loading="lazy"
                              onError={() => handleImageError(photo.id)}
                            />

                            {/* Time overlay */}
                            {timeDisplay && !hasFailed && (
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                                <span className="text-xs text-white font-medium">
                                  {timeDisplay}
                                </span>
                              </div>
                            )}

                            {/* Caption tooltip on hover */}
                            {photo.caption && !hasFailed && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                                <p className="text-white text-xs text-center line-clamp-3">
                                  {photo.caption}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {dayGroup.photos && dayGroup.photos.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No photos for this day</p>
                    </div>
                  )}

                  {/* Collapse button at bottom of day */}
                  {dayGroup.photos && dayGroup.photos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleDay(dayGroup.rawDate)}
                      className="w-full mt-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg
                        className="w-4 h-4 rotate-180"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                      Collapse day
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {selectedPhoto && (
        <PhotoLightbox
          photo={selectedPhoto}
          photos={allLoadedPhotos.length > 0 ? allLoadedPhotos : [selectedPhoto]}
          getPhotoUrl={getLightboxPhotoUrl}
          onClose={() => setSelectedPhoto(null)}
          onNavigate={handleNavigate}
          tripId={tripId}
        />
      )}
    </div>
  );
}
