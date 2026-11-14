import { useState, useEffect, useRef } from 'react';
import { getTimelineItemIcon, EditIcon, DeleteIcon, LocationIcon, HashIcon, CheckCircleIcon, MoonIcon, BoltIcon, ChecklistIcon, PhotoIcon } from './icons';
import {
  formatTime,
  formatDuration,
  formatDistance,
  getTypeColor,
  getTypeBorderColor,
  getTimezoneAbbr,
  mapTimelineTypeToEntityType,
  getTimelineItemPlace,
} from './utils';
import LinkedEntitiesDisplay from '../LinkedEntitiesDisplay';
import LinkButton from '../LinkButton';
import DirectionsButton from '../DirectionsButton';
import entityLinkService from '../../services/entityLink.service';
import { getFullAssetUrl } from '../../lib/config';
import { getAccessToken } from '../../lib/axios';
import type { TimelineEventCardProps, TimelineItem } from './types';
import type { Activity } from '../../types/activity';
import type { Photo } from '../../types/photo';

export default function TimelineEventCard({
  item,
  tripId,
  tripTimezone,
  userTimezone,
  showDualTime,
  mobileActiveTimezone = 'trip',
  linkSummary,
  viewMode,
  connectionInfo,
  showConnectionLine,
  originPlace = null,
  onEdit,
  onDelete,
  onLinkUpdate,
}: TimelineEventCardProps) {
  const isCompact = viewMode === 'compact';
  const entityType = mapTimelineTypeToEntityType(item.type);

  // Where this item is, for the Directions deep link. Null for items that are
  // not places (a journal entry, an activity with no address).
  const directionsDestination = getTimelineItemPlace(item);

  // Get the actual entity ID from the data object
  const actualEntityId = item.data.id;

  // Inline photos state
  const [inlinePhotos, setInlinePhotos] = useState<Photo[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Record<number, string>>({});
  const blobUrlsRef = useRef<string[]>([]);
  const photoCount = linkSummary?.linkCounts?.PHOTO || 0;

  // Load inline photos when card is rendered and photos are linked
  useEffect(() => {
    if (photoCount > 0 && !photosLoaded) {
      entityLinkService
        .getPhotosForEntity(tripId, entityType, actualEntityId)
        .then(async (photos) => {
          setInlinePhotos(photos.slice(0, 3));
          setPhotosLoaded(true);

          // Load thumbnails for Immich photos
          const token = getAccessToken();
          if (token) {
            for (const photo of photos.slice(0, 3).filter(p => p.source === 'immich' && p.thumbnailPath)) {
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
                  setThumbnailCache(prev => ({ ...prev, [photo.id]: blobUrl }));
                }
              } catch {
                // Skip failed thumbnails
              }
            }
          }
        })
        .catch(() => {
          setPhotosLoaded(true);
        });
    }
  }, [photoCount, photosLoaded, tripId, entityType, actualEntityId]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      blobUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Helper to get photo URL
  const getPhotoUrl = (photo: Photo): string | null => {
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
  };

  // Determine timezone to use for display
  const displayTimezone =
    item.type === 'transportation' && item.startTimezone
      ? item.startTimezone
      : tripTimezone;

  // Format trip time display
  const renderTripTime = () => {
    if (item.isAllDay) {
      return <span className="text-gray-500 dark:text-dusk-400">All Day</span>;
    }
    if (item.showCheckInTime) {
      return (
        <>
          <span className="font-medium text-gray-700 dark:text-dusk-300">
            Check-in: {formatTime(item.dateTime, displayTimezone)}
          </span>
          {displayTimezone && (
            <span className="text-gray-400 dark:text-dusk-400 ml-1">
              {getTimezoneAbbr(displayTimezone)}
            </span>
          )}
        </>
      );
    }
    if (item.showCheckOutTime && item.endDateTime) {
      return (
        <>
          <span className="font-medium text-gray-700 dark:text-dusk-300">
            Check-out: {formatTime(item.endDateTime, displayTimezone)}
          </span>
          {displayTimezone && (
            <span className="text-gray-400 dark:text-dusk-400 ml-1">
              {getTimezoneAbbr(displayTimezone)}
            </span>
          )}
        </>
      );
    }

    // Regular time display
    const primaryTime = formatTime(item.dateTime, displayTimezone);
    const endTime = item.endDateTime ? formatTime(item.endDateTime, displayTimezone) : null;

    return (
      <>
        <span className="font-medium text-gray-700 dark:text-dusk-300">
          {primaryTime}
          {endTime && ` - ${endTime}`}
        </span>
        {displayTimezone && (
          <span className="text-gray-400 dark:text-dusk-400 ml-1">
            {getTimezoneAbbr(displayTimezone)}
          </span>
        )}
      </>
    );
  };

  // Format home/user time display
  const renderHomeTime = () => {
    if (!userTimezone || displayTimezone === userTimezone) {
      return null;
    }
    if (item.isAllDay) {
      return <span className="text-gray-500 dark:text-dusk-400">All Day</span>;
    }
    if (item.showCheckInTime) {
      return (
        <>
          <span className="text-gray-500 dark:text-dusk-400">
            Check-in: {formatTime(item.dateTime, userTimezone)}
          </span>
          <span className="text-gray-400 dark:text-dusk-400 ml-1">
            {getTimezoneAbbr(userTimezone)}
          </span>
        </>
      );
    }
    if (item.showCheckOutTime && item.endDateTime) {
      return (
        <>
          <span className="text-gray-500 dark:text-dusk-400">
            Check-out: {formatTime(item.endDateTime, userTimezone)}
          </span>
          <span className="text-gray-400 dark:text-dusk-400 ml-1">
            {getTimezoneAbbr(userTimezone)}
          </span>
        </>
      );
    }

    // Regular time display with start and end times
    const primaryTime = formatTime(item.dateTime, userTimezone);
    const endTime = item.endDateTime ? formatTime(item.endDateTime, userTimezone) : null;

    return (
      <>
        <span className="text-gray-500 dark:text-dusk-400">
          {primaryTime}
          {endTime && ` - ${endTime}`}
        </span>
        <span className="text-gray-400 dark:text-dusk-400 ml-1">
          {getTimezoneAbbr(userTimezone)}
        </span>
      </>
    );
  };

  // Mobile time display - shows only the timezone selected by the toggle
  const renderMobileTime = () => {
    if (mobileActiveTimezone === 'user' && userTimezone && displayTimezone !== userTimezone) {
      // Show home/user timezone
      return renderHomeTime();
    }
    // Default to trip timezone
    return renderTripTime();
  };

  // Legacy inline time display (used for non-dual-time modes and desktop)
  const renderTimeDisplay = () => {
    return (
      <>
        {renderTripTime()}
      </>
    );
  };

  // Render duration/distance info
  const renderDurationDistance = () => {
    const parts: string[] = [];
    if (item.durationMinutes && item.durationMinutes > 0) {
      parts.push(formatDuration(item.durationMinutes));
    }
    if (item.distanceKm) {
      parts.push(formatDistance(item.distanceKm));
    }
    if (parts.length === 0) return null;
    return (
      <span className="text-gray-400 dark:text-dusk-400">
        {' '}· {parts.join(' · ')}
      </span>
    );
  };

  // Get address from data object (now via TimelineItem.location from linked entities)
  const address: string | null = item.location || null;

  return (
    <div className="timeline-item relative flex gap-3">
      {/* Connection line to next item */}
      {showConnectionLine && (
        <div className="absolute left-5 top-10 h-full w-0.5 border-l-2 border-dashed border-green-400 dark:border-green-500 z-0" />
      )}

      {/* Icon dot */}
      <div
        className={`flex-shrink-0 ${isCompact ? 'w-10 h-10' : 'w-11 h-11'} rounded-full ${getTypeColor(
          item.type
        )} text-white flex items-center justify-center z-10 shadow-md ${
          connectionInfo ? 'ring-2 ring-green-400 dark:ring-green-500' : ''
        }`}
      >
        {getTimelineItemIcon(item, isCompact ? 'w-4 h-4' : 'w-5 h-5')}
      </div>

      {/* Content card */}
      <div
        className={`group flex-1 bg-white dark:bg-dusk-800 border-l-4 ${getTypeBorderColor(
          item.type
        )} rounded-lg ${isCompact ? 'p-2.5' : 'p-4'} shadow-sm hover:shadow-md transition-shadow relative border border-gray-200 dark:border-dusk-700 border-l-4 ${
          connectionInfo ? 'ring-1 ring-green-200 dark:ring-green-800' : ''
        }`}
      >
        {/* Quick action buttons - appear on hover */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 print:hidden">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dusk-700 text-gray-500 hover:text-blue-600 dark:text-dusk-400 dark:hover:text-blue-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Edit"
          >
            <EditIcon />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:text-dusk-400 dark:hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Delete"
          >
            <DeleteIcon />
          </button>
        </div>

        {/* Time row */}
        <div className={`text-sm text-gray-500 dark:text-dusk-400 ${isCompact ? 'mb-1' : 'mb-2'} pr-16`}>
          {/* Desktop: columnar layout for dual timezone */}
          {showDualTime && userTimezone && displayTimezone !== userTimezone ? (
            <>
              {/* Mobile: show only the selected timezone */}
              <div className="lg:hidden">
                {renderMobileTime()}
                {renderDurationDistance()}
              </div>
              {/* Desktop: trip time LEFT, home time RIGHT */}
              <div className="hidden lg:flex items-baseline justify-between">
                <div className="flex items-baseline gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    {renderTripTime()}
                  </div>
                  <div className="text-gray-400 dark:text-dusk-400">{renderDurationDistance()}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {renderHomeTime()}
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-dusk-500 shrink-0" />
                </div>
              </div>
            </>
          ) : (
            <>
              {renderTimeDisplay()}
              {renderDurationDistance()}
            </>
          )}
        </div>

        {/* Title and subtitle */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className={`font-semibold text-gray-900 dark:text-white break-words ${isCompact ? 'text-sm' : ''}`}>
              {item.title}
            </h4>
            {item.subtitle && (
              <p className={`text-gray-600 dark:text-dusk-400 break-words ${isCompact ? 'text-xs' : 'text-sm'}`}>
                {item.subtitle}
              </p>
            )}
          </div>
          {/* Cost */}
          {item.cost !== undefined && item.cost > 0 && item.currency && (
            <div className={`font-medium text-gray-700 dark:text-dusk-300 shrink-0 whitespace-nowrap ${isCompact ? 'text-xs' : 'text-sm'}`}>
              {item.currency} {item.cost.toFixed(2)}
            </div>
          )}
        </div>

        {/* Booking info */}
        {(item.vehicleNumber || item.confirmationNumber) && (
          <div className={`flex items-center gap-3 text-gray-500 dark:text-dusk-400 font-mono ${isCompact ? 'mt-1 text-xs' : 'mt-2 text-xs'}`}>
            {item.vehicleNumber && (
              <span className="inline-flex items-center gap-1">
                <HashIcon />
                {item.vehicleNumber}
              </span>
            )}
            {item.confirmationNumber && (
              <span className="inline-flex items-center gap-1">
                <CheckCircleIcon />
                {item.confirmationNumber}
              </span>
            )}
          </div>
        )}

        {/* Location */}
        {item.location && (
          <div className={`flex items-start gap-1.5 text-gray-600 dark:text-dusk-400 ${isCompact ? 'mt-1.5 text-xs' : 'mt-2 text-sm'}`}>
            <LocationIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div>{item.location}</div>
              {address && (
                <div className="text-xs text-gray-500 dark:text-dusk-400 mt-0.5">
                  {address}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Description (for transportation shows route, for others shows description) */}
        {item.description && !isCompact && (
          <p className="text-sm text-gray-700 dark:text-dusk-300 mt-2 line-clamp-2">
            {item.description}
          </p>
        )}

        {/* Inline photo thumbnails */}
        {inlinePhotos.length > 0 && !isCompact && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {inlinePhotos.map((photo) => {
                const photoUrl = getPhotoUrl(photo);
                return (
                  <div
                    key={photo.id}
                    className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 dark:bg-dusk-700 flex-shrink-0"
                  >
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={photo.caption || 'Photo'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <PhotoIcon className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {photoCount > 3 && (
              <span className="text-xs text-gray-500 dark:text-dusk-400">
                +{photoCount - 3} more
              </span>
            )}
          </div>
        )}

        {/* Badges row */}
        <div className={`flex flex-wrap items-center gap-1.5 ${isCompact ? 'mt-2' : 'mt-3'}`}>
          {/* Connection badge */}
          {connectionInfo && (
            <span className="inline-flex items-center justify-center gap-1 h-6 px-2 rounded-md bg-green-100 dark:bg-green-900/30 text-xs font-medium leading-none text-green-700 dark:text-green-300">
              <BoltIcon />
              Leg {connectionInfo.legNumber}/{connectionInfo.totalLegs}
            </span>
          )}

          {/* Multi-day stay badge */}
          {item.multiDayInfo && (
            <span className="inline-flex items-center justify-center gap-1 h-6 px-2 rounded-md bg-purple-100 dark:bg-purple-900/30 text-xs font-medium leading-none text-purple-700 dark:text-purple-300">
              <MoonIcon />
              Night {item.multiDayInfo.nightNumber}/{item.multiDayInfo.totalNights}
            </span>
          )}
        </div>

        {/* Child activities (for parent activities) */}
        {item.type === 'activity' && renderChildActivities(item, isCompact, tripTimezone)}

        {/* Linked Entities */}
        <LinkedEntitiesDisplay
          tripId={tripId}
          entityType={entityType}
          entityId={actualEntityId}
          compact
          currentDate={item.dateTime}
          timezone={tripTimezone}
        />

        {/* Link + directions buttons */}
        <div className={`flex items-center gap-2 border-t border-gray-100 dark:border-dusk-700 ${isCompact ? 'mt-2 pt-2' : 'mt-3 pt-3'}`}>
          <LinkButton
            tripId={tripId}
            entityType={entityType}
            entityId={actualEntityId}
            linkSummary={linkSummary}
            onUpdate={onLinkUpdate}
            size="sm"
          />
          {directionsDestination && (
            <DirectionsButton
              destination={directionsDestination}
              origin={originPlace}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Render child activities for parent activity items
function renderChildActivities(
  item: TimelineItem,
  isCompact: boolean,
  timezone?: string
): React.ReactNode {
  if (item.type !== 'activity') return null;
  const activity = item.data as Activity;
  if (!activity.children || activity.children.length === 0) return null;

  return (
    <div className={`border-t border-gray-200 dark:border-dusk-700 ${isCompact ? 'mt-2 pt-2' : 'mt-3 pt-3'}`}>
      <div className="flex items-center gap-2 mb-2">
        <ChecklistIcon className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-medium text-gray-600 dark:text-dusk-400">
          Sub-activities ({activity.children.length})
        </span>
      </div>
      <div className="space-y-2">
        {activity.children.slice(0, 3).map((child) => {
          let childDuration: string | null = null;
          if (child.startTime && child.endTime) {
            const start = new Date(child.startTime);
            const end = new Date(child.endTime);
            const minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
            childDuration = formatDuration(minutes);
          }

          return (
            <div
              key={child.id}
              className="text-sm bg-blue-50 dark:bg-blue-900/20 rounded p-2 border-l-2 border-blue-400 dark:border-blue-500"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-800 dark:text-dusk-200">
                  {child.name}
                </span>
                {child.startTime && (
                  <span className="text-xs text-gray-500 dark:text-dusk-400">
                    {formatTime(new Date(child.startTime), timezone)}
                    {childDuration && ` · ${childDuration}`}
                  </span>
                )}
              </div>
              {child.category && (
                <span className="text-xs text-gray-500 dark:text-dusk-400">
                  {child.category}
                </span>
              )}
            </div>
          );
        })}
        {activity.children.length > 3 && (
          <div className="text-xs text-gray-500 dark:text-dusk-400 pl-2">
            +{activity.children.length - 3} more sub-activities
          </div>
        )}
      </div>
    </div>
  );
}
