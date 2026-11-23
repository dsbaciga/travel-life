/**
 * Offline Map Hook
 *
 * Provides offline-aware map tile loading functionality.
 * Checks cache first before fetching from network.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import type { CacheProgress } from '../services/mapTileCache.service';
import { mapTileCacheService } from '../services/mapTileCache.service';
import type { BoundingBox, CoordinateLocation } from '../lib/tileUtils';
import { calculateBufferedBounds } from '../lib/tileUtils';

/**
 * Hook return type
 */
export interface UseOfflineMapReturn {
  /** Whether the device is currently offline */
  isOffline: boolean;

  /** Whether the device has a slow connection */
  isSlowConnection: boolean;

  /**
   * Get a cached tile, returns null if not cached
   */
  getCachedTile: (z: number, x: number, y: number) => Promise<Response | null>;

  /**
   * Check if an area has cached tiles
   */
  hasCachedTiles: (bounds: BoundingBox, zoom?: number) => Promise<boolean>;

  /**
   * Get cache coverage for a bounds at specific zoom
   */
  getCacheCoverage: (
    bounds: BoundingBox,
    zoom: number
  ) => Promise<{ cached: number; total: number; percentage: number }>;

  /**
   * Check if a specific tile is cached
   */
  isTileCached: (z: number, x: number, y: number) => Promise<boolean>;

  /**
   * Get the count of cached tiles
   */
  cachedTileCount: number;

  /**
   * Loading state for cache count
   */
  isLoading: boolean;

  /**
   * Refresh cached tile count
   */
  refreshCacheCount: () => Promise<void>;

  /**
   * Create a custom tile layer source that checks cache first
   * Returns a function compatible with Leaflet's TileLayer
   */
  createCacheAwareTileUrl: (template: string) => (z: number, x: number, y: number) => string;
}

/**
 * Hook for offline-aware map functionality
 *
 * @example
 * ```tsx
 * const { isOffline, getCachedTile, hasCachedTiles } = useOfflineMap();
 *
 * // Check if map area is available offline
 * const hasOfflineData = await hasCachedTiles(tripBounds);
 *
 * // Get a cached tile
 * const tile = await getCachedTile(10, 512, 384);
 * ```
 */
export function useOfflineMap(): UseOfflineMapReturn {
  const { isOnline, isSlowConnection } = useNetworkStatus();
  const [cachedTileCount, setCachedTileCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Ref to track mounted state
  const isMountedRef = useRef(true);

  // Load cached tile count on mount
  useEffect(() => {
    isMountedRef.current = true;

    const loadCacheCount = async () => {
      try {
        const count = await mapTileCacheService.getCachedTileCount();
        if (isMountedRef.current) {
          setCachedTileCount(count);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to load cache count:', error);
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadCacheCount();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Refresh the cached tile count
   */
  const refreshCacheCount = useCallback(async () => {
    try {
      const count = await mapTileCacheService.getCachedTileCount();
      if (isMountedRef.current) {
        setCachedTileCount(count);
      }
    } catch (error) {
      console.error('Failed to refresh cache count:', error);
    }
  }, []);

  /**
   * Get a cached tile
   */
  const getCachedTile = useCallback(
    async (z: number, x: number, y: number): Promise<Response | null> => {
      return mapTileCacheService.getTileFromCache(z, x, y);
    },
    []
  );

  /**
   * Check if an area has cached tiles (at least 50% coverage at zoom 13)
   */
  const hasCachedTiles = useCallback(
    async (bounds: BoundingBox, zoom: number = 13): Promise<boolean> => {
      const coverage = await mapTileCacheService.hasCachedTilesForBounds(bounds, zoom);
      return coverage.percentage >= 50;
    },
    []
  );

  /**
   * Get cache coverage for a bounds
   */
  const getCacheCoverage = useCallback(
    async (
      bounds: BoundingBox,
      zoom: number
    ): Promise<{ cached: number; total: number; percentage: number }> => {
      return mapTileCacheService.hasCachedTilesForBounds(bounds, zoom);
    },
    []
  );

  /**
   * Check if a specific tile is cached
   */
  const isTileCached = useCallback(async (z: number, x: number, y: number): Promise<boolean> => {
    return mapTileCacheService.isTileCached(z, x, y);
  }, []);

  /**
   * Create a cache-aware tile URL function for Leaflet
   * Note: This is a synchronous function that returns a URL,
   * but the actual caching happens asynchronously in the background
   */
  const createCacheAwareTileUrl = useCallback(
    (template: string) => {
      return (z: number, x: number, y: number): string => {
        // Return the standard URL - Leaflet will handle loading
        // The service worker (when implemented) will intercept and check cache
        return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      };
    },
    []
  );

  return {
    isOffline: !isOnline,
    isSlowConnection,
    getCachedTile,
    hasCachedTiles,
    getCacheCoverage,
    isTileCached,
    cachedTileCount,
    isLoading,
    refreshCacheCount,
    createCacheAwareTileUrl,
  };
}

/**
 * Hook options for trip-specific offline map functionality
 */
export interface UseOfflineTripMapOptions {
  tripId: string;
  locations: CoordinateLocation[];
  bufferKm?: number;
}

/**
 * Return type for trip-specific offline map hook
 */
export interface UseOfflineTripMapReturn extends UseOfflineMapReturn {
  /** Whether this trip has cached map tiles */
  hasTripCache: boolean;

  /** Metadata about the trip's cached tiles */
  tripCacheInfo: {
    tileCount: number;
    cachedAt: Date | null;
    size: number;
  } | null;

  /** Calculated bounds for the trip */
  tripBounds: BoundingBox | null;

  /** Cache tiles for this trip */
  cacheTripTiles: (
    options?: {
      minZoom?: number;
      maxZoom?: number;
      onProgress?: (progress: CacheProgress) => void;
    }
  ) => Promise<{ success: boolean; cached: number; failed: number }>;

  /** Clear cached tiles for this trip */
  clearTripCache: () => Promise<void>;

  /** Loading state for trip cache info */
  isTripCacheLoading: boolean;

  /** Error if trip cache operation failed */
  tripCacheError: string | null;
}

/**
 * Hook for trip-specific offline map functionality
 *
 * @example
 * ```tsx
 * const {
 *   hasTripCache,
 *   tripCacheInfo,
 *   cacheTripTiles,
 *   clearTripCache
 * } = useOfflineTripMap({
 *   tripId: trip.id,
 *   locations: trip.locations
 * });
 *
 * // Cache tiles for this trip
 * await cacheTripTiles({
 *   minZoom: 10,
 *   maxZoom: 16,
 *   onProgress: (p) => setProgress(p.percentage)
 * });
 * ```
 */
export function useOfflineTripMap(options: UseOfflineTripMapOptions): UseOfflineTripMapReturn {
  const { tripId, locations, bufferKm = 5 } = options;

  const baseHook = useOfflineMap();
  const [hasTripCache, setHasTripCache] = useState(false);
  const [tripCacheInfo, setTripCacheInfo] = useState<{
    tileCount: number;
    cachedAt: Date | null;
    size: number;
  } | null>(null);
  const [tripBounds, setTripBounds] = useState<BoundingBox | null>(null);
  const [isTripCacheLoading, setIsTripCacheLoading] = useState(true);
  const [tripCacheError, setTripCacheError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  // Calculate bounds and load trip cache info
  useEffect(() => {
    isMountedRef.current = true;

    const loadTripCacheInfo = async () => {
      try {
        // Calculate bounds from locations
        const validLocations = locations.filter(
          (loc) =>
            loc.latitude !== null &&
            loc.longitude !== null &&
            !isNaN(Number(loc.latitude)) &&
            !isNaN(Number(loc.longitude))
        );

        if (validLocations.length > 0) {
          const bounds = calculateBufferedBounds(validLocations, bufferKm);
          if (isMountedRef.current) {
            setTripBounds(bounds);
          }
        }

        // Load cache metadata
        const metadata = await mapTileCacheService.getTripCacheMetadata(tripId);

        if (isMountedRef.current) {
          if (metadata) {
            setHasTripCache(true);
            setTripCacheInfo({
              tileCount: metadata.tiles.length,
              cachedAt: new Date(metadata.cachedAt),
              size: metadata.totalSize,
            });
          } else {
            setHasTripCache(false);
            setTripCacheInfo(null);
          }
          setIsTripCacheLoading(false);
        }
      } catch (error) {
        console.error('Failed to load trip cache info:', error);
        if (isMountedRef.current) {
          setTripCacheError(error instanceof Error ? error.message : 'Unknown error');
          setIsTripCacheLoading(false);
        }
      }
    };

    loadTripCacheInfo();

    return () => {
      isMountedRef.current = false;
    };
  }, [tripId, locations, bufferKm]);

  /**
   * Cache tiles for this trip
   */
  const cacheTripTiles = useCallback(
    async (
      cacheOptions?: {
        minZoom?: number;
        maxZoom?: number;
        onProgress?: (progress: CacheProgress) => void;
      }
    ): Promise<{ success: boolean; cached: number; failed: number }> => {
      setTripCacheError(null);

      try {
        const result = await mapTileCacheService.cacheTilesForTrip(
          tripId,
          locations,
          cacheOptions?.onProgress,
          {
            minZoom: cacheOptions?.minZoom,
            maxZoom: cacheOptions?.maxZoom,
          }
        );

        // Refresh trip cache info
        const metadata = await mapTileCacheService.getTripCacheMetadata(tripId);
        if (metadata && isMountedRef.current) {
          setHasTripCache(true);
          setTripCacheInfo({
            tileCount: metadata.tiles.length,
            cachedAt: new Date(metadata.cachedAt),
            size: metadata.totalSize,
          });
        }

        // Refresh base hook cache count
        await baseHook.refreshCacheCount();

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Couldn't cache tiles. Try again.";
        if (isMountedRef.current) {
          setTripCacheError(errorMessage);
        }
        throw error;
      }
    },
    [tripId, locations, baseHook]
  );

  /**
   * Clear cached tiles for this trip
   */
  const clearTripCache = useCallback(async (): Promise<void> => {
    setTripCacheError(null);

    try {
      await mapTileCacheService.clearTripTiles(tripId);

      if (isMountedRef.current) {
        setHasTripCache(false);
        setTripCacheInfo(null);
      }

      // Refresh base hook cache count
      await baseHook.refreshCacheCount();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Couldn't clear cache. Try again.";
      if (isMountedRef.current) {
        setTripCacheError(errorMessage);
      }
      throw error;
    }
  }, [tripId, baseHook]);

  return {
    ...baseHook,
    hasTripCache,
    tripCacheInfo,
    tripBounds,
    cacheTripTiles,
    clearTripCache,
    isTripCacheLoading,
    tripCacheError,
  };
}

export default useOfflineMap;
