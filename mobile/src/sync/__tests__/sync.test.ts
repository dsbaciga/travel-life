/**
 * Offline sync engine tests (real SQLite, in-memory fake API)
 *
 * Test cases:
 * - SYNC-001: Pull mirrors a full snapshot and records the sync time
 * - SYNC-002: Delta pull applies changes and removes rows deleted elsewhere
 * - SYNC-003: Pull keeps unsynced local fields and still shows collaborator edits to other fields
 * - SYNC-004: Pull does not resurrect a row whose delete is still queued
 * - SYNC-010: Offline create -> flush assigns a server id and remaps the entity row
 * - SYNC-011: Offline Location + Activity + EntityLink sync in causal order with remapped link ends
 * - SYNC-012: Parent/child and foreign-key references are remapped (child location, transport legs, food log)
 * - SYNC-013: Editing an unsynced entity folds into its create (one request)
 * - SYNC-014: Deleting an unsynced entity sends nothing and drops its queued links
 * - SYNC-015: Update-only fields on a new row go out as a follow-up update
 * - SYNC-016: Transportation fields are aliased to the API's wire names
 * - SYNC-020: Two edits to one entity coalesce into one update with the earliest baseline
 * - SYNC-021: Non-overlapping collaborator edit merges automatically
 * - SYNC-022: Overlapping collaborator edit is held as a conflict, nothing is sent
 * - SYNC-023: Resolving "mine" overwrites; resolving "theirs" adopts the server value
 * - SYNC-024: Same value on both sides is not a conflict
 * - SYNC-030: Offline flush is interrupted and loses nothing; retrying completes
 * - SYNC-031: Losing signal mid-flush leaves the remaining graph intact and consistent
 * - SYNC-032: A server rejection marks that entry failed and blocks only its dependents
 * - SYNC-033: Update/delete of something already deleted on the server is not an error
 * - SYNC-034: A duplicate link is treated as already done
 * - SYNC-035: Discarding a failed create removes the local row and its links
 * - SYNC-040: Unlink hides immediately and deletes on the server; re-linking cancels a queued unlink
 * - SYNC-041: Delete of a synced entity removes it and its links locally and remotely
 * - SYNC-051: Offline meal + photos sync in order and the photos end up attached to the meal
 * - SYNC-050: The plan's E2E flow — offline create + link, reschedule existing, reconnect, verify server
 * - SYNC-060: sameValue / detectConflicts semantics
 * - SYNC-061: Migrations are idempotent and wipe() empties every table
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActivityDto, LocationDto } from '@travel-life/shared';
import { isLocalId } from '@travel-life/shared';
import { migrate, wipe } from '../../db/schema';
import {
  getEntity,
  getLastSyncedAt,
  getTrip,
  listEntities,
  listLinks,
  listLinksFor,
} from '../../db/repository';
import {
  adjustTime,
  createAndLink,
  createEntity,
  createLink,
  deleteEntity,
  removeLink,
  setIdFactory,
  updateEntity,
} from '../../domain/mutations';
import { createTestDb } from '../../test/nodeSqliteDriver';
import { FakeServer } from '../../test/fakeServer';
import {
  detectConflicts,
  discardFailedEntry,
  flushOutbox,
  pullTrip,
  resolveConflict,
  resolveEntityId,
  sameValue,
  syncTrip,
} from '../engine';
import { countOutbox, listOutbox } from '../outbox';

type Db = Awaited<ReturnType<typeof createTestDb>>;

const TRIP = 10;

const activityInput = (overrides: Partial<ActivityDto> = {}): Omit<ActivityDto, 'id' | 'tripId'> => ({
  parentId: null,
  name: 'Gelato stop',
  description: null,
  category: 'Dining',
  allDay: false,
  startTime: '2026-06-02T13:00:00.000Z',
  endTime: '2026-06-02T13:30:00.000Z',
  timezone: null,
  cost: null,
  currency: null,
  bookingUrl: null,
  bookingReference: null,
  notes: null,
  manualOrder: null,
  ...overrides,
});

const locationInput = (overrides: Partial<LocationDto> = {}): Omit<LocationDto, 'id' | 'tripId'> => ({
  parentId: null,
  name: 'Gelateria Nico',
  address: null,
  latitude: 45.4296,
  longitude: 12.3271,
  categoryId: null,
  visitDatetime: null,
  visitDurationMinutes: null,
  notes: null,
  isFavorite: false,
  openingHours: null,
  timezone: null,
  ...overrides,
});

describe('sync engine', () => {
  let db: Db;
  let server: FakeServer;
  let counter: number;

  beforeEach(async () => {
    db = await createTestDb();
    server = new FakeServer();
    counter = 0;
    setIdFactory(() => `t${++counter}`);
  });

  afterEach(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // PULL
  // ---------------------------------------------------------------------------

  it('SYNC-001: pull mirrors a full snapshot and records the sync time', async () => {
    const loc = server.seed('LOCATION', locationInput({ name: 'Rialto' }));
    const act = server.seed('ACTIVITY', activityInput({ name: 'Walk' }));
    server.seedLink({
      sourceType: 'ACTIVITY',
      sourceId: act.id as number,
      targetType: 'LOCATION',
      targetId: loc.id as number,
      relationship: 'OCCURRED_AT',
    });

    const result = await pullTrip(db, server, TRIP);

    expect(result.upserted).toBe(2);
    expect((await getTrip(db, TRIP))?.title).toBe('Venice');
    expect(await getLastSyncedAt(db, TRIP)).not.toBeNull();
    expect((await listEntities(db, TRIP, 'LOCATION')).map((l) => l.name)).toEqual(['Rialto']);
    const links = await listLinksFor(db, TRIP, 'ACTIVITY', act.id as number);
    expect(links).toHaveLength(1);
    expect(links[0].targetId).toBe(loc.id);
  });

  it('SYNC-002: delta pull applies changes and removes rows deleted elsewhere', async () => {
    const keep = server.seed('ACTIVITY', activityInput({ name: 'Keep' }));
    const gone = server.seed('ACTIVITY', activityInput({ name: 'Gone' }));
    await pullTrip(db, server, TRIP);

    server.edit('ACTIVITY', keep.id as number, { name: 'Kept and renamed' });
    server.remove('ACTIVITY', gone.id as number);
    const result = await pullTrip(db, server, TRIP);

    expect(result.upserted).toBe(1);
    expect(result.removed).toBe(1);
    expect((await listEntities(db, TRIP, 'ACTIVITY')).map((a) => a.name)).toEqual(['Kept and renamed']);
  });

  it('SYNC-003: pull keeps unsynced local fields and shows collaborator edits to other fields', async () => {
    const act = server.seed('ACTIVITY', activityInput({ notes: 'original' }));
    await pullTrip(db, server, TRIP);

    await updateEntity(db, 'ACTIVITY', act.id as number, { name: 'My offline rename' });
    server.edit('ACTIVITY', act.id as number, { notes: 'collaborator note' });
    await pullTrip(db, server, TRIP);

    const local = await getEntity(db, 'ACTIVITY', act.id as number);
    expect(local?.name).toBe('My offline rename');
    expect(local?.notes).toBe('collaborator note');
    expect((await countOutbox(db)).pending).toBe(1);
  });

  it('SYNC-004: pull does not resurrect a row whose delete is still queued', async () => {
    const act = server.seed('ACTIVITY', activityInput());
    await pullTrip(db, server, TRIP);
    await deleteEntity(db, 'ACTIVITY', act.id as number);

    await pullTrip(db, server, TRIP, { full: true });

    expect(await listEntities(db, TRIP, 'ACTIVITY')).toHaveLength(0);
    expect((await listOutbox(db))[0]).toMatchObject({ op: 'delete', kind: 'ACTIVITY' });
  });

  // ---------------------------------------------------------------------------
  // CREATE + REMAP
  // ---------------------------------------------------------------------------

  it('SYNC-010: offline create -> flush assigns a server id and remaps the entity row', async () => {
    await pullTrip(db, server, TRIP);
    const local = await createEntity(db, 'ACTIVITY', TRIP, activityInput());
    expect(isLocalId(local.id)).toBe(true);

    const result = await flushOutbox(db, server);

    expect(result).toMatchObject({ sent: 1, failed: 0, blocked: 0, interrupted: false });
    const rows = await listEntities(db, TRIP, 'ACTIVITY');
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].id).toBe('number');
    expect(server.get('ACTIVITY', rows[0].id as number)?.name).toBe('Gelato stop');
    // A screen still holding the local id can find where it went.
    expect(await resolveEntityId(db, 'ACTIVITY', local.id)).toBe(rows[0].id);
    expect(await getEntity(db, 'ACTIVITY', local.id)).toBeNull();
    // The request carried the trip id and no local-only fields.
    expect(server.log[0].body).not.toHaveProperty('id');
    expect(server.log[0].body).toMatchObject({ tripId: TRIP, name: 'Gelato stop' });
  });

  it('SYNC-011: offline Location + Activity + EntityLink sync in causal order', async () => {
    await pullTrip(db, server, TRIP);
    // Created in the "wrong" order on purpose: the link's target does not exist yet.
    const activity = await createEntity(db, 'ACTIVITY', TRIP, activityInput());
    const { entity: location, link } = await createAndLink(
      db,
      TRIP,
      { type: 'ACTIVITY', id: activity.id },
      'LOCATION',
      locationInput()
    );
    expect(link.relationship).toBe('OCCURRED_AT');
    expect(isLocalId(link.sourceId) && isLocalId(link.targetId)).toBe(true);

    const result = await flushOutbox(db, server);

    expect(result.sent).toBe(3);
    expect(server.log.map((r) => r.path)).toEqual(['/locations', '/activities', `/trips/${TRIP}/links`]);
    const serverLinks = [...server.links.values()];
    expect(serverLinks).toHaveLength(1);
    const serverActivity = server.all('ACTIVITY')[0];
    const serverLocation = server.all('LOCATION')[0];
    expect(serverLinks[0]).toMatchObject({
      sourceType: 'ACTIVITY',
      sourceId: serverActivity.id,
      targetType: 'LOCATION',
      targetId: serverLocation.id,
      relationship: 'OCCURRED_AT',
    });

    // Local mirror is fully on server ids, with no stragglers.
    const localLinks = await listLinks(db, TRIP);
    expect(localLinks).toHaveLength(1);
    expect(localLinks[0].id).toBe(serverLinks[0].id);
    expect(localLinks[0].sourceId).toBe(serverActivity.id);
    expect(localLinks[0].targetId).toBe(serverLocation.id);
    expect(await getEntity(db, 'LOCATION', location.id)).toBeNull();
    expect(await listOutbox(db)).toHaveLength(0);
  });

  it('SYNC-012: parent/child and foreign-key references are remapped', async () => {
    await pullTrip(db, server, TRIP);
    const parent = await createEntity(db, 'LOCATION', TRIP, locationInput({ name: 'Dorsoduro' }));
    const child = await createEntity(
      db,
      'LOCATION',
      TRIP,
      locationInput({ name: 'Gelateria Nico', parentId: parent.id })
    );
    const station = await createEntity(db, 'LOCATION', TRIP, locationInput({ name: 'Santa Lucia' }));
    const leg = await createEntity(db, 'TRANSPORTATION', TRIP, {
      type: 'train',
      startLocationId: station.id,
      startLocationText: null,
      endLocationId: null,
      endLocationText: 'Verona',
      scheduledStart: '2026-06-03T08:00:00.000Z',
      scheduledEnd: '2026-06-03T09:10:00.000Z',
      startTimezone: null,
      endTimezone: null,
      actualStart: null,
      actualEnd: null,
      company: 'Trenitalia',
      referenceNumber: 'FR9710',
      seatNumber: null,
      bookingReference: 'ABC123',
      cost: 23.9,
      currency: 'EUR',
      status: 'on_time',
      delayMinutes: null,
      notes: null,
    });
    const meal = await createEntity(db, 'ACTIVITY', TRIP, activityInput({ name: 'Lunch' }));
    await createEntity(db, 'FOOD_LOG', TRIP, {
      activityId: meal.id,
      locationId: child.id,
      restaurantName: 'Nico',
      dish: 'Gianduiotto',
      rating: 5,
      notes: null,
      orderAgain: true,
    });

    const result = await flushOutbox(db, server);

    expect(result).toMatchObject({ sent: 6, failed: 0, blocked: 0 });
    const byName = (name: string) => server.all('LOCATION').find((l) => l.name === name);
    expect(byName('Gelateria Nico')?.parentId).toBe(byName('Dorsoduro')?.id);
    expect(server.all('TRANSPORTATION')[0].startLocationId).toBe(byName('Santa Lucia')?.id);
    const food = server.all('FOOD_LOG')[0];
    expect(food.activityId).toBe(server.all('ACTIVITY')[0].id);
    expect(food.locationId).toBe(byName('Gelateria Nico')?.id);

    // And the local rows point at server ids too.
    const localLeg = (await listEntities(db, TRIP, 'TRANSPORTATION'))[0];
    expect(localLeg.startLocationId).toBe(byName('Santa Lucia')?.id);
    expect(await getEntity(db, 'TRANSPORTATION', leg.id)).toBeNull();
    const localChild = (await listEntities(db, TRIP, 'LOCATION')).find((l) => l.name === 'Gelateria Nico');
    expect(localChild?.parentId).toBe(byName('Dorsoduro')?.id);
  });

  it('SYNC-013: editing an unsynced entity folds into its create', async () => {
    await pullTrip(db, server, TRIP);
    const local = await createEntity(db, 'ACTIVITY', TRIP, activityInput());
    await updateEntity(db, 'ACTIVITY', local.id, { name: 'Two scoops', notes: 'pistachio' });
    await updateEntity(db, 'ACTIVITY', local.id, { notes: 'pistachio + stracciatella' });

    expect(await listOutbox(db)).toHaveLength(1);
    await flushOutbox(db, server);

    expect(server.log).toHaveLength(1);
    expect(server.all('ACTIVITY')[0]).toMatchObject({
      name: 'Two scoops',
      notes: 'pistachio + stracciatella',
    });
  });

  it('SYNC-014: deleting an unsynced entity sends nothing and drops its queued links', async () => {
    const loc = server.seed('LOCATION', locationInput());
    await pullTrip(db, server, TRIP);
    const local = await createEntity(db, 'ACTIVITY', TRIP, activityInput(), [
      { targetType: 'LOCATION', targetId: loc.id as number },
    ]);
    expect(await listOutbox(db)).toHaveLength(2);

    await deleteEntity(db, 'ACTIVITY', local.id);

    expect(await listOutbox(db)).toHaveLength(0);
    expect(await listLinks(db, TRIP)).toHaveLength(0);
    const result = await flushOutbox(db, server);
    expect(result.sent).toBe(0);
    expect(server.log).toHaveLength(0);
  });

  it('SYNC-015: update-only fields on a new row go out as a follow-up update', async () => {
    await pullTrip(db, server, TRIP);
    await createEntity(db, 'LOCATION', TRIP, locationInput({ isFavorite: true }));

    const result = await flushOutbox(db, server);

    expect(result.sent).toBe(2);
    expect(server.log.map((r) => r.method)).toEqual(['POST', 'PUT']);
    expect(server.log[0].body).not.toHaveProperty('isFavorite');
    expect(server.log[1].body).toEqual({ isFavorite: true });
    expect(server.all('LOCATION')[0].isFavorite).toBe(true);
  });

  it('SYNC-016: transportation fields are aliased to the wire names', async () => {
    const leg = server.seed('TRANSPORTATION', {
      type: 'train',
      scheduledStart: '2026-06-03T08:00:00.000Z',
      actualStart: null,
      status: 'on_time',
      delayMinutes: null,
      company: 'Trenitalia',
    });
    await pullTrip(db, server, TRIP);

    await updateEntity(db, 'TRANSPORTATION', leg.id as number, {
      actualStart: '2026-06-03T08:25:00.000Z',
      status: 'delayed',
      delayMinutes: 25,
      company: 'Italo',
    });
    await flushOutbox(db, server);

    expect(server.log[0]).toMatchObject({
      method: 'PUT',
      path: `/transportation/${leg.id}`,
      body: {
        actualDepartureTime: '2026-06-03T08:25:00.000Z',
        status: 'delayed',
        delayMinutes: 25,
        carrier: 'Italo',
      },
    });
    expect(server.get('TRANSPORTATION', leg.id as number)).toMatchObject({
      actualStart: '2026-06-03T08:25:00.000Z',
      company: 'Italo',
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATES + CONFLICTS
  // ---------------------------------------------------------------------------

  it('SYNC-020: two edits coalesce into one update with the earliest baseline', async () => {
    const act = server.seed('ACTIVITY', activityInput({ name: 'A' }));
    await pullTrip(db, server, TRIP);

    await updateEntity(db, 'ACTIVITY', act.id as number, { name: 'B' });
    await updateEntity(db, 'ACTIVITY', act.id as number, { name: 'C', notes: 'n' });

    const queue = await listOutbox(db);
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toEqual({ name: 'C', notes: 'n' });
    expect(queue[0].base).toEqual({ name: 'A', notes: null });

    await flushOutbox(db, server);
    expect(server.log).toHaveLength(1);
  });

  it('SYNC-021: non-overlapping collaborator edit merges automatically', async () => {
    const act = server.seed('ACTIVITY', activityInput({ notes: 'old' }));
    await pullTrip(db, server, TRIP);

    await adjustTime(db, 'ACTIVITY', act.id as number, { type: 'shift', minutes: 30 }, 'Europe/Rome');
    server.edit('ACTIVITY', act.id as number, { notes: 'collaborator wrote this' });

    const result = await syncTrip(db, server, TRIP);

    expect(result).toMatchObject({ sent: 1, conflicts: 0 });
    expect(server.get('ACTIVITY', act.id as number)).toMatchObject({
      startTime: '2026-06-02T13:30:00.000Z',
      endTime: '2026-06-02T14:00:00.000Z',
      notes: 'collaborator wrote this',
    });
    expect(await getEntity(db, 'ACTIVITY', act.id as number)).toMatchObject({
      startTime: '2026-06-02T13:30:00.000Z',
      notes: 'collaborator wrote this',
    });
  });

  it('SYNC-022: overlapping collaborator edit is held as a conflict', async () => {
    const act = server.seed('ACTIVITY', activityInput());
    await pullTrip(db, server, TRIP);

    await adjustTime(db, 'ACTIVITY', act.id as number, { type: 'shift', minutes: 30 }, 'Europe/Rome');
    server.edit('ACTIVITY', act.id as number, { startTime: '2026-06-02T15:00:00.000Z' });

    const result = await syncTrip(db, server, TRIP);

    expect(result).toMatchObject({ sent: 0, conflicts: 1 });
    expect(server.log).toHaveLength(0);
    const [entry] = await listOutbox(db, { status: 'conflict' });
    expect(entry.conflict).toEqual([
      {
        field: 'startTime',
        base: '2026-06-02T13:00:00.000Z',
        mine: '2026-06-02T13:30:00.000Z',
        theirs: '2026-06-02T15:00:00.000Z',
      },
    ]);
    // The server's value was not overwritten.
    expect(server.get('ACTIVITY', act.id as number)?.startTime).toBe('2026-06-02T15:00:00.000Z');
  });

  it('SYNC-023: resolving "mine" overwrites; resolving "theirs" adopts the server value', async () => {
    const mine = server.seed('ACTIVITY', activityInput({ name: 'Mine' }));
    const theirs = server.seed('ACTIVITY', activityInput({ name: 'Theirs' }));
    await pullTrip(db, server, TRIP);

    for (const act of [mine, theirs]) {
      await updateEntity(db, 'ACTIVITY', act.id as number, {
        startTime: '2026-06-02T13:30:00.000Z',
        notes: 'local note',
      });
      server.edit('ACTIVITY', act.id as number, { startTime: '2026-06-02T15:00:00.000Z' });
    }
    await syncTrip(db, server, TRIP);
    const held = await listOutbox(db, { status: 'conflict' });
    expect(held).toHaveLength(2);

    await resolveConflict(db, held.find((e) => e.entityId === String(mine.id))!.seq, 'mine');
    await resolveConflict(db, held.find((e) => e.entityId === String(theirs.id))!.seq, 'theirs');
    const result = await syncTrip(db, server, TRIP);

    expect(result).toMatchObject({ sent: 2, conflicts: 0 });
    expect(server.get('ACTIVITY', mine.id as number)).toMatchObject({
      startTime: '2026-06-02T13:30:00.000Z',
      notes: 'local note',
    });
    // "Theirs" keeps the server time but the non-conflicting note still went out.
    expect(server.get('ACTIVITY', theirs.id as number)).toMatchObject({
      startTime: '2026-06-02T15:00:00.000Z',
      notes: 'local note',
    });
    expect((await getEntity(db, 'ACTIVITY', theirs.id as number))?.startTime).toBe(
      '2026-06-02T15:00:00.000Z'
    );
    expect(await listOutbox(db)).toHaveLength(0);
  });

  it('SYNC-024: the same value on both sides is not a conflict', async () => {
    const act = server.seed('ACTIVITY', activityInput());
    await pullTrip(db, server, TRIP);

    await updateEntity(db, 'ACTIVITY', act.id as number, { name: 'Agreed name' });
    server.edit('ACTIVITY', act.id as number, { name: 'Agreed name' });

    const result = await syncTrip(db, server, TRIP);
    expect(result.conflicts).toBe(0);
    expect(await listOutbox(db)).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // FAILURE MODES
  // ---------------------------------------------------------------------------

  it('SYNC-030: offline flush is interrupted and loses nothing; retrying completes', async () => {
    await pullTrip(db, server, TRIP);
    await createEntity(db, 'ACTIVITY', TRIP, activityInput());

    server.offline = true;
    const offline = await syncTrip(db, server, TRIP);
    expect(offline).toMatchObject({ sent: 0, interrupted: true, pulled: false });
    expect((await countOutbox(db)).pending).toBe(1);
    expect(await listEntities(db, TRIP, 'ACTIVITY')).toHaveLength(1);

    server.offline = false;
    const online = await syncTrip(db, server, TRIP);
    expect(online).toMatchObject({ sent: 1, interrupted: false });
    expect(server.all('ACTIVITY')).toHaveLength(1);
  });

  it('SYNC-031: losing signal mid-flush leaves the remaining graph consistent', async () => {
    await pullTrip(db, server, TRIP);
    const activity = await createEntity(db, 'ACTIVITY', TRIP, activityInput());
    await createAndLink(db, TRIP, { type: 'ACTIVITY', id: activity.id }, 'LOCATION', locationInput());

    // The location create succeeds, then the connection drops.
    server.failNext = { afterRequests: 2, status: null };
    const first = await flushOutbox(db, server);
    expect(first).toMatchObject({ sent: 1, interrupted: true });

    // Half-synced state: the link already points at the location's server id,
    // while its source is still local and still queued.
    const [link] = await listLinks(db, TRIP);
    expect(typeof link.targetId).toBe('number');
    expect(isLocalId(link.sourceId)).toBe(true);
    const queued = await listOutbox(db);
    expect(queued.map((e) => `${e.kind}:${e.op}`)).toEqual(['ACTIVITY:create', 'LINK:create']);
    expect(queued[1].payload.targetId).toBe(link.targetId);

    const second = await flushOutbox(db, server);
    expect(second).toMatchObject({ sent: 2, interrupted: false, blocked: 0 });
    // No duplicate location was created by the retry.
    expect(server.all('LOCATION')).toHaveLength(1);
    expect(server.links.size).toBe(1);
  });

  it('SYNC-032: a server rejection fails that entry and blocks only its dependents', async () => {
    await pullTrip(db, server, TRIP);
    const activity = await createEntity(db, 'ACTIVITY', TRIP, activityInput({ name: 'Rejected' }));
    await createAndLink(db, TRIP, { type: 'ACTIVITY', id: activity.id }, 'LOCATION', locationInput());
    await createEntity(db, 'ACTIVITY', TRIP, activityInput({ name: 'Unrelated' }));

    // Requests in causal order: location, then the first activity (rejected).
    server.failNext = { afterRequests: 2, status: 400, message: 'Validation failed: name' };
    const result = await flushOutbox(db, server);

    expect(result).toMatchObject({ sent: 2, failed: 1, blocked: 1, interrupted: false });
    expect(server.all('ACTIVITY').map((a) => a.name)).toEqual(['Unrelated']);
    const failed = await listOutbox(db, { status: 'failed' });
    expect(failed).toHaveLength(1);
    expect(failed[0].lastError).toContain('Validation failed');
    // The link waits; it was never sent with a local id.
    expect(server.links.size).toBe(0);
    expect((await listOutbox(db, { status: 'pending' })).map((e) => e.kind)).toEqual(['LINK']);
  });

  it('SYNC-033: update/delete of something already deleted on the server is not an error', async () => {
    const edited = server.seed('ACTIVITY', activityInput({ name: 'Edited' }));
    const deleted = server.seed('ACTIVITY', activityInput({ name: 'Deleted' }));
    await pullTrip(db, server, TRIP);

    await updateEntity(db, 'ACTIVITY', edited.id as number, { name: 'New name' });
    await deleteEntity(db, 'ACTIVITY', deleted.id as number);
    server.remove('ACTIVITY', edited.id as number);
    server.remove('ACTIVITY', deleted.id as number);

    const result = await flushOutbox(db, server);
    expect(result).toMatchObject({ sent: 2, failed: 0 });
    expect(await listOutbox(db)).toHaveLength(0);

    await pullTrip(db, server, TRIP);
    expect(await listEntities(db, TRIP, 'ACTIVITY')).toHaveLength(0);
  });

  it('SYNC-034: a duplicate link is treated as already done', async () => {
    const act = server.seed('ACTIVITY', activityInput());
    const loc = server.seed('LOCATION', locationInput());
    await pullTrip(db, server, TRIP);

    await createLink(db, TRIP, 'ACTIVITY', act.id as number, {
      targetType: 'LOCATION',
      targetId: loc.id as number,
    });
    // A collaborator makes the same link before this phone reconnects.
    const theirs = server.seedLink({
      sourceType: 'ACTIVITY',
      sourceId: act.id as number,
      targetType: 'LOCATION',
      targetId: loc.id as number,
      relationship: 'OCCURRED_AT',
    });

    const result = await flushOutbox(db, server);
    expect(result).toMatchObject({ sent: 1, failed: 0 });
    await pullTrip(db, server, TRIP);

    const links = await listLinks(db, TRIP);
    expect(links).toHaveLength(1);
    expect(links[0].id).toBe(theirs.id);
    expect(server.links.size).toBe(1);
  });

  it('SYNC-035: discarding a failed create removes the local row and its links', async () => {
    const loc = server.seed('LOCATION', locationInput());
    await pullTrip(db, server, TRIP);
    await createEntity(db, 'ACTIVITY', TRIP, activityInput(), [
      { targetType: 'LOCATION', targetId: loc.id as number },
    ]);
    server.failNext = { afterRequests: 1, status: 400, message: 'nope' };
    await flushOutbox(db, server);
    const [failed] = await listOutbox(db, { status: 'failed' });

    await discardFailedEntry(db, failed.seq);

    expect(await listEntities(db, TRIP, 'ACTIVITY')).toHaveLength(0);
    expect(await listLinks(db, TRIP)).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // LINKS + DELETES
  // ---------------------------------------------------------------------------

  it('SYNC-040: unlink hides immediately and deletes remotely; re-linking cancels a queued unlink', async () => {
    const act = server.seed('ACTIVITY', activityInput());
    const loc = server.seed('LOCATION', locationInput());
    const link = server.seedLink({
      sourceType: 'ACTIVITY',
      sourceId: act.id as number,
      targetType: 'LOCATION',
      targetId: loc.id as number,
      relationship: 'OCCURRED_AT',
    });
    await pullTrip(db, server, TRIP);

    await removeLink(db, link.id);
    expect(await listLinks(db, TRIP)).toHaveLength(0);

    // Changed their mind before syncing.
    await createLink(db, TRIP, 'ACTIVITY', act.id as number, {
      targetType: 'LOCATION',
      targetId: loc.id as number,
    });
    expect(await listLinks(db, TRIP)).toHaveLength(1);
    expect(await listOutbox(db)).toHaveLength(0);

    await removeLink(db, link.id);
    const result = await flushOutbox(db, server);
    expect(result.sent).toBe(1);
    expect(server.links.size).toBe(0);
    expect(await listLinks(db, TRIP)).toHaveLength(0);
  });

  it('SYNC-041: deleting a synced entity removes it and its links locally and remotely', async () => {
    const act = server.seed('ACTIVITY', activityInput());
    const loc = server.seed('LOCATION', locationInput());
    server.seedLink({
      sourceType: 'ACTIVITY',
      sourceId: act.id as number,
      targetType: 'LOCATION',
      targetId: loc.id as number,
      relationship: 'OCCURRED_AT',
    });
    await pullTrip(db, server, TRIP);

    await deleteEntity(db, 'ACTIVITY', act.id as number);
    expect(await listLinks(db, TRIP)).toHaveLength(0);

    const result = await syncTrip(db, server, TRIP);
    expect(result.sent).toBe(1);
    expect(server.log.map((r) => `${r.method} ${r.path}`)).toEqual([`DELETE /activities/${act.id}`]);
    expect(server.all('ACTIVITY')).toHaveLength(0);
    expect(server.links.size).toBe(0);
    expect(await listEntities(db, TRIP, 'LOCATION')).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // END TO END
  // ---------------------------------------------------------------------------

  it('SYNC-050: offline create + link, reschedule existing, reconnect, verify server', async () => {
    const museum = server.seed(
      'ACTIVITY',
      activityInput({
        name: 'Accademia',
        startTime: '2026-06-02T08:00:00.000Z',
        endTime: '2026-06-02T10:00:00.000Z',
      })
    );
    await syncTrip(db, server, TRIP);

    // --- signal lost ---
    server.offline = true;
    const stop = await createEntity(db, 'ACTIVITY', TRIP, activityInput({ name: 'Spritz by the canal' }));
    const { entity: bar } = await createAndLink(
      db,
      TRIP,
      { type: 'ACTIVITY', id: stop.id },
      'LOCATION',
      locationInput({ name: 'Bar al Canale' })
    );
    await adjustTime(db, 'ACTIVITY', museum.id as number, { type: 'moveDays', days: 1 }, 'Europe/Rome');
    expect((await syncTrip(db, server, TRIP)).interrupted).toBe(true);

    // Everything is usable offline.
    expect((await listEntities(db, TRIP, 'ACTIVITY')).map((a) => a.name).sort()).toEqual([
      'Accademia',
      'Spritz by the canal',
    ]);
    expect(await listLinksFor(db, TRIP, 'LOCATION', bar.id)).toHaveLength(1);

    // --- signal back ---
    server.offline = false;
    const result = await syncTrip(db, server, TRIP);

    expect(result).toMatchObject({ sent: 4, failed: 0, conflicts: 0, blocked: 0, interrupted: false });
    const serverStop = server.all('ACTIVITY').find((a) => a.name === 'Spritz by the canal');
    const serverBar = server.all('LOCATION').find((l) => l.name === 'Bar al Canale');
    expect(serverStop && serverBar).toBeTruthy();
    expect([...server.links.values()]).toEqual([
      expect.objectContaining({
        sourceType: 'ACTIVITY',
        sourceId: serverStop?.id,
        targetType: 'LOCATION',
        targetId: serverBar?.id,
        relationship: 'OCCURRED_AT',
      }),
    ]);
    // Same wall-clock time, one day later.
    expect(server.get('ACTIVITY', museum.id as number)).toMatchObject({
      startTime: '2026-06-03T08:00:00.000Z',
      endTime: '2026-06-03T10:00:00.000Z',
    });
    expect(await listOutbox(db)).toHaveLength(0);
    const localIds = (await listEntities(db, TRIP, 'ACTIVITY')).map((a) => a.id);
    expect(localIds.every((id) => typeof id === 'number')).toBe(true);
  });

  it('SYNC-051: an offline meal with photos uploads them and attaches them to the meal', async () => {
    server.offline = true;
    const meal = await createEntity(db, 'FOOD_LOG', TRIP, {
      activityId: null,
      locationId: null,
      restaurantName: 'Trattoria',
      dish: 'Cacio e pepe',
      rating: 5,
      notes: null,
      orderAgain: true,
    });
    for (const uri of ['file:///a.jpg', 'file:///b.jpg']) {
      await createEntity(db, 'PHOTO', TRIP, {
        source: 'local',
        mediaType: 'image',
        localPath: null,
        thumbnailPath: null,
        caption: null,
        latitude: null,
        longitude: null,
        takenAt: '2026-06-02T12:00:00.000Z',
        pendingUri: uri,
        foodLogId: meal.id,
      });
    }
    expect((await syncTrip(db, server, TRIP)).interrupted).toBe(true);

    server.offline = false;
    const result = await syncTrip(db, server, TRIP);

    expect(result).toMatchObject({ failed: 0, blocked: 0, interrupted: false });
    const serverMeal = server.all('FOOD_LOG')[0];
    const photoIds = server.all('PHOTO').map((p) => p.id);
    expect(photoIds).toHaveLength(2);
    // Both photos hang off the meal's real id, not a local one.
    expect(new Set(server.mealPhotos.get(serverMeal.id as number))).toEqual(new Set(photoIds as number[]));
    // The photo create must not leak the device-only reference to the server.
    expect(server.log.some((r) => r.path === '/photos/upload' && r.body && 'foodLogId' in r.body)).toBe(false);
    expect(await listOutbox(db)).toHaveLength(0);
  });

  it('SYNC-052: photos added to an already-synced meal are attached on the next sync', async () => {
    const meal = server.seed('FOOD_LOG', {
      activityId: null,
      locationId: null,
      restaurantName: 'Bar',
      dish: 'Spritz',
      rating: 4,
      notes: null,
      orderAgain: false,
    });
    await syncTrip(db, server, TRIP);

    await createEntity(db, 'PHOTO', TRIP, {
      source: 'local',
      mediaType: 'image',
      localPath: null,
      thumbnailPath: null,
      caption: null,
      latitude: null,
      longitude: null,
      takenAt: '2026-06-02T12:00:00.000Z',
      pendingUri: 'file:///c.jpg',
      foodLogId: meal.id as number,
    });
    const result = await syncTrip(db, server, TRIP);

    expect(result).toMatchObject({ failed: 0, blocked: 0 });
    expect(server.mealPhotos.get(meal.id as number)).toEqual([server.all('PHOTO')[0].id]);
    expect(await listOutbox(db)).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // UNITS
  // ---------------------------------------------------------------------------

  it('SYNC-060: sameValue / detectConflicts semantics', () => {
    expect(sameValue('2026-06-02T13:00:00Z', '2026-06-02T13:00:00.000Z')).toBe(true);
    expect(sameValue('2026-06-02T15:00:00+02:00', '2026-06-02T13:00:00.000Z')).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(null, '')).toBe(false);
    expect(sameValue(1, 1)).toBe(true);
    expect(sameValue('Museum', 'museum')).toBe(false);
    expect(sameValue(['a'], ['a'])).toBe(true);

    expect(detectConflicts({ name: 'B' }, { name: 'A' }, { name: 'A' })).toEqual([]);
    expect(detectConflicts({ name: 'B' }, { name: 'A' }, { name: 'B' })).toEqual([]);
    expect(detectConflicts({ name: 'B' }, { name: 'A' }, { name: 'C' })).toHaveLength(1);
    // No baseline for the field, or no server copy: nothing to compare.
    expect(detectConflicts({ name: 'B' }, {}, { name: 'C' })).toEqual([]);
    expect(detectConflicts({ name: 'B' }, { name: 'A' }, null)).toEqual([]);
  });

  it('SYNC-061: migrations are idempotent and wipe() empties every table', async () => {
    expect(await migrate(db)).toBe(2);
    server.seed('ACTIVITY', activityInput());
    await pullTrip(db, server, TRIP);
    await createEntity(db, 'ACTIVITY', TRIP, activityInput());

    await wipe(db);

    for (const table of ['trips', 'entities', 'entity_links', 'outbox', 'id_map']) {
      const rows = await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      expect(rows[0].n).toBe(0);
    }
  });
});
