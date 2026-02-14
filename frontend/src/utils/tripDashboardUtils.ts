/**
 * Utility functions for the Trip Dashboard components
 *
 * Provides functions for:
 * - Determining the next upcoming event
 * - Normalizing event data across different entity types
 * - Formatting event information for display
 * - Getting today's itinerary events
 */

import type { Activity } from '../types/activity';
import type { Transportation, TransportationType } from '../types/transportation';
import type { Lodging, LodgingType } from '../types/lodging';
import type { Location } from '../types/location';
import type { JournalEntry } from '../types/journalEntry';
import type { Photo } from '../types/photo';
import { TripStatus, type TripStatusType } from '../types/trip';

// ============================================================================
// Constants
// ============================================================================

/**
 * ID offset for lodging check-out events to avoid collision with check-in events
 */
export const LODGING_CHECKOUT_ID_OFFSET = 100000;

/**
 * ID offset for lodging ongoing stay events to avoid collision with check-in/out events
 */
export const LODGING_ONGOING_STAY_ID_OFFSET = 200000;

/**
 * Default check-in time (3:00 PM) used when lodging doesn't specify a time
 */
export const DEFAULT_CHECKIN_HOUR = 15;

/**
 * Default check-out time (11:00 AM) used when lodging doesn't specify a time
 */
export const DEFAULT_CHECKOUT_HOUR = 11;

/**
 * Event types for the today's itinerary
 */
export type ItineraryEventType = 'activity' | 'transportation' | 'lodging';

/**
 * A unified event structure for today's itinerary display
 */
export interface ItineraryEvent {
  id: number;
  type: ItineraryEventType;
  name: string;
  startTime: Date;
  endTime?: Date;
  location?: string;
  subtitle?: string;
  isCompleted: boolean;
  data: Activity | Transportation | Lodging;
}

/**
 * Get today's date string in the specified timezone (YYYY-MM-DD format)
 */
export function getTodayInTimezone(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Get the current time in the specified timezone as a Date object
 */
export function getCurrentTimeInTimezone(timezone: string): Date {
  const now = new Date();
  // Get the current time formatted in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';

  const year = parseInt(getPart('year'));
  const month = parseInt(getPart('month')) - 1;
  const day = parseInt(getPart('day'));
  const hour = parseInt(getPart('hour'));
  const minute = parseInt(getPart('minute'));
  const second = parseInt(getPart('second'));

  return new Date(year, month, day, hour, minute, second);
}

/**
 * Check if a datetime string is on "today" in the specified timezone
 */
function isDateToday(dateTime: string | null, todayStr: string, timezone: string): boolean {
  if (!dateTime) return false;

  const date = new Date(dateTime);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date) === todayStr;
}

/**
 * Check if a date range spans "today" in the specified timezone
 * Used for lodging that may span multiple days
 */
function doesDateRangeIncludeToday(
  checkInDate: string | null,
  checkOutDate: string | null,
  todayStr: string,
  timezone: string
): boolean {
  if (!checkInDate) return false;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const checkInStr = formatter.format(new Date(checkInDate));
  const checkOutStr = checkOutDate ? formatter.format(new Date(checkOutDate)) : checkInStr;

  // Today is within the range if: checkIn <= today <= checkOut
  return checkInStr <= todayStr && todayStr <= checkOutStr;
}

/**
 * Get today's events from activities, transportation, and lodging
 * Returns events sorted by start time
 */
export function getTodaysEvents(
  activities: Activity[],
  transportation: Transportation[],
  lodging: Lodging[],
  timezone: string
): ItineraryEvent[] {
  const todayStr = getTodayInTimezone(timezone);
  const now = getCurrentTimeInTimezone(timezone);
  const events: ItineraryEvent[] = [];

  // Process activities
  for (const activity of activities) {
    if (!activity.startTime) continue;

    // Check if activity is today
    if (!isDateToday(activity.startTime, todayStr, timezone)) continue;

    const startTime = new Date(activity.startTime);
    const endTime = activity.endTime ? new Date(activity.endTime) : undefined;

    events.push({
      id: activity.id,
      type: 'activity',
      name: activity.name,
      startTime,
      endTime,
      location: activity.category || undefined,
      subtitle: activity.description || undefined,
      isCompleted: endTime ? endTime < now : startTime < now,
      data: activity,
    });
  }

  // Process transportation
  for (const trans of transportation) {
    if (!trans.departureTime) continue;

    // Check if departure is today
    if (!isDateToday(trans.departureTime, todayStr, timezone)) continue;

    const startTime = new Date(trans.departureTime);
    const endTime = trans.arrivalTime ? new Date(trans.arrivalTime) : undefined;

    // Build location description
    let location: string | undefined;
    if (trans.fromLocationName && trans.toLocationName) {
      location = `${trans.fromLocationName} to ${trans.toLocationName}`;
    } else if (trans.fromLocation?.name && trans.toLocation?.name) {
      location = `${trans.fromLocation.name} to ${trans.toLocation.name}`;
    }

    // Build subtitle with carrier/vehicle info
    let subtitle: string | undefined;
    if (trans.carrier && trans.vehicleNumber) {
      subtitle = `${trans.carrier} ${trans.vehicleNumber}`;
    } else if (trans.carrier) {
      subtitle = trans.carrier;
    } else if (trans.vehicleNumber) {
      subtitle = trans.vehicleNumber;
    }

    events.push({
      id: trans.id,
      type: 'transportation',
      name: trans.type.charAt(0).toUpperCase() + trans.type.slice(1),
      startTime,
      endTime,
      location,
      subtitle,
      isCompleted: endTime ? endTime < now : startTime < now,
      data: trans,
    });
  }

  // Process lodging (check-in and check-out events)
  for (const lodge of lodging) {
    // Check-in event
    if (lodge.checkInDate && isDateToday(lodge.checkInDate, todayStr, timezone)) {
      const startTime = new Date(lodge.checkInDate);

      events.push({
        id: lodge.id,
        type: 'lodging',
        name: `Check-in: ${lodge.name}`,
        startTime,
        location: lodge.address || undefined,
        subtitle: lodge.type.charAt(0).toUpperCase() + lodge.type.slice(1).replace(/_/g, ' '),
        isCompleted: startTime < now,
        data: lodge,
      });
    }

    // Check-out event
    if (lodge.checkOutDate && isDateToday(lodge.checkOutDate, todayStr, timezone)) {
      const startTime = new Date(lodge.checkOutDate);

      events.push({
        id: lodge.id + LODGING_CHECKOUT_ID_OFFSET,
        type: 'lodging',
        name: `Check-out: ${lodge.name}`,
        startTime,
        location: lodge.address || undefined,
        subtitle: lodge.type.charAt(0).toUpperCase() + lodge.type.slice(1).replace(/_/g, ' '),
        isCompleted: startTime < now,
        data: lodge,
      });
    }

    // Ongoing stay (neither check-in nor check-out today, but staying overnight)
    if (
      lodge.checkInDate &&
      lodge.checkOutDate &&
      doesDateRangeIncludeToday(lodge.checkInDate, lodge.checkOutDate, todayStr, timezone) &&
      !isDateToday(lodge.checkInDate, todayStr, timezone) &&
      !isDateToday(lodge.checkOutDate, todayStr, timezone)
    ) {
      // Create an all-day event at midnight for ongoing stays
      const todayMidnight = new Date(todayStr + 'T00:00:00');

      events.push({
        id: lodge.id + LODGING_ONGOING_STAY_ID_OFFSET,
        type: 'lodging',
        name: `Staying at: ${lodge.name}`,
        startTime: todayMidnight,
        location: lodge.address || undefined,
        subtitle: 'Ongoing stay',
        isCompleted: false, // Ongoing stays are never "completed"
        data: lodge,
      });
    }
  }

  // Sort by start time
  events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return events;
}

/**
 * Calculate the position (percentage) for the current time indicator
 * Returns a value between 0 and 100, or null if outside the day range
 *
 * @param startHour - The start hour of the visible timeline (default 0)
 * @param endHour - The end hour of the visible timeline (default 24)
 * @param timezone - The timezone to calculate current time in
 */
export function getCurrentTimePosition(
  timezone: string,
  startHour: number = 0,
  endHour: number = 24
): number | null {
  const now = getCurrentTimeInTimezone(timezone);
  const currentHour = now.getHours() + now.getMinutes() / 60;

  // Check if current time is within the visible range
  if (currentHour < startHour || currentHour > endHour) {
    return null;
  }

  // Calculate percentage position
  const totalHours = endHour - startHour;
  const hoursFromStart = currentHour - startHour;

  return (hoursFromStart / totalHours) * 100;
}

/**
 * Find the next upcoming event (first event that hasn't completed yet)
 */
export function getNextEvent(events: ItineraryEvent[]): ItineraryEvent | null {
  return events.find(event => !event.isCompleted) || null;
}

/**
 * Format time for display (e.g., "9:00 AM")
 */
export function formatEventTime(date: Date, timezone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  if (timezone) {
    options.timeZone = timezone;
  }

  return date.toLocaleTimeString('en-US', options);
}

/**
 * Format event duration (e.g., "2h 30m")
 */
export function formatEventDuration(startTime: Date, endTime?: Date): string | null {
  if (!endTime) return null;

  const durationMs = endTime.getTime() - startTime.getTime();
  if (durationMs <= 0) return null;

  const totalMinutes = Math.round(durationMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Calculate the time span needed to display all events
 * Returns the earliest start hour and latest end hour
 */
export function calculateTimeSpan(events: ItineraryEvent[]): { startHour: number; endHour: number } {
  if (events.length === 0) {
    return { startHour: 6, endHour: 22 }; // Default 6 AM to 10 PM
  }

  let minHour = 24;
  let maxHour = 0;

  for (const event of events) {
    const startHour = event.startTime.getHours();
    const endHour = event.endTime ? event.endTime.getHours() + 1 : startHour + 1;

    minHour = Math.min(minHour, startHour);
    maxHour = Math.max(maxHour, endHour);
  }

  // Add some padding
  minHour = Math.max(0, minHour - 1);
  maxHour = Math.min(24, maxHour + 1);

  // Ensure at least 6 hours are shown
  if (maxHour - minHour < 6) {
    const midpoint = (minHour + maxHour) / 2;
    minHour = Math.max(0, Math.floor(midpoint - 3));
    maxHour = Math.min(24, Math.ceil(midpoint + 3));
  }

  return { startHour: minHour, endHour: maxHour };
}

// ============================================================================
// NextUpCard Utilities
// ============================================================================

/**
 * Event type for normalized events (used by NextUpCard)
 */
export type NextUpEventType = 'activity' | 'transportation' | 'lodging';

/**
 * Icon types for events
 */
export type EventIconType =
  | 'plane'
  | 'train'
  | 'bus'
  | 'car'
  | 'ferry'
  | 'bicycle'
  | 'walk'
  | 'hotel'
  | 'hostel'
  | 'airbnb'
  | 'camping'
  | 'resort'
  | 'home'
  | 'activity'
  | 'other';

/**
 * Represents a normalized event that can be any of the trip entities
 */
export interface NormalizedEvent {
  id: number;
  type: NextUpEventType;
  title: string;
  subtitle: string | null;
  dateTime: Date | null;
  endDateTime: Date | null;
  timezone: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  originalEntity: Activity | Transportation | Lodging;
  icon: EventIconType;
  tabName: string;
}

/**
 * Maps transportation types to icon types
 */
function getTransportationIcon(type: TransportationType): EventIconType {
  const iconMap: Record<TransportationType, EventIconType> = {
    flight: 'plane',
    train: 'train',
    bus: 'bus',
    car: 'car',
    ferry: 'ferry',
    bicycle: 'bicycle',
    walk: 'walk',
    other: 'other',
  };
  return iconMap[type] || 'other';
}

/**
 * Maps lodging types to icon types
 */
function getLodgingIcon(type: LodgingType): EventIconType {
  const iconMap: Record<LodgingType, EventIconType> = {
    hotel: 'hotel',
    hostel: 'hostel',
    airbnb: 'airbnb',
    vacation_rental: 'home',
    camping: 'camping',
    resort: 'resort',
    motel: 'hotel',
    bed_and_breakfast: 'home',
    apartment: 'home',
    friends_family: 'home',
    other: 'other',
  };
  return iconMap[type] || 'other';
}

/**
 * Normalizes an activity into a common event format
 */
function normalizeActivity(activity: Activity): NormalizedEvent {
  const dateTime = activity.startTime ? new Date(activity.startTime) : null;
  const endDateTime = activity.endTime ? new Date(activity.endTime) : null;

  return {
    id: activity.id,
    type: 'activity',
    title: activity.name,
    subtitle: activity.category || activity.description,
    dateTime,
    endDateTime,
    timezone: activity.timezone,
    locationName: null,
    latitude: null,
    longitude: null,
    originalEntity: activity,
    icon: 'activity',
    tabName: 'activities',
  };
}

/**
 * Normalizes a transportation into a common event format
 */
function normalizeTransportation(transport: Transportation): NormalizedEvent {
  const dateTime = transport.departureTime ? new Date(transport.departureTime) : null;
  const endDateTime = transport.arrivalTime ? new Date(transport.arrivalTime) : null;

  let subtitle: string | null = null;
  if (transport.carrier && transport.vehicleNumber) {
    subtitle = `${transport.carrier} ${transport.vehicleNumber}`;
  } else if (transport.carrier) {
    subtitle = transport.carrier;
  } else if (transport.vehicleNumber) {
    subtitle = transport.vehicleNumber;
  }

  const fromName = transport.fromLocation?.name || transport.fromLocationName || 'Unknown';
  const toName = transport.toLocation?.name || transport.toLocationName || 'Unknown';
  const title = `${fromName} to ${toName}`;

  const latitude = transport.fromLocation?.latitude ?? null;
  const longitude = transport.fromLocation?.longitude ?? null;

  return {
    id: transport.id,
    type: 'transportation',
    title,
    subtitle,
    dateTime,
    endDateTime,
    timezone: transport.startTimezone,
    locationName: fromName,
    latitude,
    longitude,
    originalEntity: transport,
    icon: getTransportationIcon(transport.type),
    tabName: 'transportation',
  };
}

/**
 * Normalizes a lodging into a common event format (check-in event)
 */
function normalizeLodging(lodging: Lodging): NormalizedEvent {
  let dateTime: Date | null = null;
  if (lodging.checkInDate) {
    const match = lodging.checkInDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      // Use default check-in time (3:00 PM) - lodging type doesn't have specific time fields
      dateTime = new Date(year, month, day, DEFAULT_CHECKIN_HOUR, 0, 0);
    }
  }

  let endDateTime: Date | null = null;
  if (lodging.checkOutDate) {
    const match = lodging.checkOutDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      // Use default check-out time (11:00 AM) - lodging type doesn't have specific time fields
      endDateTime = new Date(year, month, day, DEFAULT_CHECKOUT_HOUR, 0, 0);
    }
  }

  const typeLabel = lodging.type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    id: lodging.id,
    type: 'lodging',
    title: lodging.name,
    subtitle: typeLabel,
    dateTime,
    endDateTime,
    timezone: lodging.timezone,
    locationName: lodging.address,
    latitude: null,
    longitude: null,
    originalEntity: lodging,
    icon: getLodgingIcon(lodging.type),
    tabName: 'lodging',
  };
}

/**
 * Normalizes all trip events into a common format
 */
export function normalizeAllEvents(
  activities: Activity[] = [],
  transportation: Transportation[] = [],
  lodging: Lodging[] = []
): NormalizedEvent[] {
  const normalizedActivities = (activities || []).map(normalizeActivity);
  const normalizedTransportation = (transportation || []).map(normalizeTransportation);
  const normalizedLodging = (lodging || []).map(normalizeLodging);

  return [...normalizedActivities, ...normalizedTransportation, ...normalizedLodging];
}

/**
 * Sorts events chronologically by their start date/time
 * Events without dates are sorted to the end
 */
export function sortEventsByDateTime(events: NormalizedEvent[]): NormalizedEvent[] {
  return [...events].sort((a, b) => {
    if (!a.dateTime && !b.dateTime) return 0;
    if (!a.dateTime) return 1;
    if (!b.dateTime) return -1;
    return a.dateTime.getTime() - b.dateTime.getTime();
  });
}

/**
 * Gets the next upcoming event based on trip status and current time
 */
export function getNextUpEvent(
  activities: Activity[],
  transportation: Transportation[],
  lodging: Lodging[],
  tripStatus: TripStatusType
): NormalizedEvent | null {
  const allEvents = normalizeAllEvents(activities, transportation, lodging);
  const sortedEvents = sortEventsByDateTime(allEvents);
  const scheduledEvents = sortedEvents.filter((e) => e.dateTime !== null);

  if (scheduledEvents.length === 0) {
    return null;
  }

  const now = new Date();

  switch (tripStatus) {
    case TripStatus.DREAM:
    case TripStatus.PLANNING:
    case TripStatus.PLANNED:
      return scheduledEvents[0];

    case TripStatus.IN_PROGRESS: {
      const upcomingEvent = scheduledEvents.find(
        (e) => e.dateTime && e.dateTime.getTime() > now.getTime()
      );
      if (upcomingEvent) {
        return upcomingEvent;
      }

      const currentEvent = scheduledEvents.find(
        (e) =>
          e.dateTime &&
          e.endDateTime &&
          e.dateTime.getTime() <= now.getTime() &&
          e.endDateTime.getTime() > now.getTime()
      );
      if (currentEvent) {
        return currentEvent;
      }

      const pastEvents = scheduledEvents.filter(
        (e) => e.dateTime && e.dateTime.getTime() <= now.getTime()
      );
      if (pastEvents.length > 0) {
        return pastEvents[pastEvents.length - 1];
      }

      return scheduledEvents[0];
    }

    case TripStatus.COMPLETED:
      return scheduledEvents[scheduledEvents.length - 1];

    case TripStatus.CANCELLED:
      return scheduledEvents[0];

    default:
      return scheduledEvents[0];
  }
}

/**
 * Gets a relative time indicator for an event
 */
export function getRelativeTimeIndicator(
  eventDateTime: Date | null
): string {
  if (!eventDateTime) {
    return 'Time not set';
  }

  const now = new Date();
  const diffMs = eventDateTime.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    const absDiffMinutes = Math.abs(diffMinutes);
    const absDiffHours = Math.abs(diffHours);
    const absDiffDays = Math.abs(diffDays);

    if (absDiffMinutes < 60) {
      return absDiffMinutes === 1 ? '1 minute ago' : `${absDiffMinutes} minutes ago`;
    }
    if (absDiffHours < 24) {
      return absDiffHours === 1 ? '1 hour ago' : `${absDiffHours} hours ago`;
    }
    if (absDiffDays === 1) {
      return 'Yesterday';
    }
    if (absDiffDays < 7) {
      return `${absDiffDays} days ago`;
    }
    return eventDateTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  if (diffMinutes < 60) {
    if (diffMinutes <= 1) return 'Now';
    return `In ${diffMinutes} minutes`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? 'In 1 hour' : `In ${diffHours} hours`;
  }
  if (diffDays === 1) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (eventDateTime.toDateString() === tomorrow.toDateString()) {
      const timeStr = eventDateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `Tomorrow at ${timeStr}`;
    }
  }
  if (diffDays < 7) {
    return `In ${diffDays} days`;
  }
  if (diffDays < 14) {
    return 'In 1 week';
  }
  if (diffDays < 30) {
    const weeks = Math.round(diffDays / 7);
    return `In ${weeks} weeks`;
  }
  if (diffDays < 60) {
    return 'In 1 month';
  }
  const months = Math.round(diffDays / 30);
  return `In ${months} months`;
}

/**
 * Formats the date and time of an event for display
 */
export function formatNextUpEventDateTime(
  eventDateTime: Date | null,
  timezone?: string | null,
  options?: { includeDate?: boolean; includeTime?: boolean }
): string {
  if (!eventDateTime) {
    return 'Time not set';
  }

  const { includeDate = true, includeTime = true } = options || {};

  const formatOptions: Intl.DateTimeFormatOptions = {};

  if (includeDate) {
    formatOptions.weekday = 'short';
    formatOptions.month = 'short';
    formatOptions.day = 'numeric';
  }

  if (includeTime) {
    formatOptions.hour = 'numeric';
    formatOptions.minute = '2-digit';
  }

  if (timezone) {
    formatOptions.timeZone = timezone;
  }

  try {
    return eventDateTime.toLocaleString('en-US', formatOptions);
  } catch {
    const fallbackOptions = { ...formatOptions };
    delete fallbackOptions.timeZone;
    return eventDateTime.toLocaleString('en-US', fallbackOptions);
  }
}

/**
 * Determines if the trip is completed based on end date or status
 */
export function isTripCompleted(
  tripStatus: TripStatusType,
  tripEndDate: string | null
): boolean {
  if (tripStatus === TripStatus.COMPLETED) {
    return true;
  }

  if (tripEndDate) {
    const endDate = new Date(tripEndDate);
    const now = new Date();
    endDate.setHours(23, 59, 59, 999);
    return now > endDate;
  }

  return false;
}

/**
 * Determines if the trip has started based on start date or status
 */
export function hasTripStarted(
  tripStatus: TripStatusType,
  tripStartDate: string | null
): boolean {
  if (tripStatus === TripStatus.IN_PROGRESS || tripStatus === TripStatus.COMPLETED) {
    return true;
  }

  if (tripStartDate) {
    const startDate = new Date(tripStartDate);
    const now = new Date();
    startDate.setHours(0, 0, 0, 0);
    return now >= startDate;
  }

  return false;
}

/**
 * Display state for the NextUpCard
 */
export type NextUpDisplayState =
  | 'no_events'
  | 'upcoming'
  | 'in_progress'
  | 'completed'
  | 'dream';

/**
 * Gets the appropriate display state for the NextUpCard
 */
export function getNextUpDisplayState(
  tripStatus: TripStatusType,
  hasScheduledEvents: boolean,
  tripStartDate: string | null,
  tripEndDate: string | null
): NextUpDisplayState {
  if (!hasScheduledEvents) {
    return 'no_events';
  }

  if (tripStatus === TripStatus.DREAM) {
    return 'dream';
  }

  if (isTripCompleted(tripStatus, tripEndDate)) {
    return 'completed';
  }

  if (hasTripStarted(tripStatus, tripStartDate)) {
    return 'in_progress';
  }

  return 'upcoming';
}

// ============================================================================
// Recent Activity Types and Functions
// ============================================================================

/**
 * Entity types for recent activity
 */
export type ActivityEntityType =
  | 'activity'
  | 'transportation'
  | 'lodging'
  | 'location'
  | 'journal'
  | 'photo';

/**
 * Action types for recent activity
 */
export type ActivityActionType =
  | 'added'
  | 'updated'
  | 'uploaded'
  | 'linked'
  | 'journal';

/**
 * Normalized activity item for display
 */
export interface RecentActivityItem {
  id: string;
  entityType: ActivityEntityType;
  entityId: number;
  actionType: ActivityActionType;
  name: string;
  description?: string;
  timestamp: string;
  count?: number; // For grouped items like "Uploaded 12 photos"
}

/**
 * Get relative timestamp for activity display
 * Handles hours/minutes for recent items, days/weeks for older items
 *
 * @param timestamp - ISO date string
 * @returns Human-readable relative time (e.g., "2 hours ago", "Yesterday")
 */
export function getRelativeTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    // Just now (less than 1 minute)
    if (diffSeconds < 60) {
      return 'Just now';
    }

    // Minutes ago (less than 1 hour)
    if (diffMinutes < 60) {
      return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
    }

    // Hours ago (less than 24 hours)
    if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }

    // Yesterday
    if (diffDays === 1) {
      return 'Yesterday';
    }

    // Days ago (less than 7 days)
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }

    // Weeks ago (less than 30 days)
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    }

    // Months ago
    const months = Math.floor(diffDays / 30);
    if (months < 12) {
      return months === 1 ? '1 month ago' : `${months} months ago`;
    }

    // Years ago
    const years = Math.floor(months / 12);
    return years === 1 ? '1 year ago' : `${years} years ago`;
  } catch {
    return '';
  }
}

/**
 * Determine if an entity was recently created vs updated
 * Uses a threshold of 5 seconds between createdAt and updatedAt
 *
 * @param createdAt - Creation timestamp
 * @param updatedAt - Update timestamp
 * @returns 'added' if newly created, 'updated' if modified
 */
function getActivityActionType(createdAt: string, updatedAt: string): 'added' | 'updated' {
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();

  // If created and updated are within 5 seconds, consider it "added"
  return Math.abs(updated - created) < 5000 ? 'added' : 'updated';
}

/**
 * Get display name for transportation in recent activity
 */
function getTransportationActivityName(transport: Transportation): string {
  const typeNames: Record<string, string> = {
    flight: 'Flight',
    train: 'Train',
    bus: 'Bus',
    car: 'Car',
    ferry: 'Ferry',
    bicycle: 'Bicycle',
    walk: 'Walk',
    other: 'Transport',
  };

  const typeName = typeNames[transport.type] || 'Transport';

  if (transport.fromLocationName && transport.toLocationName) {
    return `${typeName}: ${transport.fromLocationName} to ${transport.toLocationName}`;
  }

  if (transport.carrier && transport.vehicleNumber) {
    return `${typeName}: ${transport.carrier} ${transport.vehicleNumber}`;
  }

  if (transport.carrier) {
    return `${typeName}: ${transport.carrier}`;
  }

  return typeName;
}

/**
 * Group photos by upload timestamp
 * Photos within 5 minutes of each other are grouped together
 *
 * @param photos - Array of photos
 * @returns Array of photo groups (each group is an array of photos)
 */
function groupPhotosByTimestamp(photos: Photo[]): Photo[][] {
  if (photos.length === 0) return [];

  // Sort photos by updatedAt descending (most recent first)
  const sortedPhotos = [...photos].sort((a, b) => {
    const dateA = new Date(a.updatedAt).getTime();
    const dateB = new Date(b.updatedAt).getTime();
    return dateB - dateA;
  });

  const groups: Photo[][] = [];
  let currentGroup: Photo[] = [];
  let lastTimestamp: number | null = null;

  const FIVE_MINUTES = 5 * 60 * 1000; // 5 minutes in milliseconds

  sortedPhotos.forEach((photo) => {
    const photoTime = new Date(photo.updatedAt).getTime();

    if (lastTimestamp === null || lastTimestamp - photoTime <= FIVE_MINUTES) {
      // Add to current group
      currentGroup.push(photo);
    } else {
      // Start new group
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [photo];
    }

    lastTimestamp = photoTime;
  });

  // Don't forget the last group
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Get recent activity from all trip entities
 *
 * This function aggregates activity from all entity types, normalizes them,
 * and returns a sorted list of recent changes. Photo uploads are grouped
 * together to avoid flooding the activity feed.
 *
 * @param activities - Trip activities
 * @param transportation - Trip transportation items
 * @param lodging - Trip lodging items
 * @param locations - Trip locations
 * @param journal - Trip journal entries
 * @param photos - Trip photos
 * @param limit - Maximum number of items to return (default: 8)
 * @returns Sorted array of recent activity items
 */
export function getRecentActivity(
  activities: Activity[],
  transportation: Transportation[],
  lodging: Lodging[],
  locations: Location[],
  journal: JournalEntry[],
  photos: Photo[],
  limit: number = 8
): RecentActivityItem[] {
  const activityItems: RecentActivityItem[] = [];

  // Process activities
  activities.forEach((activity) => {
    activityItems.push({
      id: `activity-${activity.id}`,
      entityType: 'activity',
      entityId: activity.id,
      actionType: getActivityActionType(activity.createdAt, activity.updatedAt),
      name: activity.name,
      description: activity.category || undefined,
      timestamp: activity.updatedAt,
    });
  });

  // Process transportation
  transportation.forEach((transport) => {
    activityItems.push({
      id: `transportation-${transport.id}`,
      entityType: 'transportation',
      entityId: transport.id,
      actionType: getActivityActionType(transport.createdAt, transport.updatedAt),
      name: getTransportationActivityName(transport),
      timestamp: transport.updatedAt,
    });
  });

  // Process lodging
  lodging.forEach((lodge) => {
    activityItems.push({
      id: `lodging-${lodge.id}`,
      entityType: 'lodging',
      entityId: lodge.id,
      actionType: getActivityActionType(lodge.createdAt, lodge.updatedAt),
      name: lodge.name || 'Lodging',
      description: lodge.type || undefined,
      timestamp: lodge.updatedAt,
    });
  });

  // Process locations
  locations.forEach((location) => {
    activityItems.push({
      id: `location-${location.id}`,
      entityType: 'location',
      entityId: location.id,
      actionType: getActivityActionType(location.createdAt, location.updatedAt),
      name: location.name,
      description: location.category?.name || undefined,
      timestamp: location.updatedAt,
    });
  });

  // Process journal entries
  journal.forEach((entry) => {
    activityItems.push({
      id: `journal-${entry.id}`,
      entityType: 'journal',
      entityId: entry.id,
      actionType: 'journal',
      name: entry.title || 'Journal Entry',
      description: entry.entryType || undefined,
      timestamp: entry.updatedAt,
    });
  });

  // Group photos by upload timestamp (within 5 minutes)
  // to avoid flooding the feed with individual photo entries
  const photoGroups = groupPhotosByTimestamp(photos);

  photoGroups.forEach((group, index) => {
    const count = group.length;
    const latestPhoto = group[0];

    activityItems.push({
      id: `photos-${index}-${latestPhoto.id}`,
      entityType: 'photo',
      entityId: latestPhoto.id,
      actionType: 'uploaded',
      name: count === 1 ? 'Uploaded 1 photo' : `Uploaded ${count} photos`,
      timestamp: latestPhoto.updatedAt,
      count,
    });
  });

  // Sort by timestamp (most recent first)
  activityItems.sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    return dateB - dateA;
  });

  // Return limited results
  return activityItems.slice(0, limit);
}

/**
 * Group activity items by day for display
 *
 * @param items - Array of activity items
 * @returns Map of date string to activity items
 */
export function groupActivityByDay(
  items: RecentActivityItem[]
): Map<string, RecentActivityItem[]> {
  const groups = new Map<string, RecentActivityItem[]>();

  items.forEach((item) => {
    const date = new Date(item.timestamp);
    const dateKey = date.toISOString().split('T')[0];

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    const group = groups.get(dateKey);
    if (group) {
      group.push(item);
    }
  });

  return groups;
}

/**
 * Get display label for a day group
 *
 * @param dateKey - ISO date string (YYYY-MM-DD)
 * @returns Human-readable date label
 */
export function getDayGroupLabel(dateKey: string): string {
  const date = new Date(dateKey + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined,
  });
}
