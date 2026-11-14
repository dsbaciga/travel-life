import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import MarkerClusterGroup from '@changey/react-leaflet-markercluster';
import { LatLngBounds, LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Location } from '../types/location';
import type { Transportation } from '../types/transportation';

// Import shared map utilities (this also sets up leaflet icons)
import { calculateMapCenter, filterMapVisibleLocations } from '../utils/mapUtils';
import '../utils/mapUtils'; // Ensure leaflet icons are set up

// Import reusable components
import EmptyState from './EmptyState';

// Import themed map tiles hook
import { useMapTiles } from '../hooks/useMapTiles';

interface TripLocationsMapProps {
  locations: Location[];
  transportations?: Transportation[];
  showRoutes?: boolean;
}

// Component to automatically fit bounds to show all markers
function MapBounds({ locations }: { locations: Location[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length === 0) return;

    const validLocations = filterMapVisibleLocations(locations);

    if (validLocations.length === 0) return;

    if (validLocations.length === 1) {
      // If only one location, center on it with a reasonable zoom
      const loc = validLocations[0];
      map.setView([Number(loc.latitude), Number(loc.longitude)], 13);
    } else {
      // If multiple locations, fit bounds to show all
      const bounds = new LatLngBounds(
        validLocations.map((loc) => [Number(loc.latitude), Number(loc.longitude)])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [locations, map]);

  return null;
}

// Helper function to get color based on transportation type
function getTransportColor(type?: string): string {
  switch (type?.toLowerCase()) {
    case 'flight':
      return '#ef4444'; // red
    case 'train':
      return '#3b82f6'; // blue
    case 'bus':
      return '#10b981'; // green
    case 'car':
      return '#f59e0b'; // orange
    case 'ferry':
      return '#06b6d4'; // cyan
    case 'bicycle':
      return '#8b5cf6'; // purple
    case 'walk':
      return '#64748b'; // gray
    default:
      return '#6b7280'; // default gray
  }
}

// Helper function to create curved arc for flights (great circle approximation)
function createArcPath(start: LatLng, end: LatLng): LatLng[] {
  const points: LatLng[] = [];
  const steps = 50;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // Simple interpolation with arc
    const lat = start.lat + (end.lat - start.lat) * t;
    const lng = start.lng + (end.lng - start.lng) * t;

    // Add curvature (offset perpendicular to path)
    const midpoint = 0.5;
    const maxHeight = 0.2; // Maximum arc height as fraction of distance
    const height = -maxHeight * 4 * (t - midpoint) * (t - midpoint) + maxHeight;
    const perpLat = -(end.lng - start.lng) * height;
    const perpLng = (end.lat - start.lat) * height;

    points.push(new LatLng(lat + perpLat, lng + perpLng));
  }

  return points;
}

export default function TripLocationsMap({ locations, transportations = [], showRoutes = true }: TripLocationsMapProps) {
  const tileConfig = useMapTiles();
  const validLocations = filterMapVisibleLocations(locations);

  if (validLocations.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-dusk-700 rounded-lg p-8">
        <EmptyState.Compact
          icon="🗺️"
          message="No locations with coordinates to display on the map."
        />
        <p className="text-sm text-gray-500 dark:text-dusk-400 mt-2 text-center">
          Add coordinates to your locations to see them on the map.
        </p>
      </div>
    );
  }

  // Calculate center point using shared utility
  const center = calculateMapCenter(validLocations);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Location Map
        </h3>
        <span className="text-sm text-gray-600 dark:text-dusk-400">
          {validLocations.length} location{validLocations.length !== 1 ? 's' : ''} shown
        </span>
      </div>

      <div className="h-64 sm:h-80 md:h-96 lg:h-[500px] rounded-lg overflow-hidden border border-gray-200 dark:border-dusk-700 shadow-lg relative z-0">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            key={tileConfig.url}
            url={tileConfig.url}
            attribution={tileConfig.attribution}
            maxZoom={tileConfig.maxZoom}
          />
          <MapBounds locations={validLocations} />

          {/* Transportation Routes */}
          {showRoutes && transportations.map((transport) => {
            // Get start and end locations
            const startLoc = transport.fromLocation || locations.find(l => l.id === transport.fromLocationId);
            const endLoc = transport.toLocation || locations.find(l => l.id === transport.toLocationId);

            // Skip if locations don't have coordinates
            if (!startLoc?.latitude || !startLoc?.longitude || !endLoc?.latitude || !endLoc?.longitude) {
              return null;
            }

            const start = new LatLng(Number(startLoc.latitude), Number(startLoc.longitude));
            const end = new LatLng(Number(endLoc.latitude), Number(endLoc.longitude));

            // Use curved arc for flights, straight line for others
            const path = transport.type?.toLowerCase() === 'flight'
              ? createArcPath(start, end)
              : [start, end];

            const color = getTransportColor(transport.type);
            const isDashed = transport.type?.toLowerCase() === 'flight';

            return (
              <Polyline
                key={transport.id}
                positions={path}
                pathOptions={{
                  color: color,
                  weight: 3,
                  opacity: 0.7,
                  dashArray: isDashed ? '10, 10' : undefined,
                }}
              >
                <Popup>
                  <div className="p-2">
                    <h4 className="font-semibold text-gray-900">{transport.type}</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {startLoc.name} → {endLoc.name}
                    </p>
                    {transport.vehicleNumber && (
                      <p className="text-xs text-gray-500 mt-1">
                        {transport.vehicleNumber}
                      </p>
                    )}
                  </div>
                </Popup>
              </Polyline>
            );
          })}

          {/* Location Markers with Clustering */}
          <MarkerClusterGroup chunkedLoading>
            {validLocations.map((location) => (
              <Marker
                key={location.id}
                position={[Number(location.latitude), Number(location.longitude)]}
              >
                <Popup>
                  <div className="p-2">
                    <h4 className="font-semibold text-gray-900">{location.name}</h4>
                    {location.address && (
                      <p className="text-sm text-gray-600 mt-1">{location.address}</p>
                    )}
                    {location.notes && (
                      <p className="text-sm text-gray-500 mt-2 italic">{location.notes}</p>
                    )}
                    {location.category && (
                      <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        {location.category.name}
                      </span>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      <div className="text-sm text-gray-600 dark:text-dusk-400">
        <p>💡 Click on markers and route lines to see details</p>
        {showRoutes && transportations.length > 0 && (
          <p className="mt-1">🛤️ Routes are color-coded by transportation type (flights shown as dashed arcs)</p>
        )}
      </div>
    </div>
  );
}
