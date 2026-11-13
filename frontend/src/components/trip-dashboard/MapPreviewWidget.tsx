import { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../utils/mapUtils';
import { ChevronRightIcon, MapPinIcon } from '../icons';

interface MapPreviewWidgetProps {
  locations: {
    id: number;
    name: string;
    latitude: number | null;
    longitude: number | null;
    category?: string;
    /** When true, the location is kept in the list but hidden from the map preview. */
    excludeFromMap?: boolean;
  }[];
  /**
   * Transport legs to draw between places. Legs already travelled are a
   * solid line; legs still ahead are dashed.
   */
  legs?: MapPreviewLeg[];
  onNavigateToMap: () => void;
  onLocationClick?: (locationId: number) => void;
}

export interface MapPreviewLeg {
  id: number;
  from: [latitude: number, longitude: number];
  to: [latitude: number, longitude: number];
  travelled: boolean;
}

const LEG_COLOR = '#D97706';

/**
 * Map icon for the empty state
 */
function MapIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

/**
 * Globe icon for the map preview header
 */
function GlobeIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * Component to automatically fit bounds to show all markers
 */
function MapBounds({ locations }: { locations: { latitude: number; longitude: number }[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length === 0) return;

    if (locations.length === 1) {
      // If only one location, center on it with a reasonable zoom
      const loc = locations[0];
      map.setView([loc.latitude, loc.longitude], 13);
    } else {
      // If multiple locations, fit bounds to show all
      const bounds = new LatLngBounds(
        locations.map((loc) => [loc.latitude, loc.longitude])
      );
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [locations, map]);

  return null;
}

/**
 * Location list item
 */
interface LocationListItemProps {
  name: string;
  category?: string;
  onClick?: () => void;
}

function LocationListItem({ name, category, onClick }: LocationListItemProps) {
  return (
    <button
      type="button"
      className={`flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-lg
        hover:bg-primary-50/50 dark:hover:bg-navy-700/50
        transition-colors duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
      `}
      onClick={onClick}
    >
      <MapPinIcon className="w-4 h-4 flex-shrink-0 text-primary-500 dark:text-gold" />
      <span className="text-sm text-charcoal dark:text-warm-gray truncate flex-1">
        {name}
      </span>
      {category && (
        <span className="text-xs text-slate dark:text-warm-gray/60 truncate max-w-[80px]">
          {category}
        </span>
      )}
    </button>
  );
}

/**
 * MapPreviewWidget - Dashboard widget showing a Leaflet map preview of trip locations
 *
 * Features:
 * - Real Leaflet map with OpenStreetMap tiles
 * - Shows location markers with popups
 * - Auto-fits bounds to show all locations
 * - Displays location count badge
 * - Lists first 4 location names
 * - Click to expand to full map view
 * - Dark mode support
 * - Empty state when no locations
 */
export default function MapPreviewWidget({
  locations,
  legs = [],
  onNavigateToMap,
  onLocationClick,
}: MapPreviewWidgetProps) {
  // Filter to locations that should render on the map: valid coordinates and not
  // explicitly excluded (e.g. a far-off home/origin the user hid to keep the map tight).
  const locationsWithCoords = useMemo(
    () =>
      locations.filter(
        (loc): loc is typeof loc & { latitude: number; longitude: number } =>
          loc.latitude !== null && loc.longitude !== null && !loc.excludeFromMap
      ),
    [locations]
  );

  // Fit to the route as well as the places, so a leg never runs off the edge.
  const boundsPoints = useMemo(
    () => [
      ...locationsWithCoords.map((loc) => ({ latitude: loc.latitude, longitude: loc.longitude })),
      ...legs.flatMap((leg) => [
        { latitude: leg.from[0], longitude: leg.from[1] },
        { latitude: leg.to[0], longitude: leg.to[1] },
      ]),
    ],
    [locationsWithCoords, legs]
  );
  const travelledCount = legs.filter((leg) => leg.travelled).length;

  // Get locations to display in list (first 4)
  const displayLocations = locations.slice(0, 4);
  const remainingCount = locations.length - displayLocations.length;

  // Check states
  const hasLocations = locations.length > 0;
  const hasCoordinates = locationsWithCoords.length > 0;

  // Calculate center point for initial map view
  const center = useMemo(() => {
    if (locationsWithCoords.length === 0) {
      return { lat: 0, lng: 0 };
    }
    const lat = locationsWithCoords.reduce((sum, loc) => sum + loc.latitude, 0) / locationsWithCoords.length;
    const lng = locationsWithCoords.reduce((sum, loc) => sum + loc.longitude, 0) / locationsWithCoords.length;
    return { lat, lng };
  }, [locationsWithCoords]);

  // Empty state - no locations at all
  if (!hasLocations) {
    return (
      <div className="card animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body flex items-center gap-2">
            <GlobeIcon className="w-5 h-5 text-primary-500 dark:text-gold" />
            Map
          </h3>
          <button
            type="button"
            onClick={onNavigateToMap}
            className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
              hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
            aria-label="Go to Map"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Empty State */}
        <div className="text-center py-6">
          <div className="mb-2">
            <MapIcon className="w-12 h-12 mx-auto text-primary-300 dark:text-gold/40" />
          </div>
          <p className="text-sm text-slate dark:text-warm-gray/70 mb-3">
            No locations added yet
          </p>
          <button
            type="button"
            onClick={onNavigateToMap}
            className="text-sm font-medium text-primary-600 dark:text-gold hover:underline"
          >
            Add a location
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body flex items-center gap-2">
            <GlobeIcon className="w-5 h-5 text-primary-500 dark:text-gold" />
            Map
          </h3>
          {/* Location count badge */}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 dark:bg-gold/20 dark:text-gold">
            {locations.length} {locations.length === 1 ? 'location' : 'locations'}
          </span>
        </div>
        <button
          type="button"
          onClick={onNavigateToMap}
          className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
            hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
          aria-label="Go to Map"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Map Preview Area */}
      <div
        className="relative h-80 rounded-xl overflow-hidden mb-4 cursor-pointer group"
        onClick={onNavigateToMap}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigateToMap();
          }
        }}
        aria-label="Click to view full map"
      >
        {hasCoordinates ? (
          <>
            <MapContainer
              center={[center.lat, center.lng]}
              zoom={10}
              scrollWheelZoom={false}
              zoomControl={false}
              dragging={false}
              doubleClickZoom={false}
              touchZoom={false}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapBounds locations={boundsPoints} />
              {legs.map((leg) => (
                <Polyline
                  key={leg.id}
                  positions={[leg.from, leg.to]}
                  pathOptions={
                    leg.travelled
                      ? { color: LEG_COLOR, weight: 3, opacity: 0.95 }
                      : { color: LEG_COLOR, weight: 2, opacity: 0.8, dashArray: '4 8', lineCap: 'round' }
                  }
                />
              ))}
              {locationsWithCoords.slice(0, 20).map((location) => (
                <Marker
                  key={location.id}
                  position={[location.latitude, location.longitude]}
                >
                  <Popup>
                    <div className="text-sm">
                      <strong>{location.name}</strong>
                      {location.category && (
                        <div className="text-xs text-gray-500">{location.category}</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-primary-500/0 group-hover:bg-primary-500/10 dark:group-hover:bg-gold/10 transition-colors duration-300 flex items-center justify-center pointer-events-none z-[1000]">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 px-3 py-1.5 rounded-full bg-white/90 dark:bg-navy-800/90 text-sm font-medium text-primary-600 dark:text-gold shadow-lg">
                View full map
              </span>
            </div>
          </>
        ) : (
          /* No coordinates fallback */
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100/50 dark:from-navy-700 dark:to-navy-800">
            <div className="text-center">
              <MapPinIcon className="w-8 h-8 mx-auto text-primary-400 dark:text-gold/60 mb-1" />
              <p className="text-xs text-slate dark:text-warm-gray/70">
                Coordinates not set
              </p>
            </div>
          </div>
        )}
      </div>

      {legs.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-slate dark:text-dusk-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-[3px] border-accent-600" aria-hidden="true" />
            Travelled ({travelledCount})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-accent-600" aria-hidden="true" />
            Still ahead ({legs.length - travelledCount})
          </span>
        </p>
      )}

      {/* Location List */}
      <div className="space-y-0.5">
        {displayLocations.map((location) => (
          <LocationListItem
            key={location.id}
            name={location.name}
            category={location.category}
            onClick={onLocationClick ? () => onLocationClick(location.id) : undefined}
          />
        ))}
      </div>

      {/* Remaining count */}
      {remainingCount > 0 && (
        <p className="text-xs text-slate dark:text-warm-gray/60 mt-2 pl-2">
          +{remainingCount} more {remainingCount === 1 ? 'location' : 'locations'}
        </p>
      )}

      {/* Footer Link */}
      <div className="mt-4 pt-3 border-t border-slate/10 dark:border-warm-gray/10">
        <button
          type="button"
          onClick={onNavigateToMap}
          className="w-full text-center text-sm font-medium text-primary-600 dark:text-gold hover:underline
            py-1.5 rounded-lg hover:bg-primary-50/50 dark:hover:bg-navy-700/30 transition-colors duration-200"
        >
          View full map
        </button>
      </div>
    </div>
  );
}
