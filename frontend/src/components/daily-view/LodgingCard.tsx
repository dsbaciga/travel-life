import { useNavigate } from 'react-router';
import type { Lodging } from '../../types/lodging';
import type { Location } from '../../types/location';
import type { PhotoAlbum } from '../../types/photo';
import EmbeddedLocationCard from './EmbeddedLocationCard';
import EmbeddedAlbumCard from './EmbeddedAlbumCard';
import LinkedEntitiesDisplay from '../LinkedEntitiesDisplay';
import DirectionsButton from '../DirectionsButton';
import { placeFromLodging } from '../../lib/itineraryPlaces';
import type { MapsPlace } from '../../lib/mapsDeepLinks';
import {
  formatTime,
  formatCurrency,
  getTypeColors,
  getLodgingIcon,
  getTimezoneAbbr,
} from './utils';

interface LodgingCardProps {
  lodging: Lodging;
  tripId: number;
  tripTimezone?: string;
  dayContext?: {
    isCheckInDay: boolean;
    isCheckOutDay: boolean;
    nightNumber?: number;
    totalNights?: number;
  };
  linkedLocations?: Location[];
  linkedAlbums?: PhotoAlbum[];
  /** Current date being displayed (for filtering linked journal entries) */
  currentDate?: Date;
  /** Previous stop of the day — pre-fills the Directions origin. */
  originPlace?: MapsPlace | null;
}

export default function LodgingCard({
  lodging,
  tripId,
  tripTimezone,
  dayContext,
  linkedLocations = [],
  linkedAlbums = [],
  currentDate,
  originPlace = null,
}: LodgingCardProps) {
  const navigate = useNavigate();
  const colors = getTypeColors('lodging');

  // Address is usually present; a linked location contributes coordinates.
  const directionsDestination = placeFromLodging(lodging, linkedLocations);

  const handleEdit = () => {
    navigate(`/trips/${tripId}?tab=lodging&edit=${lodging.id}`);
  };

  const timezone = lodging.timezone || tripTimezone;

  // Format type display
  const typeDisplay =
    lodging.type.charAt(0).toUpperCase() +
    lodging.type.slice(1).replace(/_/g, ' ');

  // Calculate total nights
  let totalNights: number | null = null;
  if (lodging.checkInDate && lodging.checkOutDate) {
    const checkIn = new Date(lodging.checkInDate);
    const checkOut = new Date(lodging.checkOutDate);
    totalNights = Math.round(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Determine what to show based on day context
  const showCheckIn = dayContext?.isCheckInDay ?? true;
  const showCheckOut = dayContext?.isCheckOutDay ?? false;
  const showCost = dayContext?.isCheckInDay ?? true; // Only show cost on check-in day
  const showConfirmation = dayContext?.isCheckInDay ?? true;

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border ${colors.border} border-l-4 ${colors.accent} overflow-hidden hover:shadow-md transition-shadow`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div
              className={`w-12 h-12 rounded-xl ${colors.icon} flex items-center justify-center flex-shrink-0`}
            >
              <span className="text-2xl">{getLodgingIcon(lodging.type)}</span>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {lodging.name}
              </h3>

              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {typeDisplay}
              </div>

              {/* Night indicator for multi-day stays */}
              {dayContext?.nightNumber && dayContext?.totalNights && (
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                      />
                    </svg>
                    Night {dayContext.nightNumber} of {dayContext.totalNights}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Cost and actions */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {showCost && lodging.cost && lodging.currency && (
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(lodging.cost, lodging.currency)}
                {totalNights && totalNights > 1 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-normal">
                    {' '}
                    / {totalNights} nights
                  </span>
                )}
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
                title="Edit lodging"
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

        {/* Check-in / Check-out times */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-4">
          {/* Check-in */}
          <div className={showCheckIn ? '' : 'opacity-50'}>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Check-in
            </div>
            {lodging.checkInDate ? (
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  {new Date(lodging.checkInDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: timezone,
                  })}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {formatTime(lodging.checkInDate, timezone)}
                  {timezone && (
                    <span className="text-gray-400 dark:text-gray-400 text-xs ml-1">
                      {getTimezoneAbbr(timezone)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-gray-400 dark:text-gray-400">Not set</div>
            )}
          </div>

          {/* Check-out */}
          <div className={showCheckOut ? '' : 'opacity-50'}>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Check-out
            </div>
            {lodging.checkOutDate ? (
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">
                  {new Date(lodging.checkOutDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: timezone,
                  })}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {formatTime(lodging.checkOutDate, timezone)}
                  {timezone && (
                    <span className="text-gray-400 dark:text-gray-400 text-xs ml-1">
                      {getTimezoneAbbr(timezone)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-gray-400 dark:text-gray-400">Not set</div>
            )}
          </div>
        </div>

        {/* Address */}
        {lodging.address && (
          <div className="mt-3 flex items-start gap-1.5 text-sm text-gray-600 dark:text-gray-400">
            <svg
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span>{lodging.address}</span>
          </div>
        )}

        {/* Confirmation number */}
        {showConfirmation && lodging.confirmationNumber && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-mono">{lodging.confirmationNumber}</span>
          </div>
        )}

        {/* Booking URL */}
        {lodging.bookingUrl && (
          <div className="mt-3">
            <a
              href={lodging.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              View Booking
            </a>
          </div>
        )}

        {/* Notes */}
        {lodging.notes && (
          <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-600 dark:text-gray-400">
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
              <span>{lodging.notes}</span>
            </div>
          </div>
        )}

        {/* Linked locations (from entity links) */}
        {linkedLocations.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
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
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
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
          entityType="LODGING"
          entityId={lodging.id}
          excludeTypes={['LOCATION', 'PHOTO_ALBUM']}
          compact
          currentDate={currentDate}
          timezone={tripTimezone}
        />
      </div>
    </div>
  );
}
