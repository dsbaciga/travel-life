import { TripStatus } from '../../types/trip.types';

/**
 * Ordering for the trip list.
 *
 * The trip you are on right now is always first: one marked In Progress, or one
 * still marked Planning/Planned whose dates cover today (the status is only
 * refreshed periodically). Trips still
 * ahead of you (Dream, Planning, Planned) come next, then Completed, and
 * Cancelled last, no matter what their dates are. Sorting by date alone put a
 * Planning trip with no dates after every dated Completed trip, because an
 * unset date sorts last, and let an old In Progress trip fall below future ones.
 *
 * Done in memory, not with Prisma `orderBy`: a status can only be ordered
 * alphabetically in SQL, which would split the open statuses apart (a Planned
 * trip next month would land after a Planning one next year).
 */

export type TripListSort = 'startDate-desc' | 'startDate-asc' | 'status';

export interface OrderableTrip {
  id: number;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
}

/** Calendar date (`YYYY-MM-DD`) of an instant on a given zone's clock. */
export function todayKeyInTimezone(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Whether this is the trip you are on: marked In Progress, or Planning/Planned
 * with both dates set and today between them. Trip dates are calendar dates
 * stored at UTC midnight, so they are compared as `YYYY-MM-DD` against today's
 * date on the user's clock. Completed and Cancelled are never current.
 */
export function isCurrentTrip(trip: OrderableTrip, todayKey?: string): boolean {
  if (trip.status === TripStatus.IN_PROGRESS) return true;
  if (!todayKey || !trip.startDate || !trip.endDate) return false;
  if (trip.status !== TripStatus.PLANNING && trip.status !== TripStatus.PLANNED) return false;
  return dateKey(trip.startDate) <= todayKey && todayKey <= dateKey(trip.endDate);
}

/** Current trip first, then the other open trips, then Completed, then Cancelled. */
export function tripGroupRank(status: string, current = false): number {
  if (current || status === TripStatus.IN_PROGRESS) return 0;
  if (status === TripStatus.COMPLETED) return 2;
  if (status === TripStatus.CANCELLED) return 3;
  return 1;
}

/** The order the "By Status" sort groups by: closest to now first. */
const STATUS_ORDER: readonly string[] = [
  TripStatus.IN_PROGRESS,
  TripStatus.PLANNED,
  TripStatus.PLANNING,
  TripStatus.DREAM,
  TripStatus.COMPLETED,
  TripStatus.CANCELLED,
];

export function tripStatusRank(status: string): number {
  const index = STATUS_ORDER.indexOf(status);
  // An unknown status is treated as open, ahead of the closed ones.
  return index === -1 ? STATUS_ORDER.indexOf(TripStatus.DREAM) : index;
}

const time = (date: Date | null): number | null => (date === null ? null : date.getTime());

/** Compare two nullable instants; a missing date always sorts last, in either direction. */
function compareDates(a: Date | null, b: Date | null, direction: 'asc' | 'desc'): number {
  const x = time(a);
  const y = time(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return direction === 'asc' ? x - y : y - x;
}

export function compareTripsForList(
  sort: TripListSort,
  todayKey?: string
): (a: OrderableTrip, b: OrderableTrip) => number {
  const direction = sort === 'startDate-asc' ? 'asc' : 'desc';
  const statusRank = (trip: OrderableTrip): number =>
    isCurrentTrip(trip, todayKey) ? -1 : tripStatusRank(trip.status);
  const groupRank = (trip: OrderableTrip): number =>
    tripGroupRank(trip.status, isCurrentTrip(trip, todayKey));
  return (a, b) => {
    const rank = sort === 'status' ? statusRank(a) - statusRank(b) : groupRank(a) - groupRank(b);
    if (rank !== 0) return rank;

    const byStart = compareDates(a.startDate, b.startDate, direction);
    if (byStart !== 0) return byStart;

    // Same start (or both undated): newest created first, or oldest first for ascending.
    const byCreated = direction === 'asc' ? a.createdAt.getTime() - b.createdAt.getTime() : b.createdAt.getTime() - a.createdAt.getTime();
    return byCreated || a.id - b.id;
  };
}
