// GENERATED FILE - DO NOT EDIT.
// Vendored from packages/shared/src/brand/routeProgress.ts by packages/shared/scripts/sync-vendored.mjs.
// Edit the source and re-run the script.

/**
 * Where "now" sits along a day's stops, for the route line.
 *
 * Past stops are muted, the current or next stop is gold, the rest are ahead.
 * Pure so web and mobile share one rule (vendored into the frontend: edit here
 * and run `npm run sync:vendored`).
 */

export type RouteStop = 'past' | 'next' | 'future';

export type RouteSegmentStyle = 'solid' | 'dashed';

export interface RouteTimes {
  start: number;
  end?: number | null;
  /**
   * An all-day item (a mid-stay night, a day-long pass) has no moment to be
   * "past" or "next": it never takes the gold marker from the first real stop.
   * Mirrors mobile `findNextUp`, which skips all-day items.
   */
  allDay?: boolean;
}

export interface RouteProgress {
  stops: RouteStop[];
  /** Line style between stop `i` and stop `i + 1` (length is stops.length - 1). */
  segments: RouteSegmentStyle[];
}

/**
 * `nowMs` is compared with each stop; `isToday` decides whether the first
 * unfinished stop earns the gold marker (a stop on a future day is not "next").
 * A stop with an end time stays current until the end passes.
 */
export function computeRouteProgress(
  items: readonly RouteTimes[],
  nowMs: number,
  isToday: boolean
): RouteProgress {
  const isPast = (item: RouteTimes) => !item.allDay && (item.end ?? item.start) < nowMs;
  const firstOpen = items.findIndex((item) => !item.allDay && !isPast(item));
  const nextIndex = isToday ? firstOpen : -1;

  const stops: RouteStop[] = items.map((item, index) => {
    if (isPast(item)) return 'past';
    return index === nextIndex ? 'next' : 'future';
  });

  const segments: RouteSegmentStyle[] = [];
  for (let i = 0; i < items.length - 1; i += 1) {
    // Travelled: the line has already reached stop i + 1 (it is past, or it is
    // the stop we are heading to / standing at).
    segments.push(stops[i + 1] === 'past' || stops[i + 1] === 'next' ? 'solid' : 'dashed');
  }
  return { stops, segments };
}
