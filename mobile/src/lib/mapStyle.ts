/**
 * Google Maps style for dark mode on Android (iOS follows `userInterfaceStyle`
 * instead). Colours follow the app's navy palette so the map does not glare
 * out of a dark screen; roads and labels stay readable at night.
 */
import type { MapStyleElement } from 'react-native-maps';

export const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#475569' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#273449' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f3a33' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#86efac' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#e2e8f0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#475569' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#fde68a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2b3a52' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#fbbf24' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1324' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
];
