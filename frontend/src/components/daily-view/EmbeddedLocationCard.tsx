import { useNavigate } from 'react-router';
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
  const categoryIcon = categoryInfo && categoryInfo.icon ? categoryInfo.icon : '📍';
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
          <span className="text-lg">{categoryIcon}</span>
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
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
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
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
