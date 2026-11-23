/**
 * Event icon component for trip dashboard.
 * Only exports React components for React Fast Refresh compatibility.
 */

import Icon from '../ui/Icon';
import type { EventIconType } from '../../utils/tripDashboardUtils';

/**
 * Get the appropriate icon component for an event type
 */
export function EventIcon({ iconType, className }: { iconType: EventIconType; className?: string }) {
  const baseClass = className || 'w-6 h-6';

  switch (iconType) {
    case 'plane':
      return (
        <Icon name="flight" className={baseClass} />
      );

    case 'train':
      return (
        <Icon name="train" className={baseClass} />
      );

    case 'bus':
      return (
        <Icon name="bus" className={baseClass} />
      );

    case 'car':
      return (
        <Icon name="car" className={baseClass} />
      );

    case 'ferry':
      return (
        <Icon name="ferry" className={baseClass} />
      );

    case 'bicycle':
      return (
        <Icon name="bike" className={baseClass} />
      );

    case 'walk':
      return (
        <Icon name="walk" className={baseClass} />
      );

    case 'hotel':
      return (
        <Icon name="hotel" className={baseClass} />
      );

    case 'airbnb':
      return (
        <Icon name="house" className={baseClass} />
      );

    case 'camping':
      return (
        <Icon name="camping" className={baseClass} />
      );

    case 'activity':
      return (
        <Icon name="activity" className={baseClass} />
      );

    default:
      return (
        <Icon name="calendar" className={baseClass} />
      );
  }
}
