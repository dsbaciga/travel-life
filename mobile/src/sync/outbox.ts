/**
 * The offline mutation queue.
 *
 * Every local write is paired with one outbox row describing the server call
 * that will make it real. Rows are coalesced as they are queued so the server
 * sees the *net* effect of an offline session rather than its history:
 *
 * - editing something created offline folds into its pending create;
 * - editing the same entity twice folds into one update (keeping the first
 *   edit's baseline, which is what conflict detection needs);
 * - deleting something that was never synced cancels its create outright.
 */

import type { EntityId, SyncEntityKind } from '@travel-life/shared';
import { isLocalId } from '@travel-life/shared';
import type { SqlDriver } from '../db/driver';
import { first } from '../db/driver';
import { idKey } from '../db/repository';

/** `LINK` rows carry EntityLink mutations; everything else is a sync entity kind. */
export type OutboxKind = SyncEntityKind | 'LINK';
export type OutboxOp = 'create' | 'update' | 'delete';
export type OutboxStatus = 'pending' | 'conflict' | 'failed';

export interface FieldConflict {
  field: string;
  /** Value before the local edit. */
  base: unknown;
  /** What this phone wants to write. */
  mine: unknown;
  /** What the server holds now. */
  theirs: unknown;
}

export interface OutboxEntry {
  seq: number;
  tripId: number;
  kind: OutboxKind;
  entityId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  base: Record<string, unknown> | null;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  conflict: FieldConflict[] | null;
  createdAt: string;
}

interface OutboxRow {
  seq: number;
  trip_id: number;
  kind: string;
  entity_id: string;
  op: string;
  payload: string;
  base: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  conflict: string | null;
  created_at: string;
}

function rowToEntry(row: OutboxRow): OutboxEntry {
  return {
    seq: row.seq,
    tripId: row.trip_id,
    kind: row.kind as OutboxKind,
    entityId: row.entity_id,
    op: row.op as OutboxOp,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    base: row.base ? (JSON.parse(row.base) as Record<string, unknown>) : null,
    status: row.status as OutboxStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    conflict: row.conflict ? (JSON.parse(row.conflict) as FieldConflict[]) : null,
    createdAt: row.created_at,
  };
}

async function insert(
  db: SqlDriver,
  tripId: number,
  kind: OutboxKind,
  entityId: string,
  op: OutboxOp,
  payload: Record<string, unknown>,
  base: Record<string, unknown> | null
): Promise<void> {
  await db.run(
    `INSERT INTO outbox (trip_id, kind, entity_id, op, payload, base, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tripId,
      kind,
      entityId,
      op,
      JSON.stringify(payload),
      base ? JSON.stringify(base) : null,
      new Date().toISOString(),
    ]
  );
}

async function findOp(
  db: SqlDriver,
  kind: OutboxKind,
  entityId: string,
  op: OutboxOp
): Promise<OutboxEntry | null> {
  const row = await first<OutboxRow>(
    db,
    'SELECT * FROM outbox WHERE kind = ? AND entity_id = ? AND op = ? ORDER BY seq ASC LIMIT 1',
    [kind, entityId, op]
  );
  return row ? rowToEntry(row) : null;
}

/** Queue the creation of an entity or link. `payload` is the full row. */
export async function enqueueCreate(
  db: SqlDriver,
  tripId: number,
  kind: OutboxKind,
  id: EntityId,
  payload: Record<string, unknown>
): Promise<void> {
  await insert(db, tripId, kind, idKey(id), 'create', payload, null);
}

/**
 * Queue a partial update.
 *
 * @param patch - Only the fields that changed
 * @param base - The values those fields held before this edit
 */
export async function enqueueUpdate(
  db: SqlDriver,
  tripId: number,
  kind: OutboxKind,
  id: EntityId,
  patch: Record<string, unknown>,
  base: Record<string, unknown>
): Promise<void> {
  const key = idKey(id);

  // Not on the server yet: the edit is just part of what gets created.
  const create = await findOp(db, kind, key, 'create');
  if (create) {
    await db.run('UPDATE outbox SET payload = ? WHERE seq = ?', [
      JSON.stringify({ ...create.payload, ...patch }),
      create.seq,
    ]);
    return;
  }

  const existing = await findOp(db, kind, key, 'update');
  if (existing) {
    // Keep the EARLIEST baseline per field: conflict detection asks "did the
    // server move away from what this phone last saw?", and that is the value
    // before the first unsynced edit, not before the latest one.
    const mergedBase = { ...base, ...(existing.base ?? {}) };
    await db.run(
      `UPDATE outbox SET payload = ?, base = ?, status = 'pending', conflict = NULL, last_error = NULL
       WHERE seq = ?`,
      [JSON.stringify({ ...existing.payload, ...patch }), JSON.stringify(mergedBase), existing.seq]
    );
    return;
  }

  await insert(db, tripId, kind, key, 'update', patch, base);
}

/**
 * Queue a delete.
 *
 * @returns `false` when the entity only ever existed on this phone, in which
 * case its pending create was cancelled and there is nothing to send.
 */
export async function enqueueDelete(
  db: SqlDriver,
  tripId: number,
  kind: OutboxKind,
  id: EntityId
): Promise<boolean> {
  const key = idKey(id);
  await db.run("DELETE FROM outbox WHERE kind = ? AND entity_id = ? AND op IN ('create', 'update')", [
    kind,
    key,
  ]);
  if (isLocalId(id)) {
    return false;
  }
  if (await findOp(db, kind, key, 'delete')) {
    return true;
  }
  await insert(db, tripId, kind, key, 'delete', {}, null);
  return true;
}

/**
 * Drop queued link mutations that reference an entity which no longer exists
 * locally (it was deleted before ever syncing).
 */
export async function dropLinkOpsReferencing(
  db: SqlDriver,
  tripId: number,
  type: string,
  id: EntityId
): Promise<void> {
  const rows = await db.all<OutboxRow>(
    "SELECT * FROM outbox WHERE trip_id = ? AND kind = 'LINK' AND op = 'create'",
    [tripId]
  );
  const key = idKey(id);
  for (const row of rows) {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const hitsSource = payload.sourceType === type && String(payload.sourceId) === key;
    const hitsTarget = payload.targetType === type && String(payload.targetId) === key;
    if (hitsSource || hitsTarget) {
      await db.run('DELETE FROM outbox WHERE seq = ?', [row.seq]);
    }
  }
}

export async function listOutbox(
  db: SqlDriver,
  options: { tripId?: number; status?: OutboxStatus } = {}
): Promise<OutboxEntry[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (options.tripId !== undefined) {
    where.push('trip_id = ?');
    params.push(options.tripId);
  }
  if (options.status) {
    where.push('status = ?');
    params.push(options.status);
  }
  const rows = await db.all<OutboxRow>(
    `SELECT * FROM outbox ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY seq ASC`,
    params
  );
  return rows.map(rowToEntry);
}

export async function getOutboxEntry(db: SqlDriver, seq: number): Promise<OutboxEntry | null> {
  const row = await first<OutboxRow>(db, 'SELECT * FROM outbox WHERE seq = ?', [seq]);
  return row ? rowToEntry(row) : null;
}

export async function removeOutboxEntry(db: SqlDriver, seq: number): Promise<void> {
  await db.run('DELETE FROM outbox WHERE seq = ?', [seq]);
}

export async function markFailed(db: SqlDriver, seq: number, error: string): Promise<void> {
  await db.run(
    "UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE seq = ?",
    [error.slice(0, 500), seq]
  );
}

export async function markConflict(
  db: SqlDriver,
  seq: number,
  conflict: FieldConflict[]
): Promise<void> {
  await db.run("UPDATE outbox SET status = 'conflict', conflict = ? WHERE seq = ?", [
    JSON.stringify(conflict),
    seq,
  ]);
}

/** Put a failed entry back in the queue (the user tapped "Retry"). */
export async function retryEntry(db: SqlDriver, seq: number): Promise<void> {
  await db.run(
    "UPDATE outbox SET status = 'pending', last_error = NULL WHERE seq = ? AND status = 'failed'",
    [seq]
  );
}

export interface OutboxCounts {
  pending: number;
  conflict: number;
  failed: number;
}

export async function countOutbox(db: SqlDriver, tripId?: number): Promise<OutboxCounts> {
  const rows = await db.all<{ status: string; n: number }>(
    tripId === undefined
      ? 'SELECT status, COUNT(*) AS n FROM outbox GROUP BY status'
      : 'SELECT status, COUNT(*) AS n FROM outbox WHERE trip_id = ? GROUP BY status',
    tripId === undefined ? [] : [tripId]
  );
  const counts: OutboxCounts = { pending: 0, conflict: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === 'pending' || row.status === 'conflict' || row.status === 'failed') {
      counts[row.status] = row.n;
    }
  }
  return counts;
}

/** Kinds + ids with any queued mutation, for the "not yet synced" badge. */
export async function listDirtyKeys(db: SqlDriver, tripId: number): Promise<Set<string>> {
  const rows = await db.all<{ kind: string; entity_id: string }>(
    'SELECT DISTINCT kind, entity_id FROM outbox WHERE trip_id = ?',
    [tripId]
  );
  return new Set(rows.map((row) => `${row.kind}:${row.entity_id}`));
}
