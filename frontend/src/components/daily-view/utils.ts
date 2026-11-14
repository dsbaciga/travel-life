import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import type { JournalEntry } from '../../types/journalEntry';
import type { Location } from '../../types/location';
import type { CustomItem } from '../../types/customItem';
import type { MapsPlace } from '../../lib/mapsDeepLinks';

/**
 * Format time for display
 */
export function formatTime(dateTime: Date | string, timezone?: string): string {
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  });
}

/**
 * Format date for display
 */
export function formatDate(dateTime: Date | string, timezone?: string): string {
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });
}

/**
 * Format duration in minutes to human readable
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Format currency amount.
 * Re-exported from the shared guarded helper so an invalid currency code cannot
 * throw a RangeError mid-render.
 */
export { formatCurrency } from '../../utils/formatCurrency';

/**
 * Get timezone abbreviation
 */
export function getTimezoneAbbr(timezone?: string): string {
  if (!timezone) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * Get type-specific colors
 */
export function getTypeColors(type: 'activity' | 'transportation' | 'lodging' | 'journal' | 'location' | 'photo' | 'album' | 'customItem') {
  switch (type) {
    case 'activity':
      return {
        bg: 'bg-green-50 dark:bg-green-900/20',
        border: 'border-green-200 dark:border-green-800',
        accent: 'border-l-green-500',
        icon: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
        text: 'text-green-700 dark:text-green-300',
      };
    case 'transportation':
      return {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800',
        accent: 'border-l-blue-500',
        icon: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        text: 'text-blue-700 dark:text-blue-300',
      };
    case 'lodging':
      return {
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        border: 'border-purple-200 dark:border-purple-800',
        accent: 'border-l-purple-500',
        icon: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        text: 'text-purple-700 dark:text-purple-300',
      };
    case 'journal':
      return {
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        border: 'border-amber-200 dark:border-amber-800',
        accent: 'border-l-amber-500',
        icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
        text: 'text-amber-700 dark:text-amber-300',
      };
    case 'location':
      return {
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-200 dark:border-red-800',
        accent: 'border-l-red-500',
        icon: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
        text: 'text-red-700 dark:text-red-300',
      };
    case 'customItem':
      return {
        bg: 'bg-indigo-50 dark:bg-indigo-900/20',
        border: 'border-indigo-200 dark:border-indigo-800',
        accent: 'border-l-indigo-500',
        icon: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
        text: 'text-indigo-700 dark:text-indigo-300',
      };
    case 'photo':
    case 'album':
      return {
        bg: 'bg-pink-50 dark:bg-pink-900/20',
        border: 'border-pink-200 dark:border-pink-800',
        accent: 'border-l-pink-500',
        icon: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
        text: 'text-pink-700 dark:text-pink-300',
      };
    default:
      return {
        bg: 'bg-gray-50 dark:bg-dusk-900/20',
        border: 'border-gray-200 dark:border-dusk-700',
        accent: 'border-l-gray-500',
        icon: 'bg-gray-100 dark:bg-dusk-900/30 text-gray-600 dark:text-dusk-400',
        text: 'text-gray-700 dark:text-dusk-300',
      };
  }
}

/**
 * Get transportation type icon
 */
export function getTransportationIcon(type: string): string {
  switch (type) {
    case 'flight':
      return '✈️';
    case 'train':
      return '🚂';
    case 'bus':
      return '🚌';
    case 'car':
      return '🚗';
    case 'ferry':
      return '⛴️';
    case 'bicycle':
      return '🚲';
    case 'walk':
      return '🚶';
    default:
      return '🚐';
  }
}

/**
 * Get lodging type icon
 */
export function getLodgingIcon(type: string): string {
  switch (type) {
    case 'hotel':
      return '🏨';
    case 'hostel':
      return '🛏️';
    case 'airbnb':
      return '🏠';
    case 'vacation_rental':
      return '🏡';
    case 'camping':
      return '⛺';
    case 'resort':
      return '🏝️';
    case 'motel':
      return '🚗';
    case 'bed_and_breakfast':
      return '🍳';
    case 'apartment':
      return '🏢';
    case 'friends_family':
      return '👨‍👩‍👧‍👦';
    default:
      return '🏠';
  }
}

/**
 * Get activity category icon
 */
export function getActivityIcon(category?: string | null): string {
  if (!category) return '📋';
  const categoryLower = category.toLowerCase();

  if (categoryLower.includes('food') || categoryLower.includes('restaurant') || categoryLower.includes('dining')) {
    return '🍽️';
  }
  if (categoryLower.includes('tour') || categoryLower.includes('sightseeing')) {
    return '🗺️';
  }
  if (categoryLower.includes('museum') || categoryLower.includes('gallery') || categoryLower.includes('art')) {
    return '🎨';
  }
  if (categoryLower.includes('shopping')) {
    return '🛍️';
  }
  if (categoryLower.includes('beach') || categoryLower.includes('swim')) {
    return '🏖️';
  }
  if (categoryLower.includes('hike') || categoryLower.includes('nature') || categoryLower.includes('outdoor')) {
    return '🥾';
  }
  if (categoryLower.includes('entertainment') || categoryLower.includes('show') || categoryLower.includes('concert')) {
    return '🎭';
  }
  if (categoryLower.includes('sport') || categoryLower.includes('adventure')) {
    return '🎯';
  }
  if (categoryLower.includes('relax') || categoryLower.includes('spa')) {
    return '💆';
  }

  return '📋';
}

/**
 * Journal mood to emoji
 */
export function getMoodEmoji(mood?: string | null): string {
  if (!mood) return '';
  switch (mood.toLowerCase()) {
    case 'happy':
    case 'excited':
    case 'joyful':
      return '😊';
    case 'peaceful':
    case 'calm':
    case 'relaxed':
      return '😌';
    case 'adventurous':
    case 'thrilled':
      return '🤩';
    case 'tired':
    case 'exhausted':
      return '😴';
    case 'frustrated':
    case 'annoyed':
      return '😤';
    case 'sad':
    case 'melancholy':
      return '😢';
    case 'grateful':
    case 'thankful':
      return '🙏';
    case 'nostalgic':
      return '🥹';
    default:
      return '📝';
  }
}

/**
 * Every entity that can appear as a day item's `data`.
 */
export type DayItemData =
  | Activity
  | Transportation
  | Lodging
  | JournalEntry
  | Location
  | CustomItem;

/**
 * Type guards
 *
 * These are structural, so ordering matters where shapes overlap. CustomItem
 * carries both `name` and `allDay`, which is exactly what isActivity tests —
 * so isCustomItem must be checked FIRST, and isActivity explicitly excludes it.
 * `typeId` is the distinguishing field: Activity has no such property.
 */
export function isCustomItem(item: DayItemData): item is CustomItem {
  return 'typeId' in item && 'confirmationNumber' in item && 'allDay' in item;
}

export function isActivity(item: DayItemData): item is Activity {
  return !isCustomItem(item) && 'name' in item && 'allDay' in item;
}

export function isTransportation(item: DayItemData): item is Transportation {
  return 'type' in item && 'fromLocationId' in item;
}

export function isLodging(item: DayItemData): item is Lodging {
  return 'type' in item && 'checkInDate' in item;
}

export function isJournalEntry(item: DayItemData): item is JournalEntry {
  return 'content' in item && 'entryType' in item;
}

export function isLocation(item: DayItemData): item is Location {
  return 'isFavorite' in item && 'name' in item;
}

/**
 * A custom item's place comes from its `locationId` FK — the direct
 * "this item is AT this place" relation, unlike Activity which resolves a place
 * through EntityLink.
 */
export function placeFromCustomItem(item: CustomItem): MapsPlace | null {
  if (!item.location) return null;
  return {
    name: item.location.name,
    latitude: item.location.latitude,
    longitude: item.location.longitude,
  };
}
