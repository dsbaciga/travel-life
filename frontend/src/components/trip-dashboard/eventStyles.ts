/**
 * Event styling utilities shared between trip dashboard components.
 */

import type { NormalizedEvent } from '../../utils/tripDashboardUtils';

/**
 * Get color classes based on event type
 */
export function getEventTypeColors(type: NormalizedEvent['type']): {
  bg: string;
  text: string;
  border: string;
} {
  switch (type) {
    case 'activity':
      return {
        bg: 'bg-green-50 dark:bg-green-900/20',
        text: 'text-green-600 dark:text-green-400',
        border: 'border-green-200 dark:border-green-800',
      };
    case 'transportation':
      return {
        bg: 'bg-orange-50 dark:bg-orange-900/20',
        text: 'text-orange-600 dark:text-orange-400',
        border: 'border-orange-200 dark:border-orange-800',
      };
    case 'lodging':
      return {
        bg: 'bg-rose-50 dark:bg-rose-900/20',
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-200 dark:border-rose-800',
      };
    default:
      return {
        bg: 'bg-gray-50 dark:bg-dusk-800',
        text: 'text-gray-600 dark:text-dusk-400',
        border: 'border-gray-200 dark:border-dusk-700',
      };
  }
}
