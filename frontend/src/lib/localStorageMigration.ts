/**
 * LocalStorage to IndexedDB Migration for PWA
 *
 * This module handles the one-time migration of draft data from localStorage
 * to IndexedDB for better offline support and larger storage capacity.
 */

import { openDatabaseWithStore } from './openIndexedDb';

// IndexedDB configuration
const DB_NAME = 'travel-life-offline';
const DRAFTS_STORE = 'localDrafts';
const MIGRATION_FLAG = 'pwa-migration-complete';

// Draft key patterns to look for in localStorage
const DRAFT_KEY_PATTERNS = [
  'travel-life-draft-',   // Main draft prefix from draftStorage.ts
  'draft-',               // Generic draft prefix
  'trip-form-',           // Trip forms
  'location-form-',       // Location forms
  'activity-form-',       // Activity forms
  'lodging-form-',        // Lodging forms
  'transportation-form-', // Transportation forms
  'journal-form-',        // Journal forms
];

// 24 hours in milliseconds (matching DRAFT_EXPIRY_HOURS from draftStorage.ts)
const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Structure for storing draft data in IndexedDB
 */
export interface DraftRecord {
  key: string;        // The draft key (e.g., 'trip-form-123')
  data: unknown;      // The draft data
  savedAt: number;    // Timestamp when saved
  expiresAt: number;  // Expiration timestamp
}

/**
 * Result of the migration operation
 */
export interface MigrationResult {
  draftsFound: number;
  draftsMigrated: number;
  errors: string[];
}

/**
 * Opens or creates the IndexedDB database with the drafts store
 */
function openDatabase(): Promise<IDBDatabase> {
  // Never at a fixed version: the database is shared with lib/offlineDb.ts,
  // which may already have moved it past version 1. See lib/openIndexedDb.ts.
  return openDatabaseWithStore(DB_NAME, DRAFTS_STORE, (db) => {
    const store = db.createObjectStore(DRAFTS_STORE, { keyPath: 'key' });
    store.createIndex('savedAt', 'savedAt', { unique: false });
    store.createIndex('expiresAt', 'expiresAt', { unique: false });
  });
}

/**
 * Checks if a localStorage key matches any of the draft patterns
 */
function isDraftKey(key: string): boolean {
  return DRAFT_KEY_PATTERNS.some(pattern => key.startsWith(pattern));
}

/**
 * Finds all draft keys in localStorage
 */
function findDraftKeysInLocalStorage(): string[] {
  const draftKeys: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isDraftKey(key)) {
        draftKeys.push(key);
      }
    }
  } catch (error) {
    console.warn('Error scanning localStorage:', error);
  }

  return draftKeys;
}

/**
 * Parses draft data from localStorage and converts to DraftRecord format
 */
function parseDraftFromLocalStorage(key: string): DraftRecord | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    const now = Date.now();

    // Handle the existing DraftData format from draftStorage.ts
    if (parsed.formData !== undefined && parsed.savedAt !== undefined) {
      const savedAt = parsed.savedAt;
      const expiresAt = savedAt + DRAFT_EXPIRY_MS;

      // Skip expired drafts
      if (now > expiresAt) {
        return null;
      }

      return {
        key,
        data: parsed.formData,
        savedAt,
        expiresAt,
      };
    }

    // Handle raw data format (no wrapper)
    return {
      key,
      data: parsed,
      savedAt: now,
      expiresAt: now + DRAFT_EXPIRY_MS,
    };
  } catch (error) {
    console.warn(`Failed to parse draft from localStorage for key "${key}":`, error);
    return null;
  }
}

/**
 * Saves a draft record to IndexedDB
 */
async function saveDraftToIndexedDB(db: IDBDatabase, record: DraftRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DRAFTS_STORE], 'readwrite');
    const store = transaction.objectStore(DRAFTS_STORE);
    const request = store.put(record);

    request.onerror = () => {
      reject(new Error(`Failed to save draft: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Checks if migration has already been completed
 */
export function isMigrationComplete(): boolean {
  try {
    return localStorage.getItem(MIGRATION_FLAG) === 'true';
  } catch {
    return false;
  }
}

/**
 * Marks migration as complete
 */
function setMigrationComplete(): void {
  try {
    localStorage.setItem(MIGRATION_FLAG, 'true');
  } catch (error) {
    console.warn('Failed to set migration flag:', error);
  }
}

/**
 * Removes a draft from localStorage after successful migration
 */
function removeDraftFromLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove draft "${key}" from localStorage:`, error);
  }
}

/**
 * Migrates all drafts from localStorage to IndexedDB
 *
 * This is a one-time migration that:
 * 1. Finds all draft keys in localStorage
 * 2. Parses and validates each draft
 * 3. Saves valid drafts to IndexedDB
 * 4. Removes migrated drafts from localStorage
 * 5. Sets a flag to prevent re-running
 *
 * @returns Migration result with counts and any errors
 */
export async function migrateFromLocalStorage(): Promise<MigrationResult> {
  const result: MigrationResult = {
    draftsFound: 0,
    draftsMigrated: 0,
    errors: [],
  };

  // Check if migration already completed
  if (isMigrationComplete()) {
    return result;
  }

  // Check if IndexedDB is available
  if (typeof indexedDB === 'undefined') {
    result.errors.push('IndexedDB is not available in this browser');
    return result;
  }

  // Find all draft keys
  const draftKeys = findDraftKeysInLocalStorage();
  result.draftsFound = draftKeys.length;

  if (draftKeys.length === 0) {
    // No drafts to migrate, mark as complete
    setMigrationComplete();
    return result;
  }

  let db: IDBDatabase | null = null;

  try {
    // Open the database
    db = await openDatabase();

    // Migrate each draft
    for (const key of draftKeys) {
      try {
        const record = parseDraftFromLocalStorage(key);

        if (record) {
          await saveDraftToIndexedDB(db, record);
          removeDraftFromLocalStorage(key);
          result.draftsMigrated++;
        } else {
          // Draft was expired or invalid, remove it
          removeDraftFromLocalStorage(key);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to migrate "${key}": ${errorMessage}`);
      }
    }

    // Mark migration as complete
    setMigrationComplete();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`Migration failed: ${errorMessage}`);
  } finally {
    if (db) {
      db.close();
    }
  }

  return result;
}

/**
 * Initializes PWA migration on app startup
 *
 * Call this in your app's initialization code (e.g., App.tsx or main.tsx)
 * to automatically migrate localStorage drafts to IndexedDB.
 *
 * @returns Migration result or null if already migrated
 */
export async function initializePWAMigration(): Promise<MigrationResult | null> {
  // Don't run if already migrated
  if (isMigrationComplete()) {
    return null;
  }

  try {
    const result = await migrateFromLocalStorage();

    if (result.draftsMigrated > 0) {
      console.log(
        `PWA Migration: Migrated ${result.draftsMigrated} of ${result.draftsFound} drafts to IndexedDB`
      );
    }

    if (result.errors.length > 0) {
      console.warn('PWA Migration errors:', result.errors);
    }

    return result;
  } catch (error) {
    console.error('PWA Migration failed:', error);
    return {
      draftsFound: 0,
      draftsMigrated: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Gets the IndexedDB database instance for draft operations
 *
 * This is used by the updated useAutoSaveDraft hook.
 */
export async function getDraftsDb(): Promise<IDBDatabase> {
  return openDatabase();
}

/**
 * Saves a draft to IndexedDB
 */
export async function saveDraftToDb(
  key: string,
  data: unknown,
  expiryMs: number = DRAFT_EXPIRY_MS
): Promise<void> {
  const now = Date.now();
  const record: DraftRecord = {
    key,
    data,
    savedAt: now,
    expiresAt: now + expiryMs,
  };

  const db = await openDatabase();
  try {
    await saveDraftToIndexedDB(db, record);
  } finally {
    db.close();
  }
}

/**
 * Loads a draft from IndexedDB
 */
export async function loadDraftFromDb(key: string): Promise<DraftRecord | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([DRAFTS_STORE], 'readonly');
      const store = transaction.objectStore(DRAFTS_STORE);
      const request = store.get(key);

      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to load draft: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        db.close();
        const record = request.result as DraftRecord | undefined;

        if (!record) {
          resolve(null);
          return;
        }

        // Check if expired
        if (Date.now() > record.expiresAt) {
          // Clean up expired draft
          clearDraftFromDb(key).catch(console.warn);
          resolve(null);
          return;
        }

        resolve(record);
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

/**
 * Clears a draft from IndexedDB
 */
export async function clearDraftFromDb(key: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([DRAFTS_STORE], 'readwrite');
      const store = transaction.objectStore(DRAFTS_STORE);
      const request = store.delete(key);

      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to clear draft: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        db.close();
        resolve();
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

/**
 * Clears all drafts for a specific trip from IndexedDB
 */
export async function clearAllDraftsForTripFromDb(tripId: string | number): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([DRAFTS_STORE], 'readwrite');
      const store = transaction.objectStore(DRAFTS_STORE);
      const request = store.openCursor();

      const keysToDelete: string[] = [];

      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to scan drafts: ${request.error?.message}`));
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          const record = cursor.value as DraftRecord;
          // Check if the key contains the trip ID
          if (record.key.includes(String(tripId))) {
            keysToDelete.push(record.key);
          }
          cursor.continue();
        } else {
          // Cursor finished, delete all matching keys
          Promise.all(
            keysToDelete.map(key => {
              return new Promise<void>((res, rej) => {
                const delRequest = store.delete(key);
                delRequest.onsuccess = () => res();
                delRequest.onerror = () => rej(delRequest.error);
              });
            })
          )
            .then(() => {
              db.close();
              resolve();
            })
            .catch(error => {
              db.close();
              reject(error);
            });
        }
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

/**
 * Cleans up all expired drafts from IndexedDB
 */
export async function cleanupExpiredDraftsFromDb(): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([DRAFTS_STORE], 'readwrite');
      const store = transaction.objectStore(DRAFTS_STORE);
      const index = store.index('expiresAt');
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      let deletedCount = 0;

      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to scan expired drafts: ${request.error?.message}`));
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          db.close();
          resolve(deletedCount);
        }
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
}

/**
 * Checks if IndexedDB is available and working
 */
export function isIndexedDBAvailable(): boolean {
  try {
    if (typeof indexedDB === 'undefined') {
      return false;
    }
    // Try to open a test database
    const testRequest = indexedDB.open('__test__', 1);
    testRequest.onsuccess = () => {
      testRequest.result.close();
      indexedDB.deleteDatabase('__test__');
    };
    return true;
  } catch {
    return false;
  }
}
