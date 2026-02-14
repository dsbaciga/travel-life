/**
 * Timezone utility functions for Travel Life
 *
 * Handles timezone conversions and formatting for activities, transportation, and lodging
 */

/**
 * Format a date/time string in a specific timezone
 * @param dateTime ISO datetime string
 * @param timezone IANA timezone string (e.g., "America/New_York")
 * @param fallbackTimezone Fallback timezone if timezone is null/undefined
 * @param includeTimezone Whether to include timezone abbreviation in output
 */
export function formatDateTimeInTimezone(
  dateTime: string | null | undefined,
  timezone?: string | null,
  fallbackTimezone?: string | null,
  options: {
    includeTimezone?: boolean;
    format?: 'short' | 'medium' | 'long';
  } = {}
): string {
  if (!dateTime) return "Not set";

  const {
    includeTimezone = true,
    format = 'medium'
  } = options;

  const date = new Date(dateTime);
  const effectiveTimezone = timezone || fallbackTimezone || undefined;

  // Base formatting options based on format type
  let formatOptions: Intl.DateTimeFormatOptions;

  switch (format) {
    case 'short':
      formatOptions = {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      };
      break;
    case 'long':
      formatOptions = {
        weekday: "short",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      };
      break;
    case 'medium':
    default:
      formatOptions = {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      };
      break;
  }

  // Add timezone if specified
  if (effectiveTimezone) {
    formatOptions.timeZone = effectiveTimezone;
    if (includeTimezone) {
      formatOptions.timeZoneName = "short";
    }
  }

  try {
    return date.toLocaleString("en-US", formatOptions);
  } catch (error) {
    // Fallback if timezone is invalid
    console.warn(`Invalid timezone: ${effectiveTimezone}`, error);
    return date.toLocaleString("en-US", {
      ...formatOptions,
      timeZone: undefined,
      timeZoneName: undefined,
    });
  }
}

/**
 * Format date only (no time) in a specific timezone
 */
export function formatDateInTimezone(
  dateTime: string | null | undefined,
  timezone?: string | null,
  fallbackTimezone?: string | null
): string {
  if (!dateTime) return "Not set";

  const date = new Date(dateTime);
  const effectiveTimezone = timezone || fallbackTimezone || undefined;

  const formatOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  if (effectiveTimezone) {
    formatOptions.timeZone = effectiveTimezone;
  }

  try {
    return date.toLocaleDateString("en-US", formatOptions);
  } catch (error) {
    console.warn(`Invalid timezone: ${effectiveTimezone}`, error);
    return date.toLocaleDateString("en-US");
  }
}

/**
 * Format time only (no date) in a specific timezone
 */
export function formatTimeInTimezone(
  dateTime: string | null | undefined,
  timezone?: string | null,
  fallbackTimezone?: string | null,
  includeTimezone: boolean = true
): string {
  if (!dateTime) return "Not set";

  const date = new Date(dateTime);
  const effectiveTimezone = timezone || fallbackTimezone || undefined;

  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };

  if (effectiveTimezone) {
    formatOptions.timeZone = effectiveTimezone;
    if (includeTimezone) {
      formatOptions.timeZoneName = "short";
    }
  }

  try {
    return date.toLocaleTimeString("en-US", formatOptions);
  } catch (error) {
    console.warn(`Invalid timezone: ${effectiveTimezone}`, error);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

/**
 * Get timezone abbreviation (e.g., "PST", "EST")
 */
export function getTimezoneAbbreviation(
  timezone: string,
  date: Date = new Date()
): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(date);
    const timeZonePart = parts.find((part) => part.type === "timeZoneName");
    return timeZonePart?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * Common timezone options for select dropdowns
 * Organized by UTC offset (west to east), with standard names and UTC offset indicators
 * Note: Offsets shown are standard time; daylight saving time adds +1 hour where applicable
 */
export const commonTimezones = [
  // UTC-12 to UTC-9
  { value: "Pacific/Honolulu", label: "Hawaii (UTC-10)" },
  { value: "America/Anchorage", label: "Alaska (UTC-9)" },

  // UTC-8 to UTC-5 (North America)
  { value: "America/Los_Angeles", label: "Pacific Time (UTC-8)" },
  { value: "America/Denver", label: "Mountain Time (UTC-7)" },
  { value: "America/Phoenix", label: "Arizona (UTC-7, no DST)" },
  { value: "America/Chicago", label: "Central Time (UTC-6)" },
  { value: "America/New_York", label: "Eastern Time (UTC-5)" },

  // UTC-4 to UTC-3 (Americas)
  { value: "America/Halifax", label: "Atlantic Time (UTC-4)" },
  { value: "America/Sao_Paulo", label: "Brasilia (UTC-3)" },

  // UTC+0 (Western Europe/Africa)
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "Europe/London", label: "London (UTC+0)" },
  { value: "Europe/Lisbon", label: "Lisbon (UTC+0)" },

  // UTC+1 (Central Europe)
  { value: "Europe/Paris", label: "Paris (UTC+1)" },
  { value: "Europe/Berlin", label: "Berlin (UTC+1)" },
  { value: "Europe/Rome", label: "Rome (UTC+1)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (UTC+1)" },
  { value: "Europe/Madrid", label: "Madrid (UTC+1)" },

  // UTC+2 (Eastern Europe)
  { value: "Europe/Athens", label: "Athens (UTC+2)" },
  { value: "Europe/Helsinki", label: "Helsinki (UTC+2)" },
  { value: "Africa/Cairo", label: "Cairo (UTC+2)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (UTC+2)" },

  // UTC+3 (Middle East/East Africa)
  { value: "Europe/Moscow", label: "Moscow (UTC+3)" },
  { value: "Europe/Istanbul", label: "Istanbul (UTC+3)" },
  { value: "Asia/Riyadh", label: "Riyadh (UTC+3)" },

  // UTC+4 (Gulf)
  { value: "Asia/Dubai", label: "Dubai (UTC+4)" },

  // UTC+5 to UTC+5:30 (South Asia)
  { value: "Asia/Karachi", label: "Karachi (UTC+5)" },
  { value: "Asia/Kolkata", label: "India (UTC+5:30)" },

  // UTC+6 to UTC+7 (Southeast Asia)
  { value: "Asia/Dhaka", label: "Dhaka (UTC+6)" },
  { value: "Asia/Bangkok", label: "Bangkok (UTC+7)" },
  { value: "Asia/Jakarta", label: "Jakarta (UTC+7)" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh City (UTC+7)" },

  // UTC+8 (East Asia)
  { value: "Asia/Singapore", label: "Singapore (UTC+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (UTC+8)" },
  { value: "Asia/Shanghai", label: "Shanghai (UTC+8)" },
  { value: "Asia/Taipei", label: "Taipei (UTC+8)" },
  { value: "Australia/Perth", label: "Perth (UTC+8)" },

  // UTC+9 (Japan/Korea)
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { value: "Asia/Seoul", label: "Seoul (UTC+9)" },

  // UTC+10 to UTC+11 (Australia/Pacific)
  { value: "Australia/Brisbane", label: "Brisbane (UTC+10, no DST)" },
  { value: "Australia/Sydney", label: "Sydney (UTC+10)" },
  { value: "Australia/Melbourne", label: "Melbourne (UTC+10)" },

  // UTC+12 to UTC+13 (Pacific)
  { value: "Pacific/Auckland", label: "Auckland (UTC+12)" },
  { value: "Pacific/Fiji", label: "Fiji (UTC+12)" },
];

/**
 * Get timezone options for select dropdown
 * Returns an array that can be mapped in JSX
 */
export function getTimezoneOptions() {
  return commonTimezones;
}

/**
 * Calculate duration between two times, accounting for timezones
 */
export function calculateDuration(
  startTime: string | null | undefined,
  endTime: string | null | undefined
): string {
  if (!startTime || !endTime) return "";

  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end.getTime() - start.getTime();

  if (diffMs < 0) return "Invalid duration";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes}m`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Convert a datetime-local input value to an ISO string that preserves
 * the wall-clock time in the specified timezone.
 *
 * Example: "2025-01-15T14:00" in "America/New_York" timezone
 * -> Returns an ISO string representing 2:00 PM Eastern Time
 *
 * @param dateTimeLocal Value from datetime-local input (YYYY-MM-DDTHH:mm)
 * @param timezone IANA timezone string
 * @returns ISO 8601 string in UTC that represents the local time
 */
export function convertDateTimeLocalToISO(
  dateTimeLocal: string,
  timezone: string
): string {
  // Parse the datetime-local value (format: YYYY-MM-DDTHH:mm)
  const [datePart, timePart] = dateTimeLocal.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);


  // Create a formatter for the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // We need to find the UTC timestamp that, when displayed in the target timezone, shows our desired time
  // Strategy: Create a date assuming UTC, then adjust for the timezone offset

  // First, parse as if it's in the target timezone
  // We'll use a clever trick: format a known UTC time in the target timezone to find the offset
  const testDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  // Format this test date in the target timezone
  const parts = formatter.formatToParts(testDate);
  const tzYear = parseInt(parts.find(p => p.type === 'year')?.value ?? '0');
  const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value ?? '0');
  const tzDay = parseInt(parts.find(p => p.type === 'day')?.value ?? '0');
  const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');

  // Calculate the difference in minutes between what we want and what we got
  const wantedMinutes = year * 525600 + (month - 1) * 43200 + day * 1440 + hour * 60 + minute;
  const gotMinutes = tzYear * 525600 + (tzMonth - 1) * 43200 + tzDay * 1440 + tzHour * 60 + tzMinute;
  const diffMinutes = wantedMinutes - gotMinutes;

  // Adjust the test date by the difference
  const adjustedDate = new Date(testDate.getTime() + diffMinutes * 60 * 1000);

  return adjustedDate.toISOString();
}

/**
 * Convert an ISO timestamp to a datetime-local input value,
 * showing the wall-clock time in the specified timezone.
 *
 * Example: ISO string representing 7:00 PM UTC with "America/New_York" timezone
 * -> Returns "2025-01-15T14:00" (2:00 PM Eastern)
 *
 * @param isoString ISO 8601 string (typically in UTC)
 * @param timezone IANA timezone string
 * @returns datetime-local format string (YYYY-MM-DDTHH:mm)
 */
export function convertISOToDateTimeLocal(
  isoString: string,
  timezone: string
): string {
  const date = new Date(isoString);

  // Format the date in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value ?? '00';
  const month = parts.find(p => p.type === 'month')?.value ?? '00';
  const day = parts.find(p => p.type === 'day')?.value ?? '00';
  const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00';

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Parse a date-only string as a local date at noon to avoid UTC timezone shift issues.
 *
 * When a date-only string like "2025-01-15" is parsed with new Date(),
 * JavaScript interprets it as midnight UTC. When this is then converted
 * to a timezone west of UTC (e.g., America/New_York = UTC-5), it shifts
 * to the previous day (e.g., 7:00 PM on 2025-01-14).
 *
 * This function extracts the YYYY-MM-DD portion and creates a Date
 * at noon local time, avoiding the timezone shift issue.
 *
 * @param dateString Date string in format "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss..."
 * @returns Date object at noon local time for the given date
 */
export function parseDateOnlyAsLocal(dateString: string): Date {
  // Extract YYYY-MM-DD portion (handles both "2025-01-15" and "2025-01-15T00:00:00.000Z")
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
    const day = parseInt(match[3], 10);
    // Create date at noon local time to avoid edge cases
    return new Date(year, month, day, 12, 0, 0);
  }
  // Fallback to standard parsing
  return new Date(dateString);
}

/**
 * Extract the date portion (YYYY-MM-DD) from a date string without timezone conversion.
 *
 * This is useful for comparing date-only values that should not be affected by timezones.
 * For example, a journal entry dated "2025-01-15" should always be compared as that date,
 * regardless of the viewer's timezone.
 *
 * @param dateString Date string in format "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss..."
 * @returns String in format "YYYY-MM-DD"
 */
export function extractDatePortion(dateString: string): string {
  const match = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  // Fallback - parse and format using local date methods
  // This is less reliable but handles edge cases
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Create a reusable date/time formatter for manager components.
 *
 * Returns a function that formats a datetime string for display, using the
 * trip timezone as fallback. This eliminates the duplicated `formatDateTime`
 * wrapper found in ActivityManager, LodgingManager, and TransportationManager.
 *
 * The returned function supports an optional `isAllDay` parameter: when true,
 * it formats as date-only (no time component) using `formatDateInTimezone`.
 *
 * @param tripTimezone - The trip's default timezone, used as fallback
 * @returns A formatter function: (dateTime, timezone?, isAllDay?) => string
 *
 * @example
 * ```tsx
 * const formatDateTime = createDateTimeFormatter(tripTimezone);
 * formatDateTime(activity.startTime, activity.timezone);
 * formatDateTime(activity.startTime, activity.timezone, activity.allDay);
 * ```
 */
export function createDateTimeFormatter(
  tripTimezone?: string | null
): (
  dateTime: string | null,
  timezone?: string | null,
  isAllDay?: boolean
) => string {
  return (
    dateTime: string | null,
    timezone?: string | null,
    isAllDay?: boolean
  ): string => {
    if (isAllDay) {
      return formatDateInTimezone(dateTime, timezone, tripTimezone);
    }
    return formatDateTimeInTimezone(dateTime, timezone, tripTimezone, {
      includeTimezone: true,
      format: "medium",
    });
  };
}
