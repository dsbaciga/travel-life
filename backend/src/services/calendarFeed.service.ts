/**
 * Calendar Feed Service
 *
 * Manages per-user secret calendar tokens and generates a read-only
 * iCalendar (RFC 5545) feed of the user's trips, transportation, and lodging.
 *
 * The ICS output is hand-rolled (no dependencies): CRLF line endings,
 * 75-octet line folding, and proper text escaping.
 */
import crypto from 'crypto';
import prisma from '../config/database';
import { AppError } from '../errors/errors';

// ---------------------------------------------------------------------------
// Pure ICS helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Escape text for use in an ICS property value (RFC 5545 section 3.3.11).
 * Backslashes, semicolons, and commas are escaped; newlines become literal \n.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line to a maximum of 75 octets per line (RFC 5545 section 3.1).
 * Continuation lines begin with a single space. Multi-byte UTF-8 sequences are
 * never split across a fold boundary.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) {
    return line;
  }

  const parts: string[] = [];
  let start = 0;
  // First physical line can hold 75 octets; continuations hold 74 (space + 74 = 75)
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off if we'd split a UTF-8 multi-byte sequence (continuation bytes are 10xxxxxx)
    while (end < bytes.length && end > start && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

/** Format a date as an ICS DATE value (YYYYMMDD) using its UTC components. */
export function formatIcsDate(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

/** Format a date as an ICS UTC DATE-TIME value (YYYYMMDDTHHMMSSZ). */
export function formatIcsDateTimeUtc(date: Date): string {
  const h = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  return `${formatIcsDate(date)}T${h}${min}${s}Z`;
}

/** Return a new Date advanced by the given number of days (UTC-safe). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Get the offset (in milliseconds) of an IANA timezone at a given instant.
 * Positive values mean the zone is ahead of UTC.
 */
function timezoneOffsetMs(timeZone: string, instant: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = parseInt(part.value, 10);
    }
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour === 24 ? 0 : parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - instant.getTime();
}

/**
 * Interpret a stored "naive" datetime (whose UTC components represent local
 * wall-clock time) as being in the given IANA timezone, and return the real
 * UTC instant. Falls back to treating the value as UTC when no/invalid tz.
 */
export function localDateTimeToUtc(local: Date, timeZone?: string | null): Date {
  if (!timeZone) {
    return local;
  }
  try {
    // First guess assuming the offset at the local timestamp, then refine once
    // to handle DST transitions correctly.
    const guess = local.getTime() - timezoneOffsetMs(timeZone, local);
    const refined = local.getTime() - timezoneOffsetMs(timeZone, new Date(guess));
    return new Date(refined);
  } catch {
    // Unknown/invalid timezone identifier — fall back to UTC interpretation
    return local;
  }
}

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  /** All-day events use DATE values; DTEND is exclusive per RFC 5545 */
  allDay?: boolean;
  start: Date;
  /** Optional; omitted from output when not provided */
  end?: Date | null;
}

/** Build a single VEVENT block as an array of unfolded content lines. */
export function buildEventLines(event: IcsEvent, dtstamp: Date): string[] {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${event.uid}`);
  lines.push(`DTSTAMP:${formatIcsDateTimeUtc(dtstamp)}`);
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.start)}`);
    if (event.end) {
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(event.end)}`);
    }
  } else {
    lines.push(`DTSTART:${formatIcsDateTimeUtc(event.start)}`);
    if (event.end) {
      lines.push(`DTEND:${formatIcsDateTimeUtc(event.end)}`);
    }
  }
  lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Build a complete VCALENDAR document from a list of events.
 * Lines are folded to 75 octets and joined with CRLF.
 */
export function buildCalendar(events: IcsEvent[], dtstamp: Date = new Date()): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Travel Life//Travel Life Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Travel Life',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];
  for (const event of events) {
    lines.push(...buildEventLines(event, dtstamp));
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Event assembly from database records (exported for unit testing)
// ---------------------------------------------------------------------------

interface TripRecord {
  id: number;
  title: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  tripTypeEmoji: string | null;
}

interface TransportationRecord {
  id: number;
  type: string;
  company: string | null;
  referenceNumber: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  startTimezone: string | null;
  endTimezone: string | null;
  startLocationText: string | null;
  endLocationText: string | null;
  startLocation: { name: string } | null;
  endLocation: { name: string } | null;
}

interface LodgingRecord {
  id: number;
  name: string;
  address: string | null;
  checkInDate: Date;
  checkOutDate: Date;
  /** The stay's place (locationId FK); used when the lodging has no address of its own. */
  location?: { name: string; address: string | null } | null;
}

export function buildTripEvent(trip: TripRecord): IcsEvent | null {
  if (!trip.startDate) {
    return null;
  }
  const endDate = trip.endDate ?? trip.startDate;
  const emoji = trip.tripTypeEmoji ? `${trip.tripTypeEmoji} ` : '';
  return {
    uid: `trip-${trip.id}@travel-life`,
    summary: `${emoji}${trip.title}`,
    description: trip.description,
    allDay: true,
    start: trip.startDate,
    // DTEND is exclusive, so add one day to include the final trip day
    end: addDays(endDate, 1),
  };
}

export function buildTransportationEvent(transport: TransportationRecord): IcsEvent | null {
  if (!transport.scheduledStart) {
    return null;
  }
  const from = transport.startLocationText ?? transport.startLocation?.name ?? null;
  const to = transport.endLocationText ?? transport.endLocation?.name ?? null;

  const summaryParts: string[] = [transport.type];
  if (transport.company) {
    summaryParts.push(transport.company);
  }
  if (transport.referenceNumber) {
    summaryParts.push(transport.referenceNumber);
  }
  let summary = summaryParts.join(' ');
  if (from && to) {
    summary += `: ${from} → ${to}`;
  } else if (from || to) {
    summary += `: ${from ?? to}`;
  }

  const start = localDateTimeToUtc(transport.scheduledStart, transport.startTimezone);
  const end = transport.scheduledEnd
    ? localDateTimeToUtc(transport.scheduledEnd, transport.endTimezone ?? transport.startTimezone)
    : null;

  return {
    uid: `transport-${transport.id}@travel-life`,
    summary,
    allDay: false,
    start,
    end,
  };
}

export function buildLodgingEvent(lodging: LodgingRecord): IcsEvent {
  return {
    uid: `lodging-${lodging.id}@travel-life`,
    summary: `🏨 ${lodging.name}`,
    location: lodging.address || lodging.location?.address || lodging.location?.name || null,
    allDay: true,
    start: lodging.checkInDate,
    // DTEND is exclusive — add one day so the event spans through check-out day
    end: addDays(lodging.checkOutDate, 1),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const FEED_PATH_PREFIX = '/api/calendar/';

function feedPathFor(token: string | null): string | null {
  return token ? `${FEED_PATH_PREFIX}${token}.ics` : null;
}

class CalendarFeedService {
  /** Get the current calendar token (or null if none has been generated). */
  async getCalendarToken(userId: number): Promise<{ token: string | null; feedPath: string | null }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { calendarToken: true },
    });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return { token: user.calendarToken, feedPath: feedPathFor(user.calendarToken) };
  }

  /** Generate a new calendar token, replacing (rotating) any existing one. */
  async rotateCalendarToken(userId: number): Promise<{ token: string; feedPath: string }> {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: userId },
      data: { calendarToken: token },
    });
    return { token, feedPath: `${FEED_PATH_PREFIX}${token}.ics` };
  }

  /** Revoke the calendar token, disabling the feed URL. */
  async revokeCalendarToken(userId: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { calendarToken: null },
    });
  }

  /**
   * Generate the full ICS document for the user owning the given token.
   * Throws a 404 AppError for unknown tokens.
   */
  async generateFeedForToken(token: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { calendarToken: token },
      select: { id: true },
    });
    if (!user) {
      throw new AppError('Calendar feed not found', 404);
    }

    const trips = await prisma.trip.findMany({
      where: {
        userId: user.id,
        NOT: { status: { equals: 'cancelled', mode: 'insensitive' } },
      },
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        status: true,
        tripTypeEmoji: true,
        transportation: {
          select: {
            id: true,
            type: true,
            company: true,
            referenceNumber: true,
            scheduledStart: true,
            scheduledEnd: true,
            startTimezone: true,
            endTimezone: true,
            startLocationText: true,
            endLocationText: true,
            startLocation: { select: { name: true } },
            endLocation: { select: { name: true } },
          },
        },
        lodging: {
          select: {
            id: true,
            name: true,
            address: true,
            checkInDate: true,
            checkOutDate: true,
            location: { select: { name: true, address: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    const events: IcsEvent[] = [];
    for (const trip of trips) {
      const tripEvent = buildTripEvent(trip);
      if (tripEvent) {
        events.push(tripEvent);
      }
      for (const transport of trip.transportation) {
        const transportEvent = buildTransportationEvent(transport);
        if (transportEvent) {
          events.push(transportEvent);
        }
      }
      for (const lodging of trip.lodging) {
        events.push(buildLodgingEvent(lodging));
      }
    }

    return buildCalendar(events);
  }
}

export const calendarFeedService = new CalendarFeedService();
