/**
 * "What is next" for the on-trip Today view.
 *
 * Pure: the caller passes the items, the current instant and a fallback zone,
 * and nothing here reads the clock, the browser's zone or the network. That is
 * what lets the card render from cached data with the network off, and lets
 * the logic be tested at awkward moments (midnight, a DST change, a landing).
 *
 * Everything that decides ORDER compares instants, so DST and time zones
 * cannot reorder or mis-time an item. Calendar days only decide the label
 * (today / tomorrow) and are always measured in the zone the traveller is in
 * right now, via `dayKeyInTimezone`.
 */

import { dayKeyInTimezone } from './timezone';

/** The least a selectable item has to know about itself. */
export interface TimedItem {
  /** Unique within the list. */
  key: string;
  /** ISO instant, or a bare YYYY-MM-DD for a date with no time. Null = undated. */
  start: string | null;
  /** ISO instant the item ends. Null = it has no duration. */
  end: string | null;
  /** The zone `start` is shown in. Already resolved by the caller. */
  timezone: string;
  /** The zone `end` is shown in (a flight lands elsewhere). Defaults to `timezone`. */
  endTimezone?: string | null;
  /** Has no time of day: an all-day activity, or a check-in with only a date. */
  allDay: boolean;
}

export type NextUpWhen = 'today' | 'tomorrow' | 'later';

export interface NextUpSelection<T extends TimedItem> {
  /**
   * The zone the traveller is in at `now`: the item under way (where it leaves
   * them), else the item about to start, else the fallback. Never UTC by
   * default; the caller supplies the fallback.
   */
  timezone: string;
  /** Today's calendar day in `timezone`, as YYYY-MM-DD. */
  todayKey: string;
  /** The item in progress right now, if any. Latest start wins when several overlap. */
  current: T | null;
  /** The first timed item that has not started yet, whenever it is. */
  next: T | null;
  /** Whether `next` falls today, tomorrow or later, in the traveller's calendar. */
  nextWhen: NextUpWhen | null;
  /** Items dated today that have no time of day (all-day activities, date-only stays). */
  untimedToday: T[];
}

/**
 * An item starting within this long is where the traveller is about to be, so
 * its zone is the one to read the clock in (the hotel after a landing).
 * Anything further out is a plan, not a location.
 */
export const IMMINENT_MS = 12 * 60 * 60 * 1000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** The calendar day after a YYYY-MM-DD key. Calendar arithmetic, so UTC is correct here. */
export function addDaysToKey(key: string, days: number): string {
  const base = Date.parse(`${key}T00:00:00Z`);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole calendar days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000
  );
}

/**
 * The calendar day an item starts on, in its own zone. A bare date has no
 * instant to convert, so it is taken as written; running it through a zone
 * would shift it a day for anyone west of UTC.
 */
export function itemDayKey(item: TimedItem): string | null {
  if (!item.start) return null;
  if (DATE_ONLY.test(item.start)) return item.start;
  return dayKeyInTimezone(item.start, item.timezone);
}

/**
 * Pick what is happening now and what comes next.
 *
 * @param items    every dated item that could matter (the whole trip is fine)
 * @param now      the current instant
 * @param fallbackTimezone  used when no item says where the traveller is; pass
 *                 the already-resolved trip zone, never a bare 'UTC'
 */
export function selectNextUp<T extends TimedItem>(
  items: readonly T[],
  now: Date,
  fallbackTimezone: string
): NextUpSelection<T> {
  const nowMs = now.getTime();

  // Timed items in time order; ties keep the caller's order.
  const timed = items
    .map((item, index) => ({ item, index, startMs: item.allDay ? null : toMs(item.start) }))
    .filter((entry): entry is { item: T; index: number; startMs: number } => entry.startMs !== null)
    .sort((a, b) => a.startMs - b.startMs || a.index - b.index);

  let current: T | null = null;
  let currentStart = -Infinity;
  for (const { item, startMs } of timed) {
    const endMs = toMs(item.end);
    if (endMs !== null && startMs <= nowMs && nowMs < endMs && startMs >= currentStart) {
      current = item;
      currentStart = startMs;
    }
  }

  const upcoming = timed.find((entry) => entry.startMs > nowMs) ?? null;
  const next = upcoming?.item ?? null;

  let timezone = fallbackTimezone;
  if (current) {
    // Mid-journey the useful clock is the one you are heading to.
    timezone = current.endTimezone || current.timezone || fallbackTimezone;
  } else if (upcoming && upcoming.startMs - nowMs <= IMMINENT_MS) {
    timezone = upcoming.item.timezone || fallbackTimezone;
  }

  const todayKey = dayKeyInTimezone(now.toISOString(), timezone) ?? '';

  let nextWhen: NextUpWhen | null = null;
  if (next) {
    const nextKey = itemDayKey(next);
    if (nextKey === null || nextKey <= todayKey) nextWhen = 'today';
    else if (nextKey === addDaysToKey(todayKey, 1)) nextWhen = 'tomorrow';
    else nextWhen = 'later';
  }

  const untimedToday = items.filter((item) => item.allDay && itemDayKey(item) === todayKey);

  return { timezone, todayKey, current, next, nextWhen, untimedToday };
}

/**
 * "in 1h 20m", "in 45m", "in 2d 3h", or "now" once the moment has arrived.
 * Rounds up to the minute so the text never says "in 0m".
 */
export function formatCountdown(msUntil: number): string {
  if (msUntil <= 0) return 'now';
  const totalMinutes = Math.ceil(msUntil / 60_000);
  if (totalMinutes < 60) return `in ${totalMinutes}m`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return minutes === 0 ? `in ${totalHours}h` : `in ${totalHours}h ${minutes}m`;

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `in ${days}d` : `in ${days}d ${hours}h`;
}
