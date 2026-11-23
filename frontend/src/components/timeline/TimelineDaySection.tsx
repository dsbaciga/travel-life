import { useMemo } from 'react';
import type { ReactNode } from 'react';
import DayHeader from './DayHeader';
import TimelineEventCard from './TimelineEventCard';
import UnscheduledActivityCard from './UnscheduledActivityCard';
import DayMiniMap from '../DayMiniMap';
import {
  getConnectionInfo,
  getTimezoneAbbr,
  getTimelineItemEndPlace,
  mapTimelineTypeToEntityType,
} from './utils';
import { pickPreviousPlace } from '../../lib/mapsDeepLinks';
import { computeRouteProgress } from '../../lib/vendored/routeProgress';
import useNow from '../../hooks/useNow';
import useTimezoneResolver from '../../hooks/useTimezoneResolver';
import { getTodayInTimezone } from '../../utils/tripDashboardUtils';
import type { DayGroup, TimelineItem } from './types';
import type { EntityLinkSummary } from '../../types/entityLink';
import { getEntityKey } from '../../types/entityLink';

interface TimelineDaySectionProps {
  dayGroup: DayGroup;
  tripId: number;
  tripTimezone?: string;
  userTimezone?: string;
  viewMode: 'standard' | 'compact';
  isCollapsed: boolean;
  showDualTimezone: boolean;
  mobileActiveTimezone?: 'trip' | 'user';
  linkSummaryMap?: Record<string, EntityLinkSummary>;
  onToggleCollapse: () => void;
  onEdit: (item: TimelineItem) => void;
  onDelete: (item: TimelineItem) => void;
  onLinkUpdate: () => void;
  /** Extra per-day actions for the day header. */
  headerActions?: ReactNode;
}

export default function TimelineDaySection({
  dayGroup,
  tripId,
  tripTimezone,
  userTimezone,
  viewMode,
  isCollapsed,
  showDualTimezone,
  mobileActiveTimezone,
  linkSummaryMap,
  onToggleCollapse,
  onEdit,
  onDelete,
  onLinkUpdate,
  headerActions,
}: TimelineDaySectionProps) {
  const { dateKey, items = [], weather, stats } = dayGroup;

  // Sort items by time
  const sortedItems = useMemo(() => {
    // Defensive check: ensure items is an array
    if (!Array.isArray(items)) {
      console.warn('TimelineDaySection: items is not an array', { dateKey, items });
      return [];
    }
    return [...items].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  }, [items, dateKey]);

  // Where each item leaves the traveller, so the next item's Directions link
  // can start from it (hotel -> restaurant rather than a bare destination pin).
  const endPlaces = useMemo(
    () => sortedItems.map((item) => getTimelineItemEndPlace(item)),
    [sortedItems]
  );

  // Get coordinates for mini map
  const mapLocations = useMemo(() => {
    const coords: { latitude: number; longitude: number; name: string }[] = [];

    sortedItems.forEach((item) => {
      if (item.locationCoords) {
        coords.push({
          ...item.locationCoords,
          name: item.title,
        });
      }
      // For transportation, include from/to coords
      if (item.type === 'transportation') {
        if (item.fromCoords) {
          coords.push({
            ...item.fromCoords,
            name: 'Departure',
          });
        }
        if (item.toCoords) {
          coords.push({
            ...item.toCoords,
            name: 'Arrival',
          });
        }
      }
    });

    return coords;
  }, [sortedItems]);

  // Get link summary for an item
  const getLinkSummary = (item: TimelineItem): EntityLinkSummary | undefined => {
    if (!linkSummaryMap) return undefined;
    const entityType = mapTimelineTypeToEntityType(item.type);
    const key = getEntityKey(entityType, item.data.id);
    return linkSummaryMap[key];
  };

  // Determine which timezone to display based on device and setting
  const getDisplayTimezone = (item: TimelineItem): string | undefined => {
    // On mobile, use the active timezone toggle
    // On desktop with dual timezone, times are shown in both
    if (!showDualTimezone) {
      return tripTimezone;
    }

    // For transportation, respect its own timezone
    if (item.type === 'transportation' && item.startTimezone) {
      return item.startTimezone;
    }

    return tripTimezone;
  };

  const isCompact = viewMode === 'compact';

  // Route line: gold marker on the current or next stop, solid line up to it.
  const now = useNow(60_000);
  const resolveTz = useTimezoneResolver();
  const isToday = dateKey === getTodayInTimezone(resolveTz(tripTimezone));
  const route = useMemo(
    () =>
      computeRouteProgress(
        sortedItems.map((item) => ({
          start: item.dateTime.getTime(),
          end: item.endDateTime?.getTime(),
        })),
        now.getTime(),
        isToday
      ),
    [sortedItems, now, isToday]
  );

  return (
    <div className="bg-white dark:bg-dusk-800 rounded-xl shadow-sm border border-gray-200 dark:border-dusk-700 overflow-hidden mb-4">
      {/* Day Header */}
      <DayHeader
        date={dateKey}
        dayNumber={dayGroup.dayNumber}
        tripTimezone={tripTimezone}
        userTimezone={userTimezone}
        weather={weather}
        stats={stats}
        eventCount={items.length}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        actions={headerActions}
      />

      {/* Day Content - collapsible */}
      <div className={`${isCompact ? 'p-2 sm:p-3' : 'p-2 sm:p-4'} ${isCollapsed ? 'hidden print:block' : ''} scroll-mt-48`}>
        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-dusk-400">
            <p className="text-sm">No events scheduled for this day</p>
          </div>
        ) : (
          <>
            {/* Desktop: Dual timezone header row */}
            {showDualTimezone && (
              <div className="hidden lg:flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-dusk-700">
                {/* Spacer to match icon column width */}
                <div className="w-11 shrink-0" />
                {/* Header row with trip time LEFT and home time RIGHT */}
                <div className="flex-1 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider">
                      Trip Time ({tripTimezone && getTimezoneAbbr(tripTimezone)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-dusk-400 uppercase tracking-wider">
                      Home Time ({userTimezone && getTimezoneAbbr(userTimezone)})
                    </span>
                    <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-dusk-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Timeline vertical line container */}
            <div className="relative">
              {/* Events list: each stop draws its own leg of the route line */}
              <div>
                {sortedItems.map((item, index) => {
                  const connectionInfo = getConnectionInfo(item, sortedItems);

                  return (
                    <TimelineEventCard
                      key={`${item.type}-${item.id}`}
                      item={item}
                      tripId={tripId}
                      tripTimezone={getDisplayTimezone(item)}
                      userTimezone={userTimezone}
                      showDualTime={showDualTimezone}
                      mobileActiveTimezone={mobileActiveTimezone}
                      linkSummary={getLinkSummary(item)}
                      viewMode={viewMode}
                      connectionInfo={connectionInfo || undefined}
                      routeStop={route.stops[index]}
                      routeSegment={route.segments[index]}
                      originPlace={pickPreviousPlace(endPlaces, index)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onLinkUpdate={onLinkUpdate}
                    />
                  );
                })}
              </div>
            </div>

            {/* Unscheduled Activities Section */}
            {dayGroup.unscheduledActivities && dayGroup.unscheduledActivities.length > 0 && (
              <div className={`${isCompact ? 'mt-3' : 'mt-4'} border-t border-gray-200 dark:border-dusk-700 pt-4`}>
                <div className="flex items-center gap-2 mb-3">
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-dusk-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-dusk-300">
                    Unscheduled Activities
                  </h4>
                  <span className="text-xs text-gray-500 dark:text-dusk-400">
                    ({dayGroup.unscheduledActivities.length})
                  </span>
                </div>
                <div className={`grid gap-2 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                  {dayGroup.unscheduledActivities.map((activity) => (
                    <UnscheduledActivityCard
                      key={activity.id}
                      activity={activity}
                      isCompact={isCompact}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Mini Map */}
            {mapLocations.length > 0 && (
              <div className={`${isCompact ? 'mt-3' : 'mt-4'} border-t border-gray-200 dark:border-dusk-700 pt-4`}>
                <DayMiniMap locations={mapLocations} defaultExpanded={viewMode === 'standard'} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
