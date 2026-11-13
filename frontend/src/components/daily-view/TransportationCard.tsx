import { useNavigate } from 'react-router';
import type { Transportation } from '../../types/transportation';
import type { Location } from '../../types/location';
import type { PhotoAlbum } from '../../types/photo';
import EmbeddedLocationCard from './EmbeddedLocationCard';
import EmbeddedAlbumCard from './EmbeddedAlbumCard';
import LinkedEntitiesDisplay from '../LinkedEntitiesDisplay';
import FlightStatusBadge from '../FlightStatusBadge';
import DirectionsButton from '../DirectionsButton';
import { placeFromTransportation } from '../../lib/itineraryPlaces';
import type { MapsPlace } from '../../lib/mapsDeepLinks';
import {
  formatTime,
  formatDuration,
  formatCurrency,
  getTypeColors,
  getTransportationIcon,
  getTimezoneAbbr,
} from './utils';

interface TransportationCardProps {
  transportation: Transportation;
  tripId: number;
  tripTimezone?: string;
  linkedLocations?: Location[];
  linkedAlbums?: PhotoAlbum[];
  /** Current date being displayed (for filtering linked journal entries) */
  currentDate?: Date;
  /** Previous stop of the day — pre-fills the Directions origin. */
  originPlace?: MapsPlace | null;
}

export default function TransportationCard({
  transportation,
  tripId,
  tripTimezone,
  linkedLocations = [],
  linkedAlbums = [],
  currentDate,
  originPlace = null,
}: TransportationCardProps) {
  const navigate = useNavigate();
  const colors = getTypeColors('transportation');

  // What you actually need on the ground is how to reach the departure point.
  const departurePlace = placeFromTransportation(transportation, 'from');

  const handleEdit = () => {
    navigate(`/trips/${tripId}?tab=transportation&edit=${transportation.id}`);
  };

  // Calculate duration
  let durationMinutes: number | null = transportation.durationMinutes || null;
  if (!durationMinutes && transportation.departureTime && transportation.arrivalTime) {
    const start = new Date(transportation.departureTime);
    const end = new Date(transportation.arrivalTime);
    durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  }

  const startTz = transportation.startTimezone || tripTimezone;
  const endTz = transportation.endTimezone || tripTimezone;

  // Get from/to display names
  const fromName =
    transportation.fromLocation?.name ||
    transportation.fromLocationName ||
    'Unknown';
  const toName =
    transportation.toLocation?.name ||
    transportation.toLocationName ||
    'Unknown';

  // Format type display
  const typeDisplay =
    transportation.type.charAt(0).toUpperCase() + transportation.type.slice(1);

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
              <span className="text-2xl">{getTransportationIcon(transportation.type)}</span>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {typeDisplay}
                {transportation.carrier && (
                  <span className="text-gray-500 dark:text-dusk-400 font-normal">
                    {' '}
                    · {transportation.carrier}
                  </span>
                )}
              </h3>

              {transportation.vehicleNumber && (
                <div className="text-sm text-gray-500 dark:text-dusk-400 mt-0.5 font-mono">
                  {transportation.vehicleNumber}
                </div>
              )}
            </div>
          </div>

          {/* Cost and actions */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {transportation.cost && transportation.currency && (
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(transportation.cost, transportation.currency)}
              </div>
            )}

            <div className="flex items-center gap-1">
              {departurePlace && (
                <DirectionsButton destination={departurePlace} origin={originPlace} />
              )}
              <button
                type="button"
                onClick={handleEdit}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors"
                title="Edit transportation"
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

        {/* Route display */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-stretch gap-3 sm:gap-4">
          {/* From */}
          <div className="flex-1">
            <div className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider mb-1">
              From
            </div>
            <div className="font-semibold text-gray-900 dark:text-white truncate">{fromName}</div>
            {transportation.departureTime && (
              <div className="mt-1 text-sm text-gray-600 dark:text-dusk-400">
                {formatTime(transportation.departureTime, startTz)}
                {startTz && (
                  <span className="text-gray-400 dark:text-dusk-400 text-xs ml-1">
                    {getTimezoneAbbr(startTz)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Arrow - horizontal on mobile, vertical on desktop */}
          <div className="flex items-center justify-center gap-2 sm:flex-col sm:gap-0 py-1 sm:py-0">
            <svg
              className="w-6 h-6 text-gray-400 dark:text-dusk-400 rotate-90 sm:rotate-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
            {durationMinutes && durationMinutes > 0 && (
              <span className="text-xs text-gray-400 dark:text-dusk-400 sm:mt-1">
                {formatDuration(durationMinutes)}
              </span>
            )}
          </div>

          {/* To */}
          <div className="flex-1 sm:text-right">
            <div className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider mb-1">
              To
            </div>
            <div className="font-semibold text-gray-900 dark:text-white truncate">{toName}</div>
            {transportation.arrivalTime && (
              <div className="mt-1 text-sm text-gray-600 dark:text-dusk-400">
                {formatTime(transportation.arrivalTime, endTz)}
                {endTz && (
                  <span className="text-gray-400 dark:text-dusk-400 text-xs ml-1">
                    {getTimezoneAbbr(endTz)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Distance badge */}
        {transportation.calculatedDistance && (
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-dusk-700 text-gray-600 dark:text-dusk-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              {transportation.calculatedDistance.toFixed(1)} km
            </span>
            {transportation.distanceSource && (
              <span className="text-xs text-gray-400 dark:text-dusk-400">
                ({transportation.distanceSource === 'route' ? 'road distance' : 'straight line'})
              </span>
            )}
          </div>
        )}

        {/* Confirmation number */}
        {transportation.confirmationNumber && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-dusk-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-mono">{transportation.confirmationNumber}</span>
          </div>
        )}

        {/* Flight tracking info */}
        {transportation.type === 'flight' && transportation.flightTracking && (
          <div className="mt-3">
            <FlightStatusBadge flightTracking={transportation.flightTracking} />
          </div>
        )}

        {/* Notes */}
        {transportation.notes && (
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
              <span>{transportation.notes}</span>
            </div>
          </div>
        )}

        {/* Embedded from/to locations */}
        {transportation.fromLocation && (
          <div className="mt-3">
            <EmbeddedLocationCard
              location={transportation.fromLocation}
              tripId={tripId}
              label="Departure Location"
            />
          </div>
        )}

        {transportation.toLocation && (
          <div className="mt-3">
            <EmbeddedLocationCard
              location={transportation.toLocation}
              tripId={tripId}
              label="Arrival Location"
            />
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
          entityType="TRANSPORTATION"
          entityId={transportation.id}
          excludeTypes={['LOCATION', 'PHOTO_ALBUM']}
          compact
          currentDate={currentDate}
          timezone={tripTimezone}
        />
      </div>
    </div>
  );
}
