/**
 * Translation between the phone's mirror (Prisma column names) and the REST
 * endpoints the web app already uses.
 *
 * The API is not uniform — transportation aliases its columns
 * (`scheduledStart` is `departureTime` on the wire), expenses and the food log
 * are nested under the trip, saved links PATCH instead of PUT, and several
 * create schemas reject `null` or omit fields that only the update schema
 * accepts. All of that is confined to this file so the sync engine can treat
 * every kind the same way.
 */

import type { EntityId, SyncEntityKind } from '@travel-life/shared';
import { isLocalId } from '@travel-life/shared';
import type { OutboxKind } from './outbox';

export interface ApiRequest {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  /** Present for photo uploads: the file to send as multipart field `photo`. */
  upload?: { uri: string; name: string; type: string };
}

type Row = Record<string, unknown>;

/** Which fields of each kind hold another entity's id, and of what kind. */
export const REFERENCE_FIELDS: Readonly<
  Partial<Record<OutboxKind, Readonly<Record<string, SyncEntityKind | 'BY_TYPE_FIELD'>>>>
> = {
  LOCATION: { parentId: 'LOCATION' },
  ACTIVITY: { parentId: 'ACTIVITY' },
  TRANSPORTATION: { startLocationId: 'LOCATION', endLocationId: 'LOCATION' },
  CUSTOM_ITEM: { locationId: 'LOCATION' },
  FOOD_LOG: { activityId: 'ACTIVITY', locationId: 'LOCATION' },
  CHECKLIST_ITEM: { checklistId: 'CHECKLIST' },
  // A link's endpoints name their own kinds in sourceType / targetType.
  LINK: { sourceId: 'BY_TYPE_FIELD', targetId: 'BY_TYPE_FIELD' },
};

/** Kind of the entity a reference field points at. */
export function referencedKind(kind: OutboxKind, field: string, row: Row): SyncEntityKind | null {
  const target = REFERENCE_FIELDS[kind]?.[field];
  if (!target) return null;
  if (target !== 'BY_TYPE_FIELD') return target;
  const typeField = field === 'sourceId' ? 'sourceType' : 'targetType';
  const type = row[typeField];
  return typeof type === 'string' ? (type as SyncEntityKind) : null;
}

/** Local ids still present in a payload's reference fields, with their kinds. */
export function unresolvedReferences(
  kind: OutboxKind,
  payload: Row
): { field: string; kind: SyncEntityKind; localId: string }[] {
  const result: { field: string; kind: SyncEntityKind; localId: string }[] = [];
  for (const field of Object.keys(REFERENCE_FIELDS[kind] ?? {})) {
    const value = payload[field];
    if (isLocalId(value)) {
      const target = referencedKind(kind, field, payload);
      if (target) result.push({ field, kind: target, localId: value });
    }
  }
  return result;
}

/** Fields accepted by a kind's CREATE endpoint. Anything else is sent in a follow-up update. */
const CREATE_FIELDS: Readonly<Record<SyncEntityKind, readonly string[]>> = {
  LOCATION: [
    'parentId',
    'name',
    'address',
    'latitude',
    'longitude',
    'categoryId',
    'visitDatetime',
    'visitDurationMinutes',
    'notes',
    'openingHours',
    'timezone',
  ],
  ACTIVITY: [
    'parentId',
    'name',
    'description',
    'category',
    'allDay',
    'startTime',
    'endTime',
    'timezone',
    'cost',
    'currency',
    'bookingUrl',
    'bookingReference',
    'notes',
  ],
  TRANSPORTATION: [
    'type',
    'startLocationId',
    'endLocationId',
    'startLocationText',
    'endLocationText',
    'scheduledStart',
    'scheduledEnd',
    'startTimezone',
    'endTimezone',
    'company',
    'referenceNumber',
    'bookingReference',
    'cost',
    'currency',
    'notes',
  ],
  LODGING: [
    'type',
    'name',
    'address',
    'checkInDate',
    'checkOutDate',
    'timezone',
    'confirmationNumber',
    'cost',
    'currency',
    'bookingUrl',
    'notes',
  ],
  JOURNAL_ENTRY: ['title', 'content', 'date', 'entryType', 'mood', 'weatherNotes'],
  SAVED_LINK: ['url', 'title', 'notes'],
  CUSTOM_ITEM: [
    'typeId',
    'name',
    'notes',
    'allDay',
    'startTime',
    'endTime',
    'timezone',
    'locationId',
    'cost',
    'currency',
    'url',
    'confirmationNumber',
  ],
  EXPENSE: ['description', 'category', 'amount', 'currency', 'date', 'notes'],
  FOOD_LOG: ['restaurantName', 'dish', 'rating', 'notes', 'orderAgain', 'activityId', 'locationId'],
  PHOTO: ['caption', 'takenAt', 'latitude', 'longitude'],
  PHOTO_ALBUM: ['name', 'description'],
  CHECKLIST: ['name', 'description', 'type', 'sortOrder'],
  CHECKLIST_ITEM: ['name', 'description', 'isChecked', 'sortOrder'],
};

/**
 * Fields the UPDATE endpoint accepts beyond the create set. A create that
 * carries one of these (a favourite pinned offline, a delay logged on a leg
 * added at the station) needs a second request once the row exists.
 */
const UPDATE_ONLY_FIELDS: Readonly<Partial<Record<SyncEntityKind, readonly string[]>>> = {
  LOCATION: ['isFavorite'],
  ACTIVITY: ['manualOrder'],
  TRANSPORTATION: ['actualStart', 'actualEnd', 'status', 'delayMinutes', 'seatNumber'],
};

/** Mirror column -> wire name, where the API aliases. */
const TRANSPORT_WIRE: Readonly<Record<string, string>> = {
  startLocationId: 'fromLocationId',
  endLocationId: 'toLocationId',
  startLocationText: 'fromLocationName',
  endLocationText: 'toLocationName',
  scheduledStart: 'departureTime',
  scheduledEnd: 'arrivalTime',
  company: 'carrier',
  referenceNumber: 'vehicleNumber',
  bookingReference: 'confirmationNumber',
  actualStart: 'actualDepartureTime',
  actualEnd: 'actualArrivalTime',
};

const COLLECTION_PATH: Readonly<Record<SyncEntityKind, string>> = {
  LOCATION: '/locations',
  ACTIVITY: '/activities',
  TRANSPORTATION: '/transportation',
  LODGING: '/lodging',
  JOURNAL_ENTRY: '/journal',
  SAVED_LINK: '/saved-links',
  CUSTOM_ITEM: '/custom-items',
  PHOTO: '/photos',
  PHOTO_ALBUM: '/albums',
  CHECKLIST: '/checklists',
  // Nested kinds are handled explicitly below.
  EXPENSE: '',
  FOOD_LOG: '',
  CHECKLIST_ITEM: '',
};

const pick = (row: Row, fields: readonly string[]): Row => {
  const out: Row = {};
  for (const field of fields) {
    if (field in row) out[field] = row[field];
  }
  return out;
};

/** Create schemas are `.optional()`, not nullable: absent is fine, `null` is a 400. */
const dropNullish = (row: Row): Row => {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
};

const toWire = (kind: SyncEntityKind, row: Row): Row => {
  if (kind !== 'TRANSPORTATION') return row;
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[TRANSPORT_WIRE[key] ?? key] = value;
  }
  return out;
};

/** Date-only columns go over the wire as `YYYY-MM-DD`. */
const normalizeDates = (kind: SyncEntityKind, row: Row): Row => {
  if ((kind === 'EXPENSE' || kind === 'JOURNAL_ENTRY') && typeof row.date === 'string') {
    return { ...row, date: row.date.slice(0, 10) };
  }
  return row;
};

function itemPath(kind: SyncEntityKind, tripId: number, id: EntityId, row: Row): string {
  switch (kind) {
    case 'EXPENSE':
      return `/trips/${tripId}/expenses/${id}`;
    case 'FOOD_LOG':
      return `/trips/${tripId}/food-log/${id}`;
    case 'CHECKLIST_ITEM':
      return `/checklists/items/${id}`;
    default:
      void row;
      return `${COLLECTION_PATH[kind]}/${id}`;
  }
}

/**
 * The request that creates an entity.
 * Call only once every reference in `data` has been remapped to a server id.
 */
export function buildCreateRequest(kind: SyncEntityKind, tripId: number, data: Row): ApiRequest {
  const body = normalizeDates(kind, dropNullish(pick(data, CREATE_FIELDS[kind])));

  switch (kind) {
    case 'EXPENSE':
      return { method: 'POST', path: `/trips/${tripId}/expenses`, body };
    case 'FOOD_LOG':
      return { method: 'POST', path: `/trips/${tripId}/food-log`, body };
    case 'CHECKLIST_ITEM':
      return { method: 'POST', path: `/checklists/${String(data.checklistId)}/items`, body };
    case 'PHOTO': {
      const uri = typeof data.pendingUri === 'string' ? data.pendingUri : '';
      const name = uri.split('/').pop() || 'photo.jpg';
      return {
        method: 'POST',
        path: '/photos/upload',
        body: { tripId, ...body },
        upload: { uri, name, type: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg' },
      };
    }
    default:
      return {
        method: 'POST',
        path: COLLECTION_PATH[kind],
        body: { tripId, ...toWire(kind, body) },
      };
  }
}

/** Fields of a freshly created row that need a follow-up update, or null. */
export function buildPostCreatePatch(kind: SyncEntityKind, data: Row): Row | null {
  const fields = UPDATE_ONLY_FIELDS[kind];
  if (!fields) return null;
  const patch: Row = {};
  for (const field of fields) {
    const value = data[field];
    // Defaults are not worth a request.
    if (value === null || value === undefined || value === false) continue;
    if (field === 'status' && value === 'on_time') continue;
    patch[field] = value;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** The request that applies a partial update. `null` values clear a field. */
export function buildUpdateRequest(
  kind: SyncEntityKind,
  tripId: number,
  id: EntityId,
  patch: Row
): ApiRequest | null {
  const allowed = [...CREATE_FIELDS[kind], ...(UPDATE_ONLY_FIELDS[kind] ?? [])];
  const body = normalizeDates(kind, pick(patch, allowed));
  if (Object.keys(body).length === 0) return null;
  return {
    method: kind === 'SAVED_LINK' ? 'PATCH' : 'PUT',
    path: itemPath(kind, tripId, id, patch),
    body: toWire(kind, body),
  };
}

export function buildDeleteRequest(kind: SyncEntityKind, tripId: number, id: EntityId): ApiRequest {
  return { method: 'DELETE', path: itemPath(kind, tripId, id, {}) };
}

// =============================================================================
// LINKS
// =============================================================================

const toNumericId = (id: unknown): unknown =>
  typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;

export function buildLinkCreateRequest(tripId: number, link: Row): ApiRequest {
  return {
    method: 'POST',
    path: `/trips/${tripId}/links`,
    body: dropNullish({
      tripId,
      sourceType: link.sourceType,
      sourceId: toNumericId(link.sourceId),
      targetType: link.targetType,
      targetId: toNumericId(link.targetId),
      relationship: link.relationship,
      sortOrder: link.sortOrder,
      notes: link.notes,
    }),
  };
}

export function buildLinkUpdateRequest(tripId: number, id: EntityId, patch: Row): ApiRequest {
  return {
    method: 'PATCH',
    path: `/trips/${tripId}/links/${id}`,
    body: pick(patch, ['relationship', 'notes']),
  };
}

export function buildLinkDeleteRequest(tripId: number, id: EntityId): ApiRequest {
  return { method: 'DELETE', path: `/trips/${tripId}/links/${id}` };
}

/**
 * Causal rank for creates: lower runs first. Mirrors the order in the plan —
 * containers, then things that point at them, then leaves, then photos, then
 * the links that tie it all together.
 */
export function createRank(kind: OutboxKind, payload: Row): number {
  switch (kind) {
    case 'LOCATION':
      return payload.parentId ? 1 : 0;
    case 'PHOTO_ALBUM':
    case 'CHECKLIST':
      return 0;
    case 'LODGING':
    case 'TRANSPORTATION':
      return 1;
    case 'ACTIVITY':
      return payload.parentId ? 2 : 1;
    case 'JOURNAL_ENTRY':
    case 'SAVED_LINK':
    case 'CUSTOM_ITEM':
    case 'FOOD_LOG':
    case 'EXPENSE':
    case 'CHECKLIST_ITEM':
      return 3;
    case 'PHOTO':
      return 4;
    case 'LINK':
      return 5;
    default:
      return 3;
  }
}
