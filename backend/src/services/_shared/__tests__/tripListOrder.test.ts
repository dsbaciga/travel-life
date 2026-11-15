/**
 * Trip list ordering tests
 *
 * Test cases:
 * - TLO-001: The status values the ordering depends on are the ones the app uses
 * - TLO-002: Open trips outrank Completed, which outranks Cancelled
 * - TLO-003: Within a group, newest start first (or oldest first), undated last in both directions
 * - TLO-004: Ties fall back to creation time, then id
 * - TLO-005: "By Status" order, and an unknown status counts as open
 * - TLO-006: The current (In Progress) trip is first whatever its dates
 * - TLO-007: A Planning/Planned trip whose dates cover today is current too
 * - TLO-008: todayKeyInTimezone reads the date on the given zone's clock
 */
import { TripStatus } from '../../../types/trip.types';
import {
  compareTripsForList,
  isCurrentTrip,
  todayKeyInTimezone,
  tripGroupRank,
  tripStatusRank,
  type OrderableTrip,
} from '../tripListOrder';

const trip = (
  id: number,
  status: string,
  start: string | null = null,
  created = '2026-01-01',
  end: string | null = null
): OrderableTrip => ({
  id,
  status,
  startDate: start ? new Date(start) : null,
  endDate: end ? new Date(end) : null,
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

  it('TLO-006: the current trip is first whatever its dates, in both directions', () => {
    const trips = [
      trip(1, TripStatus.PLANNED, '2028-05-01'),
      trip(2, TripStatus.IN_PROGRESS, '2025-01-10'),
      trip(3, TripStatus.PLANNING, null),
      trip(4, TripStatus.COMPLETED, '2029-01-01'),
    ];
    expect(order(trips, 'startDate-desc')).toEqual([2, 1, 3, 4]);
    expect(order(trips, 'startDate-asc')).toEqual([2, 1, 3, 4]);
    expect(tripGroupRank(TripStatus.IN_PROGRESS)).toBeLessThan(tripGroupRank(TripStatus.PLANNED));
  });

  it('TLO-007: a Planning/Planned trip whose dates cover today is current too', () => {
    const today = '2026-06-10';
    const covering = trip(1, TripStatus.PLANNED, '2026-06-08', '2026-01-01', '2026-06-12');
    const future = trip(2, TripStatus.PLANNING, '2028-01-01', '2026-01-01', '2028-01-05');
    const finished = trip(3, TripStatus.COMPLETED, '2026-06-08', '2026-01-01', '2026-06-12');

    expect(isCurrentTrip(covering, today)).toBe(true);
    // Inclusive at both ends.
    expect(isCurrentTrip(trip(4, TripStatus.PLANNED, '2026-06-10', '2026-01-01', '2026-06-10'), today)).toBe(true);
    // Not current: outside the dates, a Dream, closed, no end date, or no "today" to judge by.
    expect(isCurrentTrip(trip(5, TripStatus.PLANNED, '2026-06-11', '2026-01-01', '2026-06-12'), today)).toBe(false);
    expect(isCurrentTrip(trip(6, TripStatus.DREAM, '2026-06-08', '2026-01-01', '2026-06-12'), today)).toBe(false);
    expect(isCurrentTrip(finished, today)).toBe(false);
    expect(isCurrentTrip(trip(7, TripStatus.PLANNING, '2026-06-08'), today)).toBe(false);
    expect(isCurrentTrip(covering)).toBe(false);
    // In Progress is current with or without dates.
    expect(isCurrentTrip(trip(8, TripStatus.IN_PROGRESS))).toBe(true);

    // Ahead of a later Planning trip, and of a Completed trip that covers the same days.
    expect(
      [finished, future, covering].sort(compareTripsForList('startDate-desc', today)).map((t) => t.id)
    ).toEqual([1, 2, 3]);
    // Without "today" the covering trip is just a Planned one, so the later Planning trip leads it.
    expect(order([finished, covering, future], 'startDate-desc')).toEqual([2, 1, 3]);
    // And "By Status" puts it with the other current trips (newest start first), ahead of the rest.
    expect(
      [future, covering, trip(9, TripStatus.IN_PROGRESS, '2025-01-01')]
        .sort(compareTripsForList('status', today))
        .map((t) => t.id)
    ).toEqual([1, 9, 2]);
  });

  it("TLO-008: todayKeyInTimezone reads the date on the given zone's clock", () => {
    const instant = new Date('2026-06-01T23:30:00Z');
    expect(todayKeyInTimezone('UTC', instant)).toBe('2026-06-01');
    expect(todayKeyInTimezone('Asia/Tokyo', instant)).toBe('2026-06-02');
    expect(todayKeyInTimezone('America/Los_Angeles', instant)).toBe('2026-06-01');
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
    // Open, but not the current trip: after In Progress, before Completed.
    expect(tripGroupRank('Something New')).toBeGreaterThan(tripGroupRank(TripStatus.IN_PROGRESS));
    expect(tripGroupRank('Something New')).toBeLessThan(tripGroupRank(TripStatus.COMPLETED));
  });
});
