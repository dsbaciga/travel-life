/**
 * Typed reads and low-level writes over the on-device mirror.
 *
 * Nothing here queues sync work — that is `domain/mutations.ts`, which pairs
 * each write with its outbox entry inside one transaction.
 */

import type {
  EntityId,
  EntityLinkDto,
  EntityType,
  LinkRelationship,
  SyncEntityKind,
  SyncEntityMap,
  TripDto,
} from '@travel-life/shared';
import type { SqlDriver, SqlValue } from './driver';
import { first } from './driver';

/** Storage form of an id. */
export const idKey = (id: EntityId): string => String(id);

/** Back from storage: digits become a server id, anything else stays a local id. */
export const parseIdKey = (key: string): EntityId =>
  /^\d+$/.test(key) ? Number(key) : (key as EntityId);

interface EntityRow {
  kind: string;
  id: string;
  trip_id: number;
  data: string;
  server_data: string | null;
}

interface LinkRow {
  id: string;
  trip_id: number;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship: string;
  sort_order: number | null;
  notes: string | null;
}

type AnyEntity = SyncEntityMap[SyncEntityKind];

/**
 * The instant an entity sits at on a timeline, used for the indexed
 * `sort_time` column. Date-only kinds return their UTC-midnight date.
 */
export function sortTimeOf(kind: SyncEntityKind, data: Record<string, unknown>): string | null {
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
    return null;
  };
  switch (kind) {
    case 'ACTIVITY':
    case 'CUSTOM_ITEM':
      return pick('startTime');
    case 'TRANSPORTATION':
      return pick('scheduledStart', 'actualStart');
    case 'LODGING':
      return pick('checkInDate');
    case 'LOCATION':
      return pick('visitDatetime');
    case 'PHOTO':
      return pick('takenAt', 'createdAt');
    case 'JOURNAL_ENTRY':
    case 'EXPENSE':
      return pick('date', 'createdAt');
    default:
      return pick('createdAt');
  }
}

const coordOf = (data: Record<string, unknown>, key: string): number | null => {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

function rowToLink(row: LinkRow): EntityLinkDto {
  return {
    id: parseIdKey(row.id),
    tripId: row.trip_id,
    sourceType: row.source_type as EntityType,
    sourceId: parseIdKey(row.source_id),
    targetType: row.target_type as EntityType,
    targetId: parseIdKey(row.target_id),
    relationship: row.relationship as LinkRelationship,
    sortOrder: row.sort_order,
    notes: row.notes,
  };
}

// =============================================================================
// TRIPS
// =============================================================================

export async function upsertTrip(db: SqlDriver, trip: TripDto, syncedAt?: string): Promise<void> {
  await db.run(
    `INSERT INTO trips (id, data, start_date, end_date, status, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       status = excluded.status,
       last_synced_at = COALESCE(excluded.last_synced_at, trips.last_synced_at)`,
    [trip.id, JSON.stringify(trip), trip.startDate, trip.endDate, trip.status, syncedAt ?? null]
  );
}

export async function getTrip(db: SqlDriver, tripId: number): Promise<TripDto | null> {
  const row = await first<{ data: string }>(db, 'SELECT data FROM trips WHERE id = ?', [tripId]);
  return row ? (JSON.parse(row.data) as TripDto) : null;
}

export async function listTrips(db: SqlDriver): Promise<TripDto[]> {
  const rows = await db.all<{ data: string }>(
    'SELECT data FROM trips ORDER BY start_date IS NULL, start_date ASC'
  );
  return rows.map((row) => JSON.parse(row.data) as TripDto);
}

export async function getLastSyncedAt(db: SqlDriver, tripId: number): Promise<string | null> {
  const row = await first<{ last_synced_at: string | null }>(
    db,
    'SELECT last_synced_at FROM trips WHERE id = ?',
    [tripId]
  );
  return row?.last_synced_at ?? null;
}

export async function listPinnedTripIds(db: SqlDriver): Promise<Set<number>> {
  const rows = await db.all<{ id: number }>('SELECT id FROM trips WHERE pinned = 1');
  return new Set(rows.map((r) => r.id));
}

export async function setTripPinned(db: SqlDriver, tripId: number, pinned: boolean): Promise<void> {
  await db.run('UPDATE trips SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, tripId]);
}

/** Drop a trip and everything mirrored for it (it was deleted or access was revoked). */
export async function removeTrip(db: SqlDriver, tripId: number): Promise<void> {
  await db.transaction(async (db) => {
    for (const table of ['entities', 'entity_links', 'outbox', 'track_points']) {
      await db.run(`DELETE FROM ${table} WHERE trip_id = ?`, [tripId]);
    }
    await db.run('DELETE FROM trips WHERE id = ?', [tripId]);
  });
}

// =============================================================================
// ENTITIES
// =============================================================================

/**
 * Insert or replace an entity's local view.
 *
 * @param serverData - Pass the server's version to record it as the conflict
 * baseline; pass `undefined` to leave the stored baseline untouched (a local
 * edit); pass `null` for a row that has never been on the server.
 */
export async function putEntity<K extends SyncEntityKind>(
  db: SqlDriver,
  kind: K,
  tripId: number,
  data: SyncEntityMap[K],
  serverData?: SyncEntityMap[K] | null
): Promise<void> {
  const record = data as unknown as Record<string, unknown>;
  const params: SqlValue[] = [
    kind,
    idKey(data.id),
    tripId,
    JSON.stringify(data),
    sortTimeOf(kind, record),
    coordOf(record, 'latitude'),
    coordOf(record, 'longitude'),
  ];
  if (serverData === undefined) {
    await db.run(
      `INSERT INTO entities (kind, id, trip_id, data, sort_time, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, id) DO UPDATE SET
         trip_id = excluded.trip_id, data = excluded.data, sort_time = excluded.sort_time,
         latitude = excluded.latitude, longitude = excluded.longitude`,
      params
    );
    return;
  }
  await db.run(
    `INSERT INTO entities (kind, id, trip_id, data, sort_time, latitude, longitude, server_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, id) DO UPDATE SET
       trip_id = excluded.trip_id, data = excluded.data, sort_time = excluded.sort_time,
       latitude = excluded.latitude, longitude = excluded.longitude,
       server_data = excluded.server_data`,
    [...params, serverData === null ? null : JSON.stringify(serverData)]
  );
}

export async function getEntity<K extends SyncEntityKind>(
  db: SqlDriver,
  kind: K,
  id: EntityId
): Promise<SyncEntityMap[K] | null> {
  const row = await first<EntityRow>(db, 'SELECT * FROM entities WHERE kind = ? AND id = ?', [
    kind,
    idKey(id),
  ]);
  return row ? (JSON.parse(row.data) as SyncEntityMap[K]) : null;
}

/** The last server-sent version, or null for a row created on this phone. */
export async function getServerEntity<K extends SyncEntityKind>(
  db: SqlDriver,
  kind: K,
  id: EntityId
): Promise<SyncEntityMap[K] | null> {
  const row = await first<EntityRow>(db, 'SELECT * FROM entities WHERE kind = ? AND id = ?', [
    kind,
    idKey(id),
  ]);
  return row?.server_data ? (JSON.parse(row.server_data) as SyncEntityMap[K]) : null;
}

export async function listEntities<K extends SyncEntityKind>(
  db: SqlDriver,
  tripId: number,
  kind: K
): Promise<SyncEntityMap[K][]> {
  const rows = await db.all<EntityRow>(
    `SELECT * FROM entities WHERE trip_id = ? AND kind = ?
     ORDER BY sort_time IS NULL, sort_time ASC, id ASC`,
    [tripId, kind]
  );
  return rows.map((row) => JSON.parse(row.data) as SyncEntityMap[K]);
}

/** Entities of several kinds whose `sort_time` falls in `[from, to)`. */
export async function listEntitiesBetween(
  db: SqlDriver,
  tripId: number,
  kinds: readonly SyncEntityKind[],
  from: string,
  to: string
): Promise<{ kind: SyncEntityKind; data: AnyEntity }[]> {
  if (kinds.length === 0) return [];
  const placeholders = kinds.map(() => '?').join(', ');
  const rows = await db.all<EntityRow>(
    `SELECT * FROM entities
     WHERE trip_id = ? AND kind IN (${placeholders}) AND sort_time >= ? AND sort_time < ?
     ORDER BY sort_time ASC`,
    [tripId, ...kinds, from, to]
  );
  return rows.map((row) => ({
    kind: row.kind as SyncEntityKind,
    data: JSON.parse(row.data) as AnyEntity,
  }));
}

export async function deleteEntityRow(
  db: SqlDriver,
  kind: SyncEntityKind,
  id: EntityId
): Promise<void> {
  await db.run('DELETE FROM entities WHERE kind = ? AND id = ?', [kind, idKey(id)]);
}

/** Server ids currently mirrored for a kind (excludes unsynced local rows). */
export async function listServerIds(
  db: SqlDriver,
  tripId: number,
  kind: SyncEntityKind
): Promise<number[]> {
  const rows = await db.all<{ id: string }>(
    "SELECT id FROM entities WHERE trip_id = ? AND kind = ? AND id NOT LIKE 'local_%'",
    [tripId, kind]
  );
  return rows.map((row) => Number(row.id));
}

// =============================================================================
// LINKS
// =============================================================================

export async function putLink(db: SqlDriver, link: EntityLinkDto): Promise<void> {
  // The natural key (trip, source, target) is unique on the server too, so a
  // row arriving under a new id for the same pair replaces the old one.
  await db.run(
    `DELETE FROM entity_links
     WHERE trip_id = ? AND source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?
       AND id <> ?`,
    [
      link.tripId,
      link.sourceType,
      idKey(link.sourceId),
      link.targetType,
      idKey(link.targetId),
      idKey(link.id),
    ]
  );
  await db.run(
    `INSERT INTO entity_links
       (id, trip_id, source_type, source_id, target_type, target_id, relationship, sort_order, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source_type = excluded.source_type, source_id = excluded.source_id,
       target_type = excluded.target_type, target_id = excluded.target_id,
       relationship = excluded.relationship, sort_order = excluded.sort_order,
       notes = excluded.notes`,
    [
      idKey(link.id),
      link.tripId,
      link.sourceType,
      idKey(link.sourceId),
      link.targetType,
      idKey(link.targetId),
      link.relationship,
      link.sortOrder ?? null,
      link.notes ?? null,
    ]
  );
}

export async function getLink(db: SqlDriver, id: EntityId): Promise<EntityLinkDto | null> {
  const row = await first<LinkRow>(db, 'SELECT * FROM entity_links WHERE id = ?', [idKey(id)]);
  return row ? rowToLink(row) : null;
}

export async function findLink(
  db: SqlDriver,
  tripId: number,
  sourceType: EntityType,
  sourceId: EntityId,
  targetType: EntityType,
  targetId: EntityId
): Promise<EntityLinkDto | null> {
  const row = await first<LinkRow>(
    db,
    `SELECT * FROM entity_links
     WHERE trip_id = ? AND source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?`,
    [tripId, sourceType, idKey(sourceId), targetType, idKey(targetId)]
  );
  return row ? rowToLink(row) : null;
}

/** Every visible link touching an entity, in either direction. */
export async function listLinksFor(
  db: SqlDriver,
  tripId: number,
  type: EntityType,
  id: EntityId
): Promise<EntityLinkDto[]> {
  const key = idKey(id);
  const rows = await db.all<LinkRow>(
    `SELECT * FROM entity_links
     WHERE trip_id = ? AND pending_delete = 0
       AND ((source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?))
     ORDER BY sort_order IS NULL, sort_order ASC, id ASC`,
    [tripId, type, key, type, key]
  );
  return rows.map(rowToLink);
}

export async function listLinks(db: SqlDriver, tripId: number): Promise<EntityLinkDto[]> {
  const rows = await db.all<LinkRow>(
    'SELECT * FROM entity_links WHERE trip_id = ? AND pending_delete = 0',
    [tripId]
  );
  return rows.map(rowToLink);
}

export async function deleteLinkRow(db: SqlDriver, id: EntityId): Promise<void> {
  await db.run('DELETE FROM entity_links WHERE id = ?', [idKey(id)]);
}

/** Remove every link that has `(type, id)` on either end. */
export async function deleteLinksFor(
  db: SqlDriver,
  tripId: number,
  type: EntityType,
  id: EntityId
): Promise<void> {
  const key = idKey(id);
  await db.run(
    `DELETE FROM entity_links
     WHERE trip_id = ?
       AND ((source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?))`,
    [tripId, type, key, type, key]
  );
}

// =============================================================================
// KEY-VALUE CACHE
// =============================================================================

export async function kvSet(db: SqlDriver, key: string, value: unknown): Promise<void> {
  await db.run(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), new Date().toISOString()]
  );
}

export async function kvGet<T>(db: SqlDriver, key: string): Promise<T | null> {
  const row = await first<{ value: string }>(db, 'SELECT value FROM kv WHERE key = ?', [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function kvDelete(db: SqlDriver, key: string): Promise<void> {
  await db.run('DELETE FROM kv WHERE key = ?', [key]);
}
