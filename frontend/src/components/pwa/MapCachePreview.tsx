/**
 * Map Cache Preview Component
 *
 * Provides a visual preview of the area that will be cached for offline use.
 * Shows tile counts, estimated download size, and zoom level options.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Rectangle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { BoundingBox, CoordinateLocation } from '../../lib/tileUtils';
import {
  calculateBufferedBounds,
  formatBytes,
  getBoundsCenter,
  getRecommendedZoomLevels,
  ZOOM_PRESETS,
} from '../../lib/tileUtils';
import type { CacheProgress, CacheSizeEstimate } from '../../services/mapTileCache.service';
import { mapTileCacheService } from '../../services/mapTileCache.service';
import { useMapTiles } from '../../hooks/useMapTiles';

/**
 * Props for MapCachePreview
 */
export interface MapCachePreviewProps {
  /** Locations to cache around */
  locations: CoordinateLocation[];
  /** Trip ID for caching */
  tripId: string;
  /** Buffer around locations in km (default: 5) */
  bufferKm?: number;
  /** Callback when caching completes */
  onCacheComplete?: (result: { cached: number; failed: number; totalSize: number }) => void;
  /** Callback when cache is cleared */
  onCacheClear?: () => void;
  /** Whether the trip already has cached tiles */
  hasCachedTiles?: boolean;
  /** Existing cache info */
  existingCacheInfo?: {
    tileCount: number;
    cachedAt: Date;
    size: number;
  } | null;
}

/**
 * Zoom level configuration
 */
interface ZoomConfig {
  id: keyof typeof ZOOM_PRESETS;
  label: string;
  description: string;
  minZoom: number;
  maxZoom: number;
}

const ZOOM_OPTIONS: ZoomConfig[] = [
  {
    id: 'CITY_OVERVIEW',
    label: 'City Overview',
    description: 'Zoom 10-12 (fastest)',
    minZoom: 10,
    maxZoom: 12,
  },
  {
    id: 'NEIGHBORHOOD',
    label: 'Neighborhood',
    description: 'Zoom 10-15 (recommended)',
    minZoom: 10,
    maxZoom: 15,
  },
  {
    id: 'STREET_LEVEL',
    label: 'Street Level',
    description: 'Zoom 10-17 (large download)',
    minZoom: 10,
    maxZoom: 17,
  },
];

/**
 * Component to update map bounds when they change
 */
function MapBoundsUpdater({ bounds }: { bounds: BoundingBox }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds([
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    ]);
  }, [map, bounds]);

  return null;
}

/**
 * Map Cache Preview Component
 */
export function MapCachePreview({
  locations,
  tripId,
  bufferKm = 5,
  onCacheComplete,
  onCacheClear,
  hasCachedTiles = false,
  existingCacheInfo = null,
}: MapCachePreviewProps) {
  const tileConfig = useMapTiles();
  const [selectedZoomConfig, setSelectedZoomConfig] = useState<ZoomConfig>(ZOOM_OPTIONS[1]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<CacheProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Calculate bounds from locations
  const bounds = useMemo(() => {
    try {
      return calculateBufferedBounds(locations, bufferKm);
    } catch {
      return null;
    }
  }, [locations, bufferKm]);

  // Calculate cache size estimate
  const sizeEstimate = useMemo((): CacheSizeEstimate | null => {
    if (!bounds) return null;
    return mapTileCacheService.estimateCacheSize(bounds, {
      min: selectedZoomConfig.minZoom,
      max: selectedZoomConfig.maxZoom,
    });
  }, [bounds, selectedZoomConfig]);

  // Get recommended zoom levels
  const recommendedZoom = useMemo(() => {
    if (!bounds) return null;
    return getRecommendedZoomLevels(bounds);
  }, [bounds]);

  // Get map center
  const mapCenter = useMemo(() => {
    if (!bounds) return { lat: 0, lng: 0 };
    return getBoundsCenter(bounds);
  }, [bounds]);

  /**
   * Handle download start
   */
  const handleDownload = useCallback(async () => {
    if (!bounds) return;

    setIsDownloading(true);
    setProgress(null);
    setError(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const result = await mapTileCacheService.cacheTilesForTrip(
        tripId,
        locations,
        (p) => setProgress(p),
        {
          minZoom: selectedZoomConfig.minZoom,
          maxZoom: selectedZoomConfig.maxZoom,
          bufferKm,
          signal: controller.signal,
        }
      );

      onCacheComplete?.(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Download cancelled');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to download tiles');
      }
    } finally {
      setIsDownloading(false);
      setAbortController(null);
    }
  }, [bounds, tripId, locations, selectedZoomConfig, bufferKm, onCacheComplete]);

  /**
   * Handle download cancel
   */
  const handleCancel = useCallback(() => {
    abortController?.abort();
  }, [abortController]);

  /**
   * Handle clear cache
   */
  const handleClearCache = useCallback(async () => {
    try {
      await mapTileCacheService.clearTripTiles(tripId);
      onCacheClear?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cache');
    }
  }, [tripId, onCacheClear]);

  // No valid locations
  if (!bounds) {
    return (
      <div className="card p-6">
        <div className="text-center text-gray-500 dark:text-dusk-400">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="mt-2 font-medium">No locations with coordinates</p>
          <p className="text-sm mt-1">Add locations with coordinates to enable map caching</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-dusk-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white font-body">
              Offline Map Cache
            </h3>
            <p className="text-sm text-gray-500 dark:text-dusk-400 mt-1">
              Download map tiles for offline access during your trip
            </p>
          </div>
          {hasCachedTiles && existingCacheInfo && (
            <div className="text-right">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Cached
              </span>
              <p className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                {existingCacheInfo.tileCount} tiles ({formatBytes(existingCacheInfo.size)})
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mini Map */}
      <div className="h-48 relative z-0">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={10}
          scrollWheelZoom={false}
          zoomControl={false}
          dragging={false}
          className="h-full w-full"
        >
          <TileLayer
            url={tileConfig.url}
            attribution=""
            maxZoom={tileConfig.maxZoom}
          />
          <MapBoundsUpdater bounds={bounds} />
          {/* Cache area rectangle */}
          <Rectangle
            bounds={[
              [bounds.south, bounds.west],
              [bounds.north, bounds.east],
            ]}
            pathOptions={{
              color: '#D97706',
              weight: 2,
              fillColor: '#FCD34D',
              fillOpacity: 0.2,
              dashArray: '5, 5',
            }}
          />
        </MapContainer>

        {/* Overlay badge */}
        <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 dark:bg-navy-800/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-dusk-300 shadow-sm">
          Cache coverage area
        </div>
      </div>

      {/* Zoom Level Selection */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-dusk-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-3">
          Detail Level
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ZOOM_OPTIONS.map((option) => {
            const isSelected = selectedZoomConfig.id === option.id;
            const estimate = mapTileCacheService.estimateCacheSize(bounds, {
              min: option.minZoom,
              max: option.maxZoom,
            });

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedZoomConfig(option)}
                disabled={isDownloading}
                className={`relative flex flex-col items-start p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-primary-500 dark:border-gold bg-primary-50 dark:bg-gold/10'
                    : 'border-gray-200 dark:border-dusk-700 hover:border-gray-300 dark:hover:border-dusk-600'
                } ${isDownloading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {/* Radio indicator */}
                <div className="absolute top-3 right-3">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? 'border-primary-500 dark:border-gold'
                        : 'border-gray-300 dark:border-dusk-600'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-primary-500 dark:bg-gold" />
                    )}
                  </div>
                </div>

                <span className="font-medium text-gray-900 dark:text-white">
                  {option.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-dusk-400 mt-1">
                  {option.description}
                </span>
                <span className="text-xs font-medium text-primary-600 dark:text-gold mt-2">
                  {estimate.totalTiles.toLocaleString()} tiles ({estimate.formattedSize})
                </span>
              </button>
            );
          })}
        </div>

        {/* Recommended zoom info */}
        {recommendedZoom && (
          <p className="text-xs text-gray-500 dark:text-dusk-400 mt-3">
            Based on your trip area, we recommend zoom levels {recommendedZoom.min}-{recommendedZoom.max}
          </p>
        )}
      </div>

      {/* Tile breakdown */}
      {sizeEstimate && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dusk-700 bg-gray-50 dark:bg-navy-900/50">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-dusk-400">Total tiles:</span>{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {sizeEstimate.totalTiles.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-dusk-400">Estimated size:</span>{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {sizeEstimate.formattedSize}
              </span>
            </div>
            <div className="hidden sm:block">
              <span className="text-gray-500 dark:text-dusk-400">Tiles by zoom:</span>{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {Array.from(sizeEstimate.tilesByZoom.entries())
                  .map(([zoom, count]) => `z${zoom}: ${count}`)
                  .join(', ')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {isDownloading && progress && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dusk-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-dusk-300">
              Downloading tiles...
            </span>
            <span className="text-sm text-gray-500 dark:text-dusk-400">
              {progress.current} / {progress.total} ({progress.percentage}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-dusk-700 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary-500 to-primary-600 dark:from-gold dark:to-accent-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-dusk-400">
            <span>{formatBytes(progress.bytesDownloaded)} downloaded</span>
            {progress.failed > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {progress.failed} failed
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-dusk-700 flex flex-wrap gap-3">
        {isDownloading ? (
          <button
            type="button"
            onClick={handleCancel}
            className="btn-secondary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel Download
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleDownload}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {hasCachedTiles ? 'Update Cache' : 'Download for Offline'}
            </button>

            {hasCachedTiles && (
              <button
                type="button"
                onClick={handleClearCache}
                className="btn-secondary text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              >
                <svg className="w-4 h-4 mr-2 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear Cache
              </button>
            )}
          </>
        )}
      </div>

      {/* Usage tips */}
      <div className="px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium">Offline Map Tips</p>
            <ul className="mt-1 list-disc list-inside text-xs space-y-1 opacity-80">
              <li>Higher detail levels require more storage space</li>
              <li>Tiles are stored in your browser's cache</li>
              <li>Map markers will still appear when offline</li>
              <li>Consider downloading on WiFi to save mobile data</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MapCachePreview;
