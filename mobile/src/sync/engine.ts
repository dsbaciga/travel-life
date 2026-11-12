/**
 * The sync engine: pull a trip snapshot into the mirror, and replay the outbox
 * against the server in causal order.
 *
 * A sync cycle is `pull -> flush -> pull`:
 * 1. The first pull refreshes each row's `server_data` baseline, which is what
 *    makes conflict detection a purely local comparison.
 * 2. Flush sends queued mutations. A create returns the server's integer id,
 *    which is immediately rewritten through every place the `local_<uuid>`
 *    appears — entity rows, foreign keys inside other entities, both ends of
 *    entity links, and the payloads of mutations still waiting in the queue.
 * 3. The second pull picks up server-side effects (FX snapshots, geocoded
 *    addresses, derived timezones).
 */

import type {
  EntityId,
  EntityLinkDto,
  MobileSyncSnapshot,
  SyncEntityKind,
  SyncEntityMap,
} from '@travel-life/shared';
import { SYNC_ENTITY_KINDS, isLocalId } from '@travel-life/shared';
import type { SqlDriver } from '../db/driver';
import { first } from '../db/driver';
import {
  deleteEntityRow,
  getEntity,
  getLastSyncedAt,
  getServerEntity,
  idKey,
  parseIdKey,
  putEntity,
  putLink,
  upsertTrip,
} from '../db/repository';
import {
  type FieldConflict,
  type OutboxEntry,
  type OutboxKind,
  enqueueUpdate,
  getOutboxEntry,
  listOutbox,
  markConflict,
  markFailed,
  removeOutboxEntry,
} from './outbox';
import {
  type ApiRequest,
  REFERENCE_FIELDS,
  buildCreateRequest,
  buildDeleteRequest,
  buildLinkCreateRequest,
  buildLinkDeleteRequest,
  buildLinkUpdateRequest,
  buildPostCreatePatch,
  buildUpdateRequest,
  createRank,
  referencedKind,
  unresolvedReferences,
} from './payloads';

type Row = Record<string, unknown>;

/** Thrown by a {@link SyncApi}. `status` is null when the server was never reached. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SyncApi {
  /** Perform a request and return the unwrapped `data` of the response envelope. */
  request<T>(request: ApiRequest): Promise<T>;
  getSnapshot(tripId: number, since?: string): Promise<MobileSyncSnapshot>;
}

/**
 * Errors that say "try again later" rather than "this mutation is wrong":
 * no connection, auth that needs refreshing, rate limiting, server trouble.
 * The queue is left intact and the flush stops.
 */
const isRetryable = (error: unknown): boolean =>
  !(error instanceof ApiError) ||
  error.status === null ||
  error.status === 401 ||
  error.status === 408 ||
  error.status === 429 ||
  error.status >= 500;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Value equality for conflict detection. Instants compare by time, so
 * `10:00:00Z` and `10:00:00.000Z` (or an offset spelling) are the same value;
 * `undefined` and `null` both mean "unset".
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  if (typeof a === 'string' && typeof b === 'string' && ISO_INSTANT.test(a) && ISO_INSTANT.test(b)) {
    const ta = new Date(a).getTime();
    const tb = new Date(b).getTime();
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb;
  }
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/**
 * Field-level three-way comparison.
 *
 * A field conflicts only when the server moved away from the value this phone
 * started from AND landed somewhere other than where this phone is going.
 * Fields with no recorded baseline cannot conflict.
 */
export function detectConflicts(patch: Row, base: Row | null, server: Row | null): FieldConflict[] {
  if (!base || !server) return [];
  const conflicts: FieldConflict[] = [];
  for (const field of Object.keys(patch)) {
    if (!(field in base)) continue;
    const theirs = server[field];
    if (!sameValue(theirs, base[field]) && !sameValue(theirs, patch[field])) {
      conflicts.push({ field, base: base[field], mine: patch[field], theirs });
    }
  }
  return conflicts;
}

// =============================================================================
// PULL
// =============================================================================

export interface PullResult {
  upserted: number;
  removed: number;
}

/** Write a snapshot into the mirror without clobbering unsynced local work. */
export async function applySnapshot(db: SqlDriver, snapshot: MobileSyncSnapshot): Promise<PullResult> {
  const tripId = snapshot.trip.id;
  let upserted = 0;
  let removed = 0;

  await db.transaction(async (db) => {
    await upsertTrip(db, snapshot.trip, snapshot.serverTime);

    const queued = await listOutbox(db, { tripId });
    const pendingUpdate = new Map<string, OutboxEntry>();
    const pendingDelete = new Set<string>();
    for (const entry of queued) {
      const key = `${entry.kind}:${entry.entityId}`;
      if (entry.op === 'update') pendingUpdate.set(key, entry);
      if (entry.op === 'delete') pendingDelete.add(key);
    }

    for (const kind of SYNC_ENTITY_KINDS) {
      const rows = snapshot.entities[kind] as SyncEntityMap[typeof kind][];
      for (const row of rows) {
        const key = `${kind}:${idKey(row.id)}`;
        // Deleted here, delete not yet delivered: do not resurrect it.
        if (pendingDelete.has(key)) continue;
        const local = pendingUpdate.get(key);
        // Show the server's row with this phone's unsynced fields laid over
        // it, so a collaborator's edit to *other* fields appears immediately.
        const view = local ? ({ ...row, ...local.payload } as typeof row) : row;
        await putEntity(db, kind, tripId, view, row);
        upserted += 1;
      }

      // Anything mirrored that the server no longer lists was deleted elsewhere.
      const alive = new Set(snapshot.ids[kind].map(String));
      const mirrored = await db.all<{ id: string }>(
        "SELECT id FROM entities WHERE trip_id = ? AND kind = ? AND id NOT LIKE 'local_%'",
        [tripId, kind]
      );
      for (const { id } of mirrored) {
        if (alive.has(id)) continue;
        await db.run('DELETE FROM entities WHERE kind = ? AND id = ?', [kind, id]);
        await db.run('DELETE FROM outbox WHERE kind = ? AND entity_id = ?', [kind, id]);
        removed += 1;
      }
    }

    const aliveLinks = new Set(snapshot.linkIds.map(String));
    const mirroredLinks = await db.all<{ id: string }>(
      "SELECT id FROM entity_links WHERE trip_id = ? AND id NOT LIKE 'local_%'",
      [tripId]
    );
    for (const { id } of mirroredLinks) {
      if (aliveLinks.has(id)) continue;
      await db.run('DELETE FROM entity_links WHERE id = ?', [id]);
      await db.run("DELETE FROM outbox WHERE kind = 'LINK' AND entity_id = ?", [id]);
    }
    for (const link of snapshot.links) {
      await putLink(db, link);
    }
  });

  return { upserted, removed };
}

/** Fetch and apply a trip snapshot (delta when one has been pulled before). */
export async function pullTrip(
  db: SqlDriver,
  api: SyncApi,
  tripId: number,
  options: { full?: boolean } = {}
): Promise<PullResult> {
  const since = options.full ? undefined : ((await getLastSyncedAt(db, tripId)) ?? undefined);
  const snapshot = await api.getSnapshot(tripId, since);
  return applySnapshot(db, snapshot);
}

// =============================================================================
// ID REMAPPING
// =============================================================================

async function lookupServerId(
  db: SqlDriver,
  kind: string,
  localId: string
): Promise<number | null> {
  const row = await first<{ server_id: number }>(
    db,
    'SELECT server_id FROM id_map WHERE kind = ? AND local_id = ?',
    [kind, localId]
  );
  return row?.server_id ?? null;
}

/**
 * Replace a `local_<uuid>` with its server id everywhere it appears.
 * Must run inside the transaction that records the create as delivered.
 */
export async function remapLocalId(
  db: SqlDriver,
  tripId: number,
  kind: SyncEntityKind,
  localId: string,
  serverId: number
): Promise<void> {
  await db.run('INSERT OR REPLACE INTO id_map (kind, local_id, server_id) VALUES (?, ?, ?)', [
    kind,
    localId,
    serverId,
  ]);

  // 1. The entity's own row.
  const own = await getEntity(db, kind, localId as EntityId);
  if (own) {
    await deleteEntityRow(db, kind, localId as EntityId);
    const renamed = { ...own, id: serverId } as SyncEntityMap[typeof kind];
    // It now exists on the server exactly as sent, so that is also the baseline.
    await putEntity(db, kind, tripId, renamed, renamed);
  }

  // 2. Foreign keys inside other entities.
  for (const [holderKind, fields] of Object.entries(REFERENCE_FIELDS)) {
    if (holderKind === 'LINK' || !fields) continue;
    const pointing = Object.entries(fields)
      .filter(([, target]) => target === kind)
      .map(([field]) => field);
    if (pointing.length === 0) continue;
    const holders = await db.all<{ id: string; data: string; server_data: string | null }>(
      'SELECT id, data, server_data FROM entities WHERE trip_id = ? AND kind = ?',
      [tripId, holderKind]
    );
    for (const holder of holders) {
      const data = JSON.parse(holder.data) as Row;
      let touched = false;
      for (const field of pointing) {
        if (data[field] === localId) {
          data[field] = serverId;
          touched = true;
        }
      }
      if (touched) {
        await db.run('UPDATE entities SET data = ? WHERE kind = ? AND id = ?', [
          JSON.stringify(data),
          holderKind,
          holder.id,
        ]);
      }
    }
  }

  // 3. Both ends of entity links.
  await db.run(
    'UPDATE entity_links SET source_id = ? WHERE trip_id = ? AND source_type = ? AND source_id = ?',
    [String(serverId), tripId, kind, localId]
  );
  await db.run(
    'UPDATE entity_links SET target_id = ? WHERE trip_id = ? AND target_type = ? AND target_id = ?',
    [String(serverId), tripId, kind, localId]
  );

  // 4. Mutations still in the queue: their subject, and references in payloads.
  await db.run('UPDATE outbox SET entity_id = ? WHERE kind = ? AND entity_id = ?', [
    String(serverId),
    kind,
    localId,
  ]);
  const queued = await listOutbox(db, { tripId });
  for (const entry of queued) {
    let touched = false;
    const payload = { ...entry.payload };
    for (const field of Object.keys(REFERENCE_FIELDS[entry.kind] ?? {})) {
      if (payload[field] === localId && referencedKind(entry.kind, field, payload) === kind) {
        payload[field] = serverId;
        touched = true;
      }
    }
    if (touched) {
      await db.run('UPDATE outbox SET payload = ? WHERE seq = ?', [
        JSON.stringify(payload),
        entry.seq,
      ]);
    }
  }

  // 5. Vault documents attached to it.
  await db.run('UPDATE vault_documents SET linked_id = ? WHERE linked_kind = ? AND linked_id = ?', [
    String(serverId),
    kind,
    localId,
  ]);
}

// =============================================================================
// FLUSH
// =============================================================================

export interface FlushResult {
  /** Mutations delivered. */
  sent: number;
  /** Rejected by the server; kept for the user to review. */
  failed: number;
  /** Held back because a collaborator changed the same field. */
  conflicts: number;
  /** Still waiting on another mutation that could not be delivered. */
  blocked: number;
  /** True when the flush stopped because the server could not be reached. */
  interrupted: boolean;
}

const OP_PHASE: Readonly<Record<string, number>> = { create: 0, update: 1, delete: 2 };

function orderKey(entry: OutboxEntry): [number, number, number] {
  if (entry.op === 'create') return [0, createRank(entry.kind, entry.payload), entry.seq];
  if (entry.op === 'delete') {
    // Reverse of creation: links first, containers last.
    return [2, 5 - createRank(entry.kind, entry.payload), entry.seq];
  }
  return [OP_PHASE[entry.op], 0, entry.seq];
}

const compareOrder = (a: OutboxEntry, b: OutboxEntry): number => {
  const ka = orderKey(a);
  const kb = orderKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
};

/** A mutation can run once nothing it names is still a local id. */
function isRunnable(entry: OutboxEntry): boolean {
  if (entry.op !== 'create' && isLocalId(entry.entityId)) return false;
  if (entry.op === 'delete') return true;
  return unresolvedReferences(entry.kind, entry.payload).length === 0;
}

async function runEntityCreate(db: SqlDriver, api: SyncApi, entry: OutboxEntry): Promise<void> {
  const kind = entry.kind as SyncEntityKind;
  const created = await api.request<{ id: number }>(
    buildCreateRequest(kind, entry.tripId, entry.payload)
  );
  if (typeof created?.id !== 'number') {
    throw new ApiError('Create response did not include an id', 422);
  }
  await db.transaction(async (db) => {
    await removeOutboxEntry(db, entry.seq);
    if (isLocalId(entry.entityId)) {
      await remapLocalId(db, entry.tripId, kind, entry.entityId, created.id);
    }
    // Fields the create endpoint does not take ride along as a normal update,
    // so they survive losing signal between the two requests.
    const followUp = buildPostCreatePatch(kind, entry.payload);
    if (followUp) {
      await enqueueUpdate(db, entry.tripId, kind, created.id, followUp, {});
    }
  });
}

async function runEntityUpdate(
  db: SqlDriver,
  api: SyncApi,
  entry: OutboxEntry
): Promise<'sent' | 'conflict'> {
  const kind = entry.kind as SyncEntityKind;
  const id = parseIdKey(entry.entityId);
  const server = (await getServerEntity(db, kind, id)) as Row | null;

  const conflicts = detectConflicts(entry.payload, entry.base, server);
  if (conflicts.length > 0) {
    await markConflict(db, entry.seq, conflicts);
    return 'conflict';
  }

  const request = buildUpdateRequest(kind, entry.tripId, id, entry.payload);
  if (request) {
    try {
      await api.request<unknown>(request);
    } catch (error) {
      // Deleted on another device while this edit waited: nothing to update.
      // The next pull removes the local row.
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
  }

  await db.transaction(async (db) => {
    // A newer edit may have been folded into this row while the request was in
    // flight; only what was actually sent is settled.
    const current = await getOutboxEntry(db, entry.seq);
    if (current) {
      const remaining: Row = {};
      for (const [field, value] of Object.entries(current.payload)) {
        if (!(field in entry.payload) || !sameValue(value, entry.payload[field])) {
          remaining[field] = value;
        }
      }
      if (Object.keys(remaining).length === 0) {
        await removeOutboxEntry(db, entry.seq);
      } else {
        await db.run('UPDATE outbox SET payload = ?, base = ? WHERE seq = ?', [
          JSON.stringify(remaining),
          JSON.stringify({ ...(current.base ?? {}), ...entry.payload }),
          entry.seq,
        ]);
      }
    }
    if (server) {
      await db.run('UPDATE entities SET server_data = ? WHERE kind = ? AND id = ?', [
        JSON.stringify({ ...server, ...entry.payload }),
        kind,
        entry.entityId,
      ]);
    }
  });
  return 'sent';
}

async function runDelete(db: SqlDriver, api: SyncApi, entry: OutboxEntry): Promise<void> {
  const id = parseIdKey(entry.entityId);
  const request =
    entry.kind === 'LINK'
      ? buildLinkDeleteRequest(entry.tripId, id)
      : buildDeleteRequest(entry.kind, entry.tripId, id);
  try {
    await api.request<unknown>(request);
  } catch (error) {
    // Already gone is the outcome that was asked for.
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }
  await db.transaction(async (db) => {
    await removeOutboxEntry(db, entry.seq);
    if (entry.kind === 'LINK') {
      await db.run('DELETE FROM entity_links WHERE id = ?', [entry.entityId]);
    }
  });
}

async function runLinkCreate(db: SqlDriver, api: SyncApi, entry: OutboxEntry): Promise<void> {
  let created: { id?: number } | null = null;
  try {
    created = await api.request<{ id: number }>(buildLinkCreateRequest(entry.tripId, entry.payload));
  } catch (error) {
    // Someone (or a retry whose response was lost) already made this exact
    // link. That is the desired end state; the next pull brings its real id.
    const duplicate =
      error instanceof ApiError && error.status === 400 && /already exists/i.test(error.message);
    if (!duplicate) throw error;
  }
  await db.transaction(async (db) => {
    await removeOutboxEntry(db, entry.seq);
    if (typeof created?.id === 'number') {
      const serverId = String(created.id);
      // The row may already be mirrored under its server id if a pull raced us.
      await db.run('DELETE FROM entity_links WHERE id = ? AND id <> ?', [serverId, entry.entityId]);
      await db.run('UPDATE entity_links SET id = ? WHERE id = ?', [serverId, entry.entityId]);
      await db.run("UPDATE outbox SET entity_id = ? WHERE kind = 'LINK' AND entity_id = ?", [
        serverId,
        entry.entityId,
      ]);
    } else {
      await db.run('DELETE FROM entity_links WHERE id = ?', [entry.entityId]);
    }
  });
}

async function runLinkUpdate(db: SqlDriver, api: SyncApi, entry: OutboxEntry): Promise<void> {
  try {
    await api.request<unknown>(
      buildLinkUpdateRequest(entry.tripId, parseIdKey(entry.entityId), entry.payload)
    );
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }
  await removeOutboxEntry(db, entry.seq);
}

/**
 * Deliver queued mutations until the queue is empty, everything left is
 * blocked/held, or the server stops answering.
 */
export async function flushOutbox(
  db: SqlDriver,
  api: SyncApi,
  options: { tripId?: number } = {}
): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, conflicts: 0, blocked: 0, interrupted: false };

  // Each pass re-reads the queue: a successful create rewrites the payloads of
  // the entries behind it, so a stale in-memory copy would send local ids.
  for (;;) {
    const pending = (await listOutbox(db, { tripId: options.tripId, status: 'pending' })).sort(
      compareOrder
    );
    const entry = pending.find(isRunnable);
    if (!entry) {
      result.blocked = pending.length;
      break;
    }

    try {
      if (entry.kind === 'LINK') {
        if (entry.op === 'create') await runLinkCreate(db, api, entry);
        else if (entry.op === 'update') await runLinkUpdate(db, api, entry);
        else await runDelete(db, api, entry);
        result.sent += 1;
      } else if (entry.op === 'create') {
        await runEntityCreate(db, api, entry);
        result.sent += 1;
      } else if (entry.op === 'update') {
        const outcome = await runEntityUpdate(db, api, entry);
        if (outcome === 'conflict') result.conflicts += 1;
        else result.sent += 1;
      } else {
        await runDelete(db, api, entry);
        result.sent += 1;
      }
    } catch (error) {
      if (isRetryable(error)) {
        result.interrupted = true;
        break;
      }
      await markFailed(db, entry.seq, error instanceof Error ? error.message : String(error));
      result.failed += 1;
    }
  }

  return result;
}

// =============================================================================
// CONFLICT RESOLUTION
// =============================================================================

/**
 * Settle a held update.
 *
 * - `mine`: keep this phone's values. The baseline moves to what the server
 *   has now, so the next flush sends the edit as a deliberate overwrite.
 * - `theirs`: accept the server's values for the conflicting fields and drop
 *   them from the edit. Non-conflicting fields in the same edit still go out.
 */
export async function resolveConflict(
  db: SqlDriver,
  seq: number,
  choice: 'mine' | 'theirs'
): Promise<void> {
  await db.transaction(async (db) => {
    const entry = await getOutboxEntry(db, seq);
    if (!entry || entry.status !== 'conflict' || !entry.conflict || entry.kind === 'LINK') return;
    const kind = entry.kind;
    const id = parseIdKey(entry.entityId);

    if (choice === 'mine') {
      const base = { ...(entry.base ?? {}) };
      for (const conflict of entry.conflict) base[conflict.field] = conflict.theirs;
      await db.run(
        "UPDATE outbox SET status = 'pending', conflict = NULL, base = ? WHERE seq = ?",
        [JSON.stringify(base), seq]
      );
      return;
    }

    const payload = { ...entry.payload };
    const local = (await getEntity(db, kind, id)) as Row | null;
    for (const conflict of entry.conflict) {
      delete payload[conflict.field];
      if (local) local[conflict.field] = conflict.theirs;
    }
    if (local) {
      await putEntity(db, kind, entry.tripId, local as unknown as SyncEntityMap[typeof kind]);
    }
    if (Object.keys(payload).length === 0) {
      await removeOutboxEntry(db, seq);
    } else {
      await db.run(
        "UPDATE outbox SET status = 'pending', conflict = NULL, payload = ? WHERE seq = ?",
        [JSON.stringify(payload), seq]
      );
    }
  });
}

/** Give up on a rejected mutation and restore the server's version locally. */
export async function discardFailedEntry(db: SqlDriver, seq: number): Promise<void> {
  await db.transaction(async (db) => {
    const entry = await getOutboxEntry(db, seq);
    if (!entry) return;
    await removeOutboxEntry(db, seq);
    if (entry.kind === 'LINK') {
      if (entry.op === 'create') {
        await db.run('DELETE FROM entity_links WHERE id = ?', [entry.entityId]);
      } else if (entry.op === 'delete') {
        await db.run('UPDATE entity_links SET pending_delete = 0 WHERE id = ?', [entry.entityId]);
      }
      return;
    }
    const id = parseIdKey(entry.entityId);
    if (entry.op === 'create') {
      await deleteEntityRow(db, entry.kind, id);
      await db.run(
        `DELETE FROM entity_links
         WHERE trip_id = ? AND ((source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?))`,
        [entry.tripId, entry.kind, entry.entityId, entry.kind, entry.entityId]
      );
    } else if (entry.op === 'update') {
      const server = await getServerEntity(db, entry.kind, id);
      if (server) await putEntity(db, entry.kind, entry.tripId, server);
    }
    // A discarded delete cannot restore the row from here; the next full pull does.
  });
}

// =============================================================================
// FULL CYCLE
// =============================================================================

export interface SyncResult extends FlushResult {
  pulled: boolean;
}

/** `pull -> flush -> pull` for one trip. Never throws for connectivity problems. */
export async function syncTrip(db: SqlDriver, api: SyncApi, tripId: number): Promise<SyncResult> {
  const empty: SyncResult = {
    sent: 0,
    failed: 0,
    conflicts: 0,
    blocked: 0,
    interrupted: true,
    pulled: false,
  };
  try {
    await pullTrip(db, api, tripId);
  } catch (error) {
    if (isRetryable(error)) return empty;
    throw error;
  }

  const flushed = await flushOutbox(db, api, { tripId });
  if (flushed.interrupted) return { ...flushed, pulled: true };

  try {
    // Full pull after sending: created rows come back with server-derived
    // fields, and it re-lists ids so discarded deletes are restored.
    if (flushed.sent > 0) await pullTrip(db, api, tripId, { full: true });
  } catch (error) {
    if (!isRetryable(error)) throw error;
    return { ...flushed, interrupted: true, pulled: true };
  }
  return { ...flushed, pulled: true };
}

/** Look up the server id a local id became, for screens holding a stale route param. */
export async function resolveEntityId(
  db: SqlDriver,
  kind: SyncEntityKind,
  id: EntityId
): Promise<EntityId> {
  if (!isLocalId(id)) return id;
  const serverId = await lookupServerId(db, kind, id);
  return serverId ?? id;
}

export type { EntityLinkDto, OutboxKind };
