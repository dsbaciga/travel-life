import { TileLayer } from 'react-leaflet';
import { useMapTiles } from '../hooks/useMapTiles';

/**
 * The app's base map layer. Drop it inside a `MapContainer` instead of a
 * hand-written `TileLayer`, so every map shares one style and English
 * labels (see `getMapTileConfig`).
 */
export default function AppTileLayer() {
  const tiles = useMapTiles();
  // Keyed by URL: Leaflet does not swap tiles when only the `url` prop changes.
  return (
    <TileLayer
      key={tiles.url}
      url={tiles.url}
      attribution={tiles.attribution}
      maxZoom={tiles.maxZoom}
    />
  );
}
