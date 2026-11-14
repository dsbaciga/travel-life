/**
 * Mobile domain logic tests
 *
 * Test cases:
 * - TL-001: Timeline items resolve their own timezone and titles
 * - TL-002: itemsForDay buckets by each item's local day
 * - TL-003: Manual order rearranges activities without moving transit
 * - TL-004: buildTripDays covers every trip day plus out-of-range items
 * - TL-005: findNextUp prefers in-progress, skips all-day and cancelled
 * - TL-006: findNextUp does not let a check-in mask the next real item
 * - TL-007: pickActiveTrip - during, then upcoming, then most recent
 * - TL-008: unscheduledItems
 * - SM-001: suggestLinks proposes the nearby location with the default relationship
 * - SM-002: suggestLinks proposes the activity happening now; lodging only as a fallback
 * - SM-003: suggestLinks never links an entity to its own kind and ignores 0,0
 * - SM-010: parseMapsUrl handles Google pin, viewport, query and Apple URLs
 * - SM-011: parseMapsUrl rejects non-maps URLs and out-of-range coordinates
 * - SM-012: classifyShare - pdf, images, place, url, text
 * - SM-020: filterAssetsForTrip and clusterAssets
 * - SM-030: buildWidgetSnapshot states
 * - SM-040: meterStatus
 * - SM-050: computeBurnRate uses FX snapshots and skips unlike currencies
 * - MUT-001: updateEntity with no real change queues nothing
 * - MUT-002: reorderActivities, logTransitActual, promoteSavedLink, toggleChecklistItem
 * - MUT-003: bulkLinkPhotos is idempotent; listLinkedEntities resolves both directions
 * - PAY-001: Request builders - nested paths, PATCH for saved links, date-only normalisation, null stripping
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ActivityDto,
  ExpenseDto,
  LocationDto,
  LodgingDto,
  TransportationDto,
} from '@travel-life/shared';
import { getEntity, listEntities, listLinks, putEntity } from '../../db/repository';
import { listOutbox } from '../../sync/outbox';
import {
  buildCreateRequest,
  buildDeleteRequest,
  buildUpdateRequest,
  unresolvedReferences,
} from '../../sync/payloads';
import { createTestDb } from '../../test/nodeSqliteDriver';
import {
  bulkLinkPhotos,
  createEntity,
  listLinkedEntities,
  logTransitActual,
  promoteSavedLink,
  reorderActivities,
  setIdFactory,
  toggleChecklistItem,
  updateEntity,
} from '../mutations';
import {
  buildWidgetSnapshot,
  classifyShare,
  clusterAssets,
  computeBurnRate,
  filterAssetsForTrip,
  meterStatus,
  parseMapsUrl,
  suggestLinks,
} from '../smart';
import {
  buildTimelineItems,
  buildTripDays,
  findNextUp,
  itemsForDay,
  pickActiveTrip,
  sortDayItems,
  unscheduledItems,
} from '../timeline';

const activity = (id: number, overrides: Partial<ActivityDto> = {}): ActivityDto => ({
  id,
  tripId: 10,
  parentId: null,
  name: `Activity ${id}`,
  description: null,
  category: null,
  allDay: false,
  startTime: null,
  endTime: null,
  timezone: null,
  cost: null,
  currency: null,
  bookingUrl: null,
  bookingReference: null,
  notes: null,
  manualOrder: null,
  ...overrides,
});

const location = (id: number, overrides: Partial<LocationDto> = {}): LocationDto => ({
  id,
  tripId: 10,
  parentId: null,
  name: `Location ${id}`,
  address: null,
  latitude: null,
  longitude: null,
  categoryId: null,
  visitDatetime: null,
  visitDurationMinutes: null,
  notes: null,
  isFavorite: false,
  openingHours: null,
  timezone: null,
  ...overrides,
});

const leg = (id: number, overrides: Partial<TransportationDto> = {}): TransportationDto => ({
  id,
  tripId: 10,
  type: 'train',
  startLocationId: null,
  startLocationText: null,
  endLocationId: null,
  endLocationText: null,
  scheduledStart: null,
  scheduledEnd: null,
  startTimezone: null,
  endTimezone: null,
  actualStart: null,
  actualEnd: null,
  company: null,
  referenceNumber: null,
  seatNumber: null,
  bookingReference: null,
  cost: null,
  currency: null,
  status: 'on_time',
  delayMinutes: null,
  notes: null,
  ...overrides,
});

const stay = (id: number, overrides: Partial<LodgingDto> = {}): LodgingDto => ({
  id,
  tripId: 10,
  type: 'hotel',
  name: 'Hotel Danieli',
  address: null,
  checkInDate: '2026-06-01T13:00:00.000Z',
  checkOutDate: '2026-06-05T09:00:00.000Z',
  timezone: null,
  confirmationNumber: 'HD-1',
  bookingUrl: null,
  cost: null,
  currency: null,
  notes: null,
  ...overrides,
});

const EMPTY = { activities: [], transportation: [], lodging: [], customItems: [] };

describe('timeline', () => {
  it('TL-001: items resolve their own timezone and titles', () => {
    const items = buildTimelineItems(
      {
        ...EMPTY,
        activities: [activity(1, { timezone: 'Asia/Tokyo' }), activity(2)],
        transportation: [
          leg(3, { startLocationId: 7, endLocationText: 'Verona', company: 'Trenitalia', referenceNumber: 'FR1' }),
        ],
        lodging: [stay(4)],
        locations: [location(7, { name: 'Santa Lucia' })],
      },
      'Europe/Rome',
      'America/Denver'
    );
    const byKey = new Map(items.map((item) => [item.key, item]));
    expect(byKey.get('ACTIVITY:1')?.timezone).toBe('Asia/Tokyo');
    expect(byKey.get('ACTIVITY:2')?.timezone).toBe('Europe/Rome');
    expect(byKey.get('TRANSPORTATION:3')?.title).toBe('Train: Santa Lucia → Verona');
    expect(byKey.get('TRANSPORTATION:3')?.subtitle).toBe('Trenitalia FR1');
    expect(byKey.get('LODGING_CHECK_IN:4')?.title).toBe('Check in: Hotel Danieli');
    expect(byKey.get('LODGING_CHECK_OUT:4')?.confirmation).toBe('HD-1');

    // No trip zone: falls to the user's, never to bare UTC.
    const [noTripZone] = buildTimelineItems({ ...EMPTY, activities: [activity(1)] }, null, 'America/Denver');
    expect(noTripZone.timezone).toBe('America/Denver');
  });

  it('TL-002: itemsForDay buckets by each item local day', () => {
    const items = buildTimelineItems(
      {
        ...EMPTY,
        // 22:30 on June 1 in Rome, but already June 2 in UTC terms? No: 20:30Z. Use 23:30 local = 21:30Z.
        activities: [
          activity(1, { startTime: '2026-06-01T21:30:00.000Z' }),
          // 00:30 on June 2 in Rome is still June 1 in UTC.
          activity(2, { startTime: '2026-06-01T22:30:00.000Z' }),
        ],
      },
      'Europe/Rome',
      null
    );
    expect(itemsForDay(items, '2026-06-01').map((i) => i.entityId)).toEqual([1]);
    expect(itemsForDay(items, '2026-06-02').map((i) => i.entityId)).toEqual([2]);
  });

  it('TL-003: manual order rearranges activities without moving transit', () => {
    const items = buildTimelineItems(
      {
        ...EMPTY,
        activities: [
          activity(1, { startTime: '2026-06-02T08:00:00Z', manualOrder: 2 }),
          activity(2, { startTime: '2026-06-02T12:00:00Z', manualOrder: 0 }),
          activity(3, { startTime: '2026-06-02T15:00:00Z', manualOrder: 1 }),
          activity(4, { startTime: '2026-06-02T00:00:00Z', allDay: true }),
        ],
        transportation: [leg(9, { scheduledStart: '2026-06-02T10:00:00Z' })],
      },
      'UTC',
      null
    );
    // All-day first; the train keeps its chronological slot (second timed item).
    expect(sortDayItems(items).map((i) => i.key)).toEqual([
      'ACTIVITY:4',
      'ACTIVITY:2',
      'TRANSPORTATION:9',
      'ACTIVITY:3',
      'ACTIVITY:1',
    ]);
    // Without any manual order it is purely chronological.
    const plain = items.map((i) => ({ ...i, manualOrder: null }));
    expect(sortDayItems(plain).map((i) => i.key)).toEqual([
      'ACTIVITY:4',
      'ACTIVITY:1',
      'TRANSPORTATION:9',
      'ACTIVITY:2',
      'ACTIVITY:3',
    ]);
  });

  it('TL-004: buildTripDays covers every trip day plus out-of-range items', () => {
    const items = buildTimelineItems(
      {
        ...EMPTY,
        activities: [activity(1, { startTime: '2026-06-02T09:00:00Z' })],
        transportation: [leg(2, { scheduledStart: '2026-05-31T18:00:00Z' })],
      },
      'UTC',
      null
    );
    const days = buildTripDays(
      { startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-03T00:00:00.000Z' },
      items
    );
    expect(days.map((d) => d.dayKey)).toEqual(['2026-05-31', '2026-06-01', '2026-06-02', '2026-06-03']);
    expect(days[0].items).toHaveLength(1);
    expect(days[1].items).toHaveLength(0);
    expect(days[2].items).toHaveLength(1);
    // No dates at all: only days that have items.
    expect(buildTripDays({ startDate: null, endDate: null }, items).map((d) => d.dayKey)).toEqual([
      '2026-05-31',
      '2026-06-02',
    ]);
  });

  it('TL-005: findNextUp prefers in-progress, skips all-day and cancelled', () => {
    const now = new Date('2026-06-02T10:30:00Z');
    const items = buildTimelineItems(
      {
        ...EMPTY,
        activities: [
          activity(1, { startTime: '2026-06-02T10:00:00Z', endTime: '2026-06-02T11:00:00Z' }),
          activity(2, { startTime: '2026-06-02T12:00:00Z' }),
          activity(3, { startTime: '2026-06-02T00:00:00Z', allDay: true }),
        ],
        transportation: [leg(4, { scheduledStart: '2026-06-02T10:45:00Z', status: 'cancelled' })],
      },
      'UTC',
      null
    );
    expect(findNextUp(items, now)).toMatchObject({ inProgress: true, item: { entityId: 1 } });
    expect(findNextUp(items, new Date('2026-06-02T11:30:00Z'))).toMatchObject({
      inProgress: false,
      item: { entityId: 2 },
    });
    expect(findNextUp(items, new Date('2026-06-03T00:00:00Z'))).toBeNull();
    expect(findNextUp([], now)).toBeNull();
  });

  it('TL-006: a check-in does not mask the next real item', () => {
    const items = buildTimelineItems(
      {
        ...EMPTY,
        activities: [activity(1, { startTime: '2026-06-01T13:30:00Z' })],
        lodging: [stay(2)],
      },
      'UTC',
      null
    );
    // 13:10: the check-in "started" at 13:00 but dinner at 13:30 is what is next.
    expect(findNextUp(items, new Date('2026-06-01T13:10:00Z'))?.item.key).toBe('ACTIVITY:1');
    // Before either: the check-in is next.
    expect(findNextUp(items, new Date('2026-06-01T12:00:00Z'))?.item.key).toBe('LODGING_CHECK_IN:2');
  });

  it('TL-007: pickActiveTrip - during, then upcoming, then most recent', () => {
    const trip = (id: number, start: string, end: string, status = 'Planned') => ({
      id,
      startDate: `${start}T00:00:00.000Z`,
      endDate: `${end}T00:00:00.000Z`,
      status,
    });
    const trips = [
      trip(1, '2026-01-01', '2026-01-05'),
      trip(2, '2026-06-01', '2026-06-05'),
      trip(3, '2026-09-01', '2026-09-05'),
      trip(4, '2026-07-01', '2026-07-05', 'Cancelled'),
    ];
    expect(pickActiveTrip(trips, '2026-06-05')?.id).toBe(2);
    expect(pickActiveTrip(trips, '2026-06-20')?.id).toBe(3);
    expect(pickActiveTrip(trips, '2026-12-01')?.id).toBe(3);
    expect(pickActiveTrip([trips[0]], '2026-12-01')?.id).toBe(1);
    expect(pickActiveTrip([], '2026-12-01')).toBeNull();
  });

  it('TL-008: unscheduledItems', () => {
    const items = buildTimelineItems(
      { ...EMPTY, activities: [activity(1, { name: 'Zoo' }), activity(2, { name: 'Aquarium' }), activity(3, { startTime: '2026-06-02T09:00:00Z' })] },
      'UTC',
      null
    );
    expect(unscheduledItems(items).map((i) => i.title)).toEqual(['Aquarium', 'Zoo']);
  });
});

describe('smart context', () => {
  const context = {
    locations: [
      location(1, { name: 'Rialto Bridge', latitude: 45.438, longitude: 12.3359 }),
      location(2, { name: 'Far', latitude: 46, longitude: 13 }),
    ],
    activities: [
      activity(5, { name: 'Bridge walk', startTime: '2026-06-02T10:00:00Z', endTime: '2026-06-02T11:00:00Z' }),
    ],
    lodging: [stay(8)],
  };
  const here = { latitude: 45.4381, longitude: 12.336 };

  it('SM-001: proposes the nearby location with the default relationship', () => {
    const photo = suggestLinks('PHOTO', context, here, new Date('2026-06-02T07:00:00Z'));
    expect(photo[0]).toMatchObject({
      targetType: 'LOCATION',
      targetId: 1,
      relationship: 'TAKEN_AT',
      reason: 'nearby',
    });
    expect(photo[0].distanceMeters).toBeLessThan(150);
    const journal = suggestLinks('JOURNAL_ENTRY', context, here, new Date('2026-06-02T07:00:00Z'));
    expect(journal[0].relationship).toBe('DOCUMENTS');
    // Too far from anything.
    expect(
      suggestLinks('PHOTO', context, { latitude: 40, longitude: 10 }, new Date('2026-05-01T00:00:00Z'))
    ).toEqual([]);
  });

  it('SM-002: proposes the activity happening now; lodging only as a fallback', () => {
    const during = suggestLinks('PHOTO', context, null, new Date('2026-06-02T10:30:00Z'));
    expect(during.map((s) => s.targetType)).toEqual(['ACTIVITY']);
    expect(during[0]).toMatchObject({ targetId: 5, relationship: 'RELATED', reason: 'happening_now' });

    const evening = suggestLinks('PHOTO', context, null, new Date('2026-06-02T20:00:00Z'));
    expect(evening.map((s) => s.targetType)).toEqual(['LODGING']);
  });

  it('SM-003: never links to its own kind and ignores 0,0', () => {
    expect(suggestLinks('LOCATION', context, here, new Date('2026-06-02T10:30:00Z')).map((s) => s.targetType)).toEqual(['ACTIVITY']);
    const forActivity = suggestLinks('ACTIVITY', context, here, new Date('2026-06-02T10:30:00Z'));
    expect(forActivity.map((s) => s.targetType)).toEqual(['LOCATION']);
    expect(forActivity[0].relationship).toBe('OCCURRED_AT');
    expect(suggestLinks('PHOTO', context, { latitude: 0, longitude: 0 }, new Date('2026-05-01T00:00:00Z'))).toEqual([]);
  });

  it('SM-010: parseMapsUrl handles Google and Apple URLs', () => {
    expect(
      parseMapsUrl(
        'https://www.google.com/maps/place/Rialto+Bridge/@45.4379842,12.3358077,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d45.4380!4d12.3359'
      )
    ).toMatchObject({ type: 'place', name: 'Rialto Bridge', latitude: 45.438, longitude: 12.3359 });
    expect(parseMapsUrl('https://www.google.com/maps/@45.4379,12.3358,17z')).toMatchObject({
      latitude: 45.4379,
      longitude: 12.3358,
      name: null,
    });
    expect(parseMapsUrl('https://maps.google.com/?q=45.5,12.5')).toMatchObject({ latitude: 45.5, longitude: 12.5 });
    expect(parseMapsUrl('https://maps.apple.com/?ll=45.438,12.3359&q=Rialto%20Bridge')).toMatchObject({
      name: 'Rialto Bridge',
      latitude: 45.438,
      longitude: 12.3359,
    });
    // Short link: no coordinates, but still a place, named from the share text.
    expect(parseMapsUrl('https://maps.app.goo.gl/AbCdEf', 'Caffè Florian')).toMatchObject({
      name: 'Caffè Florian',
      latitude: null,
      longitude: null,
    });
  });

  it('SM-011: parseMapsUrl rejects non-maps URLs and out-of-range coordinates', () => {
    expect(parseMapsUrl('https://example.com/maps/@45,12')).toBeNull();
    expect(parseMapsUrl('not a url')).toBeNull();
    expect(parseMapsUrl('https://www.google.com/maps/@95.0,12.0,17z')).toMatchObject({
      latitude: null,
      longitude: null,
    });
  });

  it('SM-012: classifyShare', () => {
    expect(
      classifyShare({ files: [{ path: 'file:///b.pdf', mimeType: 'application/pdf', fileName: 'booking.pdf' }] })
    ).toEqual({ type: 'pdf', uri: 'file:///b.pdf', name: 'booking.pdf' });
    expect(
      classifyShare({ files: [{ path: 'a.jpg', mimeType: 'image/jpeg' }, { path: 'b.png', mimeType: 'image/png' }] })
    ).toEqual({ type: 'images', uris: ['a.jpg', 'b.png'] });
    expect(classifyShare({ text: 'Rialto Bridge\nhttps://maps.app.goo.gl/xyz' })).toMatchObject({
      type: 'place',
      name: 'Rialto Bridge',
    });
    expect(classifyShare({ text: 'Great trattoria https://example.com/da-enzo' })).toEqual({
      type: 'url',
      url: 'https://example.com/da-enzo',
      title: 'Great trattoria',
    });
    expect(classifyShare({ webUrl: 'https://example.com/x' })).toEqual({
      type: 'url',
      url: 'https://example.com/x',
      title: null,
    });
    expect(classifyShare({ text: 'just a note' })).toEqual({ type: 'text', text: 'just a note' });
    expect(classifyShare({ text: '   ' })).toBeNull();
  });

  it('SM-020: filterAssetsForTrip and clusterAssets', () => {
    const t = (iso: string) => Date.parse(iso);
    const assets = [
      { id: 'before', uri: 'a', creationTime: t('2026-05-31T12:00:00Z') },
      { id: 'a', uri: 'a', creationTime: t('2026-06-01T10:00:00Z'), latitude: 45.438, longitude: 12.3359 },
      { id: 'b', uri: 'b', creationTime: t('2026-06-01T10:05:00Z'), latitude: 45.4381, longitude: 12.336 },
      // Close in time but 2 km away: a new moment.
      { id: 'c', uri: 'c', creationTime: t('2026-06-01T10:10:00Z'), latitude: 45.456, longitude: 12.336 },
      // No GPS, close in time: stays with the previous moment.
      { id: 'd', uri: 'd', creationTime: t('2026-06-01T10:15:00Z') },
      { id: 'e', uri: 'e', creationTime: t('2026-06-01T15:00:00Z') },
      { id: 'after', uri: 'f', creationTime: t('2026-06-06T12:00:00Z') },
    ];
    const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const inTrip = filterAssetsForTrip(
      assets,
      { startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-05T00:00:00.000Z' },
      dayKey
    );
    expect(inTrip.map((a) => a.id)).toEqual(['a', 'b', 'c', 'd', 'e']);

    const clusters = clusterAssets(inTrip);
    expect(clusters.map((c) => c.assets.map((a) => a.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(clusters[0].center?.latitude).toBeCloseTo(45.43805, 4);
    expect(clusters[2].center).toBeNull();
    expect(filterAssetsForTrip(assets, { startDate: null, endDate: null }, dayKey)).toEqual([]);
  });

  it('SM-030: buildWidgetSnapshot states', () => {
    const now = new Date('2026-06-02T10:00:00Z');
    expect(buildWidgetSnapshot(null, null, now)).toMatchObject({ title: 'No upcoming trip', url: 'travellife://' });

    const trip = { id: 10, title: 'Venice', startDate: '2026-06-05T00:00:00.000Z' };
    expect(buildWidgetSnapshot(trip, null, now)).toMatchObject({ title: 'Venice', countdown: 'in 2d 14h' });

    const items = buildTimelineItems(
      {
        ...EMPTY,
        transportation: [
          leg(1, {
            scheduledStart: '2026-06-02T12:05:00Z',
            endLocationText: 'Verona',
            status: 'delayed',
            delayMinutes: 20,
            bookingReference: 'ABC123',
          }),
        ],
      },
      'Europe/Rome',
      null
    );
    expect(buildWidgetSnapshot(trip, findNextUp(items, now), now)).toMatchObject({
      tripTitle: 'Venice',
      title: 'Train: Verona',
      timeLabel: '2:05 PM',
      countdown: 'in 2h 05m',
      detail: 'Delayed 20m · ABC123',
      url: 'travellife://trip/10',
    });
  });

  it('SM-040: meterStatus', () => {
    const now = new Date('2026-06-02T10:00:00Z');
    expect(meterStatus({ meterExpiresAt: null }, now).state).toBe('none');
    expect(meterStatus({ meterExpiresAt: '2026-06-02T11:00:00Z' }, now)).toEqual({ state: 'ok', label: 'Meter in 1h 00m' });
    expect(meterStatus({ meterExpiresAt: '2026-06-02T10:08:00Z' }, now).state).toBe('soon');
    expect(meterStatus({ meterExpiresAt: '2026-06-02T09:50:00Z' }, now)).toEqual({ state: 'expired', label: 'Expired 10m ago' });
  });

  it('SM-050: computeBurnRate uses FX snapshots and skips unlike currencies', () => {
    const expense = (overrides: Partial<ExpenseDto>): ExpenseDto => ({
      id: 1,
      tripId: 10,
      description: 'x',
      category: 'food',
      amount: 0,
      currency: null,
      exchangeRate: null,
      baseAmount: null,
      baseCurrency: null,
      date: null,
      notes: null,
      ...overrides,
    });
    const trip = {
      budget: 1000,
      budgetCurrency: 'EUR',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-10T00:00:00.000Z',
    };
    const rate = computeBurnRate(
      trip,
      [
        expense({ amount: 100, currency: 'EUR' }),
        expense({ amount: 5000, currency: 'JPY', baseAmount: 30 }),
        // Offline-created, not yet converted: left out, and counted.
        expense({ amount: 70, currency: 'USD' }),
      ],
      '2026-06-05'
    );
    expect(rate).toMatchObject({ spent: 130, unconvertedCount: 1, state: 'under' });
    expect(rate?.elapsedFraction).toBeCloseTo(0.5, 5);
    expect(computeBurnRate(trip, [expense({ amount: 900, currency: 'EUR' })], '2026-06-05')?.state).toBe('over');
    expect(computeBurnRate(trip, [expense({ amount: 500, currency: 'EUR' })], '2026-06-05')?.state).toBe('on_track');
    expect(computeBurnRate({ ...trip, budget: null }, [], '2026-06-05')).toBeNull();
  });
});

describe('mutations', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let counter = 0;

  beforeEach(async () => {
    db = await createTestDb();
    counter = 0;
    setIdFactory(() => `m${++counter}`);
  });
  afterEach(() => db.close());

  it('MUT-001: updateEntity with no real change queues nothing', async () => {
    const a = activity(1, { name: 'Museum', notes: null });
    await putEntity(db, 'ACTIVITY', 10, a, a);

    await updateEntity(db, 'ACTIVITY', 1, { name: 'Museum', notes: null });
    expect(await listOutbox(db)).toHaveLength(0);

    // Identity and bookkeeping fields are never sent.
    await updateEntity(db, 'ACTIVITY', 1, { id: 999, tripId: 5, name: 'Museo' } as Partial<ActivityDto>);
    const [entry] = await listOutbox(db);
    expect(entry.payload).toEqual({ name: 'Museo' });
    expect(entry.base).toEqual({ name: 'Museum' });
    expect((await getEntity(db, 'ACTIVITY', 1))?.tripId).toBe(10);
    expect(await updateEntity(db, 'ACTIVITY', 404, { name: 'x' })).toBeNull();
  });

  it('MUT-002: reorder, transit actuals, promote saved link, checklist toggle', async () => {
    for (const id of [1, 2, 3]) {
      const a = activity(id);
      await putEntity(db, 'ACTIVITY', 10, a, a);
    }
    await reorderActivities(db, [3, 1, 2]);
    expect((await listEntities(db, 10, 'ACTIVITY')).map((a) => [a.id, a.manualOrder])).toEqual([
      [1, 1],
      [2, 2],
      [3, 0],
    ]);

    const train = leg(7, { scheduledStart: '2026-06-02T10:00:00.000Z' });
    await putEntity(db, 'TRANSPORTATION', 10, train, train);
    const departed = await logTransitActual(db, 7, 'departed', new Date('2026-06-02T10:25:00.000Z'));
    expect(departed).toMatchObject({ actualStart: '2026-06-02T10:25:00.000Z', status: 'delayed', delayMinutes: 25 });
    const arrived = await logTransitActual(db, 7, 'arrived', new Date('2026-06-02T11:40:00.000Z'));
    expect(arrived?.actualEnd).toBe('2026-06-02T11:40:00.000Z');
    expect((await logTransitActual(db, 7, 'cancelled'))?.status).toBe('cancelled');

    const saved = {
      id: 20,
      tripId: 10,
      url: 'https://example.com/trattoria',
      title: 'Da Enzo',
      description: 'Roman classics',
      siteName: null,
      imageUrl: null,
      notes: 'book ahead',
    };
    await putEntity(db, 'SAVED_LINK', 10, saved, saved);
    const promoted = await promoteSavedLink(db, 20, 'ACTIVITY', { startTime: '2026-06-02T18:00:00.000Z' });
    expect(promoted).toMatchObject({ name: 'Da Enzo', bookingUrl: 'https://example.com/trattoria', allDay: false });
    const links = await listLinks(db, 10);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ sourceType: 'SAVED_LINK', sourceId: 20, targetType: 'ACTIVITY', relationship: 'RELATED' });
    expect((await promoteSavedLink(db, 20, 'LOCATION'))?.name).toBe('Da Enzo');
    expect(await promoteSavedLink(db, 999, 'ACTIVITY')).toBeNull();

    const item = { id: 30, checklistId: 3, name: 'Passport', description: null, isChecked: false, sortOrder: 0, checkedAt: null };
    await putEntity(db, 'CHECKLIST_ITEM', 10, item, item);
    await toggleChecklistItem(db, 30, true);
    const checked = await getEntity(db, 'CHECKLIST_ITEM', 30);
    expect(checked?.isChecked).toBe(true);
    expect(checked?.checkedAt).not.toBeNull();
    const queued = (await listOutbox(db)).find((e) => e.kind === 'CHECKLIST_ITEM');
    expect(queued?.tripId).toBe(10);
  });

  it('MUT-003: bulkLinkPhotos is idempotent; listLinkedEntities resolves both directions', async () => {
    const loc = location(1);
    await putEntity(db, 'LOCATION', 10, loc, loc);
    for (const id of [41, 42]) {
      const photo = {
        id, tripId: 10, source: 'local', mediaType: 'image', localPath: null, thumbnailPath: null,
        caption: null, latitude: null, longitude: null, takenAt: null,
      };
      await putEntity(db, 'PHOTO', 10, photo, photo);
    }
    expect(await bulkLinkPhotos(db, 10, [41, 42], { targetType: 'LOCATION', targetId: 1 })).toBe(2);
    expect(await bulkLinkPhotos(db, 10, [41, 42], { targetType: 'LOCATION', targetId: 1 })).toBe(0);
    const links = await listLinks(db, 10);
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.relationship === 'TAKEN_AT')).toBe(true);

    // From the location's side the photos are incoming links.
    const photos = await listLinkedEntities(db, 10, { type: 'LOCATION', id: 1 }, 'PHOTO');
    expect(photos.map((p) => p.id).sort()).toEqual([41, 42]);
    const places = await listLinkedEntities(db, 10, { type: 'PHOTO', id: 41 }, 'LOCATION');
    expect(places.map((p) => p.id)).toEqual([1]);
  });

  it('MUT-004: createEntity with links queues the entity and its links atomically', async () => {
    const loc = location(1);
    await putEntity(db, 'LOCATION', 10, loc, loc);
    const created = await createEntity(db, 'JOURNAL_ENTRY', 10, {
      date: '2026-06-02T00:00:00.000Z', title: 'Day 2', content: 'Canals.', entryType: 'daily', mood: null, weatherNotes: null,
    }, [{ targetType: 'LOCATION', targetId: 1 }]);
    const queue = await listOutbox(db);
    expect(queue.map((e) => `${e.kind}:${e.op}`)).toEqual(['JOURNAL_ENTRY:create', 'LINK:create']);
    expect(queue[1].payload).toMatchObject({ sourceId: created.id, relationship: 'DOCUMENTS' });
    expect(unresolvedReferences('LINK', queue[1].payload)).toEqual([
      { field: 'sourceId', kind: 'JOURNAL_ENTRY', localId: created.id },
    ]);
  });
});

describe('request builders', () => {
  it('PAY-001: nested paths, PATCH for saved links, date-only normalisation, null stripping', () => {
    expect(
      buildCreateRequest('EXPENSE', 10, {
        id: 'local_x', tripId: 10, description: 'Lunch', category: 'food', amount: 12.5,
        currency: 'EUR', date: '2026-06-02T00:00:00.000Z', notes: null, baseAmount: null,
      })
    ).toEqual({
      method: 'POST',
      path: '/trips/10/expenses',
      body: { description: 'Lunch', category: 'food', amount: 12.5, currency: 'EUR', date: '2026-06-02' },
    });
    expect(buildCreateRequest('FOOD_LOG', 10, { restaurantName: 'R', dish: 'D', rating: 4 }).path).toBe('/trips/10/food-log');
    expect(buildCreateRequest('CHECKLIST_ITEM', 10, { checklistId: 3, name: 'Passport' })).toEqual({
      method: 'POST',
      path: '/checklists/3/items',
      body: { name: 'Passport' },
    });
    const photo = buildCreateRequest('PHOTO', 10, { pendingUri: 'file:///cache/IMG_1.png', caption: 'Canal', latitude: null });
    expect(photo).toMatchObject({
      path: '/photos/upload',
      body: { tripId: 10, caption: 'Canal' },
      upload: { uri: 'file:///cache/IMG_1.png', name: 'IMG_1.png', type: 'image/png' },
    });

    expect(buildUpdateRequest('SAVED_LINK', 10, 5, { title: 'T' })).toEqual({
      method: 'PATCH', path: '/saved-links/5', body: { title: 'T' },
    });
    // null survives on update: it means "clear this field".
    expect(buildUpdateRequest('ACTIVITY', 10, 5, { notes: null, manualOrder: 2 })).toEqual({
      method: 'PUT', path: '/activities/5', body: { notes: null, manualOrder: 2 },
    });
    expect(buildUpdateRequest('CHECKLIST_ITEM', 10, 9, { isChecked: true, checkedAt: 'x' })).toEqual({
      method: 'PUT', path: '/checklists/items/9', body: { isChecked: true },
    });
    // Nothing the API accepts: no request at all.
    expect(buildUpdateRequest('ACTIVITY', 10, 5, { pendingUri: 'x' })).toBeNull();
    expect(buildDeleteRequest('EXPENSE', 10, 4)).toEqual({ method: 'DELETE', path: '/trips/10/expenses/4' });
    expect(buildDeleteRequest('LODGING', 10, 4)).toEqual({ method: 'DELETE', path: '/lodging/4' });
  });
});
