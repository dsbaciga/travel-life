/**
 * Trip list ordering tests
 *
 * Test cases:
 * - TLO-001: The status values the ordering depends on are the ones the app uses
 * - TLO-002: Open trips outrank Completed, which outranks Cancelled
 * - TLO-003: Within a group, newest start first (or oldest first), undated last in both directions
 * - TLO-004: Ties fall back to creation time, then id
 * - TLO-005: "By Status" order, and an unknown status counts as open
 */
import { TripStatus } from '../../../types/trip.types';
import {
  compareTripsForList,
  tripGroupRank,
  tripStatusRank,
  type OrderableTrip,
} from '../tripListOrder';

const trip = (
  id: number,
  status: string,
  start: string | null = null,
  created = '2026-01-01'
): OrderableTrip => ({
  id,
  status,
  startDate: start ? new Date(start) : null,
  createdAt: new Date(created),
});

const order = (trips: OrderableTrip[], sort: Parameters<typeof compareTripsForList>[0]) =>
  [...trips].sort(compareTripsForList(sort)).map((t) => t.id);

describe('trip list ordering', () => {
  it('TLO-001: depends on the status strings the app uses', () => {
    expect(TripStatus).toMatchObject({
      DREAM: 'Dream',
      PLANNING: 'Planning',
      PLANNED: 'Planned',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    });
  });

  it('TLO-002: open trips outrank Completed, which outranks Cancelled', () => {
    for (const open of [TripStatus.DREAM, TripStatus.PLANNING, TripStatus.PLANNED, TripStatus.IN_PROGRESS]) {
      expect(tripGroupRank(open)).toBeLessThan(tripGroupRank(TripStatus.COMPLETED));
    }
    expect(tripGroupRank(TripStatus.COMPLETED)).toBeLessThan(tripGroupRank(TripStatus.CANCELLED));

    // The case that was wrong: an undated Planning trip against a dated Completed one.
    const trips = [trip(1, TripStatus.COMPLETED, '2026-06-01'), trip(2, TripStatus.PLANNING, null)];
    expect(order(trips, 'startDate-desc')).toEqual([2, 1]);
    expect(order(trips, 'startDate-asc')).toEqual([2, 1]);
  });

  it('TLO-003: within a group, orders by start date with undated trips last in both directions', () => {
    const trips = [
      trip(1, TripStatus.PLANNING, '2027-03-01'),
      trip(2, TripStatus.PLANNING, null),
      trip(3, TripStatus.PLANNING, '2028-03-01'),
      trip(4, TripStatus.PLANNED, '2026-12-01'),
    ];
    expect(order(trips, 'startDate-desc')).toEqual([3, 1, 4, 2]);
    expect(order(trips, 'startDate-asc')).toEqual([4, 1, 3, 2]);
  });

  it('TLO-004: ties fall back to creation time, then id', () => {
    const trips = [
      trip(1, TripStatus.PLANNING, null, '2026-01-01'),
      trip(2, TripStatus.PLANNING, null, '2026-03-01'),
      trip(3, TripStatus.PLANNING, null, '2026-03-01'),
    ];
    // Newest created first; equal creation times break on id.
    expect(order(trips, 'startDate-desc')).toEqual([2, 3, 1]);
    expect(order(trips, 'startDate-asc')).toEqual([1, 2, 3]);
  });

  it('TLO-005: "By Status" runs closest to now first, and an unknown status counts as open', () => {
    expect(
      [
        TripStatus.IN_PROGRESS,
        TripStatus.PLANNED,
        TripStatus.PLANNING,
        TripStatus.DREAM,
        TripStatus.COMPLETED,
        TripStatus.CANCELLED,
      ].map(tripStatusRank)
    ).toEqual([0, 1, 2, 3, 4, 5]);

    expect(tripStatusRank('Something New')).toBeLessThan(tripStatusRank(TripStatus.COMPLETED));
    expect(tripGroupRank('Something New')).toBe(0);
  });
});
