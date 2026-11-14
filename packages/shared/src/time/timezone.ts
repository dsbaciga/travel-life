/**
 * Timezone resolution and formatting shared by every client.
 *
 * The house rule (see CLAUDE.md → Timezones): **never fall back to UTC for
 * display.** A time belongs to the most specific zone that claims it —
 * `entity.timezone → trip.timezone → user.timezone → device timezone → UTC`.
 *
 * This module is pure: the device zone is passed in by the caller (or read
 * through `Intl`, which exists on Node, browsers and Hermes alike).
 */

/** Last resort only, when nothing — not even the device — can name a zone. */
export const FALLBACK_TIMEZONE = 'UTC';

/** The device's IANA zone, e.g. "Europe/Rome". */
export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** True when `Intl` accepts the zone. Guards user-entered and synced values. */
export function isValidTimezone(timezone: string | null | undefined): timezone is string {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Picks the first timezone that was actually specified, ending at the device
 * zone rather than UTC.
 *
 * @example
 * resolveTimezone(activity.timezone, trip.timezone, user.timezone)
 */
export function resolveTimezone(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return getDeviceTimezone();
}

/**
 * Calendar day (`YYYY-MM-DD`) an instant falls on in a zone.
 *
 * Slicing the ISO string groups by the UTC day and misfiles evening events;
 * always bucket timeline items with this.
 */
export function dayKeyInTimezone(instant: string | number | Date, timezone: string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Formats a date-only value (`@db.Date`, stored at UTC midnight).
 *
 * Pins to UTC deliberately: these are calendar dates, not instants, and any
 * zone west of Greenwich would otherwise render the previous day.
 */
export function formatDateOnly(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
  locale = 'en-US'
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
}

/** `YYYY-MM-DD` portion of a date-only value, pinned to UTC. */
export function dateOnlyKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Wall-clock time of an instant in a zone: `2:05 PM` by default, or `14:05`
 * with `{ hour12: false }`.
 */
export function formatTimeInTimezone(
  instant: string | number | Date | null | undefined,
  timezone: string,
  options: { hour12?: boolean; locale?: string } = {}
): string {
  if (instant === null || instant === undefined || instant === '') return '';
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  const hour12 = options.hour12 ?? true;
  return (
    new Intl.DateTimeFormat(options.locale ?? 'en-US', {
      timeZone: timezone,
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12,
    })
      .format(date)
      // Newer ICU puts a narrow no-break space before AM/PM; plain text is easier to
      // compare, copy and read aloud, and renders the same.
      .replace(/ /g, ' ')
  );
}

/** Short zone label for an instant, e.g. "CEST" or "GMT+2". */
export function getTimezoneAbbreviation(timezone: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone;
  } catch {
    return timezone;
  }
}

/**
 * Offset of a zone from UTC at an instant, in minutes (east positive).
 * Used by the dual clock to show "+7h from home".
 */
export function timezoneOffsetMinutes(timezone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * The instant at which a calendar day begins in a zone.
 *
 * @param dayKey - `YYYY-MM-DD`
 */
export function startOfDayInTimezone(dayKey: string, timezone: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  // Guess UTC midnight, then correct by the zone's offset at that guess. A
  // second pass handles days where the offset changes (DST transitions).
  let guess = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 2; i++) {
    const offset = timezoneOffsetMinutes(timezone, guess);
    guess = new Date(Date.UTC(y, m - 1, d) - offset * 60000);
  }
  return guess;
}

/**
 * The instant at which a wall-clock time occurs on a calendar day in a zone.
 *
 * Not "midnight + N ms": on a DST-change day midnight and 09:00 sit at
 * different UTC offsets, so the offset is resolved at the target time itself.
 *
 * @param dayKey - `YYYY-MM-DD`
 * @param msOfDay - Wall-clock milliseconds since local midnight
 */
export function wallClockToInstant(dayKey: string, msOfDay: number, timezone: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d) + msOfDay;
  let guess = new Date(wallAsUtc);
  for (let i = 0; i < 2; i++) {
    guess = new Date(wallAsUtc - timezoneOffsetMinutes(timezone, guess) * 60000);
  }
  return guess;
}

/** Wall-clock milliseconds since local midnight for an instant in a zone. */
export function msOfDayInTimezone(instant: string | number | Date, timezone: string): number {
  const date = instant instanceof Date ? instant : new Date(instant);
  const local = date.getTime() + timezoneOffsetMinutes(timezone, date) * 60000;
  return ((local % 86400000) + 86400000) % 86400000;
}

/** Adds whole calendar days to a `YYYY-MM-DD` key. */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Human countdown to (or since) an instant: "in 2h 05m", "in 3d", "12m ago", "now".
 */
export function formatCountdown(target: string | number | Date, now: Date = new Date()): string {
  const t = target instanceof Date ? target.getTime() : new Date(target).getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = t - now.getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.floor(abs / 60000);
  if (minutes < 1) return 'now';
  let text: string;
  if (minutes < 60) text = `${minutes}m`;
  else if (minutes < 24 * 60) {
    text = `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  } else {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    text = hours > 0 && days < 3 ? `${days}d ${hours}h` : `${days}d`;
  }
  return diffMs >= 0 ? `in ${text}` : `${text} ago`;
}
