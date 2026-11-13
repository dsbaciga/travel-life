import type { TimelineItem, TimelineItemType, ConnectionInfo } from './types';
import type { MapsPlace } from '../../lib/mapsDeepLinks';
import { placeFromTransportation } from '../../lib/itineraryPlaces';

/**
 * Get date string in a specific timezone
 */
export function getDateStringInTimezone(date: Date, timezone?: string): string {
  if (!timezone) {
    return date.toDateString();
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return formatter.format(date);
  } catch (error) {
    console.warn(`Invalid timezone: ${timezone}`, error);
    return date.toDateString();
  }
}

/**
 * Format time in a specific timezone
 */
export function formatTime(date: Date, timezone?: string): string {
  if (timezone) {
    return date.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get timezone abbreviation
 * Returns standard abbreviation (with DST variant where applicable)
 */
export function getTimezoneAbbr(timezone: string): string {
  const abbrs: Record<string, string> = {
    // UTC
    UTC: 'UTC',

    // North America
    'Pacific/Honolulu': 'HST',
    'America/Anchorage': 'AKST/AKDT',
    'America/Los_Angeles': 'PST/PDT',
    'America/Denver': 'MST/MDT',
    'America/Phoenix': 'MST',
    'America/Chicago': 'CST/CDT',
    'America/New_York': 'EST/EDT',
    'America/Halifax': 'AST/ADT',
    'America/Sao_Paulo': 'BRT',

    // Europe
    'Europe/London': 'GMT/BST',
    'Europe/Lisbon': 'WET/WEST',
    'Europe/Paris': 'CET/CEST',
    'Europe/Berlin': 'CET/CEST',
    'Europe/Rome': 'CET/CEST',
    'Europe/Amsterdam': 'CET/CEST',
    'Europe/Madrid': 'CET/CEST',
    'Europe/Athens': 'EET/EEST',
    'Europe/Helsinki': 'EET/EEST',
    'Europe/Moscow': 'MSK',
    'Europe/Istanbul': 'TRT',

    // Africa
    'Africa/Cairo': 'EET',
    'Africa/Johannesburg': 'SAST',

    // Middle East
    'Asia/Riyadh': 'AST',
    'Asia/Dubai': 'GST',

    // South Asia
    'Asia/Karachi': 'PKT',
    'Asia/Kolkata': 'IST',

    // Southeast Asia
    'Asia/Dhaka': 'BST',
    'Asia/Bangkok': 'ICT',
    'Asia/Jakarta': 'WIB',
    'Asia/Ho_Chi_Minh': 'ICT',

    // East Asia
    'Asia/Singapore': 'SGT',
    'Asia/Hong_Kong': 'HKT',
    'Asia/Shanghai': 'CST',
    'Asia/Taipei': 'CST',
    'Asia/Tokyo': 'JST',
    'Asia/Seoul': 'KST',

    // Australia
    'Australia/Perth': 'AWST',
    'Australia/Brisbane': 'AEST',
    'Australia/Sydney': 'AEST/AEDT',
    'Australia/Melbourne': 'AEST/AEDT',

    // Pacific
    'Pacific/Auckland': 'NZST/NZDT',
    'Pacific/Fiji': 'FJT',
  };
  return abbrs[timezone] || timezone.split('/').pop() || timezone;
}

/**
 * Format duration in minutes to human readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 0) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format distance in kilometers
 */
export function formatDistance(kilometers: number | null | undefined): string {
  if (kilometers == null || typeof kilometers !== 'number' || isNaN(kilometers)) {
    return 'Unknown distance';
  }
  const miles = kilometers * 0.621371;
  return `${kilometers.toFixed(1)} km (${miles.toFixed(1)} mi)`;
}

/**
 * Get day number from trip start date
 */
export function getDayNumber(dateString: string, tripStartDate?: string): number | null {
  if (!tripStartDate) return null;

  const match = tripStartDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let startDate: Date;
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    startDate = new Date(year, month, day, 0, 0, 0, 0);
  } else {
    startDate = new Date(tripStartDate);
    startDate.setHours(0, 0, 0, 0);
  }

  const itemDate = new Date(dateString);
  itemDate.setHours(0, 0, 0, 0);

  const diffTime = itemDate.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays + 1;
}

/**
 * Format date for display
 */
export function formatDateDisplay(dateString: string, tripStartDate?: string): string {
  const date = new Date(dateString);
  const dayNumber = getDayNumber(dateString, tripStartDate);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return dayNumber && dayNumber > 0 ? `Day ${dayNumber} - ${formattedDate}` : formattedDate;
}

/**
 * Get background color class for timeline item type
 */
export function getTypeColor(type: TimelineItemType): string {
  switch (type) {
    case 'activity':
      return 'bg-green-500';
    case 'transportation':
      return 'bg-blue-500';
    case 'lodging':
      return 'bg-purple-500';
    case 'journal':
      return 'bg-amber-500';
    case 'customItem':
      return 'bg-indigo-500';
    default:
      return 'bg-gray-500';
  }
}

/**
 * Get border color class for timeline item type
 */
export function getTypeBorderColor(type: TimelineItemType): string {
  switch (type) {
    case 'activity':
      return 'border-l-green-500';
    case 'transportation':
      return 'border-l-blue-500';
    case 'lodging':
      return 'border-l-purple-500';
    case 'journal':
      return 'border-l-amber-500';
    case 'customItem':
      return 'border-l-indigo-500';
    default:
      return 'border-l-gray-500';
  }
}

/**
 * Get text color class for timeline item type
 */
export function getTypeTextColor(type: TimelineItemType): string {
  switch (type) {
    case 'activity':
      return 'text-green-600 dark:text-green-400';
    case 'transportation':
      return 'text-blue-600 dark:text-blue-400';
    case 'lodging':
      return 'text-purple-600 dark:text-purple-400';
    case 'journal':
      return 'text-amber-600 dark:text-amber-400';
    case 'customItem':
      return 'text-indigo-600 dark:text-indigo-400';
    default:
      return 'text-gray-600 dark:text-dusk-400';
  }
}

/**
 * Get connection info for a timeline item within a group
 */
export function getConnectionInfo(
  item: TimelineItem,
  items: TimelineItem[]
): ConnectionInfo | null {
  if (!item.connectionGroupId) return null;

  // Defensive check: ensure items is an array
  if (!Array.isArray(items)) {
    console.warn('getConnectionInfo: items is not an array', { item, items });
    return null;
  }

  const group = items.filter((i) => i.connectionGroupId === item.connectionGroupId);
  if (group.length < 2) return null;

  const sortedGroup = [...group].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  const index = sortedGroup.findIndex((i) => i.id === item.id);

  return {
    legNumber: index + 1,
    totalLegs: sortedGroup.length,
    isFirst: index === 0,
    isLast: index === sortedGroup.length - 1,
    groupId: item.connectionGroupId,
  };
}

/* ------------------------------------------------------------------ */
/* Directions: turning timeline items into navigable places            */
/* ------------------------------------------------------------------ */

/** Structural guard — only Transportation carries from/to endpoints. */
function hasTransportEndpoints(
  data: TimelineItem['data']
): data is Extract<TimelineItem['data'], { fromLocationName: string | null }> {
  return 'fromLocationName' in data && 'toLocationName' in data;
}

/** Structural guard — Lodging is the only entity with a postal `address`. */
function hasAddress(
  data: TimelineItem['data']
): data is Extract<TimelineItem['data'], { address: string | null }> {
  return 'address' in data;
}

function transportEndpointPlace(
  item: TimelineItem,
  end: 'from' | 'to'
): MapsPlace | null {
  const data = item.data;
  return hasTransportEndpoints(data) ? placeFromTransportation(data, end) : null;
}

/**
 * The place a traveller needs directions TO for this item.
 *
 * For transportation that is the *departure* point — you need to get to the
 * airport, not to your arrival city.
 */
export function getTimelineItemPlace(item: TimelineItem): MapsPlace | null {
  if (item.type === 'transportation') {
    return transportEndpointPlace(item, 'from');
  }

  const data = item.data;
  const address = (hasAddress(data) ? data.address : null) ?? item.location ?? null;
  const coords = item.locationCoords ?? null;

  if (item.type === 'lodging') {
    // Hotel names geocode well, so a name-only lodging still gets a link.
    return { name: item.title, address, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null };
  }

  // Activities and journal entries are titled things ("Dinner", "Day 3"), not
  // places — without an address or coordinates there is nothing to navigate to.
  if (address === null && coords === null) return null;

  return {
    name: item.title,
    address,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  };
}

/**
 * Where the traveller ends up after this item — used to infer the origin of
 * the *next* item. Identical to `getTimelineItemPlace` except for
 * transportation, which drops you at its arrival point.
 */
export function getTimelineItemEndPlace(item: TimelineItem): MapsPlace | null {
  if (item.type === 'transportation') {
    return transportEndpointPlace(item, 'to') ?? transportEndpointPlace(item, 'from');
  }
  return getTimelineItemPlace(item);
}

/**
 * Map timeline item type to entity type for linking
 */
export function mapTimelineTypeToEntityType(
  type: TimelineItemType
): 'ACTIVITY' | 'TRANSPORTATION' | 'LODGING' | 'JOURNAL_ENTRY' | 'CUSTOM_ITEM' {
  // No `default` on purpose: with a return type that excludes undefined, an
  // unhandled TimelineItemType is a compile error here rather than a silent
  // undefined at the call site.
  switch (type) {
    case 'activity':
      return 'ACTIVITY';
    case 'transportation':
      return 'TRANSPORTATION';
    case 'lodging':
      return 'LODGING';
    case 'journal':
      return 'JOURNAL_ENTRY';
    case 'customItem':
      return 'CUSTOM_ITEM';
  }
}
