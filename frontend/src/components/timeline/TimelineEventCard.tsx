import { useState, useEffect, useRef } from 'react';
import { useUnits } from '../../hooks/useUnits';
import { getTimelineItemIcon, EditIcon, DeleteIcon, LocationIcon, HashIcon, CheckCircleIcon, MoonIcon, BoltIcon, ChecklistIcon, PhotoIcon } from './icons';
import {
  formatTime,
  formatDuration,
  getTypeColor,
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
import RouteSegment from '../brand/RouteSegment';
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
  routeStop = 'future',
  routeSegment,
  originPlace = null,
  onEdit,
  onDelete,
  onLinkUpdate,
}: TimelineEventCardProps) {
  const { formatDistance } = useUnits();
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
      return <span className="text-gray-500 dark:text-dusk-400">All day</span>;
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
      return <span className="text-gray-500 dark:text-dusk-400">All day</span>;
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
      <span className="text-gray-400 dark:text-dusk-400 tabular-nums">
        {' '}· {parts.join(' · ')}
      </span>
    );
  };

  // Street address under the place name; only when it adds something
  const address: string | null =
    item.locationAddress && item.locationAddress !== item.location ? item.locationAddress : null;

  // Route-line marker: gold when it is the current or next stop, muted once
  // passed, otherwise the item type's colour.
  const markerClass =
    routeStop === 'next'
      ? 'bg-accent-500 dark:bg-gold text-white dark:text-dusk-900 ring-4 ring-accent-500/20 dark:ring-gold/20'
      : routeStop === 'past'
        ? 'bg-gray-300 dark:bg-dusk-600 text-white dark:text-dusk-300'
        : `${getTypeColor(item.type)} text-white`;
  const markerSize = isCompact ? 'w-8 h-8 sm:w-10 sm:h-10' : 'w-9 h-9 sm:w-11 sm:h-11';

  return (
    <div className="timeline-item relative flex gap-2 sm:gap-3" data-route-stop={routeStop}>
      {/* Route rail: this stop's marker and the leg down to the next one */}
      <div className={`relative flex-shrink-0 ${isCompact ? 'w-8 sm:w-10' : 'w-9 sm:w-11'}`}>
        {routeSegment && (
          <RouteSegment
            style={routeSegment}
            className={isCompact ? 'top-4 -bottom-4 sm:top-5 sm:-bottom-5' : 'top-[18px] -bottom-[18px] sm:top-[22px] sm:-bottom-[22px]'}
          />
        )}
        <div
          className={`relative ${markerSize} rounded-full ${markerClass} flex items-center justify-center z-10 ${
            connectionInfo ? 'outline outline-2 outline-offset-2 outline-green-400 dark:outline-green-500' : ''
          }`}
        >
          {getTimelineItemIcon(item, isCompact ? 'w-4 h-4' : 'w-5 h-5')}
        </div>
      </div>

      {/* Content: no card chrome, the route line carries the structure */}
      <div
        className={`group flex-1 min-w-0 rounded-lg ${isCompact ? 'p-2 mb-1' : 'p-2 sm:p-3 mb-2'} hover:bg-gray-50 dark:hover:bg-dusk-800/60 transition-colors relative ${
          routeStop === 'past' ? 'opacity-70' : ''
        }`}
      >
        {/* Quick action buttons - appear on hover */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity flex gap-1 print:hidden">
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
        <div className={`text-sm tabular-nums text-gray-500 dark:text-dusk-400 ${isCompact ? 'mb-1' : 'mb-2'} pr-16 [@media(hover:none)]:pr-24 [@media(hover:none)]:min-h-[36px]`}>
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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-2">
          <div className="min-w-0 sm:flex-1">
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
              <div className="place-name">{item.location}</div>
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
          manageable
          onLinksUpdate={onLinkUpdate}
          currentDate={item.dateTime}
          timezone={tripTimezone}
        />

        {/* Link + directions buttons */}
        <div className={`flex items-center gap-2 ${isCompact ? 'mt-1' : 'mt-2'}`}>
          <LinkButton
            tripId={tripId}
            entityType={entityType}
            entityId={actualEntityId}
            linkSummary={linkSummary}
            onUpdate={onLinkUpdate}
            size="sm"
            hideWhenLinked
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
                  <span className="text-xs tabular-nums text-gray-500 dark:text-dusk-400">
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
