/**
 * GPS track buffer, EXIF decoding and form definition tests
 *
 * Test cases:
 * - TRKM-001: Fixes are stored once per timestamp and inaccurate ones are dropped
 * - TRKM-002: loadTrack returns a half-open time window, oldest first
 * - TRKM-003: Upload sends thinned batches per trip and marks every fetched row uploaded
 * - TRKM-004: An offline upload leaves rows pending; a later retry delivers them
 * - TRKM-005: A 403/404 for a trip drops its undeliverable fixes instead of retrying forever
 * - TRKM-006: Uploads are split into batches under the server cap
 * - TRKM-007: pruneUploadedTrack removes only old, already-uploaded rows
 * - EXIF-001: GPS coordinates honour the hemisphere reference
 * - EXIF-002: EXIF dates parse; garbage does not
 * - FORM-001: Every form validates its own defaults-plus-required fields and reports field errors
 * - FORM-002: completeEntity produces server-shaped rows (nulls, UTC-midnight dates)
 * - FORM-003: Every form field key is accepted by its kind's create or update request
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TrackPointDto } from '@travel-life/shared';
import { ApiError } from '../../sync/engine';
import { buildCreateRequest, buildUpdateRequest } from '../../sync/payloads';
import { createTestDb, type TestDb } from '../../test/nodeSqliteDriver';
import {
  ENTITY_FORMS,
  completeEntity,
  isFormKind,
  validationErrors,
  type FormKind,
} from '../../lib/entityForms';
import { exifCoordinate, exifDate } from '../exif';
import { loadTrack, pruneUploadedTrack, storeTrackPoints, uploadPendingTrack } from '../track';

const point = (minute: number, overrides: Partial<TrackPointDto> = {}): TrackPointDto => ({
  // ~110 m apart per minute, so thinning keeps them.
  latitude: 45 + minute * 0.001,
  longitude: 12,
  accuracy: 8,
  recordedAt: new Date(Date.UTC(2026, 5, 1, 10, minute)).toISOString(),
  ...overrides,
});

describe('track buffer', () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(() => db.close());

  const pendingCount = async (): Promise<number> =>
    (await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM track_points WHERE uploaded = 0'))[0].n;

  it('TRKM-001: stored once per timestamp; inaccurate fixes dropped', async () => {
    await storeTrackPoints(db, 10, [point(0), point(1), point(2, { accuracy: 500 })]);
    await storeTrackPoints(db, 10, [point(1), point(3, { accuracy: null })]);

    const rows = await db.all<{ recorded_at: string }>('SELECT recorded_at FROM track_points ORDER BY recorded_at');
    expect(rows.map((r) => r.recorded_at.slice(14, 16))).toEqual(['00', '01', '03']);
  });

  it('TRKM-002: loadTrack returns a half-open window, oldest first', async () => {
    await storeTrackPoints(db, 10, [point(2), point(0), point(1)]);
    await storeTrackPoints(db, 11, [point(1)]);

    const track = await loadTrack(db, 10, point(0).recordedAt, point(2).recordedAt);
    expect(track.map((p) => p.recordedAt)).toEqual([point(0).recordedAt, point(1).recordedAt]);
  });

  it('TRKM-003: sends thinned batches per trip and marks every fetched row uploaded', async () => {
    // Three fixes on the same spot, then one that moved.
    await storeTrackPoints(db, 10, [
      point(0),
      point(1, { latitude: 45 }),
      point(2, { latitude: 45 }),
      point(3, { latitude: 45.01 }),
    ]);
    await storeTrackPoints(db, 11, [point(0)]);
    const sent: { tripId: number; count: number }[] = [];

    const uploaded = await uploadPendingTrack(db, async (tripId, points) => {
      sent.push({ tripId, count: points.length });
    });

    expect(uploaded).toBe(5);
    // Trip 10: first, last, and nothing redundant in between.
    expect(sent).toEqual([
      { tripId: 10, count: 2 },
      { tripId: 11, count: 1 },
    ]);
    expect(await pendingCount()).toBe(0);
  });

  it('TRKM-004: an offline upload leaves rows pending; retry delivers them', async () => {
    await storeTrackPoints(db, 10, [point(0), point(1)]);

    const first = await uploadPendingTrack(db, async () => {
      throw new ApiError('Network request failed', null);
    });
    expect(first).toBe(0);
    expect(await pendingCount()).toBe(2);

    const second = await uploadPendingTrack(db, async () => undefined);
    expect(second).toBe(2);
    expect(await pendingCount()).toBe(0);
  });

  it('TRKM-005: a 403/404 drops that trip\'s fixes and carries on with others', async () => {
    await storeTrackPoints(db, 10, [point(0)]);
    await storeTrackPoints(db, 11, [point(0)]);

    const uploaded = await uploadPendingTrack(db, async (tripId) => {
      if (tripId === 10) throw new ApiError('Trip not found or access denied', 404);
    });

    expect(uploaded).toBe(1);
    const left = await db.all<{ trip_id: number }>('SELECT trip_id FROM track_points');
    expect(left.map((r) => r.trip_id)).toEqual([11]);
  });

  it('TRKM-006: uploads are split into batches under the server cap', async () => {
    const many: TrackPointDto[] = [];
    for (let i = 0; i < 1200; i += 1) {
      many.push({
        latitude: 45 + i * 0.001,
        longitude: 12,
        accuracy: 5,
        recordedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)).toISOString(),
      });
    }
    await storeTrackPoints(db, 10, many);
    const sizes: number[] = [];

    const uploaded = await uploadPendingTrack(db, async (_tripId, points) => {
      sizes.push(points.length);
    });

    expect(uploaded).toBe(1200);
    expect(sizes).toEqual([500, 500, 200]);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2000);
  });

  it('TRKM-007: prune removes only old, already-uploaded rows', async () => {
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    const recent = new Date(Date.now() - 86400000).toISOString();
    await storeTrackPoints(db, 10, [point(0, { recordedAt: old }), point(1, { recordedAt: recent })]);
    await storeTrackPoints(db, 11, [point(2, { recordedAt: old })]);
    await db.run('UPDATE track_points SET uploaded = 1 WHERE trip_id = 10');

    await pruneUploadedTrack(db);

    const left = await db.all<{ trip_id: number; recorded_at: string }>(
      'SELECT trip_id, recorded_at FROM track_points ORDER BY trip_id'
    );
    // Old+uploaded is gone; recent+uploaded and old+pending remain.
    expect(left).toEqual([
      { trip_id: 10, recorded_at: recent },
      { trip_id: 11, recorded_at: old },
    ]);
  });
});

describe('exif', () => {
  it('EXIF-001: coordinates honour the hemisphere reference', () => {
    expect(exifCoordinate(45.43, 'N')).toBe(45.43);
    expect(exifCoordinate(33.86, 'S')).toBe(-33.86);
    expect(exifCoordinate(122.33, 'W')).toBe(-122.33);
    // Already-signed values are not double-negated.
    expect(exifCoordinate(-122.33, 'W')).toBe(-122.33);
    expect(exifCoordinate(12.33, undefined)).toBe(12.33);
    expect(exifCoordinate('45', 'N')).toBeNull();
    expect(exifCoordinate(Number.NaN, 'N')).toBeNull();
  });

  it('EXIF-002: dates parse; garbage does not', () => {
    const parsed = exifDate('2026:06:02 14:05:09');
    expect(parsed).not.toBeNull();
    const date = new Date(parsed as string);
    // Camera-local wall clock, interpreted on the device.
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([
      2026, 5, 2, 14, 5,
    ]);
    expect(exifDate('yesterday')).toBeNull();
    expect(exifDate(12345)).toBeNull();
  });
});

describe('entity forms', () => {
  const KINDS = Object.keys(ENTITY_FORMS) as FormKind[];

  const minimal: Record<FormKind, Record<string, unknown>> = {
    ACTIVITY: { name: 'Gelato' },
    LOCATION: { name: 'Rialto' },
    TRANSPORTATION: { type: 'train' },
    LODGING: { type: 'hotel', name: 'Danieli', checkInDate: '2026-06-01T13:00:00Z', checkOutDate: '2026-06-03T09:00:00Z' },
    JOURNAL_ENTRY: { title: 'Day 1', content: 'Arrived.' },
    SAVED_LINK: { url: 'https://example.com' },
    CUSTOM_ITEM: { name: 'Laundry' },
    EXPENSE: { description: 'Lunch', category: 'food', amount: 12 },
    FOOD_LOG: { restaurantName: 'Nico', dish: 'Gianduiotto', rating: 5 },
  };

  it('FORM-001: forms validate minimal input and report field errors', () => {
    for (const kind of KINDS) {
      const ok = validationErrors(kind, { ...ENTITY_FORMS[kind].defaults, ...minimal[kind] });
      expect(ok.ok, `${kind} minimal input`).toBe(true);
    }
    const bad = validationErrors('ACTIVITY', { name: '   ' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.name).toBeTruthy();

    const range = validationErrors('ACTIVITY', {
      name: 'x',
      startTime: '2026-06-01T10:00:00Z',
      endTime: '2026-06-01T09:00:00Z',
    });
    expect(range.ok).toBe(false);
    if (!range.ok) expect(range.errors.endTime).toBe('End must be after start');

    // Nulls from cleared optional fields are accepted, not rejected.
    expect(validationErrors('ACTIVITY', { name: 'x', notes: null, cost: null, bookingUrl: null }).ok).toBe(true);
    expect(isFormKind('ACTIVITY')).toBe(true);
    expect(isFormKind('PHOTO')).toBe(false);
  });

  it('FORM-002: completeEntity produces server-shaped rows', () => {
    const activity = completeEntity('ACTIVITY', { name: 'Gelato' });
    expect(activity).toMatchObject({ name: 'Gelato', allDay: false, notes: null, parentId: null, manualOrder: null });
    expect(Object.values(activity).includes(undefined)).toBe(false);

    expect(completeEntity('EXPENSE', { description: 'x', category: 'food', amount: 1, date: '2026-06-02' }).date).toBe(
      '2026-06-02T00:00:00.000Z'
    );
    expect(completeEntity('LOCATION', { name: 'x' })).toMatchObject({ isFavorite: false, latitude: null });
    expect(completeEntity('TRANSPORTATION', {})).toMatchObject({ type: 'train', status: 'on_time' });
  });

  it('FORM-003: every form field is accepted by its create or update request', () => {
    for (const kind of KINDS) {
      for (const field of ENTITY_FORMS[kind].fields) {
        const probe = { [field.key]: 'probe', checklistId: 1 };
        const inCreate = field.key in (buildCreateRequest(kind, 10, probe).body ?? {});
        const update = buildUpdateRequest(kind, 10, 5, probe);
        // A field the form shows but no request carries would be silently lost on sync.
        expect(inCreate || update !== null, `${kind}.${field.key} is never sent`).toBe(true);
      }
    }
  });
});
