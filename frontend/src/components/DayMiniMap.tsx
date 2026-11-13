import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../utils/mapUtils';

interface MapLocation {
  name: string;
  latitude: number;
  longitude: number;
  type?: 'activity' | 'transportation' | 'lodging';
}

interface DayMiniMapProps {
  locations: MapLocation[];
  defaultExpanded?: boolean;
}

// Component to automatically fit bounds to show all markers
function MapBounds({ locations }: { locations: MapLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length === 0) return;

    if (locations.length === 1) {
      // If only one location, center on it with a reasonable zoom
      const loc = locations[0];
      map.setView([loc.latitude, loc.longitude], 14);
    } else {
      // If multiple locations, fit bounds to show all
      const bounds = new LatLngBounds(
        locations.map((loc) => [loc.latitude, loc.longitude])
      );
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [locations, map]);

  return null;
}

// Get marker icon (could be customized by type in the future)
const getMarkerIcon = () => {
  // Using default markers for now, could customize with colored markers later
  return new Icon.Default();
};

export default function DayMiniMap({ locations, defaultExpanded = false }: DayMiniMapProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Update expansion state when defaultExpanded prop changes
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  if (locations.length === 0) {
    return null;
  }

  // Calculate center point
  const centerLat = locations.reduce((sum, loc) => sum + loc.latitude, 0) / locations.length;
  const centerLng = locations.reduce((sum, loc) => sum + loc.longitude, 0) / locations.length;

  return (
    <div className="mb-4 print:hidden">
      {/* Collapsed state - show button to expand */}
      {!isExpanded && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-gray-200 dark:border-dusk-700 bg-gray-50 dark:bg-dusk-800/50 text-gray-600 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-800 hover:text-gray-900 dark:hover:text-dusk-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium">
            {locations.length} location{locations.length !== 1 ? 's' : ''} - Show map
          </span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Expanded state - show map */}
      {isExpanded && (
        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-dusk-700 shadow-sm">
          {/* Header with collapse button */}
          <div className="flex items-center justify-between bg-gray-50 dark:bg-dusk-800 px-3 py-2 border-b border-gray-200 dark:border-dusk-700">
            <span className="text-sm font-medium text-gray-700 dark:text-dusk-300 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {locations.length} location{locations.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-dusk-700 text-gray-500 dark:text-dusk-400 transition-colors"
              title="Hide map"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>

          {/* Map */}
          <div className="h-[200px] relative z-0">
            <MapContainer
              center={[centerLat, centerLng]}
              zoom={13}
              scrollWheelZoom={false}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapBounds locations={locations} />
              {locations.map((location, index) => (
                <Marker
                  key={`${location.name}-${index}`}
                  position={[location.latitude, location.longitude]}
                  icon={getMarkerIcon()}
                >
                  <Popup>
                    <div className="text-sm">
                      <strong>{location.name}</strong>
                      {location.type && (
                        <div className="text-xs text-gray-500 capitalize">{location.type}</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}
