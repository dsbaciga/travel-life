/**
 * Storage Manager Service for Travel Life PWA
 *
 * Provides storage analysis and cleanup functionality for offline data.
 * Works with IndexedDB, Cache API, and localStorage to track and manage storage.
 */

// ============================================
// TYPES
// ============================================

/**
 * Storage categories tracked by the service
 */
export type StorageCategory =
  | 'trips'
  | 'photoThumbnails'
  | 'photoFull'
  | 'mapTiles'
  | 'immichCache'
  | 'videoCache'
  | 'other';

/**
 * Storage breakdown by category
 */
export interface StorageBreakdown {
  trips: number;
  photoThumbnails: number;
  photoFull: number;
  mapTiles: number;
  immichCache: number;
  videoCache: number;
  other: number;
  total: number;
}

/**
 * Overall storage usage information
 */
export interface StorageUsage {
  used: number;
  quota: number;
  percentUsed: number;
  isPersisted: boolean;
}

/**
 * Information about cached trip data
 */
export interface CachedTripInfo {
  tripId: string;
  tripTitle: string;
  lastSynced: Date;
  size: number;
  photoCount: number;
  thumbnailsCached: number;
  fullPhotosCached: number;
}

/**
 * Information about oldest cached data for cleanup suggestions
 */
export interface OldDataInfo {
  category: StorageCategory;
  itemId: string;
  itemName: string;
  cachedAt: Date;
  size: number;
}

/**
 * Auto-cleanup settings
 */
export interface AutoCleanupSettings {
  enabled: boolean;
  maxAgeInDays: number;
  targetCategories: StorageCategory[];
}

// ============================================
// CONSTANTS
// ============================================

const DB_NAME = 'travel-life-offline';
const CACHE_NAMES = {
  photos: 'travel-life-photos',
  thumbnails: 'travel-life-thumbnails',
  mapTiles: 'travel-life-map-tiles',
  immich: 'travel-life-immich',
  videos: 'travel-life-videos',
};

const AUTO_CLEANUP_KEY = 'travel-life-auto-cleanup-settings';

// Default auto-cleanup settings
const DEFAULT_AUTO_CLEANUP: AutoCleanupSettings = {
  enabled: false,
  maxAgeInDays: 30,
  targetCategories: ['photoThumbnails', 'mapTiles', 'immichCache'],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Estimate size of a JavaScript object in bytes
 */
function estimateObjectSize(obj: unknown): number {
  const jsonString = JSON.stringify(obj);
  return new Blob([jsonString]).size;
}

/**
 * Get size of a Cache API cache
 */
async function getCacheSize(cacheName: string): Promise<number> {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    let totalSize = 0;

    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }

    return totalSize;
  } catch {
    // Cache doesn't exist or error accessing it
    return 0;
  }
}

/**
 * Get all entries from an IndexedDB store with their sizes
 */
async function getIndexedDBStoreSize(
  db: IDBDatabase,
  storeName: string
): Promise<number> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      let totalSize = 0;

      request.onsuccess = () => {
        const items = request.result;
        for (const item of items) {
          totalSize += estimateObjectSize(item);
        }
        resolve(totalSize);
      };

      request.onerror = () => {
        resolve(0);
      };
    } catch {
      resolve(0);
    }
  });
}

/**
 * Open the IndexedDB database
 */
async function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

// ============================================
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Get overall storage usage information
 */
async function getStorageUsage(): Promise<StorageUsage> {
  try {
    const estimate = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted();

    const used = estimate.usage || 0;
    const quota = estimate.quota || 0;

    return {
      used,
      quota,
      percentUsed: quota > 0 ? (used / quota) * 100 : 0,
      isPersisted: persisted,
    };
  } catch {
    return {
      used: 0,
      quota: 0,
      percentUsed: 0,
      isPersisted: false,
    };
  }
}

/**
 * Get detailed storage breakdown by category
 */
async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const breakdown: StorageBreakdown = {
    trips: 0,
    photoThumbnails: 0,
    photoFull: 0,
    mapTiles: 0,
    immichCache: 0,
    videoCache: 0,
    other: 0,
    total: 0,
  };

  // Get Cache API sizes
  const [thumbnailsSize, photosSize, mapTilesSize, immichSize, videosSize] =
    await Promise.all([
      getCacheSize(CACHE_NAMES.thumbnails),
      getCacheSize(CACHE_NAMES.photos),
      getCacheSize(CACHE_NAMES.mapTiles),
      getCacheSize(CACHE_NAMES.immich),
      getCacheSize(CACHE_NAMES.videos),
    ]);

  breakdown.photoThumbnails = thumbnailsSize;
  breakdown.photoFull = photosSize;
  breakdown.mapTiles = mapTilesSize;
  breakdown.immichCache = immichSize;
  breakdown.videoCache = videosSize;

  // Get IndexedDB sizes
  const db = await openDatabase();
  if (db) {
    const storeNames = Array.from(db.objectStoreNames);

    // Group stores by category
    const tripStores = ['trips', 'locations', 'activities', 'transportation', 'lodging', 'journals', 'checklists', 'checklistItems'];
    const photoMetadataStores = ['photos', 'albums'];
    const otherStores = storeNames.filter(
      (name) => !tripStores.includes(name) && !photoMetadataStores.includes(name)
    );

    // Calculate trip data size
    for (const storeName of tripStores) {
      if (storeNames.includes(storeName)) {
        breakdown.trips += await getIndexedDBStoreSize(db, storeName);
      }
    }

    // Photo metadata goes into trips category (small)
    for (const storeName of photoMetadataStores) {
      if (storeNames.includes(storeName)) {
        breakdown.trips += await getIndexedDBStoreSize(db, storeName);
      }
    }

    // Other IndexedDB data
    for (const storeName of otherStores) {
      breakdown.other += await getIndexedDBStoreSize(db, storeName);
    }

    db.close();
  }

  // Add localStorage size estimate
  try {
    let localStorageSize = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        localStorageSize += (localStorage[key]?.length || 0) * 2; // UTF-16 encoding
      }
    }
    breakdown.other += localStorageSize;
  } catch {
    // localStorage not available or quota exceeded
  }

  // Calculate total
  breakdown.total =
    breakdown.trips +
    breakdown.photoThumbnails +
    breakdown.photoFull +
    breakdown.mapTiles +
    breakdown.immichCache +
    breakdown.videoCache +
    breakdown.other;

  return breakdown;
}

/**
 * Get list of cached trips with their sizes
 */
async function getCachedTrips(): Promise<CachedTripInfo[]> {
  const trips: CachedTripInfo[] = [];

  const db = await openDatabase();
  if (!db) return trips;

  try {
    // Get all trips from IndexedDB
    const transaction = db.transaction('trips', 'readonly');
    const store = transaction.objectStore('trips');
    const request = store.getAll();

    await new Promise<void>((resolve) => {
      request.onsuccess = async () => {
        const tripRecords = request.result || [];

        for (const record of tripRecords) {
          const tripData = record.data || record;
          const tripId = String(record.id || tripData.id);

          // Calculate trip data size
          let size = estimateObjectSize(record);

          // Count photos for this trip
          let photoCount = 0;
          let thumbnailsCached = 0;
          let fullPhotosCached = 0;

          // Get photos from IndexedDB
          try {
            const photoTx = db.transaction('photos', 'readonly');
            const photoStore = photoTx.objectStore('photos');
            const photoIndex = photoStore.index('tripId');
            const photoRequest = photoIndex.getAll(tripId);

            await new Promise<void>((photoResolve) => {
              photoRequest.onsuccess = () => {
                const photos = photoRequest.result || [];
                photoCount = photos.length;

                for (const photo of photos) {
                  size += estimateObjectSize(photo);
                  if (photo.thumbnailCached) thumbnailsCached++;
                  if (photo.fullCached) fullPhotosCached++;
                }
                photoResolve();
              };
              photoRequest.onerror = () => photoResolve();
            });
          } catch {
            // Photos store might not have tripId index
          }

          trips.push({
            tripId,
            tripTitle: tripData.title || 'Untitled Trip',
            lastSynced: new Date(record.lastSync || Date.now()),
            size,
            photoCount,
            thumbnailsCached,
            fullPhotosCached,
          });
        }
        resolve();
      };
      request.onerror = () => resolve();
    });
  } finally {
    db.close();
  }

  // Sort by last synced (most recent first)
  trips.sort((a, b) => b.lastSynced.getTime() - a.lastSynced.getTime());

  return trips;
}

/**
 * Clear a specific storage category
 */
async function clearCategory(category: StorageCategory): Promise<void> {
  switch (category) {
    case 'photoThumbnails':
      await caches.delete(CACHE_NAMES.thumbnails);
      break;

    case 'photoFull':
      await caches.delete(CACHE_NAMES.photos);
      break;

    case 'mapTiles':
      await caches.delete(CACHE_NAMES.mapTiles);
      break;

    case 'immichCache': {
      await caches.delete(CACHE_NAMES.immich);
      // Also clear IndexedDB immich cache if exists
      const db = await openDatabase();
      if (db) {
        try {
          const transaction = db.transaction('immichCache', 'readwrite');
          const store = transaction.objectStore('immichCache');
          store.clear();
        } catch {
          // Store might not exist
        }
        db.close();
      }
      break;
    }

    case 'videoCache': {
      await caches.delete(CACHE_NAMES.videos);
      // Also clear IndexedDB video cache if exists
      const videoDb = await openDatabase();
      if (videoDb) {
        try {
          const transaction = videoDb.transaction('videoCache', 'readwrite');
          const store = transaction.objectStore('videoCache');
          store.clear();
        } catch {
          // Store might not exist
        }
        videoDb.close();
      }
      break;
    }

    case 'trips': {
      // Clear trip-related stores in IndexedDB
      const tripDb = await openDatabase();
      if (tripDb) {
        // NOTE: these must match the object store names created in
        // lib/offlineDb.ts (STORE_NAMES) exactly. db.transaction() throws
        // NotFoundError for an unknown store, so a typo here silently means
        // "that data is never cleared".
        const tripStores = [
          'trips',
          'locations',
          'activities',
          'transportation',
          'lodging',
          'journals',
          'photos',
          'photoAlbums',
          'checklists',
          'checklistItems',
          'entityLinks',
          'tripTags',
          'tagAssignments',
          'travelCompanions',
          'tripCompanions',
        ];

        for (const storeName of tripStores) {
          try {
            const transaction = tripDb.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            store.clear();
          } catch (error) {
            // Do not swallow: an unknown store name means data silently
            // survives a "clear" the user explicitly asked for.
            console.error(
              `[storageManager] Failed to clear IndexedDB store "${storeName}":`,
              error
            );
          }
        }
        tripDb.close();
      }
      break;
    }

    case 'other': {
      // Clear sync queue, drafts, and other metadata
      const otherDb = await openDatabase();
      if (otherDb) {
        // Names must match STORE_NAMES in lib/offlineDb.ts — see the note above.
        const otherStores = [
          'syncQueue',
          'syncConflicts',
          'idMappings',
          'localDrafts',
          'searchIndex',
          'metadata',
        ];

        for (const storeName of otherStores) {
          try {
            const transaction = otherDb.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            store.clear();
          } catch (error) {
            console.error(
              `[storageManager] Failed to clear IndexedDB store "${storeName}":`,
              error
            );
          }
        }
        otherDb.close();
      }

      // Clear localStorage items related to offline data
      const keysToRemove: string[] = [];
      for (const key in localStorage) {
        if (
          key.startsWith('travel-life-') &&
          !key.includes('auth') &&
          !key.includes('theme')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      break;
    }
  }
}

/**
 * Clear all offline data (complete reset)
 */
async function clearAllOfflineData(): Promise<void> {
  // Clear all Cache API caches
  await Promise.all([
    caches.delete(CACHE_NAMES.thumbnails),
    caches.delete(CACHE_NAMES.photos),
    caches.delete(CACHE_NAMES.mapTiles),
    caches.delete(CACHE_NAMES.immich),
    caches.delete(CACHE_NAMES.videos),
  ]);

  // Delete the entire IndexedDB database
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error("Couldn't delete IndexedDB. Try again."));
    request.onblocked = () => {
      // Database is in use, try to resolve anyway
      resolve();
    };
  });
}

/**
 * Clear data older than a specified age
 */
async function clearOldData(maxAgeInDays: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeInDays);
  const cutoffTime = cutoffDate.getTime();

  let freedBytes = 0;

  const db = await openDatabase();
  if (!db) return freedBytes;

  try {
    // Clear old sync queue entries
    if (db.objectStoreNames.contains('syncQueue')) {
      const transaction = db.transaction('syncQueue', 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.openCursor();

      await new Promise<void>((resolve) => {
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
          if (cursor) {
            const record = cursor.value;
            if (record.timestamp && record.timestamp < cutoffTime) {
              freedBytes += estimateObjectSize(record);
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => resolve();
      });
    }

    // Clear old drafts
    if (db.objectStoreNames.contains('localDrafts')) {
      const transaction = db.transaction('localDrafts', 'readwrite');
      const store = transaction.objectStore('localDrafts');
      const request = store.openCursor();

      await new Promise<void>((resolve) => {
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
          if (cursor) {
            const record = cursor.value;
            if (record.updatedAt && record.updatedAt < cutoffTime) {
              freedBytes += estimateObjectSize(record);
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => resolve();
      });
    }

    // Clear old Immich cache entries
    if (db.objectStoreNames.contains('immichCache')) {
      const transaction = db.transaction('immichCache', 'readwrite');
      const store = transaction.objectStore('immichCache');
      const request = store.openCursor();

      await new Promise<void>((resolve) => {
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
          if (cursor) {
            const record = cursor.value;
            if (record.cachedAt && record.cachedAt < cutoffTime) {
              freedBytes += estimateObjectSize(record);
              if (record.thumbnailBlob) freedBytes += record.thumbnailBlob.size || 0;
              if (record.fullBlob) freedBytes += record.fullBlob.size || 0;
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => resolve();
      });
    }
  } finally {
    db.close();
  }

  return freedBytes;
}

/**
 * Get oldest cached data for cleanup suggestions
 */
async function getOldestData(limit = 10): Promise<OldDataInfo[]> {
  const oldData: OldDataInfo[] = [];

  const db = await openDatabase();
  if (!db) return oldData;

  try {
    // Get old trip data
    if (db.objectStoreNames.contains('trips')) {
      const transaction = db.transaction('trips', 'readonly');
      const store = transaction.objectStore('trips');
      const request = store.getAll();

      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const trips = request.result || [];
          for (const trip of trips) {
            oldData.push({
              category: 'trips',
              itemId: String(trip.id),
              itemName: trip.data?.title || 'Untitled Trip',
              cachedAt: new Date(trip.lastSync || Date.now()),
              size: estimateObjectSize(trip),
            });
          }
          resolve();
        };
        request.onerror = () => resolve();
      });
    }

    // Get old Immich cache entries
    if (db.objectStoreNames.contains('immichCache')) {
      const transaction = db.transaction('immichCache', 'readonly');
      const store = transaction.objectStore('immichCache');
      const request = store.getAll();

      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const entries = request.result || [];
          for (const entry of entries) {
            let size = estimateObjectSize(entry);
            if (entry.thumbnailBlob) size += entry.thumbnailBlob.size || 0;
            if (entry.fullBlob) size += entry.fullBlob.size || 0;

            oldData.push({
              category: 'immichCache',
              itemId: entry.id,
              itemName: `Immich asset ${entry.id}`,
              cachedAt: new Date(entry.cachedAt || Date.now()),
              size,
            });
          }
          resolve();
        };
        request.onerror = () => resolve();
      });
    }

    // Get old video cache entries
    if (db.objectStoreNames.contains('videoCache')) {
      const transaction = db.transaction('videoCache', 'readonly');
      const store = transaction.objectStore('videoCache');
      const request = store.getAll();

      await new Promise<void>((resolve) => {
        request.onsuccess = () => {
          const entries = request.result || [];
          for (const entry of entries) {
            oldData.push({
              category: 'videoCache',
              itemId: entry.id,
              itemName: `Video ${entry.id}`,
              cachedAt: new Date(entry.cachedAt || Date.now()),
              size: entry.sizeBytes || estimateObjectSize(entry),
            });
          }
          resolve();
        };
        request.onerror = () => resolve();
      });
    }
  } finally {
    db.close();
  }

  // Sort by oldest first and limit
  oldData.sort((a, b) => a.cachedAt.getTime() - b.cachedAt.getTime());
  return oldData.slice(0, limit);
}

/**
 * Request persistent storage from the browser
 */
async function requestPersistentStorage(): Promise<boolean> {
  try {
    const result = await navigator.storage.persist();
    return result;
  } catch {
    return false;
  }
}

/**
 * Get auto-cleanup settings
 */
function getAutoCleanupSettings(): AutoCleanupSettings {
  try {
    const stored = localStorage.getItem(AUTO_CLEANUP_KEY);
    if (stored) {
      return { ...DEFAULT_AUTO_CLEANUP, ...JSON.parse(stored) };
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return DEFAULT_AUTO_CLEANUP;
}

/**
 * Save auto-cleanup settings
 */
function setAutoCleanupSettings(settings: Partial<AutoCleanupSettings>): void {
  const current = getAutoCleanupSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(AUTO_CLEANUP_KEY, JSON.stringify(updated));
}

/**
 * Clear data for a specific trip
 */
async function clearTripData(tripId: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  try {
    const stores = [
      'locations',
      'activities',
      'transportation',
      'lodging',
      'journals',
      'photos',
      'checklists',
      'checklistItems',
      'entityLinks',
    ];

    // Clear trip-scoped data
    for (const storeName of stores) {
      if (!db.objectStoreNames.contains(storeName)) continue;

      try {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);

        // Try to use tripId index if available
        if (store.indexNames.contains('tripId')) {
          const index = store.index('tripId');
          const request = index.openCursor(IDBKeyRange.only(tripId));

          await new Promise<void>((resolve) => {
            request.onsuccess = (event) => {
              const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
              if (cursor) {
                cursor.delete();
                cursor.continue();
              } else {
                resolve();
              }
            };
            request.onerror = () => resolve();
          });
        }
      } catch {
        // Store doesn't exist or error accessing it
      }
    }

    // Delete the trip itself
    if (db.objectStoreNames.contains('trips')) {
      const transaction = db.transaction('trips', 'readwrite');
      const store = transaction.objectStore('trips');
      store.delete(tripId);
    }
  } finally {
    db.close();
  }
}

// ============================================
// EXPORT SERVICE
// ============================================

export default {
  // Storage info
  getStorageUsage,
  getStorageBreakdown,
  getCachedTrips,
  getOldestData,

  // Cleanup operations
  clearCategory,
  clearAllOfflineData,
  clearOldData,
  clearTripData,

  // Persistent storage
  requestPersistentStorage,

  // Auto-cleanup settings
  getAutoCleanupSettings,
  setAutoCleanupSettings,

  // Utilities
  formatBytes,
};
