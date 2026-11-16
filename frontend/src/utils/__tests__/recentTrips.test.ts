import { describe, it, expect, beforeEach } from 'vitest';
import { installMemoryLocalStorage } from '../../test/memoryStorage';
import {
  RECENT_TRIPS_LIMIT,
  addRecentTrip,
  parseRecentTrips,
  pruneRecentTrips,
  readRecentTrips,
  recentTripsKey,
  writeRecentTrips,
  type RecentTrip,
} from '../recentTrips';

describe('recentTrips', () => {
  beforeEach(() => installMemoryLocalStorage());

  it('puts the newest view first and collapses duplicates', () => {
    let list: RecentTrip[] = [];
    list = addRecentTrip(list, { tripId: 1, title: 'A' }, 100);
    list = addRecentTrip(list, { tripId: 2 }, 200);
    list = addRecentTrip(list, { tripId: 1, title: 'A2' }, 300);
    expect(list.map((e) => e.tripId)).toEqual([1, 2]);
    expect(list[0]).toEqual({ tripId: 1, viewedAt: 300, title: 'A2' });
  });

  it('caps the list at the limit', () => {
    let list: RecentTrip[] = [];
    for (let id = 1; id <= RECENT_TRIPS_LIMIT + 3; id++) {
      list = addRecentTrip(list, { tripId: id }, id);
    }
    expect(list).toHaveLength(RECENT_TRIPS_LIMIT);
    expect(list[0].tripId).toBe(RECENT_TRIPS_LIMIT + 3);
  });

  it('prunes entries that no longer exist, keeping identity when nothing changes', () => {
    const list = [
      { tripId: 1, viewedAt: 2 },
      { tripId: 2, viewedAt: 1 },
    ];
    expect(pruneRecentTrips(list, new Set([2])).map((e) => e.tripId)).toEqual([2]);
    expect(pruneRecentTrips(list, new Set([1, 2]))).toBe(list);
  });

  it('tolerates corrupted and old-format JSON', () => {
    expect(parseRecentTrips(null)).toEqual([]);
    expect(parseRecentTrips('{not json')).toEqual([]);
    expect(parseRecentTrips('{"a":1}')).toEqual([]);
    expect(parseRecentTrips('[1,2,3]')).toEqual([]);
    expect(
      parseRecentTrips(
        JSON.stringify([
          { tripId: 'x', viewedAt: 1 },
          { tripId: 3, viewedAt: 'y' },
          { tripId: 4, viewedAt: 5, title: 7 },
          null,
        ])
      )
    ).toEqual([{ tripId: 4, viewedAt: 5 }]);
  });

  it('stores each user under a separate key', () => {
    writeRecentTrips(1, [{ tripId: 10, viewedAt: 1 }]);
    writeRecentTrips(2, [{ tripId: 20, viewedAt: 1 }]);
    expect(recentTripsKey(1)).not.toBe(recentTripsKey(2));
    expect(readRecentTrips(1).map((e) => e.tripId)).toEqual([10]);
    expect(readRecentTrips(2).map((e) => e.tripId)).toEqual([20]);
  });
});
