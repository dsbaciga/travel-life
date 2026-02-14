import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TransportationRoute } from "../types/transportation";
import { useMapTiles } from "../hooks/useMapTiles";

interface FlightRouteMapProps {
  route: TransportationRoute;
  height?: string;
  showLabels?: boolean;
  transportationType?: "flight" | "train" | "bus" | "car" | "ferry" | "bicycle" | "walk" | "other";
}

// Get icon based on transportation type
const getTransportationIcon = (type?: string) => {
  let emoji = "✈️"; // Default to airplane

  switch (type) {
    case "flight":
      emoji = "✈️";
      break;
    case "train":
      emoji = "🚆";
      break;
    case "bus":
      emoji = "🚌";
      break;
    case "car":
      emoji = "🚗";
      break;
    case "ferry":
      emoji = "⛴️";
      break;
    case "bicycle":
      emoji = "🚴";
      break;
    case "walk":
      emoji = "🚶";
      break;
    case "other":
    default:
      emoji = "🚗"; // Default to car for "other"
      break;
  }

  return L.divIcon({
    html: `<div style="font-size: 24px;">${emoji}</div>`,
    className: "custom-div-icon",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

// Calculate intermediate points for curved flight path
const calculateCurvedPath = (
  start: [number, number],
  end: [number, number],
  numPoints: number = 50
): [number, number][] => {
  const points: [number, number][] = [];
  const [lat1, lon1] = start;
  const [lat2, lon2] = end;

  // Calculate the distance for arc height
  const distance = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lon2 - lon1, 2));
  const arcHeight = distance * 0.2; // 20% of distance for arc curvature

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;

    // Linear interpolation
    const lat = lat1 + (lat2 - lat1) * t;
    const lon = lon1 + (lon2 - lon1) * t;

    // Add parabolic curve
    const curvature = 4 * arcHeight * t * (1 - t);
    const curvedLat = lat + curvature;

    points.push([curvedLat, lon]);
  }

  return points;
};

export default function FlightRouteMap({
  route,
  height = "300px",
  showLabels = true,
  transportationType = "flight",
}: FlightRouteMapProps) {
  const tileConfig = useMapTiles();
  const { from, to, geometry } = route;

  // Get the appropriate icon for this transportation type
  const transportIcon = getTransportationIcon(transportationType);

  // Calculate center and zoom
  const centerLat = (from.latitude + to.latitude) / 2;
  const centerLon = (from.longitude + to.longitude) / 2;

  // Calculate zoom level based on distance
  const latDiff = Math.abs(to.latitude - from.latitude);
  const lonDiff = Math.abs(to.longitude - from.longitude);
  const maxDiff = Math.max(latDiff, lonDiff);
  const zoom = maxDiff > 100 ? 2 : maxDiff > 50 ? 3 : maxDiff > 20 ? 4 : maxDiff > 10 ? 5 : 6;

  // Use actual route geometry if available (from OpenRouteService for car/bike/walking)
  // For flights: use curved path when no geometry (represents flight arc)
  // For road/ground transportation: use straight line when no geometry (indicates no actual route data)
  const routePath = geometry
    ? geometry.map(([lon, lat]) => [lat, lon] as [number, number]) // Convert [lon, lat] to [lat, lon]
    : transportationType === "flight"
      ? calculateCurvedPath([from.latitude, from.longitude], [to.latitude, to.longitude])
      : [[from.latitude, from.longitude], [to.latitude, to.longitude]] as [number, number][]; // Straight line for non-flights

  return (
    // Dynamic height requires CSS variable - cannot be moved to static CSS
    <div
      className="map-container-dynamic rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 w-full relative z-0"
      style={{ '--map-height': height }}
    >
      <MapContainer
        center={[centerLat, centerLon]}
        zoom={zoom}
        scrollWheelZoom={false}
        className="h-full w-full z-0"
        zoomControl={true}
      >
        <TileLayer
          key={tileConfig.url}
          url={tileConfig.url}
          attribution={tileConfig.attribution}
          maxZoom={tileConfig.maxZoom}
        />

        {/* Departure marker */}
        <Marker position={[from.latitude, from.longitude]} icon={transportIcon}>
          {showLabels && (
            <Popup>
              <div className="text-sm">
                <strong>Departure:</strong> {from.name}
              </div>
            </Popup>
          )}
        </Marker>

        {/* Arrival marker */}
        <Marker position={[to.latitude, to.longitude]} icon={transportIcon}>
          {showLabels && (
            <Popup>
              <div className="text-sm">
                <strong>Arrival:</strong> {to.name}
              </div>
            </Popup>
          )}
        </Marker>

        {/* Route path - solid line when actual route geometry, dashed when fallback/estimated */}
        <Polyline
          positions={routePath}
          pathOptions={{
            color: "#3b82f6",
            weight: 3,
            opacity: 0.7,
            dashArray: geometry ? undefined : "10, 10", // Solid line for actual routes, dashed for fallback
          }}
        />
      </MapContainer>
    </div>
  );
}
