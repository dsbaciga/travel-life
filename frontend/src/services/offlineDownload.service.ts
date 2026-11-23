/**
 * Offline Download Service for Travel Life PWA
 *
 * Provides functionality to download trip data for offline access.
 * Handles metadata, photos, and map tiles with progress reporting.
 */

import { getDb, getStorageEstimate } from '../lib/offlineDb';
import { toStringId } from '../types/offline.types';
import tripService from './trip.service';
import locationService from './location.service';
import activityService from './activity.service';
import transportationService from './transportation.service';
import lodgingService from './lodging.service';
import journalEntryService from './journalEntry.service';
import checklistService from './checklist.service';
import photoService from './photo.service';
import entityLinkService from './entityLink.service';
import type { Trip } from '../types/trip';
import type { Location } from '../types/location';
import type { Activity } from '../types/activity';
import type { Transportation } from '../types/transportation';
import type { Lodging } from '../types/lodging';
import type { JournalEntry } from '../types/journalEntry';
import type { Photo, PhotoAlbum } from '../types/photo';
import type { Checklist } from '../types/checklist';
import type { EntityLink } from '../types/entityLink';

// ============================================
// TYPES
// ============================================

/**
 * Options for downloading a trip for offline access
 */
export interface DownloadOptions {
  /** Include full resolution photos (default: false) */
  includeFullPhotos: boolean;
  /** Include map tiles for the trip area (default: false) */
  includeMapTiles: boolean;
  /** Photo quality to download */
  photoQuality: 'thumbnail' | 'medium' | 'full';
}

/**
 * Progress information during download
 */
export interface DownloadProgress {
  /** Current phase of the download */
  phase: 'metadata' | 'photos' | 'maps' | 'complete';
  /** Current item number in the phase */
  current: number;
  /** Total items in the phase */
  total: number;
  /** Name of the current item being processed */
  currentItem?: string;
  /** Total bytes downloaded so far */
  bytesDownloaded: number;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
}

/**
 * Size estimation for a trip download
 */
export interface DownloadSizeEstimate {
  /** Metadata size in bytes (trip, locations, activities, etc.) */
  metadataSize: number;
  /** Thumbnail size in bytes */
  thumbnailSize: number;
  /** Full photo size in bytes (if requested) */
  fullPhotoSize: number;
  /** Map tiles size in bytes (if requested) */
  mapTilesSize: number;
  /** Total estimated size in bytes */
  totalSize: number;
  /** Photo count */
  photoCount: number;
  /** Location count (for map tiles estimation) */
  locationCount: number;
}

/**
 * Information about an offline-downloaded trip
 */
export interface OfflineTripInfo {
  /** Trip ID */
  tripId: number;
  /** Trip title */
  title: string;
  /** When the trip was downloaded */
  downloadedAt: Date;
  /** When the data was last synced */
  lastSyncedAt: Date;
  /** Whether the offline data is outdated */
  isOutdated: boolean;
  /** Size of offline data in bytes */
  sizeBytes: number;
  /** Number of photos cached */
  photosCached: number;
  /** Whether map tiles are cached */
  hasMapTiles: boolean;
}

/**
 * Offline download status for a trip
 */
export type OfflineDownloadStatus = 'not-downloaded' | 'downloading' | 'downloaded' | 'outdated';

// ============================================
// CONSTANTS
// ============================================

/** Average size estimates for different data types */
const SIZE_ESTIMATES = {
  /** Average trip metadata size */
  TRIP_METADATA: 5000,
  /** Average location size */
  LOCATION: 1500,
  /** Average activity size */
  ACTIVITY: 1200,
  /** Average transportation size */
  TRANSPORTATION: 2000,
  /** Average lodging size */
  LODGING: 1800,
  /** Average journal entry size */
  JOURNAL: 3000,
  /** Average checklist size */
  CHECKLIST: 1500,
  /** Average photo metadata size */
  PHOTO_METADATA: 500,
  /** Average thumbnail size */
  THUMBNAIL: 50000, // ~50KB
  /** Average medium resolution photo size */
  MEDIUM_PHOTO: 300000, // ~300KB
  /** Average full resolution photo size */
  FULL_PHOTO: 3000000, // ~3MB
  /** Average map tile size */
  MAP_TILE: 15000, // ~15KB
  /** Tiles per location (multiple zoom levels) */
  TILES_PER_LOCATION: 100,
  /** Entity link size */
  ENTITY_LINK: 200,
};

/** Key prefix for metadata storage */
const METADATA_KEYS = {
  DOWNLOAD_INFO: 'offline-download-',
  LAST_SYNC: 'offline-sync-',
};

// ============================================
// SERVICE CLASS
// ============================================

class OfflineDownloadService {
  /** Active download abort controllers */
  private activeDownloads: Map<number, AbortController> = new Map();

  /**
   * Estimates the download size for a trip
   */
  async estimateDownloadSize(tripId: number): Promise<DownloadSizeEstimate> {
    // Fetch trip data to count entities
    const [, locations, activities, transportation, lodging, journals, checklists, photosResult] =
      await Promise.all([
        tripService.getTripById(tripId),
        locationService.getLocationsByTrip(tripId),
        activityService.getActivitiesByTrip(tripId),
        transportationService.getTransportationByTrip(tripId),
        lodgingService.getLodgingByTrip(tripId),
        journalEntryService.getJournalEntriesByTrip(tripId),
        checklistService.getChecklistsByTripId(tripId),
        photoService.getPhotosByTrip(tripId, { take: 1 }), // Just get count
      ]);

    const photoCount = photosResult.total;
    const locationCount = locations.length;

    // Calculate metadata size
    const metadataSize =
      SIZE_ESTIMATES.TRIP_METADATA +
      locations.length * SIZE_ESTIMATES.LOCATION +
      activities.length * SIZE_ESTIMATES.ACTIVITY +
      transportation.length * SIZE_ESTIMATES.TRANSPORTATION +
      lodging.length * SIZE_ESTIMATES.LODGING +
      journals.length * SIZE_ESTIMATES.JOURNAL +
      checklists.length * SIZE_ESTIMATES.CHECKLIST +
      photoCount * SIZE_ESTIMATES.PHOTO_METADATA;

    // Calculate photo sizes
    const thumbnailSize = photoCount * SIZE_ESTIMATES.THUMBNAIL;
    const fullPhotoSize = photoCount * SIZE_ESTIMATES.FULL_PHOTO;

    // Calculate map tiles size (rough estimate based on location count and area)
    const mapTilesSize = locationCount * SIZE_ESTIMATES.TILES_PER_LOCATION * SIZE_ESTIMATES.MAP_TILE;

    return {
      metadataSize,
      thumbnailSize,
      fullPhotoSize,
      mapTilesSize,
      totalSize: metadataSize + thumbnailSize,
      photoCount,
      locationCount,
    };
  }

  /**
   * Downloads a trip for offline access
   */
  async downloadTripForOffline(
    tripId: number,
    options: DownloadOptions,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<void> {
    // Create abort controller for this download
    const abortController = new AbortController();
    this.activeDownloads.set(tripId, abortController);

    const db = await getDb();
    let bytesDownloaded = 0;
    const startTime = Date.now();

    try {
      // ========================================
      // PHASE 1: METADATA
      // ========================================
      onProgress({
        phase: 'metadata',
        current: 0,
        total: 8,
        currentItem: 'Trip details',
        bytesDownloaded,
      });

      // Check for abort
      if (abortController.signal.aborted) {
        throw new Error('Download cancelled');
      }

      // Download trip
      const trip = await tripService.getTripById(tripId);
      await this.cacheTripMetadata(db, trip);
      bytesDownloaded += SIZE_ESTIMATES.TRIP_METADATA;
      onProgress({
        phase: 'metadata',
        current: 1,
        total: 8,
        currentItem: 'Locations',
        bytesDownloaded,
      });

      // Download all related entities in parallel
      const [locations, activities, transportation, lodging, journals, checklists, entityLinks] =
        await Promise.all([
          locationService.getLocationsByTrip(tripId),
          activityService.getActivitiesByTrip(tripId),
          transportationService.getTransportationByTrip(tripId),
          lodgingService.getLodgingByTrip(tripId),
          journalEntryService.getJournalEntriesByTrip(tripId),
          checklistService.getChecklistsByTripId(tripId),
          entityLinkService.getTripLinks(tripId),
        ]);

      // Check for abort
      if (abortController.signal.aborted) {
        throw new Error('Download cancelled');
      }

      // Cache locations
      await this.cacheLocations(db, tripId, locations);
      bytesDownloaded += locations.length * SIZE_ESTIMATES.LOCATION;
      onProgress({
        phase: 'metadata',
        current: 2,
        total: 8,
        currentItem: 'Activities',
        bytesDownloaded,
      });

      // Cache activities
      await this.cacheActivities(db, tripId, activities);
      bytesDownloaded += activities.length * SIZE_ESTIMATES.ACTIVITY;
      onProgress({
        phase: 'metadata',
        current: 3,
        total: 8,
        currentItem: 'Transport',
        bytesDownloaded,
      });

      // Cache transportation
      await this.cacheTransportation(db, tripId, transportation);
      bytesDownloaded += transportation.length * SIZE_ESTIMATES.TRANSPORTATION;
      onProgress({
        phase: 'metadata',
        current: 4,
        total: 8,
        currentItem: 'Stays',
        bytesDownloaded,
      });

      // Cache lodging
      await this.cacheLodging(db, tripId, lodging);
      bytesDownloaded += lodging.length * SIZE_ESTIMATES.LODGING;
      onProgress({
        phase: 'metadata',
        current: 5,
        total: 8,
        currentItem: 'Journal entries',
        bytesDownloaded,
      });

      // Cache journals
      await this.cacheJournals(db, tripId, journals);
      bytesDownloaded += journals.length * SIZE_ESTIMATES.JOURNAL;
      onProgress({
        phase: 'metadata',
        current: 6,
        total: 8,
        currentItem: 'Checklists',
        bytesDownloaded,
      });

      // Cache checklists
      await this.cacheChecklists(db, tripId, checklists);
      bytesDownloaded += checklists.length * SIZE_ESTIMATES.CHECKLIST;
      onProgress({
        phase: 'metadata',
        current: 7,
        total: 8,
        currentItem: 'Entity links',
        bytesDownloaded,
      });

      // Cache entity links
      await this.cacheEntityLinks(db, tripId, entityLinks);
      bytesDownloaded += entityLinks.length * SIZE_ESTIMATES.ENTITY_LINK;
      onProgress({
        phase: 'metadata',
        current: 8,
        total: 8,
        currentItem: 'Completed',
        bytesDownloaded,
      });

      // ========================================
      // PHASE 2: PHOTOS
      // ========================================
      const photoQuality = options.includeFullPhotos ? 'full' : options.photoQuality;

      // Get all photos
      let allPhotos: Photo[] = [];
      let hasMore = true;
      let skip = 0;
      const take = 100;

      while (hasMore) {
        const result = await photoService.getPhotosByTrip(tripId, { skip, take });
        allPhotos = [...allPhotos, ...result.photos];
        hasMore = result.hasMore;
        skip += take;
      }

      if (allPhotos.length > 0) {
        onProgress({
          phase: 'photos',
          current: 0,
          total: allPhotos.length,
          currentItem: 'Preparing photos',
          bytesDownloaded,
        });

        for (let i = 0; i < allPhotos.length; i++) {
          // Check for abort
          if (abortController.signal.aborted) {
            throw new Error('Download cancelled');
          }

          const photo = allPhotos[i];
          const photoSize = await this.cachePhoto(db, tripId, photo, photoQuality);
          bytesDownloaded += photoSize;

          // Calculate estimated time remaining
          const elapsed = Date.now() - startTime;
          const progress = (i + 1) / allPhotos.length;
          const estimatedTotal = elapsed / progress;
          const estimatedRemaining = estimatedTotal - elapsed;

          onProgress({
            phase: 'photos',
            current: i + 1,
            total: allPhotos.length,
            currentItem: photo.caption || `Photo ${i + 1}`,
            bytesDownloaded,
            estimatedTimeRemaining: Math.round(estimatedRemaining),
          });
        }
      }

      // Also get photo albums
      const albumsResult = await photoService.getAlbumsByTrip(tripId);
      await this.cachePhotoAlbums(db, tripId, albumsResult.albums);

      // ========================================
      // PHASE 3: MAP TILES (if requested)
      // ========================================
      if (options.includeMapTiles && locations.length > 0) {
        onProgress({
          phase: 'maps',
          current: 0,
          total: locations.length,
          currentItem: 'Preparing map tiles',
          bytesDownloaded,
        });

        const tilesSize = await this.cacheMapTilesForTrip(
          tripId,
          locations,
          (current, total, locationName) => {
            onProgress({
              phase: 'maps',
              current,
              total,
              currentItem: locationName,
              bytesDownloaded,
            });
          }
        );
        bytesDownloaded += tilesSize;
      }

      // ========================================
      // FINALIZE
      // ========================================

      // Mark trip as downloaded
      const tripRecord = await db.get('trips', toStringId(tripId));
      if (tripRecord) {
        await db.put('trips', {
          ...tripRecord,
          downloadedForOffline: true,
        });
      }

      // Store download metadata
      const now = Date.now();
      await db.put('metadata', {
        key: `${METADATA_KEYS.DOWNLOAD_INFO}${tripId}`,
        value: {
          tripId,
          downloadedAt: now,
          lastSyncedAt: now,
          options,
          bytesDownloaded,
          photosCached: allPhotos.length,
          hasMapTiles: options.includeMapTiles,
        },
      });

      onProgress({
        phase: 'complete',
        current: 1,
        total: 1,
        bytesDownloaded,
      });
    } catch (error) {
      // Handle quota exceeded
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        // Rollback - remove partially downloaded data
        await this.removeOfflineTrip(tripId);
        throw new Error('Storage quota exceeded. Please free up space and try again.');
      }

      // Re-throw other errors
      throw error;
    } finally {
      // Clean up abort controller
      this.activeDownloads.delete(tripId);
    }
  }

  /**
   * Cancels an in-progress download
   */
  cancelDownload(tripId: number): void {
    const controller = this.activeDownloads.get(tripId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(tripId);
    }
  }

  /**
   * Checks if a trip is fully downloaded for offline
   */
  async isOfflineDownloaded(tripId: number): Promise<boolean> {
    const db = await getDb();
    const tripRecord = await db.get('trips', toStringId(tripId));
    return tripRecord?.downloadedForOffline === true;
  }

  /**
   * Gets the download status for a trip
   */
  async getOfflineStatus(tripId: number): Promise<OfflineDownloadStatus> {
    // Check if download is in progress
    if (this.activeDownloads.has(tripId)) {
      return 'downloading';
    }

    const db = await getDb();
    const tripRecord = await db.get('trips', toStringId(tripId));

    if (!tripRecord?.downloadedForOffline) {
      return 'not-downloaded';
    }

    // Check if data is outdated (more than 7 days old)
    const metadata = await db.get('metadata', `${METADATA_KEYS.DOWNLOAD_INFO}${tripId}`);
    if (metadata?.value) {
      const downloadInfo = metadata.value as { lastSyncedAt: number };
      const daysSinceSync = (Date.now() - downloadInfo.lastSyncedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceSync > 7) {
        return 'outdated';
      }
    }

    return 'downloaded';
  }

  /**
   * Removes a trip from offline storage
   */
  async removeOfflineTrip(tripId: number): Promise<void> {
    const db = await getDb();
    const tripIdStr = toStringId(tripId);

    // Remove from entity stores that have by-trip index
    const storesWithTripIndex: Array<'locations' | 'activities' | 'transportation' | 'lodging' | 'journals' | 'photos' | 'photoAlbums' | 'checklists' | 'entityLinks'> = [
      'locations',
      'activities',
      'transportation',
      'lodging',
      'journals',
      'photos',
      'photoAlbums',
      'checklists',
      'entityLinks',
    ];

    for (const store of storesWithTripIndex) {
      const items = await db.getAllFromIndex(store, 'by-trip', tripIdStr);
      for (const item of items) {
        await db.delete(store, item.id);
      }
    }

    // Handle checklistItems separately - they're indexed by checklist, not trip
    // Get all checklists for this trip, then delete their items
    const checklists = await db.getAllFromIndex('checklists', 'by-trip', tripIdStr);
    for (const checklist of checklists) {
      const items = await db.getAllFromIndex('checklistItems', 'by-checklist', checklist.id);
      for (const item of items) {
        await db.delete('checklistItems', item.id);
      }
    }

    // Clear photo cache for this trip
    try {
      const cache = await caches.open('photo-cache');
      const keys = await cache.keys();
      for (const request of keys) {
        if (request.url.includes(`/trip/${tripId}/`) || request.url.includes(`tripId=${tripId}`)) {
          await cache.delete(request);
        }
      }
    } catch (error) {
      console.warn('Failed to clear photo cache:', error);
    }

    // Clear map tile cache for this trip
    try {
      await caches.open('map-tiles');
      // Map tiles are cached by bounds, so we need to clear based on trip metadata
      // For simplicity, we'll leave this to manual cleanup or periodic purge
    } catch (error) {
      console.warn('Failed to clear map cache:', error);
    }

    // Update trip record
    const tripRecord = await db.get('trips', tripIdStr);
    if (tripRecord) {
      await db.put('trips', {
        ...tripRecord,
        downloadedForOffline: false,
      });
    }

    // Remove download metadata
    await db.delete('metadata', `${METADATA_KEYS.DOWNLOAD_INFO}${tripId}`);
  }

  /**
   * Gets all trips that are available offline
   */
  async getOfflineTrips(): Promise<OfflineTripInfo[]> {
    const db = await getDb();
    // Get all trips and filter for downloaded ones
    // (IndexedDB boolean indexes have type compatibility issues with idb library)
    const allTripRecords = await db.getAll('trips');
    const offlineTrips: OfflineTripInfo[] = [];

    for (const tripRecord of allTripRecords) {
      if (!tripRecord.downloadedForOffline) continue;

      const metadata = await db.get('metadata', `${METADATA_KEYS.DOWNLOAD_INFO}${tripRecord.id}`);
      const downloadInfo = metadata?.value as {
        downloadedAt: number;
        lastSyncedAt: number;
        bytesDownloaded: number;
        photosCached: number;
        hasMapTiles: boolean;
      } | undefined;

      const daysSinceSync = downloadInfo
        ? (Date.now() - downloadInfo.lastSyncedAt) / (1000 * 60 * 60 * 24)
        : 0;

      offlineTrips.push({
        tripId: parseInt(tripRecord.id),
        title: tripRecord.data.title,
        downloadedAt: new Date(downloadInfo?.downloadedAt || Date.now()),
        lastSyncedAt: new Date(downloadInfo?.lastSyncedAt || Date.now()),
        isOutdated: daysSinceSync > 7,
        sizeBytes: downloadInfo?.bytesDownloaded || 0,
        photosCached: downloadInfo?.photosCached || 0,
        hasMapTiles: downloadInfo?.hasMapTiles || false,
      });
    }

    return offlineTrips;
  }

  /**
   * Gets the current storage usage
   */
  async getStorageUsage(): Promise<{
    used: number;
    quota: number;
    percentUsed: number;
    tripCount: number;
    photoCount: number;
  }> {
    const estimate = await getStorageEstimate();
    const db = await getDb();

    const tripCount = await db.count('trips');
    const photoCount = await db.count('photos');

    return {
      used: estimate?.usage || 0,
      quota: estimate?.quota || 0,
      percentUsed: estimate ? ((estimate.usage || 0) / (estimate.quota || 1)) * 100 : 0,
      tripCount,
      photoCount,
    };
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private async cacheTripMetadata(
    db: Awaited<ReturnType<typeof getDb>>,
    trip: Trip
  ): Promise<void> {
    await db.put('trips', {
      id: toStringId(trip.id),
      data: trip,
      lastSync: Date.now(),
      version: 1,
      downloadedForOffline: false, // Will be set to true after complete download
    });
  }

  private async cacheLocations(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    locations: Location[]
  ): Promise<void> {
    const tx = db.transaction('locations', 'readwrite');
    for (const location of locations) {
      await tx.store.put({
        id: toStringId(location.id),
        tripId: toStringId(tripId),
        data: location,
        lastSync: Date.now(),
      });
    }
    await tx.done;
  }

  private async cacheActivities(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    activities: Activity[]
  ): Promise<void> {
    const tx = db.transaction('activities', 'readwrite');
    for (const activity of activities) {
      await tx.store.put({
        id: toStringId(activity.id),
        tripId: toStringId(tripId),
        data: activity,
        lastSync: Date.now(),
      });
    }
    await tx.done;
  }

  private async cacheTransportation(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    transportation: Transportation[]
  ): Promise<void> {
    const tx = db.transaction('transportation', 'readwrite');
    for (const transport of transportation) {
      await tx.store.put({
        id: toStringId(transport.id),
        tripId: toStringId(tripId),
        data: transport,
        lastSync: Date.now(),
      });
    }
    await tx.done;
  }

  private async cacheLodging(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    lodging: Lodging[]
  ): Promise<void> {
    const tx = db.transaction('lodging', 'readwrite');
    for (const lodge of lodging) {
      await tx.store.put({
        id: toStringId(lodge.id),
        tripId: toStringId(tripId),
        data: lodge,
        lastSync: Date.now(),
      });
    }
    await tx.done;
  }

  private async cacheJournals(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    journals: JournalEntry[]
  ): Promise<void> {
    const tx = db.transaction('journals', 'readwrite');
    for (const journal of journals) {
      await tx.store.put({
        id: toStringId(journal.id),
        tripId: toStringId(tripId),
        data: journal,
        lastSync: Date.now(),
      });
    }
    await tx.done;
  }

  private async cacheChecklists(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    checklists: Checklist[]
  ): Promise<void> {
    const checklistTx = db.transaction('checklists', 'readwrite');
    for (const checklist of checklists) {
      await checklistTx.store.put({
        id: toStringId(checklist.id),
        tripId: toStringId(tripId),
        data: checklist,
        lastSync: Date.now(),
      });
    }
    await checklistTx.done;

    // Cache checklist items
    const itemTx = db.transaction('checklistItems', 'readwrite');
    for (const checklist of checklists) {
      if (checklist.items) {
        for (const item of checklist.items) {
          await itemTx.store.put({
            id: toStringId(item.id),
            checklistId: toStringId(checklist.id),
            data: item,
            lastSync: Date.now(),
          });
        }
      }
    }
    await itemTx.done;
  }

  private async cacheEntityLinks(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    links: EntityLink[]
  ): Promise<void> {
    const tx = db.transaction('entityLinks', 'readwrite');
    for (const link of links) {
      await tx.store.put({
        id: toStringId(link.id),
        tripId: toStringId(tripId),
        data: link,
        lastSync: Date.now(),
      });
    }
    await tx.done;
  }

  private async cachePhotoAlbums(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    albums: PhotoAlbum[]
  ): Promise<void> {
    const tx = db.transaction('photoAlbums', 'readwrite');
    for (const album of albums) {
      await tx.store.put({
        id: toStringId(album.id),
        tripId: toStringId(tripId),
        data: album,
        lastSync: Date.now(),
      });
    }
    await tx.done;
  }

  private async cachePhoto(
    db: Awaited<ReturnType<typeof getDb>>,
    tripId: number,
    photo: Photo,
    quality: 'thumbnail' | 'medium' | 'full'
  ): Promise<number> {
    let bytesDownloaded = SIZE_ESTIMATES.PHOTO_METADATA;

    // Store photo metadata
    await db.put('photos', {
      id: toStringId(photo.id),
      tripId: toStringId(tripId),
      metadata: photo,
      thumbnailCached: false,
      fullCached: false,
      lastSync: Date.now(),
    });

    // Download and cache the photo image
    try {
      const cache = await caches.open('photo-cache');

      // Determine the URL based on photo source
      let photoUrl: string;
      if (photo.source === 'immich' && photo.immichAssetId) {
        // For Immich photos, use the proxy endpoint
        photoUrl = `/api/immich/asset/${photo.immichAssetId}/thumbnail`;
        if (quality === 'full') {
          photoUrl = `/api/immich/asset/${photo.immichAssetId}/original`;
        }
      } else if (photo.thumbnailPath) {
        // For local photos
        photoUrl = photo.thumbnailPath;
        if (quality === 'full' && photo.localPath) {
          photoUrl = photo.localPath;
        }
      } else {
        return bytesDownloaded;
      }

      // Fetch and cache the image
      const response = await fetch(photoUrl);
      if (response.ok) {
        const blob = await response.blob();
        await cache.put(photoUrl, new Response(blob));
        bytesDownloaded += blob.size;

        // Update the cached flag
        const photoRecord = await db.get('photos', toStringId(photo.id));
        if (photoRecord) {
          await db.put('photos', {
            ...photoRecord,
            thumbnailCached: true,
            fullCached: quality === 'full',
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to cache photo ${photo.id}:`, error);
    }

    return bytesDownloaded;
  }

  private async cacheMapTilesForTrip(
    _tripId: number,
    locations: Location[],
    onProgress: (current: number, total: number, locationName: string) => void
  ): Promise<number> {
    let totalSize = 0;

    // Calculate bounding box for all locations
    const validLocations = locations.filter(
      (loc) => loc.latitude !== null && loc.longitude !== null
    );

    if (validLocations.length === 0) {
      return 0;
    }

    // For each location, cache tiles at multiple zoom levels
    const zoomLevels = [10, 12, 14, 16]; // From overview to street level

    for (let i = 0; i < validLocations.length; i++) {
      const location = validLocations[i];
      onProgress(i + 1, validLocations.length, location.name);

      // Cache tiles around this location
      for (const zoom of zoomLevels) {
        const tiles = this.getTilesForLocation(
          location.latitude!,
          location.longitude!,
          zoom
        );

        for (const tile of tiles) {
          const size = await this.cacheTile(tile.x, tile.y, tile.z);
          totalSize += size;
        }
      }
    }

    return totalSize;
  }

  private getTilesForLocation(
    lat: number,
    lng: number,
    zoom: number
  ): Array<{ x: number; y: number; z: number }> {
    // Convert lat/lng to tile coordinates
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);

    // Get surrounding tiles (3x3 grid)
    const tiles: Array<{ x: number; y: number; z: number }> = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        tiles.push({ x: x + dx, y: y + dy, z: zoom });
      }
    }

    return tiles;
  }

  private async cacheTile(x: number, y: number, z: number): Promise<number> {
    try {
      const cache = await caches.open('map-tiles');
      const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

      // Check if already cached
      const cached = await cache.match(tileUrl);
      if (cached) {
        return 0; // Already cached
      }

      // Fetch and cache the tile
      const response = await fetch(tileUrl);
      if (response.ok) {
        const blob = await response.blob();
        await cache.put(tileUrl, new Response(blob));
        return blob.size;
      }
    } catch (error) {
      console.warn(`Failed to cache tile ${z}/${x}/${y}:`, error);
    }

    return 0;
  }
}

// Export singleton instance
export const offlineDownloadService = new OfflineDownloadService();
export default offlineDownloadService;
