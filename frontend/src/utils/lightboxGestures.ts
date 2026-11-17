/** Pure gesture maths for the photo lightbox touch handling. */

export interface Point {
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;

const SWIPE_MIN_DISTANCE = 50;
const SWIPE_MAX_DURATION_MS = 800;
const TAP_MAX_MOVEMENT = 10;
const TAP_MAX_DURATION_MS = 300;
const DOUBLE_TAP_MAX_GAP_MS = 350;
const DOUBLE_TAP_MAX_DISTANCE = 40;

export type ReleaseKind = 'swipe-next' | 'swipe-prev' | 'tap' | 'none';

/**
 * Classify a finished single-finger gesture. A swipe must be mostly horizontal
 * so vertical scrolls are not misread; a tap barely moves and is short.
 */
export function classifyRelease(dx: number, dy: number, durationMs: number): ReleaseKind {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX <= TAP_MAX_MOVEMENT && absY <= TAP_MAX_MOVEMENT) {
    return durationMs <= TAP_MAX_DURATION_MS ? 'tap' : 'none';
  }
  if (absX >= SWIPE_MIN_DISTANCE && absX > absY * 1.5 && durationMs <= SWIPE_MAX_DURATION_MS) {
    return dx < 0 ? 'swipe-next' : 'swipe-prev';
  }
  return 'none';
}

export interface TapRecord extends Point {
  time: number;
}

export function isDoubleTap(previous: TapRecord | null, current: TapRecord): boolean {
  if (!previous) return false;
  return (
    current.time - previous.time <= DOUBLE_TAP_MAX_GAP_MS &&
    distance(previous, current) <= DOUBLE_TAP_MAX_DISTANCE
  );
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Zoom after a pinch: the start zoom scaled by the ratio of finger distances. */
export function pinchZoom(startZoom: number, startDistance: number, currentDistance: number): number {
  if (startDistance <= 0) return clampZoom(startZoom);
  return clampZoom(startZoom * (currentDistance / startDistance));
}

/** Keep a panned image from leaving the viewport: at most half the extra size in each direction. */
export function clampPan(position: Point, zoom: number, width: number, height: number): Point {
  const maxX = Math.max(0, ((zoom - 1) * width) / 2);
  const maxY = Math.max(0, ((zoom - 1) * height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, position.x)),
    y: Math.min(maxY, Math.max(-maxY, position.y)),
  };
}
