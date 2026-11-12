/**
 * Live itinerary adjustments: the "+30m / +1h / Move to tomorrow / All-day"
 * gestures on the Today timeline.
 *
 * Pure functions that return the *patch* to apply, so the same logic drives the
 * optimistic SQLite write, the outbox payload and the unit tests.
 */

import {
  addDaysToDayKey,
  dayKeyInTimezone,
  msOfDayInTimezone,
  startOfDayInTimezone,
  wallClockToInstant,
} from '../time/timezone';

export interface TimedItem {
  startTime: string | null;
  endTime: string | null;
  allDay?: boolean;
}

export interface TimePatch {
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
}

export const QUICK_SHIFT_MINUTES = [15, 30, 60] as const;

const shiftIso = (iso: string | null, ms: number): string | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(t + ms).toISOString();
};

/**
 * Nudge an item later (positive) or earlier (negative), preserving duration.
 * An all-day or untimed item has nothing to nudge and is returned unchanged.
 */
export function shiftByMinutes(item: TimedItem, minutes: number): TimePatch {
  if (item.allDay || !item.startTime) {
    return { startTime: item.startTime, endTime: item.endTime, allDay: Boolean(item.allDay) };
  }
  const ms = minutes * 60000;
  return {
    startTime: shiftIso(item.startTime, ms),
    endTime: shiftIso(item.endTime, ms),
    allDay: false,
  };
}

/**
 * Move an item by whole calendar days **in its own timezone**, keeping the
 * same wall-clock time. Adding 24h would be wrong across a DST change: a 09:00
 * museum slot must stay 09:00 the next day.
 */
export function moveByDays(item: TimedItem, days: number, timezone: string): TimePatch {
  if (!item.startTime) {
    return { startTime: null, endTime: item.endTime, allDay: Boolean(item.allDay) };
  }
  const move = (iso: string): string => {
    const instant = new Date(iso);
    const dayKey = dayKeyInTimezone(instant, timezone);
    return wallClockToInstant(
      addDaysToDayKey(dayKey, days),
      msOfDayInTimezone(instant, timezone),
      timezone
    ).toISOString();
  };
  return {
    startTime: move(item.startTime),
    endTime: item.endTime ? move(item.endTime) : null,
    allDay: Boolean(item.allDay),
  };
}

/** Move to a specific `YYYY-MM-DD` day, keeping the wall-clock time. */
export function moveToDay(item: TimedItem, targetDayKey: string, timezone: string): TimePatch {
  if (!item.startTime) {
    // Untimed items get pinned to the start of the target day as all-day.
    return {
      startTime: startOfDayInTimezone(targetDayKey, timezone).toISOString(),
      endTime: null,
      allDay: true,
    };
  }
  const currentKey = dayKeyInTimezone(item.startTime, timezone);
  const [cy, cm, cd] = currentKey.split('-').map(Number);
  const [ty, tm, td] = targetDayKey.split('-').map(Number);
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(cy, cm - 1, cd)) / 86400000);
  return moveByDays(item, days, timezone);
}

/** Convert to an all-day item on the day it currently starts. */
export function convertToAllDay(item: TimedItem, timezone: string, fallbackDayKey: string): TimePatch {
  const dayKey = item.startTime ? dayKeyInTimezone(item.startTime, timezone) : fallbackDayKey;
  return {
    startTime: startOfDayInTimezone(dayKey, timezone).toISOString(),
    endTime: null,
    allDay: true,
  };
}

/**
 * New `manualOrder` values after a drag-to-reorder.
 *
 * @param orderedIds - Item ids in their new visual order
 * @returns id → manualOrder (0-based, gap-free)
 */
export function reorderManualOrder<Id extends string | number>(
  orderedIds: readonly Id[]
): Map<Id, number> {
  const result = new Map<Id, number>();
  orderedIds.forEach((id, index) => result.set(id, index));
  return result;
}

/** Moves one element of an array, returning a new array. */
export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = list.slice();
  if (from < 0 || from >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(copy.length, to)), 0, item);
  return copy;
}

export type TransportStatus = 'on_time' | 'delayed' | 'cancelled';

/**
 * Derive the status fields for a transit leg from its actual departure.
 * A leg that left 5+ minutes late is "delayed"; earlier or on time is "on_time".
 */
export function deriveTransportDelay(
  scheduledStart: string | null,
  actualStart: string | null
): { status: TransportStatus; delayMinutes: number | null } {
  if (!scheduledStart || !actualStart) return { status: 'on_time', delayMinutes: null };
  const delay = Math.round(
    (new Date(actualStart).getTime() - new Date(scheduledStart).getTime()) / 60000
  );
  if (Number.isNaN(delay)) return { status: 'on_time', delayMinutes: null };
  return delay >= 5
    ? { status: 'delayed', delayMinutes: delay }
    : { status: 'on_time', delayMinutes: null };
}
