/**
 * Route-line state for one day of the Today list: which stop is current, and
 * which legs of the line are travelled (solid) or ahead (dashed).
 */
import { computeRouteProgress, type RouteSegmentStyle, type RouteStop } from '@travel-life/shared';
import type { TimelineItem } from './timeline';

export interface RouteLineState {
  stop: RouteStop;
  /** Leg arriving at this stop; undefined for the first. */
  above?: RouteSegmentStyle;
  /** Leg leaving this stop; undefined for the last. */
  below?: RouteSegmentStyle;
}

/** Same default as "next up": an item with no end is treated as an hour long. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * One entry per item, in order. Timed items are measured against `now`;
 * all-day items have no moment, so they stay "future" and never take the gold
 * marker. Cancelled items count as past so they never become "next".
 */
export function buildRouteLine(items: readonly TimelineItem[], now: Date, isToday: boolean): RouteLineState[] {
  const nowMs = now.getTime();
  const timedIndexes: number[] = [];
  const times = items.flatMap((item, index) => {
    if (item.allDay || !item.start) return [];
    const start = new Date(item.start).getTime();
    if (Number.isNaN(start)) return [];
    timedIndexes.push(index);
    // A cancelled item is finished business: end it before now.
    const end = item.status === 'cancelled' ? Math.min(start, nowMs - 1) : item.end ? new Date(item.end).getTime() : start + DEFAULT_DURATION_MS;
    return [{ start: Math.min(start, end), end }];
  });

  const progress = computeRouteProgress(times, nowMs, isToday);
  const stops: RouteStop[] = items.map(() => 'future');
  timedIndexes.forEach((itemIndex, position) => {
    stops[itemIndex] = progress.stops[position];
  });

  return items.map((_, index) => ({
    stop: stops[index],
    above: index > 0 ? legInto(stops[index]) : undefined,
    below: index < items.length - 1 ? legInto(stops[index + 1]) : undefined,
  }));
}

/** A leg is travelled once the traveller has reached the stop it leads to. */
const legInto = (stop: RouteStop): RouteSegmentStyle => (stop === 'future' ? 'dashed' : 'solid');
