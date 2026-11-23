/**
 * RecentActivityCard - Shows recent changes to the trip
 *
 * Displays a list of 5-8 most recent activities/changes with:
 * - Action type icons (Added, Updated, Uploaded, Linked, Journal)
 * - Entity name and timestamp
 * - Grouped by day if many items
 * - Click to navigate to entity
 * - "View all activity" link at bottom
 */

import Icon from '../ui/Icon';
import { useMemo } from 'react';

import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import type { Location } from '../../types/location';
import type { JournalEntry } from '../../types/journalEntry';
import type { Photo } from '../../types/photo';

import {
  getRecentActivity,
  groupActivityByDay,
  getDayGroupLabel,
} from '../../utils/tripDashboardUtils';

import { ActivityItem } from './ActivityItem';

interface RecentActivityCardProps {
  activities: Activity[];
  transportation: Transportation[];
  lodging: Lodging[];
  locations: Location[];
  journal: JournalEntry[];
  photos: Photo[];
  onNavigateToEntity: (entityType: string, entityId: string) => void;
}

/**
 * Empty state when no activity exists
 */
function EmptyActivityState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="text-4xl mb-3" role="img" aria-label="No activity">
        <Icon name="schedule" className="w-12 h-12 text-slate/50 dark:text-warm-gray/50" />
      </div>
      <p className="text-sm text-slate dark:text-warm-gray font-medium">
        No recent activity
      </p>
      <p className="text-xs text-slate/70 dark:text-warm-gray/70 mt-1">
        Start planning your trip to see activity here
      </p>
    </div>
  );
}

/**
 * Day group header for grouped activities
 */
function DayGroupHeader({ label }: { label: string }) {
  return (
    <div className="px-2 py-1 mt-2 first:mt-0">
      <span className="text-xs font-semibold text-slate dark:text-warm-gray uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

export function RecentActivityCard({
  activities,
  transportation,
  lodging,
  locations,
  journal,
  photos,
  onNavigateToEntity,
}: RecentActivityCardProps) {
  // Get recent activity items
  const recentItems = useMemo(() => {
    return getRecentActivity(
      activities,
      transportation,
      lodging,
      locations,
      journal,
      photos,
      8 // Show 8 items
    );
  }, [activities, transportation, lodging, locations, journal, photos]);

  // Group by day if more than 5 items
  const shouldGroupByDay = recentItems.length > 5;
  const groupedItems = useMemo(() => {
    if (!shouldGroupByDay) return null;
    return groupActivityByDay(recentItems);
  }, [recentItems, shouldGroupByDay]);

  // Check if we have any activity
  const hasActivity = recentItems.length > 0;

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-body font-semibold text-lg text-charcoal dark:text-warm-gray">
          Recent Activity
        </h3>
        <div className="flex items-center gap-1 text-slate dark:text-warm-gray">
          <Icon name="schedule" className="w-4 h-4" />
        </div>
      </div>

      {/* Content */}
      {!hasActivity ? (
        <EmptyActivityState />
      ) : shouldGroupByDay && groupedItems ? (
        // Grouped by day view
        <div className="space-y-1">
          {Array.from(groupedItems.entries()).map(([dateKey, items]) => (
            <div key={dateKey}>
              <DayGroupHeader label={getDayGroupLabel(dateKey)} />
              <div className="space-y-0.5">
                {items.map((item) => (
                  <ActivityItem
                    key={item.id}
                    entityType={item.entityType}
                    entityId={item.entityId}
                    actionType={item.actionType}
                    name={item.name}
                    timestamp={item.timestamp}
                    onNavigateToEntity={onNavigateToEntity}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Simple list view
        <div className="space-y-0.5">
          {recentItems.map((item) => (
            <ActivityItem
              key={item.id}
              entityType={item.entityType}
              entityId={item.entityId}
              actionType={item.actionType}
              name={item.name}
              timestamp={item.timestamp}
              onNavigateToEntity={onNavigateToEntity}
            />
          ))}
        </div>
      )}

      {/* Footer - View all activity link */}
      {hasActivity && (
        <div className="mt-4 pt-3 border-t border-warm-gray/30 dark:border-gold/10">
          <button
            type="button"
            className="w-full text-sm text-primary-600 dark:text-gold hover:text-primary-700 dark:hover:text-accent-300 font-medium
                       flex items-center justify-center gap-1
                       transition-colors duration-200
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50
                       rounded-lg p-2 -m-2
                       hover:bg-primary-50 dark:hover:bg-navy-700/50"
            onClick={() => {
              // Future: navigate to activity log or open a modal
              // Currently no-op until activity log feature is implemented
            }}
          >
            <span>View all activity</span>
            <Icon name="chevronRight" className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default RecentActivityCard;
