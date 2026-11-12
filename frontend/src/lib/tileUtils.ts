/**
 * Tile calculation utilities for map tile pre-caching
 *
 * These functions convert between geographic coordinates and tile coordinates
 * using the Web Mercator projection (EPSG:3857) which is standard for web maps.
 */

/**
 * Tile coordinates (x, y at zoom level z)
 */
export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Geographic bounding box
 */
export interface BoundingBox {
  north: number; // Max latitude
  south: number; // Min latitude
  east: number; // Max longitude
  west: number; // Min longitude
}

/**
 * Location with coordinates (compatible with the app's Location type)
 */
export interface CoordinateLocation {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Zoom level presets for different use cases
 */
export const ZOOM_PRESETS = {
  CITY_OVERVIEW: { min: 10, max: 12 },
  NEIGHBORHOOD: { min: 13, max: 15 },
  STREET_LEVEL: { min: 16, max: 17 },
  FULL_OFFLINE: { min: 10, max: 16 },
} as const;

/**
 * Default OpenStreetMap tile URL template
 * Uses subdomains a, b, c for load balancing
 */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * CARTO tile URLs for light/dark themes
 */
const CARTO_KEY_QUERY = import.meta.env.VITE_CARTO_API_KEY
  ? `?key=${encodeURIComponent(String(import.meta.env.VITE_CARTO_API_KEY).trim())}`
  : '';

export const CARTO_TILE_URLS = {
  light: `https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png${CARTO_KEY_QUERY}`,
  dark: `https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png${CARTO_KEY_QUERY}`,
} as const;

/**
 * Average tile size in bytes (approximately 20KB for typical OSM tiles)
 */
export const AVERAGE_TILE_SIZE_BYTES = 20 * 1024;

/**
 * Convert latitude/longitude to tile coordinates at a given zoom level
 *
 * Uses the Web Mercator projection formula:
 * x = floor((lon + 180) / 360 * 2^zoom)
 * y = floor((1 - ln(tan(lat) + sec(lat)) / pi) / 2 * 2^zoom)
 *
 * @param lat Latitude in degrees (-90 to 90)
 * @param lng Longitude in degrees (-180 to 180)
 * @param zoom Zoom level (0-19)
 * @returns Tile x, y coordinates
 */
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  // Clamp latitude to valid range for Mercator projection
  const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const n = Math.pow(2, zoom);

  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  // Clamp to valid tile range
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

/**
 * Convert tile coordinates to geographic bounding box
 *
 * @param x Tile x coordinate
 * @param y Tile y coordinate
 * @param zoom Zoom level
 * @returns Bounding box with north, south, east, west bounds
 */
export function tileToBounds(x: number, y: number, zoom: number): BoundingBox {
  const n = Math.pow(2, zoom);

  // Calculate longitude bounds
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;

  // Calculate latitude bounds (inverse Mercator)
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;

  return { north, south, east, west };
}

/**
 * Get all tiles that cover a bounding box at a specific zoom level
 *
 * @param bounds Geographic bounding box
 * @param zoom Zoom level
 * @returns Array of tile coordinates
 */
export function getTilesInBounds(bounds: BoundingBox, zoom: number): TileCoord[] {
  const tiles: TileCoord[] = [];

  // Get tile range
  const minTile = latLngToTile(bounds.north, bounds.west, zoom);
  const maxTile = latLngToTile(bounds.south, bounds.east, zoom);

  // Handle edge case where min > max due to wrapping
  const startX = Math.min(minTile.x, maxTile.x);
  const endX = Math.max(minTile.x, maxTile.x);
  const startY = Math.min(minTile.y, maxTile.y);
  const endY = Math.max(minTile.y, maxTile.y);

  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

/**
 * Get all tiles for a bounding box across multiple zoom levels
 *
 * @param bounds Geographic bounding box
 * @param minZoom Minimum zoom level (inclusive)
 * @param maxZoom Maximum zoom level (inclusive)
 * @returns Array of tile coordinates
 */
export function getTilesForBounds(
  bounds: BoundingBox,
  minZoom: number,
  maxZoom: number
): TileCoord[] {
  const tiles: TileCoord[] = [];

  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    tiles.push(...getTilesInBounds(bounds, zoom));
  }

  return tiles;
}

/**
 * Calculate a buffered bounding box around a set of locations
 *
 * @param locations Array of locations with latitude/longitude
 * @param bufferKm Buffer distance in kilometers (default 5km)
 * @returns Bounding box with buffer applied
 * @throws Error if no valid locations provided
 */
export function calculateBufferedBounds(
  locations: CoordinateLocation[],
  bufferKm: number = 5
): BoundingBox {
  // Filter to locations with valid coordinates
  const validLocations = locations.filter(
    (loc): loc is { latitude: number; longitude: number } =>
      loc.latitude !== null &&
      loc.longitude !== null &&
      !isNaN(loc.latitude) &&
      !isNaN(loc.longitude)
  );

  if (validLocations.length === 0) {
    throw new Error('No valid locations with coordinates provided');
  }

  // Find initial bounds
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const loc of validLocations) {
    if (loc.latitude > north) north = loc.latitude;
    if (loc.latitude < south) south = loc.latitude;
    if (loc.longitude > east) east = loc.longitude;
    if (loc.longitude < west) west = loc.longitude;
  }

  // Convert buffer from km to degrees (approximate)
  // 1 degree latitude = ~111 km
  // 1 degree longitude = ~111 km * cos(latitude)
  const latBuffer = bufferKm / 111;
  const midLat = (north + south) / 2;
  const lngBuffer = bufferKm / (111 * Math.cos((midLat * Math.PI) / 180));

  // Apply buffer
  return {
    north: Math.min(90, north + latBuffer),
    south: Math.max(-90, south - latBuffer),
    east: Math.min(180, east + lngBuffer),
    west: Math.max(-180, west - lngBuffer),
  };
}

/**
 * Generate tile URL from tile coordinates
 *
 * @param tile Tile coordinates
 * @param urlTemplate URL template with {z}, {x}, {y} placeholders
 * @returns Tile URL
 */
export function getTileUrl(tile: TileCoord, urlTemplate: string = OSM_TILE_URL): string {
  return urlTemplate.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
}

/**
 * Get the cache key for a tile
 *
 * @param tile Tile coordinates
 * @returns Cache key string
 */
export function getTileCacheKey(tile: TileCoord): string {
  return `tile/${tile.z}/${tile.x}/${tile.y}`;
}

/**
 * Parse a cache key back to tile coordinates
 *
 * @param key Cache key in format "tile/{z}/{x}/{y}"
 * @returns Tile coordinates or null if invalid
 */
export function parseTileCacheKey(key: string): TileCoord | null {
  const match = key.match(/^tile\/(\d+)\/(\d+)\/(\d+)$/);
  if (!match) return null;

  return {
    z: parseInt(match[1], 10),
    x: parseInt(match[2], 10),
    y: parseInt(match[3], 10),
  };
}

/**
 * Count tiles at each zoom level in a tile list
 *
 * @param tiles Array of tile coordinates
 * @returns Map of zoom level to tile count
 */
export function countTilesByZoom(tiles: TileCoord[]): Map<number, number> {
  const counts = new Map<number, number>();

  for (const tile of tiles) {
    counts.set(tile.z, (counts.get(tile.z) || 0) + 1);
  }

  return counts;
}

/**
 * Estimate download size for a set of tiles
 *
 * @param tileCount Number of tiles
 * @param avgTileSize Average tile size in bytes (default: 20KB)
 * @returns Estimated size in bytes
 */
export function estimateDownloadSize(
  tileCount: number,
  avgTileSize: number = AVERAGE_TILE_SIZE_BYTES
): number {
  return tileCount * avgTileSize;
}

/**
 * Format byte size to human readable string
 *
 * @param bytes Size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Get recommended zoom levels based on area size
 *
 * @param bounds Bounding box
 * @returns Recommended min and max zoom levels
 */
export function getRecommendedZoomLevels(bounds: BoundingBox): { min: number; max: number } {
  // Calculate area span in degrees
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const maxSpan = Math.max(latSpan, lngSpan);

  // Recommend zoom levels based on area size
  if (maxSpan > 10) {
    // Very large area (region/country)
    return { min: 6, max: 12 };
  } else if (maxSpan > 2) {
    // Large area (multiple cities)
    return { min: 8, max: 14 };
  } else if (maxSpan > 0.5) {
    // Medium area (city)
    return { min: 10, max: 15 };
  } else if (maxSpan > 0.1) {
    // Small area (neighborhood)
    return { min: 12, max: 16 };
  } else {
    // Very small area (block)
    return { min: 14, max: 17 };
  }
}

/**
 * Calculate the center point of a bounding box
 *
 * @param bounds Bounding box
 * @returns Center latitude and longitude
 */
export function getBoundsCenter(bounds: BoundingBox): { lat: number; lng: number } {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  };
}

/**
 * Check if a point is within a bounding box
 *
 * @param lat Latitude
 * @param lng Longitude
 * @param bounds Bounding box
 * @returns True if point is within bounds
 */
export function isPointInBounds(lat: number, lng: number, bounds: BoundingBox): boolean {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

/**
 * Merge multiple bounding boxes into one that contains all
 *
 * @param boxes Array of bounding boxes
 * @returns Combined bounding box
 * @throws Error if no boxes provided
 */
export function mergeBounds(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) {
    throw new Error('No bounding boxes to merge');
  }

  return {
    north: Math.max(...boxes.map((b) => b.north)),
    south: Math.min(...boxes.map((b) => b.south)),
    east: Math.max(...boxes.map((b) => b.east)),
    west: Math.min(...boxes.map((b) => b.west)),
  };
}
