/**
 * PrintMiniMap - Static map image for printable itinerary
 * Uses OpenStreetMap static tiles for print-friendly maps
 */

interface PrintMiniMapProps {
  latitude: number;
  longitude: number;
  label?: string;
  zoom?: number;
}

/**
 * Generates a static map image URL using OpenStreetMap tiles
 * This approach embeds the map as an image that works in print
 */
export default function PrintMiniMap({
  latitude,
  longitude,
  label,
  zoom = 15,
}: PrintMiniMapProps) {
  // Use OpenStreetMap static map service
  // Format: https://staticmap.openstreetmap.de/staticmap.php?center=lat,lng&zoom=z&size=WxH&markers=lat,lng,red
  const mapWidth = 300;
  const mapHeight = 150;

  const staticMapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=${zoom}&size=${mapWidth}x${mapHeight}&markers=${latitude},${longitude},red`;

  // Google Maps link for the location (useful if printed and user wants to navigate)
  const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    <div className="print-mini-map">
      <img
        src={staticMapUrl}
        alt={label ? `Map of ${label}` : 'Location map'}
        className="print-mini-map-image"
        style={{
          width: `${mapWidth}px`,
          height: `${mapHeight}px`,
          objectFit: 'cover',
          borderRadius: '4px',
          border: '1px solid #e5e7eb',
        }}
        loading="lazy"
      />
      <div className="print-mini-map-coords" style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px' }}>
        {latitude.toFixed(5)}, {longitude.toFixed(5)}
        <span style={{ marginLeft: '8px', color: '#3b82f6' }}>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
            Open in Maps
          </a>
        </span>
      </div>
    </div>
  );
}

/**
 * PrintRouteMap - Static map showing a route between two points (for transportation)
 */
interface PrintRouteMapProps {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  fromLabel?: string;
  toLabel?: string;
}

export function PrintRouteMap({
  fromLatitude,
  fromLongitude,
  toLatitude,
  toLongitude,
  fromLabel,
  toLabel,
}: PrintRouteMapProps) {
  const mapWidth = 300;
  const mapHeight = 150;

  // Calculate center point between from and to
  const centerLat = (fromLatitude + toLatitude) / 2;
  const centerLng = (fromLongitude + toLongitude) / 2;

  // Calculate appropriate zoom based on distance
  const latDiff = Math.abs(fromLatitude - toLatitude);
  const lngDiff = Math.abs(fromLongitude - toLongitude);
  const maxDiff = Math.max(latDiff, lngDiff);

  // Rough zoom calculation (smaller diff = higher zoom)
  let zoom = 12;
  if (maxDiff < 0.01) zoom = 15;
  else if (maxDiff < 0.05) zoom = 13;
  else if (maxDiff < 0.1) zoom = 12;
  else if (maxDiff < 0.5) zoom = 10;
  else if (maxDiff < 1) zoom = 9;
  else if (maxDiff < 5) zoom = 7;
  else if (maxDiff < 10) zoom = 5;
  else zoom = 4;

  // Create markers string for both points
  const staticMapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=${zoom}&size=${mapWidth}x${mapHeight}&markers=${fromLatitude},${fromLongitude},green|${toLatitude},${toLongitude},red`;

  // Google Maps directions link
  const googleMapsUrl = `https://www.google.com/maps/dir/${fromLatitude},${fromLongitude}/${toLatitude},${toLongitude}`;

  return (
    <div className="print-mini-map print-route-map">
      <img
        src={staticMapUrl}
        alt={`Route from ${fromLabel || 'start'} to ${toLabel || 'end'}`}
        className="print-mini-map-image"
        style={{
          width: `${mapWidth}px`,
          height: `${mapHeight}px`,
          objectFit: 'cover',
          borderRadius: '4px',
          border: '1px solid #e5e7eb',
        }}
        loading="lazy"
      />
      <div className="print-mini-map-legend" style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px', display: 'flex', gap: '12px' }}>
        <span><span style={{ color: '#22c55e' }}>●</span> From</span>
        <span><span style={{ color: '#ef4444' }}>●</span> To</span>
        <span style={{ marginLeft: 'auto', color: '#3b82f6' }}>
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
            Get directions
          </a>
        </span>
      </div>
    </div>
  );
}
