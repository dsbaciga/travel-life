/**
 * The offline database is opened by three modules. Once one of them had raised
 * its version, the others asked for version 1 and failed with VersionError on
 * every later page load, taking drafts, the sync queue and offline trips with it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import { openDatabaseWithStore } from './openIndexedDb';
import { getDb, closeDb, deleteDb, DB_NAME, DB_VERSION, STORE_NAMES } from './offlineDb';

const openMapMetadata = () =>
  openDatabaseWithStore(DB_NAME, 'mapCacheMetadata', (db) => {
    db.createObjectStore('mapCacheMetadata', { keyPath: 'tripId' });
  });

describe('opening the shared offline database', () => {
  beforeEach(async () => {
    closeDb();
    await deleteDb();
  });

  it('survives a reload after another module created the database first', async () => {
    // First page load: the map tile cache gets there first and creates the
    // database with only its own store...
    const early = await openMapMetadata();
    expect(early.version).toBe(1);
    early.close();

    // ...so the main module finds its stores missing and repairs one version up.
    const repaired = await getDb();
    expect(repaired.version).toBeGreaterThan(DB_VERSION);
    for (const store of STORE_NAMES) expect(repaired.objectStoreNames.contains(store)).toBe(true);
    closeDb();

    // Next page load. This is the open that used to throw VersionError.
    const reopened = await getDb();
    expect(reopened.version).toBe(repaired.version);
    expect(reopened.objectStoreNames.contains('mapCacheMetadata')).toBe(true);
    closeDb();

    // And the single-store openers must cope with the higher version too.
    const late = await openMapMetadata();
    expect(late.version).toBe(repaired.version);
    late.close();
  });

  it('adds a missing store without disturbing the ones already there', async () => {
    const main = await getDb();
    const before = main.version;
    await main.put('metadata', { key: 'probe', value: 'kept' } as never);
    closeDb();

    const withMetadata = await openMapMetadata();
    expect(withMetadata.objectStoreNames.contains('mapCacheMetadata')).toBe(true);
    expect(withMetadata.version).toBe(before + 1);
    withMetadata.close();

    const again = await getDb();
    expect(await again.get('metadata', 'probe')).toMatchObject({ value: 'kept' });
    closeDb();
  });

  it('opens an existing store without changing the version', async () => {
    const first = await openMapMetadata();
    const version = first.version;
    first.close();

    const second = await openMapMetadata();
    expect(second.version).toBe(version);
    second.close();
  });
});
