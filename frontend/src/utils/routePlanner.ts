/**
 * Pure helpers for the Multi-City Trip Planner: great-circle distance, a rough travel-time
 * estimate, route optimisation and the per-stop arrival/departure schedule. No I/O, so the
 * planner can recompute everything on every drag.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in km. Longitude differences are taken through sin/cos, so a leg
 * that crosses the antimeridian (+179 to -179) is the short way round, not 358 degrees.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  // Clamp: rounding can push h a hair above 1 for antipodal points.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of the route visiting `points` in the given order. */
export function routeLengthKm(points: readonly GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return total;
}

// ---------------------------------------------------------------------------
// Travel time estimate
// ---------------------------------------------------------------------------

export type TravelMode = 'drive' | 'flight';

/** A flight leg has no time estimate (minutes is null); a drive leg has a rough one. */
export type TravelEstimate = { mode: 'drive'; minutes: number } | { mode: 'flight'; minutes: null };

/** At or above this straight-line distance the estimate assumes a flight. */
export const FLIGHT_THRESHOLD_KM = 600;
const DRIVE_DETOUR_FACTOR = 1.3; // roads are longer than the straight line
const DRIVE_KMH = 70;

/** A rough driving time from the straight-line distance. An estimate, not a routing result. */
export function estimateDriveMinutes(distanceKm: number): number {
  return Math.round(((distanceKm * DRIVE_DETOUR_FACTOR) / DRIVE_KMH) * 60);
}

/**
 * Classify a leg from its straight-line distance. A drive gets a rough time estimate; a
 * flight gets none (airport time and schedules cannot be guessed from distance).
 */
export function estimateTravel(distanceKm: number): TravelEstimate {
  if (distanceKm >= FLIGHT_THRESHOLD_KM) return { mode: 'flight', minutes: null };
  return { mode: 'drive', minutes: estimateDriveMinutes(distanceKm) };
}

/** "45 min", "3 h", "3 h 20 min". */
export function formatTravelMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ---------------------------------------------------------------------------
// Optimisation
// ---------------------------------------------------------------------------

export interface OptimizeOptions {
  /** Keep the first stop where it is. */
  fixFirst?: boolean;
  /** Keep the last stop where it is. */
  fixLast?: boolean;
}

export interface OptimizeResult {
  /** New order as indices into the input array. Always a permutation of 0..n-1. */
  order: number[];
  originalKm: number;
  optimizedKm: number;
  /** originalKm - optimizedKm; never negative. */
  savedKm: number;
}

type DistanceMatrix = number[][];

function buildMatrix(points: readonly GeoPoint[]): DistanceMatrix {
  return points.map((a, i) => points.map((b, j) => (i === j ? 0 : haversineKm(a, b))));
}

function pathLength(order: readonly number[], d: DistanceMatrix): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += d[order[i - 1]][order[i]];
  return total;
}

/** Nearest-neighbour over `free` (indices), starting at `start`, which is not in `free`. */
function nearestNeighbour(start: number, free: readonly number[], d: DistanceMatrix): number[] {
  const order = [start];
  const left = new Set(free);
  let current = start;
  while (left.size > 0) {
    let best = -1;
    let bestDist = Infinity;
    for (const candidate of left) {
      if (d[current][candidate] < bestDist) {
        bestDist = d[current][candidate];
        best = candidate;
      }
    }
    order.push(best);
    left.delete(best);
    current = best;
  }
  return order;
}

/**
 * 2-opt on an open path. Only positions in [lo, hi] may move, so fixed end stops stay put.
 * Repeats until no reversal shortens the path.
 */
function twoOpt(order: number[], lo: number, hi: number, d: DistanceMatrix): void {
  const EPSILON = 1e-9;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = lo; i < hi; i++) {
      for (let j = i + 1; j <= hi; j++) {
        const before = i > 0 ? order[i - 1] : -1;
        const after = j < order.length - 1 ? order[j + 1] : -1;
        const first = order[i];
        const last = order[j];
        const oldCost =
          (before >= 0 ? d[before][first] : 0) + (after >= 0 ? d[last][after] : 0);
        const newCost =
          (before >= 0 ? d[before][last] : 0) + (after >= 0 ? d[first][after] : 0);
        if (newCost < oldCost - EPSILON) {
          // Reverse order[i..j] in place.
          for (let a = i, b = j; a < b; a++, b--) {
            const swap = order[a];
            order[a] = order[b];
            order[b] = swap;
          }
          improved = true;
        }
      }
    }
  }
}

/**
 * Proposes a shorter visiting order: nearest-neighbour from each permitted start, each
 * refined with 2-opt, best one kept. Heuristic, not exact. It never returns a route longer
 * than the input: if nothing beats the original order, the original order comes back
 * with a saving of 0.
 *
 * With fixFirst the first input point stays first; with fixLast the last stays last. Fewer
 * than 3 movable positions cannot be improved and return the input order unchanged.
 */
export function optimizeRoute(
  points: readonly GeoPoint[],
  { fixFirst = false, fixLast = false }: OptimizeOptions = {}
): OptimizeResult {
  const n = points.length;
  const identity = Array.from({ length: n }, (_, i) => i);
  const d = buildMatrix(points);
  const originalKm = pathLength(identity, d);
  const unchanged: OptimizeResult = { order: identity, originalKm, optimizedKm: originalKm, savedKm: 0 };

  // A fixed end cannot be fixed twice when there is a single stop.
  const lo = fixFirst && n > 0 ? 1 : 0;
  const hi = fixLast && n > 1 ? n - 2 : n - 1;
  if (hi - lo < 1) return unchanged; // 0 or 1 movable stops: nothing to reorder

  const freeAll = identity.slice(lo, hi + 1);
  const tail = hi < n - 1 ? [n - 1] : [];

  // Starting points: the fixed first stop, or every free stop in turn.
  const starts = fixFirst ? [0] : freeAll;

  let bestOrder = identity;
  let bestLength = originalKm;
  for (const start of starts) {
    const free = fixFirst ? freeAll : freeAll.filter((i) => i !== start);
    const order = [...nearestNeighbour(start, free, d), ...tail];
    twoOpt(order, lo, hi, d);
    const length = pathLength(order, d);
    if (length < bestLength - 1e-9) {
      bestLength = length;
      bestOrder = order;
    }
  }

  if (bestOrder === identity) return unchanged;
  return {
    order: bestOrder,
    originalKm,
    optimizedKm: bestLength,
    savedKm: originalKm - bestLength,
  };
}

// ---------------------------------------------------------------------------
// Schedule (calendar dates; never timezone-converted)
// ---------------------------------------------------------------------------

export interface ScheduledStop {
  /** YYYY-MM-DD, or null when the trip has no start date. */
  arrival: string | null;
  departure: string | null;
}

const DAY_MS = 86_400_000;

function parseDateOnly(value: string): number | null {
  const t = Date.parse(`${value.split('T')[0]}T00:00:00.000Z`);
  return Number.isNaN(t) ? null : t;
}

function toDateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Arrival and departure of each stop: stop 1 arrives on the trip start date, and each
 * following stop arrives when the previous one departs. A stop with no nights set counts
 * as 0 nights. UTC arithmetic keeps these calendar dates, so no DST or zone can shift them.
 */
export function computeSchedule(
  nights: ReadonlyArray<number | null>,
  tripStartDate: string | null | undefined
): ScheduledStop[] {
  const start = tripStartDate ? parseDateOnly(tripStartDate) : null;
  if (start === null) return nights.map(() => ({ arrival: null, departure: null }));

  let cursor = start;
  return nights.map((n) => {
    const arrival = cursor;
    cursor += (n ?? 0) * DAY_MS;
    return { arrival: toDateOnly(arrival), departure: toDateOnly(cursor) };
  });
}

/** Nights between two trip calendar dates; null when either is missing or invalid. */
export function tripLengthNights(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): number | null {
  if (!startDate || !endDate) return null;
  const s = parseDateOnly(startDate);
  const e = parseDateOnly(endDate);
  if (s === null || e === null) return null;
  return Math.max(0, Math.round((e - s) / DAY_MS));
}
