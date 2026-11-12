/**
 * EXIF field decoding for captured and picked photos. Pure.
 */

/** EXIF GPS arrives as unsigned degrees plus a hemisphere reference. */
export function exifCoordinate(value: unknown, ref: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return ref === 'S' || ref === 'W' ? -Math.abs(value) : value;
}

/** EXIF `2026:06:02 14:05:09` (camera-local, no zone) -> ISO instant in device time. */
export function exifDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match.map(Number);
  const date = new Date(y, m - 1, d, hh, mm, ss);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
