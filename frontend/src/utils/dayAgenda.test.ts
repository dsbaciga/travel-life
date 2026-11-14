import { describe, it, expect } from 'vitest';
import { buildDayAgenda, tripDayKeys, type DayAgendaInput } from './dayAgenda';
import type { Activity } from '../types/activity';
import type { Transportation } from '../types/transportation';
import type { Lodging } from '../types/lodging';
import type { Location } from '../types/location';

const activity = (over: Partial<Activity>): Activity =>
  ({ id: 1, tripId: 1, name: 'Activity', category: null, allDay: false, startTime: null, timezone: null, ...over }) as Activity;

const leg = (over: Partial<Transportation>): Transportation =>
  ({ id: 1, tripId: 1, type: 'train', departureTime: null, startTimezone: null, carrier: null, vehicleNumber: null, fromLocationName: null, toLocationName: null, ...over }) as Transportation;

const stay = (over: Partial<Lodging>): Lodging =>
  ({ id: 1, tripId: 1, type: 'hotel', name: 'Hotel', checkInDate: null, checkOutDate: null, timezone: null, ...over }) as Lodging;

const place = (id: number, latitude: number | null, longitude: number | null): Location =>
  ({ id, tripId: 1, name: `Place ${id}`, latitude, longitude }) as Location;

const input = (over: Partial<DayAgendaInput>): DayAgendaInput => ({
  activities: [],
  transportation: [],
  lodging: [],
  locations: [],
  locationLinks: [],
  dayKey: '2026-05-10',
  resolveTimezone: (tz) => tz ?? 'Asia/Tokyo',
  ...over,
});

describe('buildDayAgenda', () => {
  it('buckets by the resolved timezone, not the UTC date', () => {
    // 13:00Z on the 9th is 22:00 on the 9th in Tokyo; 16:00Z is 01:00 on the 10th.
    const items = buildDayAgenda(
      input({
        activities: [
          activity({ id: 1, name: 'Dinner', startTime: '2026-05-09T13:00:00Z' }),
          activity({ id: 2, name: 'Late walk', startTime: '2026-05-09T16:00:00Z' }),
        ],
      })
    );
    expect(items.map((item) => item.title)).toEqual(['Late walk']);
  });

  it('uses the entity timezone ahead of the fallback', () => {
    const items = buildDayAgenda(
      input({
        activities: [
          activity({ id: 1, startTime: '2026-05-10T02:00:00Z', timezone: 'America/Los_Angeles' }),
        ],
      })
    );
    // 02:00Z on the 10th is still the 9th in Los Angeles.
    expect(items).toHaveLength(0);
  });

  it('orders timed items by time, then all-day items, and numbers them in that order', () => {
    const items = buildDayAgenda(
      input({
        activities: [
          activity({ id: 1, name: 'Festival', startTime: '2026-05-10T00:00:00Z', allDay: true }),
          activity({ id: 2, name: 'Lunch', startTime: '2026-05-10T03:00:00Z' }),
        ],
        transportation: [leg({ id: 3, departureTime: '2026-05-10T00:30:00Z' })],
      })
    );
    expect(items.map((item) => [item.number, item.key])).toEqual([
      [1, 'transportation-3'],
      [2, 'activity-2'],
      [3, 'activity-1'],
    ]);
    expect(items[2].time).toBeNull();
  });

  it('pins an activity through its linked location and numbers unpinned items too', () => {
    const items = buildDayAgenda(
      input({
        activities: [
          activity({ id: 1, name: 'Museum', startTime: '2026-05-10T01:00:00Z' }),
          activity({ id: 2, name: 'Free time', startTime: '2026-05-10T04:00:00Z' }),
        ],
        locations: [place(7, 35.68, 139.76)],
        locationLinks: [{ sourceType: 'ACTIVITY', sourceId: 1, targetId: 7 }],
      })
    );
    expect(items[0].point).toEqual({ latitude: 35.68, longitude: 139.76 });
    expect(items[1].point).toBeNull();
    expect(items[1].number).toBe(2);
  });

  it('ignores linked locations without valid coordinates', () => {
    const items = buildDayAgenda(
      input({
        activities: [activity({ id: 1, startTime: '2026-05-10T01:00:00Z' })],
        locations: [place(7, null, null), place(8, 95, 10)],
        locationLinks: [
          { sourceType: 'ACTIVITY', sourceId: 1, targetId: 7 },
          { sourceType: 'ACTIVITY', sourceId: 1, targetId: 8 },
        ],
      })
    );
    expect(items[0].point).toBeNull();
  });

  it('gives a transport leg a start and an end point', () => {
    const items = buildDayAgenda(
      input({
        transportation: [
          leg({
            id: 1,
            departureTime: '2026-05-10T01:00:00Z',
            fromLocation: { id: 1, name: 'Tokyo', latitude: 35.68, longitude: 139.76 },
            toLocation: { id: 2, name: 'Kyoto', latitude: 35.01, longitude: 135.77 },
          }),
        ],
      })
    );
    expect(items[0].title).toBe('Tokyo to Kyoto');
    expect(items[0].point).toEqual({ latitude: 35.68, longitude: 139.76 });
    expect(items[0].endPoint).toEqual({ latitude: 35.01, longitude: 135.77 });
  });

  it('lists check-out, check-in and the nights in between', () => {
    const lodging = [
      stay({ id: 1, name: 'Ryokan', checkInDate: '2026-05-09T06:00:00Z', checkOutDate: '2026-05-11T02:00:00Z' }),
    ];
    const titles = (dayKey: string) =>
      buildDayAgenda(input({ lodging, dayKey })).map((item) => item.title);

    expect(titles('2026-05-09')).toEqual(['Check in: Ryokan']);
    expect(titles('2026-05-10')).toEqual(['Staying at Ryokan']);
    expect(titles('2026-05-11')).toEqual(['Check out: Ryokan']);
    expect(titles('2026-05-12')).toEqual([]);
  });
});

describe('tripDayKeys', () => {
  it('lists every day inclusive', () => {
    expect(tripDayKeys('2026-05-30T00:00:00.000Z', '2026-06-01T00:00:00.000Z')).toEqual([
      '2026-05-30',
      '2026-05-31',
      '2026-06-01',
    ]);
  });

  it('returns one day when there is no end date and none when there is no start', () => {
    expect(tripDayKeys('2026-05-30', null)).toEqual(['2026-05-30']);
    expect(tripDayKeys(null, '2026-06-01')).toEqual([]);
  });

  it('returns nothing for a reversed range', () => {
    expect(tripDayKeys('2026-06-02', '2026-06-01')).toEqual([]);
  });
});
