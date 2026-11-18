/**
 * Calendar-day helpers for the Timeline and Day By Day views.
 *
 * A trip's start and end are date-only values, so the list of days comes from
 * their YYYY-MM-DD parts and never from a Date built in the device zone. The
 * day keys use the same "Fri, Nov 13, 2026" shape that
 * `getDateStringInTimezone` produces for real timestamps, so both meet in one map.
 */

export interface TripDay {
  dayNumber: number;
  /** "Fri, Nov 13, 2026": matches the key of a timestamp bucketed in the trip zone. */
  dateKey: string;
  /** "Friday, November 13, 2026" */
  displayDate: string;
  /** Noon UTC on the calendar day; use it for ordering, not for formatting in a zone. */
  date: Date;
}

const DAY_KEY_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: 'UTC',
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

const DISPLAY_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC noon of a date-only string, or null when it has no YYYY-MM-DD prefix. */
function noonUtc(dateOnly: string): number | null {
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/** The day key for a date-only value ("2026-11-13" or an ISO string for that date). */
export function dayKeyForDateOnly(dateOnly: string): string | null {
  const ms = noonUtc(dateOnly);
  if (ms === null) return null;
  return new Intl.DateTimeFormat('en-US', DAY_KEY_FORMAT).format(new Date(ms));
}

/** One entry per calendar day from start to end inclusive. */
export function listTripDays(startDate: string, endDate: string): TripDay[] {
  const start = noonUtc(startDate);
  const end = noonUtc(endDate);
  if (start === null || end === null) return [];

  const keyFormatter = new Intl.DateTimeFormat('en-US', DAY_KEY_FORMAT);
  const displayFormatter = new Intl.DateTimeFormat('en-US', DISPLAY_FORMAT);

  const days: TripDay[] = [];
  for (let ms = start, n = 1; ms <= end && n <= 1000; ms += DAY_MS, n++) {
    const date = new Date(ms);
    days.push({
      dayNumber: n,
      dateKey: keyFormatter.format(date),
      displayDate: displayFormatter.format(date),
      date,
    });
  }
  return days;
}

/** Every calendar day from first to last (date-only values) as UTC-noon dates. */
export function utcNoonRange(firstDateOnly: string, lastDateOnly: string): Date[] {
  const first = noonUtc(firstDateOnly);
  const last = noonUtc(lastDateOnly);
  if (first === null || last === null) return [];
  const out: Date[] = [];
  for (let ms = first; ms <= last && out.length <= 1000; ms += DAY_MS) out.push(new Date(ms));
  return out;
}

/** Day key for a UTC-noon date produced by `utcNoonRange`. */
export function dayKeyForUtcNoon(date: Date): string {
  return new Intl.DateTimeFormat('en-US', DAY_KEY_FORMAT).format(date);
}
