export interface CoordinateLike {
  latitude?: number | string | null;
  longitude?: number | string | null;
}

/** Zoom used when only one place (or places all at one spot) is shown. */
export const SINGLE_PLACE_ZOOM = 12;

/** The [lat, lng] pairs of the places that have usable coordinates. */
export function validCoordinates(locations: CoordinateLike[]): [number, number][] {
  const points: [number, number][] = [];
  for (const location of locations) {
    if (location.latitude == null || location.longitude == null) continue;
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    points.push([lat, lng]);
  }
  return points;
}

/** True when every point is the same spot, so there is no area to fit. */
export function isSinglePoint(points: [number, number][]): boolean {
  return points.every(([lat, lng]) => lat === points[0][0] && lng === points[0][1]);
}

/** A stable string for a set of points, used to refit only when the places change. */
export function pointsSignature(points: [number, number][]): string {
  return points.map(([lat, lng]) => `${lat},${lng}`).join('|');
}
