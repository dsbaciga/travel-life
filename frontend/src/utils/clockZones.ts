/**
 * Clock helpers for the on-trip "local vs home" display. Pure: every function
 * takes the instant and the zone explicitly, so none of it reads the browser's
 * own zone.
 */

/**
 * The offset of `timezone` from UTC at `at`, in minutes east of UTC (Tokyo is
 * +540). Null when the zone is not one the runtime knows.
 */
export function getUtcOffsetMinutes(timezone: string, at: Date): number | null {
  try {
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
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value);
    const wallClockAsUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second')
    );
    if (Number.isNaN(wallClockAsUtc)) return null;
    // Drop sub-second noise so the difference is a whole number of minutes.
    const instant = Math.floor(at.getTime() / 1000) * 1000;
    return Math.round((wallClockAsUtc - instant) / 60_000);
  } catch {
    return null;
  }
}

/**
 * True when the two zones show the same wall-clock time right now. Compares the
 * offsets at `at`, not the zone names: Europe/London and Africa/Abidjan are
 * different zones but read the same in winter.
 */
export function haveSameOffset(zoneA: string, zoneB: string, at: Date): boolean {
  if (zoneA === zoneB) return true;
  const a = getUtcOffsetMinutes(zoneA, at);
  const b = getUtcOffsetMinutes(zoneB, at);
  // If either zone cannot be read, say nothing rather than show a wrong clock.
  return a === null || b === null ? true : a === b;
}

/** "9:41 PM" in `timezone`, or an empty string for a zone the runtime rejects. */
export function formatClockTime(at: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(at);
  } catch {
    return '';
  }
}

/** "Sat" in `timezone`, used to flag a clock that is on a different day. */
export function formatClockWeekday(at: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(at);
  } catch {
    return '';
  }
}

/** The last segment of an IANA name as a place: "America/New_York" -> "New York". */
export function zoneCityLabel(timezone: string): string {
  return (timezone.split('/').pop() ?? timezone).replace(/_/g, ' ');
}
