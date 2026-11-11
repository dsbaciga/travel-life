import { TripStatus, type TripStatusType } from '../types/trip';

/**
 * Color mappings for trip statuses
 * Each status has a background and text color class
 */
export const tripStatusColors: Record<TripStatusType, string> = {
  [TripStatus.DREAM]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  [TripStatus.PLANNING]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  [TripStatus.PLANNED]: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300',
  [TripStatus.IN_PROGRESS]: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  [TripStatus.COMPLETED]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  [TripStatus.CANCELLED]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

/**
 * Ribbon color mappings for trip cards
 * More vibrant colors for visual impact on card ribbons.
 *
 * The `-700` step rather than `-500`: these ribbons are 10-12px uppercase text
 * on a solid fill, so they need 4.5:1 against white. At `-500` every one of them
 * failed (amber 2.15:1, green 2.28:1, blue 3.68:1, red 3.76:1, purple 3.96:1);
 * `-700` clears 4.5:1 across the set while staying fully saturated.
 */
export const tripStatusRibbonColors: Record<TripStatusType, string> = {
  [TripStatus.DREAM]: 'bg-purple-700 text-white',
  [TripStatus.PLANNING]: 'bg-blue-700 text-white',
  [TripStatus.PLANNED]: 'bg-sky-700 text-white',
  [TripStatus.IN_PROGRESS]: 'bg-amber-700 text-white',
  [TripStatus.COMPLETED]: 'bg-green-700 text-white',
  [TripStatus.CANCELLED]: 'bg-red-700 text-white',
};

/**
 * Get the ribbon color classes for a trip status
 * @param status - The trip status
 * @returns Tailwind CSS classes for ribbon background and text color
 */
export function getTripStatusRibbonColor(status: string): string {
  return tripStatusRibbonColors[status as TripStatusType] ?? 'bg-gray-500 text-white';
}

/**
 * Get the color classes for a trip status
 * @param status - The trip status
 * @returns Tailwind CSS classes for background and text color
 */
export function getTripStatusColor(status: string): string {
  return tripStatusColors[status as TripStatusType] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
}

/**
 * Status badge component styling - combines status color with badge styling
 */
export function getTripStatusBadgeClasses(status: string): string {
  return `px-2 py-1 text-xs font-medium rounded-lg ${getTripStatusColor(status)}`;
}

/**
 * Generic status colors for other entities (companions, checklists, etc.)
 */
export const genericStatusColors = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
} as const;

export type GenericStatus = keyof typeof genericStatusColors;

export function getGenericStatusColor(status: GenericStatus): string {
  return genericStatusColors[status];
}

/**
 * Flight status colors for flight tracking
 */
export const flightStatusColors = {
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  landed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  diverted: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
} as const;

export type FlightStatus = keyof typeof flightStatusColors;

export function getFlightStatusColor(status: string | null): string {
  if (!status) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  return flightStatusColors[status as FlightStatus] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

/**
 * Delay text colors - positive delays (late) are red, negative (early) are green
 */
export const delayColors = {
  late: 'text-red-600 dark:text-red-400',
  early: 'text-green-600 dark:text-green-400',
  onTime: 'text-gray-600 dark:text-gray-400',
} as const;

export function getDelayColor(delay: number | null): string {
  if (delay === null || delay === 0) return delayColors.onTime;
  return delay > 0 ? delayColors.late : delayColors.early;
}

