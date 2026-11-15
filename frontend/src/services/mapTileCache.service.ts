/**
 * Map Tile Cache Service
 *
 * Handles pre-caching of map tiles for offline use using the Cache API.
 * Tiles are stored for trip areas so maps work offline during travel.
 *
 * Cache Storage:
 * - Cache name: 'map-tiles-v1'
 * - Key format: 'tile/{z}/{x}/{y}'
 * - Metadata stored in IndexedDB under 'mapCacheMetadata' store
 */

import type { BoundingBox, CoordinateLocation, TileCoord } from '../lib/tileUtils';
import { openDatabaseWithStore } from '../lib/openIndexedDb';
import {
  calculateBufferedBounds,
  countTilesByZoom,
  estimateDownloadSize,
  formatBytes,
  getRecommendedZoomLevels,
  getTileCacheKey,
  getTileUrl,
  getTilesForBounds,
  AVERAGE_TILE_SIZE_BYTES,
  OSM_TILE_URL,
} from '../lib/tileUtils';

/**
 * Metadata stored for each trip's cached tiles
 */
export interface TileCacheMetadata {
  tripId: string;
  tiles: TileCoord[];
  cachedAt: number;
  totalSize: number;
  bounds: BoundingBox;
  zoomLevels: { min: number; max: number };
}

/**
 * Progress callback for tile caching operations
 */
export interface CacheProgress {
  current: number;
  total: number;
  percentage: number;
  currentTile?: TileCoord;
  bytesDownloaded: number;
  estimatedTotalBytes: number;
  failed: number;
}

/**
 * Options for caching tiles
 */
export interface CacheOptions {
  /** Minimum zoom level to cache (default: 10) */
  minZoom?: number;
  /** Maximum zoom level to cache (default: 16) */
  maxZoom?: number;
  /** Buffer around locations in km (default: 5) */
  bufferKm?: number;
  /** Tile URL template (default: OSM) */
  tileUrlTemplate?: string;
  /** Delay between tile fetches in ms (default: 50) */
  fetchDelay?: number;
  /** Maximum concurrent requests (default: 4) */
  concurrency?: number;
  /** Skip tiles that are already cached (default: true) */
  skipCached?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Cache size estimation result
 */
export interface CacheSizeEstimate {
  totalTiles: number;
  tilesByZoom: Map<number, number>;
  estimatedBytes: number;
  formattedSize: string;
  bounds: BoundingBox;
  recommendedZoom: { min: number; max: number };
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalTiles: number;
  totalSize: number;
  formattedSize: string;
  tripCaches: Array<{
    tripId: string;
    tileCount: number;
    cachedAt: Date;
    size: number;
  }>;
}

// Cache name constant
const CACHE_NAME = 'map-tiles-v1';

// IndexedDB database name and store
const DB_NAME = 'travel-life-offline';
const METADATA_STORE = 'mapCacheMetadata';

/**
 * Open IndexedDB for metadata storage
 */
async function openMetadataDB(): Promise<IDBDatabase> {
  // Never at a fixed version: the database is shared with lib/offlineDb.ts,
  // which may already have moved it past version 1. See lib/openIndexedDb.ts.
  return openDatabaseWithStore(DB_NAME, METADATA_STORE, (db) => {
    db.createObjectStore(METADATA_STORE, { keyPath: 'tripId' });
  });
}

/**
 * Get metadata for a trip's cached tiles
 */
async function getTripMetadata(tripId: string): Promise<TileCacheMetadata | null> {
  const db = await openMetadataDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(METADATA_STORE, 'readonly');
    const store = tx.objectStore(METADATA_STORE);
    const request = store.get(tripId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);

    tx.oncomplete = () => db.close();
  });
}

/**
 * Save metadata for a trip's cached tiles
 */
async function saveTripMetadata(metadata: TileCacheMetadata): Promise<void> {
  const db = await openMetadataDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(METADATA_STORE, 'readwrite');
    const store = tx.objectStore(METADATA_STORE);
    const request = store.put(metadata);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete metadata for a trip
 */
async function deleteTripMetadata(tripId: string): Promise<void> {
  const db = await openMetadataDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(METADATA_STORE, 'readwrite');
    const store = tx.objectStore(METADATA_STORE);
    const request = store.delete(tripId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();

    tx.oncomplete = () => db.close();
  });
}

/**
 * Get all trip metadata
 */
async function getAllTripMetadata(): Promise<TileCacheMetadata[]> {
  const db = await openMetadataDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(METADATA_STORE, 'readonly');
    const store = tx.objectStore(METADATA_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);

    tx.oncomplete = () => db.close();
  });
}

class MapTileCacheService {
  private tileUrlTemplate: string = OSM_TILE_URL;

  /**
   * Set the tile URL template to use for caching
   */
  setTileUrlTemplate(template: string): void {
    this.tileUrlTemplate = template;
  }

  /**
   * Calculate which tiles cover a bounding box at specified zoom levels
   */
  calculateTilesForBounds(
    bounds: BoundingBox,
    zoomLevels: { min: number; max: number }
  ): TileCoord[] {
    return getTilesForBounds(bounds, zoomLevels.min, zoomLevels.max);
  }

  /**
   * Estimate the cache size for a given area and zoom levels
   */
  estimateCacheSize(
    bounds: BoundingBox,
    zoomLevels: { min: number; max: number }
  ): CacheSizeEstimate {
    const tiles = this.calculateTilesForBounds(bounds, zoomLevels);
    const tilesByZoom = countTilesByZoom(tiles);
    const estimatedBytes = estimateDownloadSize(tiles.length);
    const recommendedZoom = getRecommendedZoomLevels(bounds);

    return {
      totalTiles: tiles.length,
      tilesByZoom,
      estimatedBytes,
      formattedSize: formatBytes(estimatedBytes),
      bounds,
      recommendedZoom,
    };
  }

  /**
   * Estimate cache size for a trip based on its locations
   */
  estimateCacheSizeForTrip(
    locations: CoordinateLocation[],
    options: { minZoom?: number; maxZoom?: number; bufferKm?: number } = {}
  ): CacheSizeEstimate {
    const { minZoom = 10, maxZoom = 16, bufferKm = 5 } = options;

    const bounds = calculateBufferedBounds(locations, bufferKm);
    return this.estimateCacheSize(bounds, { min: minZoom, max: maxZoom });
  }

  /**
   * Cache tiles for a specific bounding box
   */
  async cacheTilesForBounds(
    bounds: BoundingBox,
    zoomLevels: { min: number; max: number },
    onProgress?: (progress: CacheProgress) => void,
    options: Omit<CacheOptions, 'minZoom' | 'maxZoom'> = {}
  ): Promise<{ success: boolean; cached: number; failed: number; totalSize: number }> {
    const {
      tileUrlTemplate = this.tileUrlTemplate,
      fetchDelay = 50,
      concurrency = 4,
      skipCached = true,
      signal,
    } = options;

    const tiles = this.calculateTilesForBounds(bounds, zoomLevels);
    const cache = await caches.open(CACHE_NAME);

    let cached = 0;
    let failed = 0;
    let totalSize = 0;
    const estimatedTotalBytes = estimateDownloadSize(tiles.length);

    // Process tiles in batches for controlled concurrency
    for (let i = 0; i < tiles.length; i += concurrency) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const batch = tiles.slice(i, i + concurrency);

      const results = await Promise.allSettled(
        batch.map(async (tile) => {
          const cacheKey = getTileCacheKey(tile);
          const url = getTileUrl(tile, tileUrlTemplate);

          // Check if already cached
          if (skipCached) {
            const existing = await cache.match(cacheKey);
            if (existing) {
              return { skipped: true, size: 0 };
            }
          }

          // Fetch the tile
          const response = await fetch(url, { signal });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          // Clone response to get size and cache
          const responseClone = response.clone();
          const blob = await response.blob();
          const size = blob.size;

          // Store in cache with our key format
          await cache.put(cacheKey, responseClone);

          return { skipped: false, size };
        })
      );

      // Process results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (!result.value.skipped) {
            cached++;
            totalSize += result.value.size;
          }
        } else {
          failed++;
          console.warn('Failed to cache tile:', result.reason);
        }
      }

      // Report progress
      if (onProgress) {
        const current = Math.min(i + concurrency, tiles.length);
        onProgress({
          current,
          total: tiles.length,
          percentage: Math.round((current / tiles.length) * 100),
          currentTile: batch[0],
          bytesDownloaded: totalSize,
          estimatedTotalBytes,
          failed,
        });
      }

      // Rate limiting delay
      if (i + concurrency < tiles.length && fetchDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, fetchDelay));
      }
    }

    return { success: failed === 0, cached, failed, totalSize };
  }

  /**
   * Cache tiles for a trip based on its locations
   */
  async cacheTilesForTrip(
    tripId: string,
    locations: CoordinateLocation[],
    onProgress?: (progress: CacheProgress) => void,
    options: CacheOptions = {}
  ): Promise<{ success: boolean; cached: number; failed: number; totalSize: number }> {
    const { minZoom = 10, maxZoom = 16, bufferKm = 5 } = options;

    // Calculate bounds from locations
    const bounds = calculateBufferedBounds(locations, bufferKm);
    const zoomLevels = { min: minZoom, max: maxZoom };

    // Cache the tiles
    const result = await this.cacheTilesForBounds(bounds, zoomLevels, onProgress, options);

    // Save metadata
    if (result.success || result.cached > 0) {
      const tiles = this.calculateTilesForBounds(bounds, zoomLevels);
      const metadata: TileCacheMetadata = {
        tripId,
        tiles,
        cachedAt: Date.now(),
        totalSize: result.totalSize,
        bounds,
        zoomLevels,
      };
      await saveTripMetadata(metadata);
    }

    return result;
  }

  /**
   * Get a cached tile by coordinates
   */
  async getTileFromCache(z: number, x: number, y: number): Promise<Response | null> {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = getTileCacheKey({ z, x, y });
    const response = await cache.match(cacheKey);
    return response || null;
  }

  /**
   * Check if a tile is cached
   */
  async isTileCached(z: number, x: number, y: number): Promise<boolean> {
    const response = await this.getTileFromCache(z, x, y);
    return response !== null;
  }

  /**
   * Clear cached tiles for a specific trip
   */
  async clearTripTiles(tripId: string): Promise<void> {
    const metadata = await getTripMetadata(tripId);
    if (!metadata) return;

    const cache = await caches.open(CACHE_NAME);

    // Delete each tile from cache
    for (const tile of metadata.tiles) {
      const cacheKey = getTileCacheKey(tile);
      await cache.delete(cacheKey);
    }

    // Delete metadata
    await deleteTripMetadata(tripId);
  }

  /**
   * Get count of cached tiles
   */
  async getCachedTileCount(): Promise<number> {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return keys.length;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    const allMetadata = await getAllTripMetadata();
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();

    const totalTiles = keys.length;
    let totalSize = 0;

    // Calculate total size from metadata
    for (const metadata of allMetadata) {
      totalSize += metadata.totalSize;
    }

    // If no metadata but tiles exist, estimate size
    if (totalSize === 0 && totalTiles > 0) {
      totalSize = totalTiles * AVERAGE_TILE_SIZE_BYTES;
    }

    const tripCaches = allMetadata.map((m) => ({
      tripId: m.tripId,
      tileCount: m.tiles.length,
      cachedAt: new Date(m.cachedAt),
      size: m.totalSize,
    }));

    return {
      totalTiles,
      totalSize,
      formattedSize: formatBytes(totalSize),
      tripCaches,
    };
  }

  /**
   * Get metadata for a trip's cache
   */
  async getTripCacheMetadata(tripId: string): Promise<TileCacheMetadata | null> {
    return getTripMetadata(tripId);
  }

  /**
   * Check if a trip has cached tiles
   */
  async hasTripCache(tripId: string): Promise<boolean> {
    const metadata = await getTripMetadata(tripId);
    return metadata !== null;
  }

  /**
   * Clear all cached tiles
   */
  async clearAllTiles(): Promise<void> {
    // Delete the entire cache
    await caches.delete(CACHE_NAME);

    // Clear all metadata
    const allMetadata = await getAllTripMetadata();
    for (const metadata of allMetadata) {
      await deleteTripMetadata(metadata.tripId);
    }
  }

  /**
   * Check if tiles for a bounds are cached
   */
  async hasCachedTilesForBounds(
    bounds: BoundingBox,
    zoomLevel: number
  ): Promise<{ cached: number; total: number; percentage: number }> {
    const tiles = this.calculateTilesForBounds(bounds, { min: zoomLevel, max: zoomLevel });

    let cached = 0;
    for (const tile of tiles) {
      if (await this.isTileCached(tile.z, tile.x, tile.y)) {
        cached++;
      }
    }

    return {
      cached,
      total: tiles.length,
      percentage: tiles.length > 0 ? Math.round((cached / tiles.length) * 100) : 0,
    };
  }

  /**
   * Get tile URL for offline-aware loading
   * Returns a blob URL if cached, otherwise the original URL
   */
  async getOfflineAwareTileUrl(z: number, x: number, y: number): Promise<string> {
    const cached = await this.getTileFromCache(z, x, y);

    if (cached) {
      const blob = await cached.blob();
      return URL.createObjectURL(blob);
    }

    return getTileUrl({ z, x, y }, this.tileUrlTemplate);
  }
}

// Export singleton instance
export const mapTileCacheService = new MapTileCacheService();

// Export class for testing
export { MapTileCacheService };
