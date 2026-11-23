import { useNavigate } from 'react-router';
import Icon from '../ui/Icon';
import type { Location } from '../../types/location';
import DirectionsButton from '../DirectionsButton';
import { placeFromLocation } from '../../lib/itineraryPlaces';
import { hasUsableLocation, type MapsPlace } from '../../lib/mapsDeepLinks';
import { getTypeColors } from './utils';

interface EmbeddedLocationCardProps {
  location: Location | {
    id: number;
    name: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    category?: {
      name: string;
      icon: string | null;
      color: string | null;
    } | null;
    notes?: string | null;
  };
  tripId: number;
  label?: string;
  /** Previous stop of the day — pre-fills the Directions origin. */
  originPlace?: MapsPlace | null;
}

export default function EmbeddedLocationCard({
  location,
  tripId,
  label,
  originPlace = null,
}: EmbeddedLocationCardProps) {
  const navigate = useNavigate();
  const colors = getTypeColors('location');

  const destination = placeFromLocation(location);
  const canNavigate = hasUsableLocation(destination);

  const handleClick = () => {
    navigate(`/trips/${tripId}?tab=locations#location-${location.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore keys aimed at the nested Directions control.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // Get category info
  const categoryInfo = 'category' in location && location.category;
  const categoryName = categoryInfo && categoryInfo.name;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View location: ${location.name}`}
      className={`p-3 rounded-lg border ${colors.bg} ${colors.border} cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dusk-800`}
    >
      {label && (
        <div className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider mb-2">
          {label}
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-lg ${colors.icon} flex items-center justify-center flex-shrink-0`}>
          {categoryInfo && categoryInfo.icon ? (
            <span className="text-lg">{categoryInfo.icon}</span>
          ) : (
            <Icon name="place" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-white truncate">
            {location.name}
          </h4>

          {categoryName && (
            <div className="text-sm text-gray-600 dark:text-dusk-400 mt-0.5">
              {categoryName}
            </div>
          )}

          {location.address && (
            <div className="flex items-start gap-1.5 mt-1 text-sm text-gray-500 dark:text-dusk-400">
              <Icon name="place" size={16} className="flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{location.address}</span>
            </div>
          )}

          {'notes' in location && location.notes && (
            <p className="mt-2 text-sm text-gray-600 dark:text-dusk-400 line-clamp-2">
              {location.notes}
            </p>
          )}

          {/* Coordinates badge */}
          {location.latitude && location.longitude && (
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-dusk-700 text-gray-600 dark:text-dusk-400">
                <Icon name="map" size={16} />
                View on map
              </span>
            </div>
          )}
        </div>

        {/* Directions + chevron */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canNavigate && (
            <DirectionsButton destination={destination} origin={originPlace} />
          )}
          <Icon name="chevronRight" size={20} className="text-gray-400" />
        </div>
      </div>
    </div>
  );
}
