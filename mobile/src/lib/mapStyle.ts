/**
 * Google Maps style for dark mode on Android (iOS follows `userInterfaceStyle`
 * instead). Colours follow the app's dusk palette so the map does not glare
 * out of a dark screen; roads and labels stay readable at night.
 */
import type { MapStyleElement } from 'react-native-maps';

import { DUSK } from './theme';

export const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: DUSK[800] }] },
  { elementType: 'labels.text.fill', stylers: [{ color: DUSK[300] }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: DUSK[900] }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: DUSK[600] }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: DUSK[400] }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#2d323c' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: DUSK[400] }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f3a33' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#86efac' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: DUSK[700] }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: DUSK[800] }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: DUSK[200] }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: DUSK[600] }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: DUSK[800] }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#fde68a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2e333d' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#fbbf24' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: DUSK[950] }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: DUSK[500] }] },
];
