/**
 * Every local write the UI can make.
 *
 * Each function applies the change to the mirror AND queues its outbox entry
 * in a single SQLite transaction, so the screen and the sync queue can never
 * disagree — including when the app is killed mid-write with no signal.
 */

import type {
  ActivityDto,
  EntityId,
  EntityLinkDto,
  EntityType,
  LinkRelationship,
  LocalId,
  LocationDto,
  SavedLinkDto,
  SyncEntityKind,
  SyncEntityMap,
  TransportationDto,
} from '@travel-life/shared';
import {
  convertToAllDay,
  deriveTransportDelay,
  getDefaultRelationship,
  isEntityType,
  isLinkableKind,
  moveByDays,
  moveToDay,
  reorderManualOrder,
  shiftByMinutes,
} from '@travel-life/shared';
import type { SqlDriver } from '../db/driver';
import {
  deleteEntityRow,
  deleteLinkRow,
  deleteLinksFor,
  findLink,
  getEntity,
  getLink,
  idKey,
  listEntities,
  listLinksFor,
  putEntity,
  putLink,
} from '../db/repository';
import {
  dropLinkOpsReferencing,
  enqueueCreate,
  enqueueDelete,
  enqueueUpdate,
} from '../sync/outbox';

type Row = Record<string, unknown>;

/** Injected so tests are deterministic; the app passes `expo-crypto`'s randomUUID. */
export type IdFactory = () => string;

let idFactory: IdFactory = () => {
  const random = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (random) return random.call((globalThis as { crypto?: unknown }).crypto);
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export function setIdFactory(factory: IdFactory): void {
  idFactory = factory;
}

export const newLocalId = (): LocalId => `local_${idFactory()}`;

/** Fields the phone never sends: identity, ownership and server bookkeeping. */
const IMMUTABLE_FIELDS = new Set(['id', 'tripId', 'createdAt', 'updatedAt', 'flightTracking']);

export interface LinkSpec {
  targetType: EntityType;
  targetId: EntityId;
  relationship?: LinkRelationship;
  notes?: string | null;
}

// =============================================================================
// ENTITIES
// =============================================================================

/**
 * Create an entity locally and queue its upload.
 *
 * @param links - Links FROM the new entity, created in the same transaction
 * @returns The stored entity, carrying a `local_<uuid>` id until it syncs
 */
export async function createEntity<K extends SyncEntityKind>(
  db: SqlDriver,
  kind: K,
  tripId: number,
  input: Omit<SyncEntityMap[K], 'id' | 'tripId'>,
  links: readonly LinkSpec[] = []
): Promise<SyncEntityMap[K]> {
  const now = new Date().toISOString();
  const entity = {
    createdAt: now,
    updatedAt: now,
    ...input,
    id: newLocalId(),
    tripId,
  } as unknown as SyncEntityMap[K];

  await db.transaction(async (db) => {
    await putEntity(db, kind, tripId, entity, null);
    await enqueueCreate(db, tripId, kind, entity.id, entity as unknown as Row);
    for (const link of links) {
      if (isEntityType(kind)) {
        await createLink(db, tripId, kind, entity.id, link);
      }
    }
  });
  return entity;
}

/**
 * Apply a partial edit. Fields whose value did not actually change are
 * dropped, so opening and saving a form untouched queues nothing.
 *
 * @returns The updated entity, or null if it no longer exists locally
 */
export async function updateEntity<K extends SyncEntityKind>(
  db: SqlDriver,
  kind: K,
  id: EntityId,
  changes: Partial<SyncEntityMap[K]>
): Promise<SyncEntityMap[K] | null> {
  return db.transaction(async (db) => {
    const current = await getEntity(db, kind, id);
    if (!current) return null;
    const before = current as unknown as Row;

    const patch: Row = {};
    const base: Row = {};
    for (const [field, value] of Object.entries(changes as Row)) {
      if (IMMUTABLE_FIELDS.has(field) || value === undefined) continue;
      if (JSON.stringify(before[field] ?? null) === JSON.stringify(value ?? null)) continue;
      patch[field] = value;
      base[field] = before[field] ?? null;
    }
    if (Object.keys(patch).length === 0) return current;

    const next = { ...before, ...patch, updatedAt: new Date().toISOString() };
    const tripId = Number(before.tripId ?? (await tripIdOf(db, kind, id)));
    await putEntity(db, kind, tripId, next as unknown as SyncEntityMap[K]);
    await enqueueUpdate(db, tripId, kind, id, patch, base);
    return next as unknown as SyncEntityMap[K];
  });
}

/** `tripId` lives outside the JSON for kinds that do not carry it (checklist items). */
async function tripIdOf(db: SqlDriver, kind: SyncEntityKind, id: EntityId): Promise<number> {
  const rows = await db.all<{ trip_id: number }>(
    'SELECT trip_id FROM entities WHERE kind = ? AND id = ?',
    [kind, idKey(id)]
  );
  return rows[0]?.trip_id ?? 0;
}

/**
 * Delete an entity and its links locally and queue the server delete.
 * The server removes the links itself when it deletes the entity, so no link
 * deletes are queued — only link *creates* that would now dangle are dropped.
 */
export async function deleteEntity(db: SqlDriver, kind: SyncEntityKind, id: EntityId): Promise<void> {
  await db.transaction(async (db) => {
    const tripId = await tripIdOf(db, kind, id);
    if (isLinkableKind(kind)) {
      await deleteLinksFor(db, tripId, kind, id);
      await dropLinkOpsReferencing(db, tripId, kind, id);
      await db.run(
        `DELETE FROM outbox WHERE trip_id = ? AND kind = 'LINK' AND entity_id NOT IN
           (SELECT id FROM entity_links WHERE trip_id = ?) AND op <> 'delete'`,
        [tripId, tripId]
      );
    }
    await deleteEntityRow(db, kind, id);
    await enqueueDelete(db, tripId, kind, id);
  });
}

// =============================================================================
// LINKS
// =============================================================================

/**
 * Link two entities. Idempotent on the (source, target) pair, matching the
 * server's unique constraint; the relationship defaults from the shared rules.
 */
export async function createLink(
  db: SqlDriver,
  tripId: number,
  sourceType: EntityType,
  sourceId: EntityId,
  spec: LinkSpec
): Promise<EntityLinkDto> {
  return db.transaction(async (db) => {
    const existing = await findLink(db, tripId, sourceType, sourceId, spec.targetType, spec.targetId);
    if (existing) {
      // Re-linking something whose unlink has not synced yet: cancel the unlink.
      await db.run('UPDATE entity_links SET pending_delete = 0 WHERE id = ?', [idKey(existing.id)]);
      await db.run("DELETE FROM outbox WHERE kind = 'LINK' AND entity_id = ? AND op = 'delete'", [
        idKey(existing.id),
      ]);
      return existing;
    }
    const link: EntityLinkDto = {
      id: newLocalId(),
      tripId,
      sourceType,
      sourceId,
      targetType: spec.targetType,
      targetId: spec.targetId,
      relationship: spec.relationship ?? getDefaultRelationship(sourceType, spec.targetType),
      sortOrder: null,
      notes: spec.notes ?? null,
    };
    await putLink(db, link);
    await enqueueCreate(db, tripId, 'LINK', link.id, link as unknown as Row);
    return link;
  });
}

/** Unlink. Hidden immediately; removed for good once the server confirms. */
export async function removeLink(db: SqlDriver, linkId: EntityId): Promise<void> {
  await db.transaction(async (db) => {
    const link = await getLink(db, linkId);
    if (!link) return;
    const needsServerDelete = await enqueueDelete(db, link.tripId, 'LINK', linkId);
    if (needsServerDelete) {
      await db.run('UPDATE entity_links SET pending_delete = 1 WHERE id = ?', [idKey(linkId)]);
    } else {
      await deleteLinkRow(db, linkId);
    }
  });
}

/** Change a link's relationship or note. */
export async function updateLink(
  db: SqlDriver,
  linkId: EntityId,
  changes: { relationship?: LinkRelationship; notes?: string | null }
): Promise<void> {
  await db.transaction(async (db) => {
    const link = await getLink(db, linkId);
    if (!link) return;
    const patch: Row = {};
    const base: Row = {};
    if (changes.relationship && changes.relationship !== link.relationship) {
      patch.relationship = changes.relationship;
      base.relationship = link.relationship;
    }
    if (changes.notes !== undefined && changes.notes !== link.notes) {
      patch.notes = changes.notes;
      base.notes = link.notes;
    }
    if (Object.keys(patch).length === 0) return;
    await putLink(db, { ...link, ...(patch as Partial<EntityLinkDto>) });
    await enqueueUpdate(db, link.tripId, 'LINK', linkId, patch, base);
  });
}

/**
 * The inline "+ Create New … Here & Link" flow: make the target entity and the
 * link to it atomically, so a half-finished pair can never be left behind.
 */
export async function createAndLink<K extends SyncEntityKind & EntityType>(
  db: SqlDriver,
  tripId: number,
  source: { type: EntityType; id: EntityId },
  targetKind: K,
  targetInput: Omit<SyncEntityMap[K], 'id' | 'tripId'>,
  relationship?: LinkRelationship
): Promise<{ entity: SyncEntityMap[K]; link: EntityLinkDto }> {
  return db.transaction(async (db) => {
    const entity = await createEntity(db, targetKind, tripId, targetInput);
    const link = await createLink(db, tripId, source.type, source.id, {
      targetType: targetKind,
      targetId: entity.id,
      relationship,
    });
    return { entity, link };
  });
}

/** Link many photos to one target (the camera-roll review bar's bulk action). */
export async function bulkLinkPhotos(
  db: SqlDriver,
  tripId: number,
  photoIds: readonly EntityId[],
  target: LinkSpec
): Promise<number> {
  let created = 0;
  await db.transaction(async (db) => {
    for (const photoId of photoIds) {
      const before = await findLink(db, tripId, 'PHOTO', photoId, target.targetType, target.targetId);
      await createLink(db, tripId, 'PHOTO', photoId, target);
      if (!before) created += 1;
    }
  });
  return created;
}

// =============================================================================
// LIVE ITINERARY ADJUSTMENTS
// =============================================================================

type Timed = 'ACTIVITY' | 'CUSTOM_ITEM';

export type TimeAdjustment =
  | { type: 'shift'; minutes: number }
  | { type: 'moveDays'; days: number }
  | { type: 'moveToDay'; dayKey: string }
  | { type: 'allDay'; fallbackDayKey: string };

/** Nudge, move or flatten a timed item. `timezone` is the item's effective zone. */
export async function adjustTime(
  db: SqlDriver,
  kind: Timed,
  id: EntityId,
  adjustment: TimeAdjustment,
  timezone: string
): Promise<void> {
  const item = await getEntity(db, kind, id);
  if (!item) return;
  const timed = { startTime: item.startTime, endTime: item.endTime, allDay: item.allDay };
  const patch =
    adjustment.type === 'shift'
      ? shiftByMinutes(timed, adjustment.minutes)
      : adjustment.type === 'moveDays'
        ? moveByDays(timed, adjustment.days, timezone)
        : adjustment.type === 'moveToDay'
          ? moveToDay(timed, adjustment.dayKey, timezone)
          : convertToAllDay(timed, timezone, adjustment.fallbackDayKey);
  await updateEntity(db, kind, id, patch as Partial<SyncEntityMap[Timed]>);
}

/** Persist a drag-to-reorder of a day's activities as `manualOrder` values. */
export async function reorderActivities(
  db: SqlDriver,
  orderedIds: readonly EntityId[]
): Promise<void> {
  const order = reorderManualOrder(orderedIds);
  await db.transaction(async (db) => {
    for (const [id, manualOrder] of order) {
      await updateEntity(db, 'ACTIVITY', id, { manualOrder });
    }
  });
}

/**
 * One-tap "it left" / "we arrived" on a transit leg. Status and delay are
 * derived from the scheduled time rather than asked for.
 */
export async function logTransitActual(
  db: SqlDriver,
  id: EntityId,
  event: 'departed' | 'arrived' | 'cancelled',
  at: Date = new Date()
): Promise<TransportationDto | null> {
  const leg = await getEntity(db, 'TRANSPORTATION', id);
  if (!leg) return null;
  if (event === 'cancelled') {
    return updateEntity(db, 'TRANSPORTATION', id, { status: 'cancelled' });
  }
  if (event === 'arrived') {
    return updateEntity(db, 'TRANSPORTATION', id, { actualEnd: at.toISOString() });
  }
  const actualStart = at.toISOString();
  const { status, delayMinutes } = deriveTransportDelay(leg.scheduledStart, actualStart);
  return updateEntity(db, 'TRANSPORTATION', id, { actualStart, status, delayMinutes });
}

/**
 * Turn a saved link into something on the itinerary, keeping the link
 * attached to it (`SAVED_LINK -> ACTIVITY|LOCATION`, RELATED).
 */
export async function promoteSavedLink(
  db: SqlDriver,
  savedLinkId: EntityId,
  to: 'ACTIVITY' | 'LOCATION',
  options: { startTime?: string | null; timezone?: string | null } = {}
): Promise<ActivityDto | LocationDto | null> {
  return db.transaction(async (db) => {
    const saved: SavedLinkDto | null = await getEntity(db, 'SAVED_LINK', savedLinkId);
    if (!saved || saved.tripId === null) return null;
    const name = (saved.title ?? saved.siteName ?? saved.url).slice(0, 500);

    let created: ActivityDto | LocationDto;
    if (to === 'ACTIVITY') {
      created = await createEntity(db, 'ACTIVITY', saved.tripId, {
        parentId: null,
        name,
        description: saved.description,
        category: null,
        allDay: !options.startTime,
        startTime: options.startTime ?? null,
        endTime: null,
        timezone: options.timezone ?? null,
        cost: null,
        currency: null,
        // The activity schema caps booking URLs at 500 chars; a longer one
        // stays reachable through the linked saved link.
        bookingUrl: saved.url.length <= 500 ? saved.url : null,
        bookingReference: null,
        notes: saved.notes,
        manualOrder: null,
      });
    } else {
      created = await createEntity(db, 'LOCATION', saved.tripId, {
        parentId: null,
        name,
        address: null,
        latitude: null,
        longitude: null,
        categoryId: null,
        visitDatetime: options.startTime ?? null,
        visitDurationMinutes: null,
        notes: saved.notes,
        isFavorite: false,
        openingHours: null,
        timezone: options.timezone ?? null,
      });
    }
    await createLink(db, saved.tripId, 'SAVED_LINK', savedLinkId, {
      targetType: to,
      targetId: created.id,
      relationship: 'RELATED',
    });
    return created;
  });
}

/** Tick or untick a checklist item. */
export async function toggleChecklistItem(
  db: SqlDriver,
  itemId: EntityId,
  isChecked: boolean
): Promise<void> {
  await updateEntity(db, 'CHECKLIST_ITEM', itemId, {
    isChecked,
    checkedAt: isChecked ? new Date().toISOString() : null,
  });
}

/** Linked entities of one type for an entity, resolved to their rows. */
export async function listLinkedEntities<K extends SyncEntityKind & EntityType>(
  db: SqlDriver,
  tripId: number,
  of: { type: EntityType; id: EntityId },
  kind: K
): Promise<SyncEntityMap[K][]> {
  const links = await listLinksFor(db, tripId, of.type, of.id);
  const ids = new Set<string>();
  for (const link of links) {
    const selfIsSource = link.sourceType === of.type && idKey(link.sourceId) === idKey(of.id);
    const otherType = selfIsSource ? link.targetType : link.sourceType;
    const otherId = selfIsSource ? link.targetId : link.sourceId;
    if (otherType === kind) ids.add(idKey(otherId));
  }
  if (ids.size === 0) return [];
  const all = await listEntities(db, tripId, kind);
  return all.filter((entity) => ids.has(idKey(entity.id)));
}
