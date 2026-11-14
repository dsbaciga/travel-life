/**
 * On-device schema and migrations.
 *
 * Trip entities are stored as JSON documents in one `entities` table keyed by
 * `(kind, id)`, rather than one wide table per entity type. The server's
 * Prisma schema is the authority on columns; mirroring all ~150 of them here
 * would mean a phone-side migration for every backend column added. The few
 * values the phone actually filters or sorts on are lifted into real, indexed
 * columns (`trip_id`, `sort_time`, `latitude`, `longitude`).
 *
 * Ids are TEXT everywhere: a server id is its decimal string, an unsynced
 * local id is `local_<uuid>`. That lets one column hold both and makes the
 * local -> server remap a plain UPDATE.
 */

import type { SqlDriver } from './driver';
import { first } from './driver';

const MIGRATIONS: readonly string[] = [
  // ---- v1 ----
  `
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    status TEXT,
    last_synced_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS entities (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    trip_id INTEGER NOT NULL,
    -- What the UI shows: the server row with any pending local edits applied.
    data TEXT NOT NULL,
    -- The last version the server sent, untouched by local edits. Conflict
    -- detection compares against this. NULL for rows created on this phone.
    server_data TEXT,
    sort_time TEXT,
    latitude REAL,
    longitude REAL,
    PRIMARY KEY (kind, id)
  );
  CREATE INDEX IF NOT EXISTS entities_trip_kind ON entities (trip_id, kind);
  CREATE INDEX IF NOT EXISTS entities_trip_time ON entities (trip_id, sort_time);

  CREATE TABLE IF NOT EXISTS entity_links (
    id TEXT PRIMARY KEY NOT NULL,
    trip_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship TEXT NOT NULL,
    sort_order INTEGER,
    notes TEXT,
    -- 1 while a delete is queued: hidden from the UI, kept so a failed sync can restore it.
    pending_delete INTEGER NOT NULL DEFAULT 0,
    UNIQUE (trip_id, source_type, source_id, target_type, target_id)
  );
  CREATE INDEX IF NOT EXISTS links_source ON entity_links (trip_id, source_type, source_id);
  CREATE INDEX IF NOT EXISTS links_target ON entity_links (trip_id, target_type, target_id);

  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op TEXT NOT NULL,
    payload TEXT NOT NULL,
    -- For updates: the pre-edit values of each patched field.
    base TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    conflict TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS outbox_entity ON outbox (kind, entity_id);
  CREATE INDEX IF NOT EXISTS outbox_status ON outbox (status, seq);

  CREATE TABLE IF NOT EXISTS id_map (
    kind TEXT NOT NULL,
    local_id TEXT NOT NULL,
    server_id INTEGER NOT NULL,
    PRIMARY KEY (kind, local_id)
  );

  CREATE TABLE IF NOT EXISTS track_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    altitude REAL,
    speed REAL,
    recorded_at TEXT NOT NULL,
    uploaded INTEGER NOT NULL DEFAULT 0,
    UNIQUE (trip_id, recorded_at)
  );
  CREATE INDEX IF NOT EXISTS track_trip_time ON track_points (trip_id, recorded_at);
  CREATE INDEX IF NOT EXISTS track_pending ON track_points (uploaded, trip_id);

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vault_documents (
    id TEXT PRIMARY KEY NOT NULL,
    trip_id INTEGER,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    local_uri TEXT NOT NULL,
    mime_type TEXT,
    -- When the document is needed (flight departure, check-in); drives ordering.
    needed_at TEXT,
    linked_kind TEXT,
    linked_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS vault_trip ON vault_documents (trip_id, needed_at);
  `,
  // Locations now carry excludeFromMap. Delta pulls only send changed rows, so
  // force one full pull per trip to fill the field in on everything mirrored before.
  `
  UPDATE trips SET last_synced_at = NULL;
  `,
];

/** Apply any migrations the database has not seen. Safe to call on every launch. */
export async function migrate(db: SqlDriver): Promise<number> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const row = await first<{ user_version: number }>(db, 'PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.transaction(async (db) => {
      await db.exec(sql);
      // PRAGMA does not accept bound parameters; `next` is a loop counter.
      await db.exec(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}

/** Remove every row. Used on sign-out so the next account starts clean. */
export async function wipe(db: SqlDriver): Promise<void> {
  await db.transaction(async (db) => {
    for (const table of [
      'trips',
      'entities',
      'entity_links',
      'outbox',
      'id_map',
      'track_points',
      'kv',
      'vault_documents',
    ]) {
      await db.exec(`DELETE FROM ${table}`);
    }
  });
}
