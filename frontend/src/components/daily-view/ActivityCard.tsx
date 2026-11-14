import { useNavigate } from 'react-router';
import type { Activity } from '../../types/activity';
import type { Location } from '../../types/location';
import type { PhotoAlbum } from '../../types/photo';
import EmbeddedLocationCard from './EmbeddedLocationCard';
import EmbeddedAlbumCard from './EmbeddedAlbumCard';
import LinkedEntitiesDisplay from '../LinkedEntitiesDisplay';
import MarkdownRenderer from '../MarkdownRenderer';
import DirectionsButton from '../DirectionsButton';
import { placeFromActivity } from '../../lib/itineraryPlaces';
import type { MapsPlace } from '../../lib/mapsDeepLinks';
import { stripMarkdown } from '../../utils/stripMarkdown';
import {
  formatTime,
  formatDuration,
  formatCurrency,
  getTypeColors,
  getActivityIcon,
  getTimezoneAbbr,
} from './utils';

interface ActivityCardProps {
  activity: Activity;
  tripId: number;
  tripTimezone?: string;
  linkedLocations?: Location[];
  linkedAlbums?: PhotoAlbum[];
  /** Current date being displayed (for filtering linked journal entries) */
  currentDate?: Date;
  /** Previous stop of the day — pre-fills the Directions origin. */
  originPlace?: MapsPlace | null;
}

export default function ActivityCard({
  activity,
  tripId,
  tripTimezone,
  linkedLocations = [],
  linkedAlbums = [],
  currentDate,
  originPlace = null,
}: ActivityCardProps) {
  const navigate = useNavigate();
  const colors = getTypeColors('activity');

  // An activity is only navigable through the locations linked to it.
  const directionsDestination = placeFromActivity(activity, linkedLocations);

  const handleEdit = () => {
    navigate(`/trips/${tripId}?tab=activities&edit=${activity.id}`);
  };

  // Calculate duration
  let durationMinutes: number | null = null;
  if (activity.startTime && activity.endTime) {
    const start = new Date(activity.startTime);
    const end = new Date(activity.endTime);
    durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  }

  const timezone = activity.timezone || tripTimezone;

  return (
    <div
      className={`bg-white dark:bg-dusk-800 rounded-xl shadow-sm border ${colors.border} border-l-4 ${colors.accent} overflow-hidden hover:shadow-md transition-shadow`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div
              className={`w-12 h-12 rounded-xl ${colors.icon} flex items-center justify-center flex-shrink-0`}
            >
              <span className="text-2xl">{getActivityIcon(activity.category)}</span>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {activity.name}
              </h3>

              {activity.category && (
                <div className="text-sm text-gray-500 dark:text-dusk-400 mt-0.5">
                  {activity.category}
                </div>
              )}

              {/* Time info */}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-600 dark:text-dusk-400">
                {activity.allDay ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium">
                    All Day
                  </span>
                ) : activity.startTime ? (
                  <>
                    <span className="font-medium">
                      {formatTime(activity.startTime, timezone)}
                      {activity.endTime && ` - ${formatTime(activity.endTime, timezone)}`}
                    </span>
                    {timezone && (
                      <span className="text-gray-400 dark:text-dusk-400 text-xs">
                        {getTimezoneAbbr(timezone)}
                      </span>
                    )}
                  </>
                ) : null}

                {durationMinutes && durationMinutes > 0 && (
                  <>
                    <span className="text-gray-300 dark:text-dusk-600">·</span>
                    <span>{formatDuration(durationMinutes)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Cost and actions */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {activity.cost && activity.currency && (
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(activity.cost, activity.currency)}
              </div>
            )}

            <div className="flex items-center gap-1">
              {directionsDestination && (
                <DirectionsButton
                  destination={directionsDestination}
                  origin={originPlace}
                />
              )}
              <button
                type="button"
                onClick={handleEdit}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors"
                title="Edit activity"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        {activity.description && (
          <div className="mt-3 text-gray-700 dark:text-dusk-300">
            <MarkdownRenderer content={activity.description} compact />
          </div>
        )}

        {/* Booking info */}
        {activity.bookingReference && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-dusk-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-mono">{activity.bookingReference}</span>
          </div>
        )}

        {/* Notes */}
        {activity.notes && (
          <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-dusk-700/50 text-sm text-gray-600 dark:text-dusk-400">
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              <MarkdownRenderer content={activity.notes} compact />
            </div>
          </div>
        )}

        {/* Linked locations (from entity links) */}
        {linkedLocations.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider mb-2">
              Related Locations ({linkedLocations.length})
            </div>
            <div className="space-y-3">
              {linkedLocations.map((loc) => (
                <EmbeddedLocationCard
                  key={loc.id}
                  location={loc}
                  tripId={tripId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Linked albums */}
        {linkedAlbums.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider mb-2">
              Related Albums ({linkedAlbums.length})
            </div>
            <div className="space-y-3">
              {linkedAlbums.map((album) => (
                <EmbeddedAlbumCard
                  key={album.id}
                  album={album}
                  tripId={tripId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Other linked entities (photos, etc.) */}
        <LinkedEntitiesDisplay
          tripId={tripId}
          entityType="ACTIVITY"
          entityId={activity.id}
          excludeTypes={['LOCATION', 'PHOTO_ALBUM']}
          compact
          currentDate={currentDate}
          timezone={tripTimezone}
        />

        {/* Sub-activities */}
        {activity.children && activity.children.length > 0 && (
          <div className="mt-4 border-t border-gray-200 dark:border-dusk-700 pt-4">
            <div className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider mb-3">
              Sub-activities ({activity.children.length})
            </div>
            <div className="space-y-2">
              {activity.children.map((child) => (
                <div
                  key={child.id}
                  className="p-3 rounded-lg bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {child.name}
                    </span>
                    {child.startTime && (
                      <span className="text-sm text-gray-500 dark:text-dusk-400">
                        {formatTime(child.startTime, timezone)}
                      </span>
                    )}
                  </div>
                  {child.description && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-dusk-400">
                      {stripMarkdown(child.description)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
