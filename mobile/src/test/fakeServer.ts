/**
 * An in-memory stand-in for the Travel Life API, for sync tests.
 *
 * It understands the same routes the outbox emits, assigns integer ids, keeps
 * the entity/link graph, and enforces the constraints that matter to sync
 * correctness: references must be server ids that exist, links are unique per
 * (source, target), and unknown ids are 404.
 */
import type {
  EntityLinkDto,
  MobileSyncSnapshot,
  SyncEntityKind,
  TripDto,
} from '@travel-life/shared';
import { SYNC_ENTITY_KINDS } from '@travel-life/shared';
import { ApiError, type SyncApi } from '../sync/engine';
import type { ApiRequest } from '../sync/payloads';

type Row = Record<string, unknown>;

const COLLECTIONS: readonly [RegExp, SyncEntityKind][] = [
  [/^\/locations(?:\/(\d+))?$/, 'LOCATION'],
  [/^\/activities(?:\/(\d+))?$/, 'ACTIVITY'],
  [/^\/transportation(?:\/(\d+))?$/, 'TRANSPORTATION'],
  [/^\/lodging(?:\/(\d+))?$/, 'LODGING'],
  [/^\/journal(?:\/(\d+))?$/, 'JOURNAL_ENTRY'],
  [/^\/saved-links(?:\/(\d+))?$/, 'SAVED_LINK'],
  [/^\/custom-items(?:\/(\d+))?$/, 'CUSTOM_ITEM'],
  [/^\/albums(?:\/(\d+))?$/, 'PHOTO_ALBUM'],
  [/^\/checklists(?:\/(\d+))?$/, 'CHECKLIST'],
  [/^\/photos\/(?:upload|(\d+))$/, 'PHOTO'],
  [/^\/trips\/\d+\/expenses(?:\/(\d+))?$/, 'EXPENSE'],
  [/^\/trips\/\d+\/food-log(?:\/(\d+))?$/, 'FOOD_LOG'],
  [/^\/checklists\/items\/(\d+)$/, 'CHECKLIST_ITEM'],
];

/** Wire name -> mirror column for transportation. */
const TRANSPORT_FROM_WIRE: Readonly<Record<string, string>> = {
  fromLocationId: 'startLocationId',
  toLocationId: 'endLocationId',
  fromLocationName: 'startLocationText',
  toLocationName: 'endLocationText',
  departureTime: 'scheduledStart',
  arrivalTime: 'scheduledEnd',
  carrier: 'company',
  vehicleNumber: 'referenceNumber',
  confirmationNumber: 'bookingReference',
  actualDepartureTime: 'actualStart',
  actualArrivalTime: 'actualEnd',
};

const REFERENCES: Readonly<Partial<Record<SyncEntityKind, Readonly<Record<string, SyncEntityKind>>>>> = {
  LOCATION: { parentId: 'LOCATION' },
  ACTIVITY: { parentId: 'ACTIVITY' },
  TRANSPORTATION: { startLocationId: 'LOCATION', endLocationId: 'LOCATION' },
  CUSTOM_ITEM: { locationId: 'LOCATION' },
  FOOD_LOG: { activityId: 'ACTIVITY', locationId: 'LOCATION' },
};

export class FakeServer implements SyncApi {
  readonly trip: TripDto;
  readonly entities = new Map<SyncEntityKind, Map<number, Row>>();
  readonly links = new Map<number, EntityLinkDto>();
  /** Photo ids attached to each food-log entry (the server keeps these in a join table). */
  readonly mealPhotos = new Map<number, number[]>();
  /** Every request received, in order. */
  readonly log: ApiRequest[] = [];
  /** When true every call fails as if there were no signal. */
  offline = false;
  /** Fail the Nth upcoming request (1-based) with this status, once. */
  failNext: { afterRequests: number; status: number | null; message?: string } | null = null;
  private nextId = 100;
  private clock = Date.parse('2026-06-01T08:00:00.000Z');

  constructor(trip: Partial<TripDto> = {}) {
    this.trip = {
      id: 10,
      title: 'Venice',
      description: null,
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-05T00:00:00.000Z',
      timezone: 'Europe/Rome',
      status: 'In Progress',
      countryCode: 'IT',
      budget: null,
      budgetCurrency: 'EUR',
      permission: 'owner',
      ...trip,
    };
    for (const kind of SYNC_ENTITY_KINDS) this.entities.set(kind, new Map());
  }

  private now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private table(kind: SyncEntityKind): Map<number, Row> {
    return this.entities.get(kind) as Map<number, Row>;
  }

  /** Put a row straight into the server, as if created from the web app. */
  seed(kind: SyncEntityKind, row: Row): Row {
    const id = typeof row.id === 'number' ? row.id : this.nextId++;
    const stamp = this.now();
    const stored = { tripId: this.trip.id, createdAt: stamp, updatedAt: stamp, ...row, id };
    this.table(kind).set(id, stored);
    return stored;
  }

  /** Edit a row as a collaborator would. */
  edit(kind: SyncEntityKind, id: number, patch: Row): void {
    const row = this.table(kind).get(id);
    if (!row) throw new Error(`no ${kind} ${id}`);
    this.table(kind).set(id, { ...row, ...patch, updatedAt: this.now() });
  }

  remove(kind: SyncEntityKind, id: number): void {
    this.table(kind).delete(id);
    for (const [linkId, link] of this.links) {
      if ((link.sourceType === kind && link.sourceId === id) || (link.targetType === kind && link.targetId === id)) {
        this.links.delete(linkId);
      }
    }
  }

  seedLink(link: Omit<EntityLinkDto, 'id' | 'tripId' | 'sortOrder' | 'notes'>): EntityLinkDto {
    const stored: EntityLinkDto = {
      sortOrder: null,
      notes: null,
      ...link,
      id: this.nextId++,
      tripId: this.trip.id,
    };
    this.links.set(stored.id as number, stored);
    return stored;
  }

  get(kind: SyncEntityKind, id: number): Row | undefined {
    return this.table(kind).get(id);
  }

  all(kind: SyncEntityKind): Row[] {
    return [...this.table(kind).values()];
  }

  private gate(): void {
    if (this.offline) throw new ApiError('Network request failed', null);
    if (this.failNext) {
      this.failNext.afterRequests -= 1;
      if (this.failNext.afterRequests <= 0) {
        const { status, message } = this.failNext;
        this.failNext = null;
        throw new ApiError(message ?? 'Injected failure', status);
      }
    }
  }

  private assertReferences(kind: SyncEntityKind, row: Row): void {
    for (const [field, target] of Object.entries(REFERENCES[kind] ?? {})) {
      const value = row[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== 'number') {
        throw new ApiError(`Validation failed: ${field} must be a number`, 400);
      }
      if (!this.table(target).has(value)) {
        throw new ApiError(`Referenced ${target} ${value} does not exist`, 400);
      }
    }
  }

  async getSnapshot(tripId: number, since?: string): Promise<MobileSyncSnapshot> {
    this.gate();
    if (tripId !== this.trip.id) throw new ApiError('Trip not found or access denied', 404);
    const sinceMs = since ? Date.parse(since) : null;
    const entities = {} as Record<SyncEntityKind, Row[]>;
    const ids = {} as Record<SyncEntityKind, number[]>;
    for (const kind of SYNC_ENTITY_KINDS) {
      const rows = this.all(kind);
      ids[kind] = rows.map((row) => row.id as number);
      entities[kind] =
        sinceMs === null ? rows : rows.filter((row) => Date.parse(row.updatedAt as string) > sinceMs);
    }
    return {
      serverTime: this.now(),
      delta: sinceMs !== null,
      trip: this.trip,
      entities: entities as unknown as MobileSyncSnapshot['entities'],
      links: [...this.links.values()],
      ids,
      linkIds: [...this.links.keys()],
    };
  }

  async request<T>(request: ApiRequest): Promise<T> {
    this.gate();
    this.log.push(request);
    const { method, path } = request;
    const body = { ...(request.body ?? {}) };

    // ---- links ----
    const linkMatch = /^\/trips\/(\d+)\/links(?:\/(\d+))?$/.exec(path);
    if (linkMatch) {
      const linkId = linkMatch[2] ? Number(linkMatch[2]) : null;
      if (method === 'POST') {
        for (const field of ['sourceId', 'targetId'] as const) {
          if (typeof body[field] !== 'number') {
            throw new ApiError(`Validation failed: ${field}`, 400);
          }
        }
        const sourceKind = body.sourceType as SyncEntityKind;
        const targetKind = body.targetType as SyncEntityKind;
        if (!this.table(sourceKind)?.has(body.sourceId as number)) {
          throw new ApiError('Source entity not found', 404);
        }
        if (!this.table(targetKind)?.has(body.targetId as number)) {
          throw new ApiError('Target entity not found', 404);
        }
        for (const link of this.links.values()) {
          if (
            link.sourceType === body.sourceType &&
            link.sourceId === body.sourceId &&
            link.targetType === body.targetType &&
            link.targetId === body.targetId
          ) {
            throw new ApiError('Link already exists between these entities', 400);
          }
        }
        return this.seedLink(body as unknown as EntityLinkDto) as unknown as T;
      }
      if (linkId === null || !this.links.has(linkId)) throw new ApiError('Link not found', 404);
      if (method === 'DELETE') {
        this.links.delete(linkId);
        return null as T;
      }
      const updated = { ...(this.links.get(linkId) as EntityLinkDto), ...(body as Partial<EntityLinkDto>) };
      this.links.set(linkId, updated);
      return updated as unknown as T;
    }

    // ---- checklist items are created under their checklist ----
    const itemCreate = /^\/checklists\/(\d+)\/items$/.exec(path);
    if (itemCreate && method === 'POST') {
      const checklistId = Number(itemCreate[1]);
      if (!this.table('CHECKLIST').has(checklistId)) throw new ApiError('Checklist not found', 404);
      return this.seed('CHECKLIST_ITEM', { ...body, checklistId, tripId: undefined }) as T;
    }

    // ---- photos attach to a food-log entry; a join, not a column ----
    const attach = /^\/trips\/\d+\/food-log\/(\d+)\/photos$/.exec(path);
    if (attach && method === 'POST') {
      const entryId = Number(attach[1]);
      if (!this.table('FOOD_LOG').has(entryId)) throw new ApiError('Food log entry not found', 404);
      const photoIds = body.photoIds as number[];
      for (const photoId of photoIds) {
        if (typeof photoId !== 'number' || !this.table('PHOTO').has(photoId)) {
          throw new ApiError('One or more photos were not found in this trip', 404);
        }
      }
      const have = new Set(this.mealPhotos.get(entryId) ?? []);
      for (const photoId of photoIds) have.add(photoId);
      this.mealPhotos.set(entryId, [...have]);
      return null as T;
    }

    for (const [pattern, kind] of COLLECTIONS) {
      const match = pattern.exec(path);
      if (!match) continue;
      const id = match[1] ? Number(match[1]) : null;

      let row: Row = body;
      if (kind === 'TRANSPORTATION') {
        row = {};
        for (const [key, value] of Object.entries(body)) row[TRANSPORT_FROM_WIRE[key] ?? key] = value;
      }

      if (method === 'POST') {
        // Mirrors the real create schemas: null is rejected, absent is fine.
        for (const [key, value] of Object.entries(row)) {
          if (value === null && kind !== 'TRANSPORTATION' && kind !== 'EXPENSE' && kind !== 'FOOD_LOG') {
            throw new ApiError(`Validation failed: ${key} must not be null on create`, 400);
          }
        }
        if (kind === 'PHOTO' && !request.upload?.uri) {
          throw new ApiError('No file uploaded', 400);
        }
        this.assertReferences(kind, row);
        return this.seed(kind, row) as T;
      }

      if (id === null || !this.table(kind).has(id)) throw new ApiError(`${kind} not found`, 404);
      if (method === 'DELETE') {
        this.remove(kind, id);
        return null as T;
      }
      this.assertReferences(kind, row);
      this.edit(kind, id, row);
      return this.get(kind, id) as T;
    }

    throw new ApiError(`FakeServer: no route for ${method} ${path}`, 404);
  }
}
