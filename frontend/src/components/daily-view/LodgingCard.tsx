import { useNavigate } from 'react-router';
import Icon from '../ui/Icon';
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
              <Icon name={getLodgingIcon(lodging.type)} size={24} />
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2 break-words [overflow-wrap:anywhere]">
                {lodging.name}
              </h3>

              <div className="text-sm text-gray-500 dark:text-dusk-400 mt-0.5">
                {typeDisplay}
              </div>

              {/* Night indicator for multi-day stays */}
              {dayContext?.nightNumber && dayContext?.totalNights && (
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
                    <Icon name="nightClear" size={16} />
                    Night {dayContext.nightNumber} of {dayContext.totalNights}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Cost and actions */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {showCost && lodging.cost && lodging.currency && (
              <div className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                {formatCurrency(lodging.cost, lodging.currency)}
                {totalNights && totalNights > 1 && (
                  <span className="text-sm text-gray-500 dark:text-dusk-400 font-normal">
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
                <Icon name="edit" size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Check-in / Check-out times */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-4">
          {/* Check-in */}
          <div className={showCheckIn ? '' : 'opacity-50'}>
            <div className="text-gray-500 dark:text-dusk-400 eyebrow mb-1">
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
                <div className="text-sm text-gray-600 dark:text-dusk-400">
                  {formatTime(lodging.checkInDate, timezone)}
                  {timezone && (
                    <span className="text-gray-400 dark:text-dusk-400 text-xs ml-1">
                      {getTimezoneAbbr(timezone)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-gray-400 dark:text-dusk-400">Not set</div>
            )}
          </div>

          {/* Check-out */}
          <div className={showCheckOut ? '' : 'opacity-50'}>
            <div className="text-gray-500 dark:text-dusk-400 eyebrow mb-1">
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
                <div className="text-sm text-gray-600 dark:text-dusk-400">
                  {formatTime(lodging.checkOutDate, timezone)}
                  {timezone && (
                    <span className="text-gray-400 dark:text-dusk-400 text-xs ml-1">
                      {getTimezoneAbbr(timezone)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-gray-400 dark:text-dusk-400">Not set</div>
            )}
          </div>
        </div>

        {/* Address */}
        {lodging.address && (
          <div className="mt-3 flex items-start gap-1.5 text-sm text-gray-600 dark:text-dusk-400">
            <Icon name="place" size={16} className="flex-shrink-0 mt-0.5" />
            <span>{lodging.address}</span>
          </div>
        )}

        {/* Confirmation number */}
        {showConfirmation && lodging.confirmationNumber && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-dusk-400">
            <Icon name="success" size={16} />
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
              className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline [@media(pointer:coarse)]:min-h-[44px]"
            >
              <Icon name="externalLink" size={16} />
              View Booking
            </a>
          </div>
        )}

        {/* Notes */}
        {lodging.notes && (
          <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-dusk-700/50 text-sm text-gray-600 dark:text-dusk-400">
            <div className="flex items-start gap-2">
              <Icon name="note" size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span>{lodging.notes}</span>
            </div>
          </div>
        )}

        {/* Linked locations (from entity links) */}
        {linkedLocations.length > 0 && (
          <div className="mt-3">
            <div className="text-gray-500 dark:text-dusk-400 eyebrow mb-2">
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
            <div className="text-gray-500 dark:text-dusk-400 eyebrow mb-2">
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
