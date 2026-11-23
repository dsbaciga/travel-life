/**
 * ActivityItem - Individual activity row for the Recent Activity Card
 *
 * Displays a single recent activity with:
 * - Icon based on action type
 * - Entity name/description
 * - Relative timestamp
 * - Click handler for navigation
 * - Subtle hover effect
 */

import Icon from '../ui/Icon';
import {
  type ActivityEntityType,
  type ActivityActionType,
  getRelativeTimestamp,
} from '../../utils/tripDashboardUtils';

interface ActivityItemProps {
  entityType: ActivityEntityType;
  entityId: number;
  actionType: ActivityActionType;
  name: string;
  timestamp: string;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
}

/**
 * Get action label for display
 */
function getActionLabel(actionType: ActivityActionType, entityType: ActivityEntityType): string {
  switch (actionType) {
    case 'added':
      return 'Added';
    case 'updated':
      return 'Updated';
    case 'uploaded':
      return ''; // Photo uploads already include the action in the name
    case 'linked':
      return 'Linked';
    case 'journal':
      return entityType === 'journal' ? 'New' : '';
    default:
      return '';
  }
}

/**
 * Get entity type label for display
 */
function getEntityTypeLabel(entityType: ActivityEntityType): string {
  switch (entityType) {
    case 'activity':
      return 'activity';
    case 'transportation':
      return 'transport';
    case 'lodging':
      return 'lodging';
    case 'location':
      return 'location';
    case 'journal':
      return 'journal entry';
    case 'photo':
      return ''; // Photo uploads already include the type in the name
    default:
      return '';
  }
}

/**
 * Get icon for action type
 */
function ActionIcon({ actionType }: { actionType: ActivityActionType }) {
  const baseClasses = 'w-4 h-4 flex-shrink-0';

  switch (actionType) {
    case 'added':
      return (
        <Icon name="add" className={`${baseClasses} text-green-500 dark:text-green-400`} />
      );

    case 'updated':
      return (
        <Icon name="edit"className={`${baseClasses} text-blue-500 dark:text-blue-400`} />
      );

    case 'uploaded':
      return (
        <Icon name="photo" className={`${baseClasses} text-purple-500 dark:text-purple-400`} />
      );

    case 'linked':
      return (
        <Icon name="link" className={`${baseClasses} text-amber-500 dark:text-gold`} />
      );

    case 'journal':
      return (
        <Icon name="journal" className={`${baseClasses} text-indigo-500 dark:text-indigo-400`} />
      );

    default:
      return (
        <Icon name="info" className={`${baseClasses} text-slate dark:text-warm-gray`} />
      );
  }
}

export function ActivityItem({
  entityType,
  entityId,
  actionType,
  name,
  timestamp,
  onNavigateToEntity,
}: ActivityItemProps) {
  const actionLabel = getActionLabel(actionType, entityType);
  const entityTypeLabel = getEntityTypeLabel(entityType);
  const relativeTime = getRelativeTimestamp(timestamp);

  // Build display text
  let displayText = name;
  if (actionLabel && entityTypeLabel) {
    displayText = `${actionLabel} ${entityTypeLabel}: ${name}`;
  } else if (actionLabel) {
    displayText = `${actionLabel}: ${name}`;
  }

  // For photo uploads, the name already contains the full description
  if (actionType === 'uploaded') {
    displayText = name;
  }

  const handleClick = () => {
    onNavigateToEntity(entityType, entityId.toString());
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="group flex items-start gap-3 p-2 -mx-2 rounded-lg cursor-pointer
                 transition-all duration-200
                 hover:bg-parchment dark:hover:bg-navy-700
                 focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
    >
      {/* Action Icon */}
      <div className="mt-0.5">
        <ActionIcon actionType={actionType} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-charcoal dark:text-warm-gray truncate group-hover:text-primary-600 dark:group-hover:text-gold transition-colors">
          {displayText}
        </p>
        <p className="text-xs text-slate dark:text-slate mt-0.5">
          {relativeTime}
        </p>
      </div>

      {/* Chevron indicator on hover */}
      <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Icon name="chevronRight" className="w-4 h-4 text-slate dark:text-warm-gray" />
      </div>
    </div>
  );
}

export default ActivityItem;
