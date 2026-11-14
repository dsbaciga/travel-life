/**
 * Pure geospatial helpers used offline by the mobile companion app and by the
 * backend's photo-location inference.
 *
 * Everything here works on plain `{ latitude, longitude }` numbers. The
 * backend's PostGIS columns remain the authority for indexed spatial queries;
 * these helpers exist for the cases where there is no database round-trip —
 * on the phone with no signal, or when post-processing a small set of rows
 * already loaded into memory.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** A single recorded GPS fix. `recordedAt` is an ISO-8601 instant or epoch ms. */
export interface TrackPoint extends LatLng {
  recordedAt: string | number | Date;
  /** Horizontal accuracy in metres, when the OS reports one. */
  accuracy?: number | null;
}

/** Mean Earth radius (IUGG), metres. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Epoch milliseconds for any TrackPoint timestamp representation. */
export function toEpochMs(value: string | number | Date): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

/**
 * Great-circle distance between two points.
 *
 * @param a - First point
 * @param b - Second point
 * @returns Distance in metres
 *
 * @example
 * ```ts
 * haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }); // ≈ 111195
 * ```
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A place that belongs on a map: usable coordinates and not marked "exclude from map". */
export function isMappableLocation<T extends { latitude?: number | null; longitude?: number | null; excludeFromMap?: boolean }>(
  location: T
): location is T & LatLng {
  return !location.excludeFromMap && isUsableCoordinate(location);
}

/** True when lat/lng are finite and in range. Guards against `0,0` "null island" too. */
export function isUsableCoordinate(
  point: { latitude?: number | null; longitude?: number | null } | null | undefined
): point is LatLng {
  if (!point) return false;
  const { latitude, longitude } = point;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  // Exactly 0,0 is overwhelmingly a default-initialised value, not a real fix.
  return !(latitude === 0 && longitude === 0);
}

/**
 * Find the closest candidate within `radiusMeters` of `point`.
 *
 * Used for smart auto-linking ("you are 40 m from the Louvre — link this photo
 * to it?"). Candidates without usable coordinates are skipped.
 *
 * @param point - The reference position
 * @param candidates - Items carrying their own lat/lng (nullable)
 * @param radiusMeters - Maximum distance to accept (default 150 m)
 * @returns The nearest candidate and its distance, or null
 */
export function findNearest<T extends { latitude?: number | null; longitude?: number | null }>(
  point: LatLng,
  candidates: readonly T[],
  radiusMeters = 150
): { item: T; distanceMeters: number } | null {
  let best: { item: T; distanceMeters: number } | null = null;
  for (const item of candidates) {
    const coord = { latitude: item.latitude ?? undefined, longitude: item.longitude ?? undefined };
    if (!isUsableCoordinate(coord)) continue;
    const d = haversineMeters(point, coord);
    if (d <= radiusMeters && (best === null || d < best.distanceMeters)) {
      best = { item, distanceMeters: d };
    }
  }
  return best;
}

/** Sort track points chronologically, dropping unusable fixes. Does not mutate input. */
export function normalizeTrack<T extends TrackPoint>(points: readonly T[]): T[] {
  return points
    .filter((p) => isUsableCoordinate(p) && Number.isFinite(toEpochMs(p.recordedAt)))
    .slice()
    .sort((a, b) => toEpochMs(a.recordedAt) - toEpochMs(b.recordedAt));
}

export interface InferredPosition extends LatLng {
  /** How the position was derived. */
  method: 'exact' | 'interpolated' | 'nearest';
  /** Time distance (ms) from `at` to the closest fix used. */
  gapMs: number;
}

/**
 * Estimate where the traveller was at instant `at` from a GPS breadcrumb trail.
 *
 * Linear interpolation between the bracketing fixes when both are within
 * `maxGapMs`; otherwise the single nearest fix if *it* is within `maxGapMs`;
 * otherwise null. Refusing to answer across big gaps matters: a phone that was
 * off for three hours on a train would otherwise geotag every photo somewhere
 * along a straight line between two cities.
 *
 * @param track - Points, any order (they are normalised internally)
 * @param at - The instant to locate (e.g. a photo's `takenAt`)
 * @param maxGapMs - Maximum allowed distance in time to a fix (default 10 min)
 */
export function inferPositionAt(
  track: readonly TrackPoint[],
  at: string | number | Date,
  maxGapMs = 10 * 60 * 1000
): InferredPosition | null {
  const t = toEpochMs(at);
  if (!Number.isFinite(t)) return null;
  const pts = normalizeTrack(track);
  if (pts.length === 0) return null;

  // Binary search for first point with time >= t.
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (toEpochMs(pts[mid].recordedAt) < t) lo = mid + 1;
    else hi = mid;
  }
  const after = pts[lo];
  const before = lo > 0 ? pts[lo - 1] : undefined;

  if (after && toEpochMs(after.recordedAt) === t) {
    return { latitude: after.latitude, longitude: after.longitude, method: 'exact', gapMs: 0 };
  }

  if (before && after) {
    const tb = toEpochMs(before.recordedAt);
    const ta = toEpochMs(after.recordedAt);
    const gapBefore = t - tb;
    const gapAfter = ta - t;
    if (gapBefore <= maxGapMs && gapAfter <= maxGapMs) {
      const f = (t - tb) / (ta - tb);
      return {
        latitude: before.latitude + (after.latitude - before.latitude) * f,
        longitude: before.longitude + (after.longitude - before.longitude) * f,
        method: 'interpolated',
        gapMs: Math.min(gapBefore, gapAfter),
      };
    }
  }

  const candidates = [before, after].filter((p): p is TrackPoint => p !== undefined);
  let nearest: TrackPoint | null = null;
  let nearestGap = Infinity;
  for (const p of candidates) {
    const gap = Math.abs(toEpochMs(p.recordedAt) - t);
    if (gap < nearestGap) {
      nearest = p;
      nearestGap = gap;
    }
  }
  if (nearest && nearestGap <= maxGapMs) {
    return { latitude: nearest.latitude, longitude: nearest.longitude, method: 'nearest', gapMs: nearestGap };
  }
  return null;
}

export interface DetectedStop extends LatLng {
  startMs: number;
  endMs: number;
  durationMinutes: number;
  pointCount: number;
}

export interface StopDetectionOptions {
  /** Points must stay within this distance of the stop's anchor (default 100 m). */
  radiusMeters?: number;
  /** Minimum dwell to count as a stop (default 45 min, matching the plan's "unlogged stop" prompt). */
  minDurationMinutes?: number;
}

/**
 * Stay-point detection over a GPS breadcrumb trail.
 *
 * Classic anchor-and-sweep: starting at each point, extend forward while
 * points remain inside `radiusMeters` of the anchor. If the dwell spans at
 * least `minDurationMinutes`, emit a stop at the centroid and jump past it.
 *
 * @returns Stops in chronological order
 */
export function detectStops(
  track: readonly TrackPoint[],
  options: StopDetectionOptions = {}
): DetectedStop[] {
  const radius = options.radiusMeters ?? 100;
  const minMs = (options.minDurationMinutes ?? 45) * 60 * 1000;
  const pts = normalizeTrack(track);
  const stops: DetectedStop[] = [];

  let i = 0;
  while (i < pts.length) {
    let j = i + 1;
    while (j < pts.length && haversineMeters(pts[i], pts[j]) <= radius) j++;
    const startMs = toEpochMs(pts[i].recordedAt);
    const endMs = toEpochMs(pts[j - 1].recordedAt);
    if (endMs - startMs >= minMs) {
      const slice = pts.slice(i, j);
      const latitude = slice.reduce((s, p) => s + p.latitude, 0) / slice.length;
      const longitude = slice.reduce((s, p) => s + p.longitude, 0) / slice.length;
      stops.push({
        latitude,
        longitude,
        startMs,
        endMs,
        durationMinutes: Math.round((endMs - startMs) / 60000),
        pointCount: slice.length,
      });
      i = j;
    } else {
      i++;
    }
  }
  return stops;
}

/**
 * Drop stops that are already explained by a known itinerary location.
 *
 * @param stops - Output of {@link detectStops}
 * @param known - Itinerary locations (and lodging coordinates) with lat/lng
 * @param radiusMeters - How close a known place must be to "explain" a stop (default 150 m)
 */
export function filterUnloggedStops(
  stops: readonly DetectedStop[],
  known: readonly { latitude?: number | null; longitude?: number | null }[],
  radiusMeters = 150
): DetectedStop[] {
  return stops.filter((s) => findNearest(s, known, radiusMeters) === null);
}

/**
 * Downsample a dense track by dropping points closer than `minDistanceMeters`
 * to the previously kept point. Keeps first and last points. Used before
 * uploading background-GPS batches over roaming data.
 */
export function thinTrack<T extends TrackPoint>(track: readonly T[], minDistanceMeters = 10): T[] {
  const pts = normalizeTrack(track);
  if (pts.length <= 2) return pts;
  const kept: T[] = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    if (haversineMeters(kept[kept.length - 1], pts[k]) >= minDistanceMeters) kept.push(pts[k]);
  }
  kept.push(pts[pts.length - 1]);
  return kept;
}

/** GeoJSON LineString for a track (lng/lat order per RFC 7946). */
export function trackToGeoJsonLineString(track: readonly TrackPoint[]): {
  type: 'LineString';
  coordinates: [number, number][];
} {
  return {
    type: 'LineString',
    coordinates: normalizeTrack(track).map((p) => [p.longitude, p.latitude]),
  };
}
