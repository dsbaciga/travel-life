/**
 * Recently viewed trips: the pure list logic behind the dashboard widget.
 *
 * The list lives in localStorage, keyed by user id so two accounts on one
 * browser never see each other's trips. Nothing here touches React.
 */

export const RECENT_TRIPS_LIMIT = 5;

export interface RecentTrip {
  tripId: number;
  /** Epoch milliseconds of the most recent view. */
  viewedAt: number;
  /** Kept only so the list can render before the trips list has loaded. */
  title?: string;
}

export function recentTripsKey(userId: number): string {
  return `recentTrips:${userId}`;
}

function sortAndCap(entries: RecentTrip[]): RecentTrip[] {
  return [...entries].sort((a, b) => b.viewedAt - a.viewedAt).slice(0, RECENT_TRIPS_LIMIT);
}

/** Parse stored JSON, dropping anything malformed. Never throws. */
export function parseRecentTrips(raw: string | null | undefined): RecentTrip[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const seen = new Set<number>();
  const entries: RecentTrip[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const { tripId, viewedAt, title } = item as Record<string, unknown>;
    if (typeof tripId !== 'number' || !Number.isInteger(tripId) || tripId <= 0) continue;
    if (typeof viewedAt !== 'number' || !Number.isFinite(viewedAt)) continue;
    if (seen.has(tripId)) continue;
    seen.add(tripId);
    entries.push({ tripId, viewedAt, ...(typeof title === 'string' && title ? { title } : {}) });
  }
  return sortAndCap(entries);
}

/** Record a view: the trip moves to the front, duplicates collapse, the list is capped. */
export function addRecentTrip(
  list: RecentTrip[],
  view: { tripId: number; title?: string },
  now: number = Date.now()
): RecentTrip[] {
  const entry: RecentTrip = {
    tripId: view.tripId,
    viewedAt: now,
    ...(view.title ? { title: view.title } : {}),
  };
  return sortAndCap([entry, ...list.filter((item) => item.tripId !== view.tripId)]);
}

/** Drop entries whose trip is not in `existingIds`. Returns the same array when nothing changes. */
export function pruneRecentTrips(
  list: RecentTrip[],
  existingIds: ReadonlySet<number>
): RecentTrip[] {
  const kept = list.filter((item) => existingIds.has(item.tripId));
  return kept.length === list.length ? list : kept;
}

export function readRecentTrips(userId: number, storage: Storage = localStorage): RecentTrip[] {
  try {
    return parseRecentTrips(storage.getItem(recentTripsKey(userId)));
  } catch {
    return [];
  }
}

export function writeRecentTrips(
  userId: number,
  list: RecentTrip[],
  storage: Storage = localStorage
): void {
  try {
    storage.setItem(recentTripsKey(userId), JSON.stringify(list));
  } catch {
    // Quota or private mode: the list is a convenience, losing it is fine.
  }
}
