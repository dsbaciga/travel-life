/**
 * Opening the shared offline database from code that only needs one store.
 *
 * Several modules use the `travel-life-offline` database. `lib/offlineDb.ts`
 * owns most of its stores and, when it finds stores missing, reopens the
 * database one version higher to create them. From then on the database is at
 * version 2 or above, and any `indexedDB.open(name, 1)` fails forever with
 * `VersionError: The requested version (1) is less than the existing version`.
 *
 * So no caller may name a version. This helper opens whatever version exists
 * (creating version 1 when there is none) and, if the store the caller needs is
 * absent, reopens one version higher to add it — the same repair `offlineDb`
 * performs, which keeps the two compatible in either order.
 */

/**
 * Open `name` at its current version, making sure `storeName` exists.
 *
 * @param name - Database name
 * @param storeName - The object store the caller is about to use
 * @param createStore - Creates that store; called only inside an upgrade, and only when it is missing
 * @returns An open connection that closes itself if another tab needs to upgrade
 */
export function openDatabaseWithStore(
  name: string,
  storeName: string,
  createStore: (db: IDBDatabase) => void
): Promise<IDBDatabase> {
  const open = (version?: number): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);

      request.onerror = () =>
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message ?? 'unknown error'}`));
      request.onblocked = () =>
        reject(new Error('Failed to open IndexedDB: another tab is holding the database open'));

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          createStore(db);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        // Let another connection (this tab's offlineDb, or another tab) upgrade.
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });

  return open().then((db) => {
    if (db.objectStoreNames.contains(storeName)) return db;
    const nextVersion = db.version + 1;
    db.close();
    return open(nextVersion);
  });
}
