/**
 * Offline Database Layer for Travel Life PWA
 *
 * This module provides IndexedDB storage for offline functionality.
 * Uses the 'idb' library for a Promise-based API.
 *
 * Database: travel-life-offline
 * Version: 1
 * Stores: 29 object stores covering all entity types
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, OpenDBCallbacks } from 'idb';
import type {
  TripStoreValue,
  LocationStoreValue,
  ActivityStoreValue,
  TransportationStoreValue,
  LodgingStoreValue,
  JournalStoreValue,
  PhotoStoreValue,
  PhotoAlbumStoreValue,
  EntityLinkStoreValue,
  TripTagStoreValue,
  TagAssignmentStoreValue,
  TravelCompanionStoreValue,
  TripCompanionStoreValue,
  ChecklistStoreValue,
  ChecklistItemStoreValue,
  LocationCategoryStoreValue,
  WeatherDataStoreValue,
  FlightTrackingStoreValue,
  DismissedValidationIssueStoreValue,
  EmergencyCardStoreValue,
  OfflineSession,
  SyncOperation,
  SyncConflict,
  MetadataEntry,
  SearchIndexEntry,
  IdMapping,
  LocalDraft,
  ImmichCacheEntry,
  VideoCacheEntry,
} from '../types/offline.types';

// ============================================
// DATABASE SCHEMA DEFINITION
// ============================================

/**
 * Complete IndexedDB schema for Travel Life offline storage.
 * Defines all object stores, their keys, values, and indexes.
 */
export interface TravelLifeDB extends DBSchema {
  // ============================================
  // CORE TRIP DATA (6 stores)
  // ============================================

  trips: {
    key: string;
    value: TripStoreValue;
    indexes: {
      'by-status': string;
      'by-date': string;
      'by-downloaded': string;
    };
  };

  locations: {
    key: string;
    value: LocationStoreValue;
    indexes: {
      'by-trip': string;
      'by-local-id': string;
    };
  };

  activities: {
    key: string;
    value: ActivityStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  transportation: {
    key: string;
    value: TransportationStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  lodging: {
    key: string;
    value: LodgingStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  journals: {
    key: string;
    value: JournalStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  // ============================================
  // PHOTO & MEDIA DATA (4 stores)
  // ============================================

  photos: {
    key: string;
    value: PhotoStoreValue;
    indexes: {
      'by-trip': string;
      'by-cached': string;
    };
  };

  photoAlbums: {
    key: string;
    value: PhotoAlbumStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  immichCache: {
    key: string;
    value: ImmichCacheEntry;
    indexes: {
      'by-expires': number;
    };
  };

  videoCache: {
    key: string;
    value: VideoCacheEntry;
    indexes: {
      'by-cached': number;
      'by-size': number;
    };
  };

  // ============================================
  // ENTITY RELATIONSHIPS (1 store)
  // ============================================

  entityLinks: {
    key: string;
    value: EntityLinkStoreValue;
    indexes: {
      'by-trip': string;
      'by-source': string;
      'by-target': string;
    };
  };

  // ============================================
  // TAGS & COMPANIONS (4 stores)
  // ============================================

  tripTags: {
    key: string;
    value: TripTagStoreValue;
    indexes: {
      'by-user': string;
    };
  };

  tagAssignments: {
    key: string;
    value: TagAssignmentStoreValue;
    indexes: {
      'by-trip': string;
      'by-tag': string;
    };
  };

  travelCompanions: {
    key: string;
    value: TravelCompanionStoreValue;
    indexes: {
      'by-user': string;
    };
  };

  tripCompanions: {
    key: string;
    value: TripCompanionStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  // ============================================
  // CHECKLISTS (2 stores)
  // ============================================

  checklists: {
    key: string;
    value: ChecklistStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  checklistItems: {
    key: string;
    value: ChecklistItemStoreValue;
    indexes: {
      'by-checklist': string;
    };
  };

  // ============================================
  // CATEGORIES (1 store)
  // ============================================

  locationCategories: {
    key: string;
    value: LocationCategoryStoreValue;
    indexes: {
      'by-user': string;
    };
  };

  // ============================================
  // WEATHER & FLIGHT DATA (2 stores)
  // ============================================

  weatherData: {
    key: string;
    value: WeatherDataStoreValue;
    indexes: {
      'by-trip': string;
      'by-location': string;
    };
  };

  flightTracking: {
    key: string;
    value: FlightTrackingStoreValue;
    indexes: {
      'by-transportation': string;
    };
  };

  // ============================================
  // VALIDATION (1 store)
  // ============================================

  dismissedValidationIssues: {
    key: string;
    value: DismissedValidationIssueStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  // ============================================
  // EMERGENCY CARD (1 store)
  // ============================================

  emergencyCards: {
    key: string;
    value: EmergencyCardStoreValue;
    indexes: {
      'by-trip': string;
    };
  };

  // ============================================
  // OFFLINE SESSION & SYNC (4 stores)
  // ============================================

  offlineSession: {
    key: string;
    value: OfflineSession;
  };

  syncQueue: {
    key: number;
    value: SyncOperation;
    indexes: {
      'by-entity-type': string;
      'by-trip': string;
      'by-timestamp': number;
    };
  };

  syncConflicts: {
    key: number;
    value: SyncConflict;
    indexes: {
      'by-status': string;
      'by-entity-type': string;
    };
  };

  metadata: {
    key: string;
    value: MetadataEntry;
  };

  // ============================================
  // OFFLINE SEARCH (1 store)
  // ============================================

  searchIndex: {
    key: string;
    value: SearchIndexEntry;
    indexes: {
      'by-trip': string;
      'by-type': string;
    };
  };

  // ============================================
  // ID MAPPINGS (1 store)
  // ============================================

  idMappings: {
    key: string;
    value: IdMapping;
    indexes: {
      'by-server-id': string;
      'by-type': string;
    };
  };

  // ============================================
  // LOCAL DRAFTS (1 store)
  // ============================================

  localDrafts: {
    key: string;
    value: LocalDraft;
    indexes: {
      'by-entity-type': string;
      'by-trip': string;
      'by-status': string;
    };
  };
}

// ============================================
// DATABASE CONSTANTS
// ============================================

/** Database name */
export const DB_NAME = 'travel-life-offline';

/**
 * Minimum database version.
 *
 * This is a floor, not the version a given browser is on. `upgrade` only runs when
 * the version number changes, so bumping this is *not* how a newly added store
 * reaches a browser that already holds a database at this version — `getDb()`
 * compares the open database against `STORE_NAMES` and reopens one version higher
 * when anything is missing. See the repair block there.
 */
export const DB_VERSION = 1;

/** All valid store names in the database */
export type StoreNames =
  | 'trips'
  | 'locations'
  | 'activities'
  | 'transportation'
  | 'lodging'
  | 'journals'
  | 'photos'
  | 'photoAlbums'
  | 'immichCache'
  | 'videoCache'
  | 'entityLinks'
  | 'tripTags'
  | 'tagAssignments'
  | 'travelCompanions'
  | 'tripCompanions'
  | 'checklists'
  | 'checklistItems'
  | 'locationCategories'
  | 'weatherData'
  | 'flightTracking'
  | 'dismissedValidationIssues'
  | 'emergencyCards'
  | 'offlineSession'
  | 'syncQueue'
  | 'syncConflicts'
  | 'metadata'
  | 'searchIndex'
  | 'idMappings'
  | 'localDrafts';

/** List of all store names for verification */
export const STORE_NAMES: StoreNames[] = [
  // Core trip data
  'trips',
  'locations',
  'activities',
  'transportation',
  'lodging',
  'journals',
  // Photo & media
  'photos',
  'photoAlbums',
  'immichCache',
  'videoCache',
  // Entity relationships
  'entityLinks',
  // Tags & companions
  'tripTags',
  'tagAssignments',
  'travelCompanions',
  'tripCompanions',
  // Checklists
  'checklists',
  'checklistItems',
  // Categories
  'locationCategories',
  // Weather & flight
  'weatherData',
  'flightTracking',
  // Validation
  'dismissedValidationIssues',
  // Emergency card
  'emergencyCards',
  // Offline session & sync
  'offlineSession',
  'syncQueue',
  'syncConflicts',
  'metadata',
  // Search
  'searchIndex',
  // ID mappings
  'idMappings',
  // Drafts
  'localDrafts',
];

// ============================================
// DATABASE INSTANCE MANAGEMENT
// ============================================

/** Singleton database instance */
let dbInstance: IDBPDatabase<TravelLifeDB> | null = null;

/** Flag to track if database is being opened */
let isOpening = false;

/** Queue of callbacks waiting for database */
const openCallbacks: Array<{
  resolve: (db: IDBPDatabase<TravelLifeDB>) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Gets the IndexedDB database instance.
 * Creates and initializes the database if it doesn't exist.
 * Returns a singleton instance for the lifetime of the app.
 *
 * @returns Promise resolving to the database instance
 * @throws Error if database cannot be opened
 */
export async function getDb(): Promise<IDBPDatabase<TravelLifeDB>> {
  // Return existing instance if available
  if (dbInstance) {
    return dbInstance;
  }

  // If already opening, wait for it
  if (isOpening) {
    return new Promise((resolve, reject) => {
      openCallbacks.push({ resolve, reject });
    });
  }

  isOpening = true;

  try {
    // Shared by the initial open and the repair reopen below. `upgrade` is
    // idempotent — every store is guarded by an `objectStoreNames` check — so
    // re-running it at a higher version creates only the missing stores and
    // leaves existing stores and their data untouched.
    const callbacks: OpenDBCallbacks<TravelLifeDB> = {
      upgrade(db, oldVersion, newVersion) {
        console.log(`[OfflineDB] Upgrading from v${oldVersion} to v${newVersion}`);

        // ========================================
        // CORE TRIP DATA (6 stores)
        // ========================================

        // Trips store
        if (!db.objectStoreNames.contains('trips')) {
          const tripStore = db.createObjectStore('trips', { keyPath: 'id' });
          tripStore.createIndex('by-status', 'data.status');
          tripStore.createIndex('by-date', 'data.startDate');
          tripStore.createIndex('by-downloaded', 'downloadedForOffline');
        }

        // Locations store
        if (!db.objectStoreNames.contains('locations')) {
          const locationStore = db.createObjectStore('locations', { keyPath: 'id' });
          locationStore.createIndex('by-trip', 'tripId');
          locationStore.createIndex('by-local-id', 'localId');
        }

        // Activities store
        if (!db.objectStoreNames.contains('activities')) {
          const activityStore = db.createObjectStore('activities', { keyPath: 'id' });
          activityStore.createIndex('by-trip', 'tripId');
        }

        // Transportation store
        if (!db.objectStoreNames.contains('transportation')) {
          const transportStore = db.createObjectStore('transportation', { keyPath: 'id' });
          transportStore.createIndex('by-trip', 'tripId');
        }

        // Lodging store
        if (!db.objectStoreNames.contains('lodging')) {
          const lodgingStore = db.createObjectStore('lodging', { keyPath: 'id' });
          lodgingStore.createIndex('by-trip', 'tripId');
        }

        // Journals store
        if (!db.objectStoreNames.contains('journals')) {
          const journalStore = db.createObjectStore('journals', { keyPath: 'id' });
          journalStore.createIndex('by-trip', 'tripId');
        }

        // ========================================
        // PHOTO & MEDIA DATA (4 stores)
        // ========================================

        // Photos store
        if (!db.objectStoreNames.contains('photos')) {
          const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
          photoStore.createIndex('by-trip', 'tripId');
          photoStore.createIndex('by-cached', 'thumbnailCached');
        }

        // Photo Albums store
        if (!db.objectStoreNames.contains('photoAlbums')) {
          const albumStore = db.createObjectStore('photoAlbums', { keyPath: 'id' });
          albumStore.createIndex('by-trip', 'tripId');
        }

        // Immich Cache store
        if (!db.objectStoreNames.contains('immichCache')) {
          const immichStore = db.createObjectStore('immichCache', { keyPath: 'id' });
          immichStore.createIndex('by-expires', 'expiresAt');
        }

        // Video Cache store
        if (!db.objectStoreNames.contains('videoCache')) {
          const videoStore = db.createObjectStore('videoCache', { keyPath: 'id' });
          videoStore.createIndex('by-cached', 'cachedAt');
          videoStore.createIndex('by-size', 'sizeBytes');
        }

        // ========================================
        // ENTITY RELATIONSHIPS (1 store)
        // ========================================

        // Entity Links store
        if (!db.objectStoreNames.contains('entityLinks')) {
          const linkStore = db.createObjectStore('entityLinks', { keyPath: 'id' });
          linkStore.createIndex('by-trip', 'tripId');
          linkStore.createIndex('by-source', 'data.sourceId');
          linkStore.createIndex('by-target', 'data.targetId');
        }

        // ========================================
        // TAGS & COMPANIONS (4 stores)
        // ========================================

        // Trip Tags store
        if (!db.objectStoreNames.contains('tripTags')) {
          const tagStore = db.createObjectStore('tripTags', { keyPath: 'id' });
          tagStore.createIndex('by-user', 'userId');
        }

        // Tag Assignments store
        if (!db.objectStoreNames.contains('tagAssignments')) {
          const assignStore = db.createObjectStore('tagAssignments', { keyPath: 'id' });
          assignStore.createIndex('by-trip', 'tripId');
          assignStore.createIndex('by-tag', 'tagId');
        }

        // Travel Companions store
        if (!db.objectStoreNames.contains('travelCompanions')) {
          const companionStore = db.createObjectStore('travelCompanions', { keyPath: 'id' });
          companionStore.createIndex('by-user', 'userId');
        }

        // Trip Companions store
        if (!db.objectStoreNames.contains('tripCompanions')) {
          const tcStore = db.createObjectStore('tripCompanions', { keyPath: 'id' });
          tcStore.createIndex('by-trip', 'tripId');
        }

        // ========================================
        // CHECKLISTS (2 stores)
        // ========================================

        // Checklists store
        if (!db.objectStoreNames.contains('checklists')) {
          const checklistStore = db.createObjectStore('checklists', { keyPath: 'id' });
          checklistStore.createIndex('by-trip', 'tripId');
        }

        // Checklist Items store
        if (!db.objectStoreNames.contains('checklistItems')) {
          const itemStore = db.createObjectStore('checklistItems', { keyPath: 'id' });
          itemStore.createIndex('by-checklist', 'checklistId');
        }

        // ========================================
        // CATEGORIES (1 store)
        // ========================================

        // Location Categories store
        if (!db.objectStoreNames.contains('locationCategories')) {
          const catStore = db.createObjectStore('locationCategories', { keyPath: 'id' });
          catStore.createIndex('by-user', 'userId');
        }

        // ========================================
        // WEATHER & FLIGHT DATA (2 stores)
        // ========================================

        // Weather Data store
        if (!db.objectStoreNames.contains('weatherData')) {
          const weatherStore = db.createObjectStore('weatherData', { keyPath: 'id' });
          weatherStore.createIndex('by-trip', 'tripId');
          weatherStore.createIndex('by-location', 'locationId');
        }

        // Flight Tracking store
        if (!db.objectStoreNames.contains('flightTracking')) {
          const flightStore = db.createObjectStore('flightTracking', { keyPath: 'id' });
          flightStore.createIndex('by-transportation', 'transportationId');
        }

        // ========================================
        // VALIDATION (1 store)
        // ========================================

        // Dismissed Validation Issues store
        if (!db.objectStoreNames.contains('dismissedValidationIssues')) {
          const dismissedStore = db.createObjectStore('dismissedValidationIssues', { keyPath: 'id' });
          dismissedStore.createIndex('by-trip', 'tripId');
        }

        // ========================================
        // EMERGENCY CARD (1 store)
        // ========================================

        // Emergency Cards store — one record per trip, keyed by trip ID.
        // Added after the initial store list, so existing browsers reach it via
        // the missing-store repair reopen in getDb() rather than a version bump.
        if (!db.objectStoreNames.contains('emergencyCards')) {
          const emergencyStore = db.createObjectStore('emergencyCards', { keyPath: 'id' });
          emergencyStore.createIndex('by-trip', 'tripId');
        }

        // ========================================
        // OFFLINE SESSION & SYNC (4 stores)
        // ========================================

        // Offline Session store
        if (!db.objectStoreNames.contains('offlineSession')) {
          db.createObjectStore('offlineSession', { keyPath: 'id' });
        }

        // Sync Queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('by-entity-type', 'entityType');
          syncStore.createIndex('by-trip', 'tripId');
          syncStore.createIndex('by-timestamp', 'timestamp');
        }

        // Sync Conflicts store
        if (!db.objectStoreNames.contains('syncConflicts')) {
          const conflictStore = db.createObjectStore('syncConflicts', { keyPath: 'id', autoIncrement: true });
          conflictStore.createIndex('by-status', 'status');
          conflictStore.createIndex('by-entity-type', 'entityType');
        }

        // Metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }

        // ========================================
        // OFFLINE SEARCH (1 store)
        // ========================================

        // Search Index store
        if (!db.objectStoreNames.contains('searchIndex')) {
          const searchStore = db.createObjectStore('searchIndex', { keyPath: 'id' });
          searchStore.createIndex('by-trip', 'tripId');
          searchStore.createIndex('by-type', 'entityType');
        }

        // ========================================
        // ID MAPPINGS (1 store)
        // ========================================

        // ID Mappings store (local ID -> server ID)
        if (!db.objectStoreNames.contains('idMappings')) {
          const mappingStore = db.createObjectStore('idMappings', { keyPath: 'localId' });
          mappingStore.createIndex('by-server-id', 'serverId');
          mappingStore.createIndex('by-type', 'entityType');
        }

        // ========================================
        // LOCAL DRAFTS (1 store)
        // ========================================

        // Local Drafts store
        if (!db.objectStoreNames.contains('localDrafts')) {
          const draftStore = db.createObjectStore('localDrafts', { keyPath: 'id' });
          draftStore.createIndex('by-entity-type', 'entityType');
          draftStore.createIndex('by-trip', 'tripId');
          draftStore.createIndex('by-status', 'status');
        }

        console.log(`[OfflineDB] Upgrade complete. Created ${db.objectStoreNames.length} stores.`);
      },

      blocked(currentVersion, blockedVersion) {
        console.warn(
          `[OfflineDB] Database upgrade blocked. Current: v${currentVersion}, Blocked: v${blockedVersion}`,
          'Please close other tabs using this app.'
        );
        // Emit custom event for UI to show notification
        window.dispatchEvent(
          new CustomEvent('offlinedb-blocked', {
            detail: { currentVersion, blockedVersion },
          })
        );
      },

      blocking(currentVersion, blockedVersion) {
        console.warn(
          `[OfflineDB] This tab is blocking a database upgrade. Current: v${currentVersion}, Blocked: v${blockedVersion}`
        );
        // Close our connection to allow the upgrade in other tab
        if (dbInstance) {
          dbInstance.close();
          dbInstance = null;
        }
        // Emit custom event for UI to show notification
        window.dispatchEvent(
          new CustomEvent('offlinedb-blocking', {
            detail: { currentVersion, blockedVersion },
          })
        );
      },

      terminated() {
        console.error('[OfflineDB] Database connection terminated unexpectedly.');
        dbInstance = null;
        // Emit custom event for UI to show error
        window.dispatchEvent(new CustomEvent('offlinedb-terminated'));
      },
    };

    let db: IDBPDatabase<TravelLifeDB>;
    try {
      db = await openDB<TravelLifeDB>(DB_NAME, DB_VERSION, callbacks);
    } catch (error) {
      // The repair below (and lib/openIndexedDb.ts) raises the stored version
      // past DB_VERSION. Asking for DB_VERSION again then fails with
      // VersionError on every later page load, which took the whole offline
      // database out of service for that browser. Open what is there instead;
      // the missing-store check that follows still applies.
      if (!(error instanceof DOMException) || error.name !== 'VersionError') {
        throw error;
      }
      db = await openDB<TravelLifeDB>(DB_NAME, undefined, callbacks);
    }

    // A browser that created this database from an older store list keeps that
    // list forever: `upgrade` runs only when the version number changes, so a
    // store added later is absent and every transaction naming it throws
    // NotFoundError ("One of the specified object stores was not found") for the
    // life of that profile. Reopening one version higher re-runs `upgrade`, which
    // creates exactly the missing stores and preserves the existing data.
    const missingStores = STORE_NAMES.filter((name) => !db.objectStoreNames.contains(name));
    if (missingStores.length > 0) {
      const repairVersion = db.version + 1;
      console.warn(
        `[OfflineDB] Database is missing ${missingStores.length} store(s): ${missingStores.join(', ')}. ` +
          `Reopening at v${repairVersion} to create them.`
      );
      db.close();
      db = await openDB<TravelLifeDB>(DB_NAME, repairVersion, callbacks);
    }

    dbInstance = db;

    // Resolve any waiting callbacks
    for (const callback of openCallbacks) {
      callback.resolve(db);
    }
    openCallbacks.length = 0;

    console.log(`[OfflineDB] Database opened successfully. Version: ${db.version}`);
    return db;
  } catch (error) {
    // Reject any waiting callbacks
    for (const callback of openCallbacks) {
      callback.reject(error as Error);
    }
    openCallbacks.length = 0;

    console.error('[OfflineDB] Failed to open database:', error);
    throw error;
  } finally {
    isOpening = false;
  }
}

/**
 * Closes the database connection.
 * Call this when the app is being unloaded or when you need to reset.
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('[OfflineDB] Database connection closed.');
  }
}

/**
 * Deletes the entire database.
 * WARNING: This will remove all offline data!
 *
 * @returns Promise resolving when database is deleted
 */
export async function deleteDb(): Promise<void> {
  closeDb();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => {
      console.log('[OfflineDB] Database deleted successfully.');
      resolve();
    };

    request.onerror = () => {
      console.error('[OfflineDB] Failed to delete database:', request.error);
      reject(request.error);
    };

    request.onblocked = () => {
      console.warn('[OfflineDB] Database deletion blocked. Close all other tabs using this app.');
      // Still resolve after a delay as the deletion will complete when tabs are closed
      setTimeout(resolve, 1000);
    };
  });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Checks if IndexedDB is supported in the current browser.
 *
 * @returns true if IndexedDB is available
 */
export function isIndexedDBSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Estimates the storage usage for the offline database.
 *
 * @returns Promise resolving to storage estimate or null if not supported
 */
export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      return await navigator.storage.estimate();
    } catch (error) {
      console.error('[OfflineDB] Failed to get storage estimate:', error);
      return null;
    }
  }
  return null;
}

/**
 * Requests persistent storage from the browser.
 * Helps prevent the browser from evicting offline data.
 *
 * @returns Promise resolving to true if persistence was granted
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log(`[OfflineDB] Persistent storage ${isPersisted ? 'granted' : 'denied'}.`);
      return isPersisted;
    } catch (error) {
      console.error('[OfflineDB] Failed to request persistent storage:', error);
      return false;
    }
  }
  return false;
}

/**
 * Gets the count of records in a specific store.
 *
 * @param storeName - Name of the object store
 * @returns Promise resolving to the record count
 */
export async function getStoreCount(storeName: StoreNames): Promise<number> {
  const db = await getDb();
  return db.count(storeName);
}

/**
 * Gets counts for all stores.
 *
 * @returns Promise resolving to an object with store names and counts
 */
export async function getAllStoreCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const counts: Record<string, number> = {};

  for (const storeName of STORE_NAMES) {
    try {
      counts[storeName] = await db.count(storeName);
    } catch {
      counts[storeName] = 0;
    }
  }

  return counts;
}

/**
 * Clears all data from a specific store.
 *
 * @param storeName - Name of the object store to clear
 */
export async function clearStore(storeName: StoreNames): Promise<void> {
  const db = await getDb();
  await db.clear(storeName);
  console.log(`[OfflineDB] Cleared store: ${storeName}`);
}

/**
 * Clears all data from all stores.
 * WARNING: This will remove all offline data!
 */
export async function clearAllStores(): Promise<void> {
  const db = await getDb();

  const tx = db.transaction(STORE_NAMES, 'readwrite');

  await Promise.all([
    ...STORE_NAMES.map((storeName) => tx.objectStore(storeName).clear()),
    tx.done,
  ]);

  console.log('[OfflineDB] Cleared all stores.');
}

/**
 * Verifies that all expected stores exist in the database.
 *
 * @returns Object with verification result and any missing stores
 */
export async function verifyStores(): Promise<{
  valid: boolean;
  storeCount: number;
  missingStores: string[];
}> {
  const db = await getDb();
  const existingStores = Array.from(db.objectStoreNames);
  const missingStores = STORE_NAMES.filter((name) => !existingStores.includes(name));

  return {
    valid: missingStores.length === 0,
    storeCount: existingStores.length,
    missingStores,
  };
}

// ============================================
// EXPORTS
// ============================================

// TravelLifeDB is already exported via the interface declaration above
