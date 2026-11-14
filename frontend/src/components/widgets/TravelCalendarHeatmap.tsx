/**
 * TravelCalendarHeatmap - GitHub-style calendar heatmap showing travel activity
 * Displays the past year with intensity based on number of active trips per day
 * Only includes Completed, In Progress, Planned, and Planning trips
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import tripService from '../../services/trip.service';
import type { Trip } from '../../types/trip';
import { Skeleton } from '../Skeleton';
import { CalendarIcon, ChevronDownIcon } from '../icons';

interface DayData {
  date: Date;
  count: number;
  trips: string[]; // Trip titles for tooltip
}

interface VisibleTrip {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
}

/** Maximum number of trips to show in the legend before collapsing with "+X more" */
const MAX_LEGEND_TRIPS = 12;

/** Width of day-of-week label column in pixels (w-7 = 28px + gap) */
const DAY_LABEL_WIDTH_PX = 32;

/** Size of each calendar cell plus gap in pixels (12px cell + 2px gap) */
const CELL_SIZE_WITH_GAP_PX = 14;

/** Color classes for heatmap intensity levels (0 = no trips, 4+ = max intensity) */
const INTENSITY_COLORS = [
  'bg-gray-100 dark:bg-navy-900/30',     // 0 trips
  'bg-primary-200 dark:bg-primary-900/50', // 1 trip
  'bg-primary-400 dark:bg-primary-700/70', // 2 trips
  'bg-primary-600 dark:bg-primary-600/80', // 3 trips
  'bg-primary-800 dark:bg-primary-500',    // 4+ trips
] as const;

export default function TravelCalendarHeatmap() {
  const [isLoading, setIsLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState<DayData[]>([]);
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);
  const [visibleTrips, setVisibleTrips] = useState<VisibleTrip[]>([]);
  const [showTripLegend, setShowTripLegend] = useState(false);

  /**
   * Parse date string to local Date without UTC timezone offset.
   * Using new Date('2024-01-15') interprets as UTC midnight which can shift
   * the displayed date in non-UTC timezones. This parses the components
   * directly to create a local midnight date.
   */
  const parseDate = useCallback((dateStr: string): Date => {
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day);
  }, []);

  const generateYearData = useCallback((trips: Trip[]): { data: DayData[]; tripsInRange: VisibleTrip[] } => {
    const data: DayData[] = [];
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    // Create a map of dates to trip counts
    const dateMap = new Map<string, { count: number; trips: string[] }>();

    // Track trips that have at least one day visible in the range
    const tripsInRange: VisibleTrip[] = [];

    // Determine the actual display range (starts from beginning of week)
    const displayStartDate = new Date(oneYearAgo);
    const dayOfWeek = displayStartDate.getDay();
    displayStartDate.setDate(displayStartDate.getDate() - dayOfWeek);

    // Process each trip
    trips.forEach((trip) => {
      if (!trip.startDate || !trip.endDate) return;

      const startDate = parseDate(trip.startDate);
      const endDate = parseDate(trip.endDate);

      // Check if this trip has any days visible in the display range
      const tripOverlapsRange = startDate <= today && endDate >= displayStartDate;

      if (tripOverlapsRange) {
        tripsInRange.push({
          id: trip.id,
          title: trip.title,
          startDate: trip.startDate,
          endDate: trip.endDate,
        });

        // Only iterate through days within the display range (performance optimization)
        const iterStart = new Date(Math.max(startDate.getTime(), displayStartDate.getTime()));
        const iterEnd = new Date(Math.min(endDate.getTime(), today.getTime()));
        const currentDate = new Date(iterStart);

        while (currentDate <= iterEnd) {
          const dateKey = currentDate.toISOString().split('T')[0];
          const existing = dateMap.get(dateKey);
          if (existing) {
            existing.count += 1;
            if (!existing.trips.includes(trip.title)) {
              existing.trips.push(trip.title);
            }
          } else {
            dateMap.set(dateKey, { count: 1, trips: [trip.title] });
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    });

    // Generate array for the past year
    const currentDate = new Date(displayStartDate);

    while (currentDate <= today) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dayData = dateMap.get(dateKey) || { count: 0, trips: [] };

      data.push({
        date: new Date(currentDate),
        count: dayData.count,
        trips: dayData.trips,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort trips by start date (most recent first)
    tripsInRange.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    return { data, tripsInRange };
  }, [parseDate]);

  const loadTravelData = useCallback(async () => {
    try {
      const response = await tripService.getTrips();
      const trips = (response.trips ?? []).filter(
        (trip) =>
          trip.status === 'Completed' ||
          trip.status === 'In Progress' ||
          trip.status === 'Planned' ||
          trip.status === 'Planning'
      );

      // Generate data for the past year
      const { data, tripsInRange } = generateYearData(trips);
      setHeatmapData(data);
      setVisibleTrips(tripsInRange);
    } catch (error) {
      console.error('Failed to load travel data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [generateYearData]);

  useEffect(() => {
    loadTravelData();
  }, [loadTravelData]);

  const getColorClass = useCallback((count: number): string => {
    return INTENSITY_COLORS[Math.min(count, INTENSITY_COLORS.length - 1)];
  }, []);

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Memoize weeks computation to avoid recalculating on every render
  const weeks = useMemo((): DayData[][] => {
    const result: DayData[][] = [];
    for (let i = 0; i < heatmapData.length; i += 7) {
      result.push(heatmapData.slice(i, i + 7));
    }
    return result;
  }, [heatmapData]);

  // Memoize month labels computation
  const monthLabels = useMemo((): { label: string; weekIndex: number }[] => {
    const labels: { label: string; weekIndex: number }[] = [];

    let lastMonth = -1;
    let lastWeekIndex = -1;
    weeks.forEach((week, weekIndex) => {
      // Check the first day of the week
      if (week.length > 0) {
        const firstDay = week[0].date;
        const month = firstDay.getMonth();

        // Skip the very first month label if it's at week 0 or 1 (partial month at start)
        const isFirstWeeks = weekIndex <= 1;

        // Only add label if it's a new month and there's enough space
        // (at least 2 weeks between labels to prevent overlap)
        if (month !== lastMonth && !isFirstWeeks && (weekIndex - lastWeekIndex >= 2 || lastWeekIndex === -1)) {
          labels.push({
            label: firstDay.toLocaleDateString('en-US', { month: 'short' }),
            weekIndex,
          });
          lastMonth = month;
          lastWeekIndex = weekIndex;
        } else if (month !== lastMonth) {
          // Month changed but not enough space or is first week, update lastMonth without adding label
          lastMonth = month;
        }
      }
    });

    return labels;
  }, [weeks]);

  // Trips to display in legend (limited to avoid excessive height)
  const displayTrips = useMemo(() => visibleTrips.slice(0, MAX_LEGEND_TRIPS), [visibleTrips]);
  const remainingTripsCount = Math.max(0, visibleTrips.length - MAX_LEGEND_TRIPS);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <Skeleton className="h-6 w-48 rounded" />
        </div>
        <Skeleton className="h-32 w-full rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20 hover:shadow-xl transition-shadow duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
          <CalendarIcon className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white">
          Travel Calendar
        </h3>
      </div>

      {/* Calendar Heatmap */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Month Labels */}
          <div className="relative mb-2 h-5">
            <div className="flex gap-[2px]" style={{ paddingLeft: `${DAY_LABEL_WIDTH_PX}px` }}>
              {monthLabels.map((monthLabel, index) => (
                <div
                  key={index}
                  className="text-xs text-gray-500 dark:text-dusk-400 font-medium whitespace-nowrap"
                  style={{
                    position: 'absolute',
                    left: `${DAY_LABEL_WIDTH_PX + monthLabel.weekIndex * CELL_SIZE_WITH_GAP_PX}px`,
                  }}
                >
                  {monthLabel.label}
                </div>
              ))}
            </div>
          </div>

          {/* Day Labels and Grid */}
          <div className="flex gap-1">
            {/* Day of week labels */}
            <div className="flex flex-col gap-[2px] justify-start w-7">
              <div className="h-3 text-xs text-gray-500 dark:text-dusk-400" />
              <div className="h-3 text-xs text-gray-500 dark:text-dusk-400">M</div>
              <div className="h-3 text-xs text-gray-500 dark:text-dusk-400" />
              <div className="h-3 text-xs text-gray-500 dark:text-dusk-400">W</div>
              <div className="h-3 text-xs text-gray-500 dark:text-dusk-400" />
              <div className="h-3 text-xs text-gray-500 dark:text-dusk-400">F</div>
              <div className="h-3 text-xs text-gray-500 dark:text-dusk-400" />
            </div>

            {/* Calendar grid */}
            <div className="flex gap-[2px]" role="grid" aria-label="Travel activity calendar">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[2px]" role="row">
                  {week.map((day, dayIndex) => {
                    const label = `${formatDate(day.date)}: ${day.count} trip${day.count !== 1 ? 's' : ''}`;
                    const hasTripActivity = day.count > 0;
                    return (
                      <div
                        key={dayIndex}
                        role="gridcell"
                        tabIndex={hasTripActivity ? 0 : -1}
                        aria-label={label}
                        className={`w-3 h-3 rounded-sm ${getColorClass(
                          day.count
                        )} cursor-pointer hover:ring-2 hover:ring-accent-500 focus:ring-2 focus:ring-accent-500 focus:outline-none transition-all duration-150`}
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        onFocus={() => setHoveredDay(day)}
                        onBlur={() => setHoveredDay(null)}
                        title={label}
                      />
                    );
                  })}
                  {/* Fill empty cells to maintain grid height */}
                  {week.length < 7 &&
                    Array.from({ length: 7 - week.length }).map((_, i) => (
                      <div key={`empty-${i}`} className="w-3 h-3" role="gridcell" aria-hidden="true" />
                    ))}
                </div>
              ))}
            </div>
          </div>

          {/* Color Legend */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-dusk-400">
              <span>Less</span>
              {INTENSITY_COLORS.map((colorClass, index) => (
                <div key={index} className={`w-3 h-3 rounded-sm ${colorClass}`} />
              ))}
              <span>More</span>
            </div>

            {/* Trip Legend Toggle */}
            {visibleTrips.length > 0 && (
              <button
                type="button"
                onClick={() => setShowTripLegend(!showTripLegend)}
                aria-expanded={showTripLegend}
                aria-controls="trip-legend-panel"
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-dusk-400 hover:text-primary-600 dark:hover:text-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50 rounded px-1 py-0.5 transition-colors"
              >
                <span>{visibleTrips.length} trip{visibleTrips.length !== 1 ? 's' : ''}</span>
                <ChevronDownIcon
                  className={`w-4 h-4 transition-transform duration-200 ${showTripLegend ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>

          {/* Trip Legend (Collapsible) - Always rendered for aria-controls, hidden when collapsed */}
          <div
            id="trip-legend-panel"
            className={`mt-3 pt-3 border-t border-gray-200 dark:border-navy-700 ${
              !showTripLegend || visibleTrips.length === 0 ? 'hidden' : ''
            }`}
          >
            <div className="text-xs font-medium text-gray-700 dark:text-dusk-300 mb-2">
              Trips shown on calendar:
            </div>
            <div className="flex flex-wrap gap-2">
              {displayTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-xs text-primary-800 dark:text-primary-300"
                >
                  <div className="w-2 h-2 rounded-full bg-primary-500" />
                  <span className="max-w-[150px] truncate">{trip.title}</span>
                </div>
              ))}
              {remainingTripsCount > 0 && (
                <span className="inline-flex items-center px-2 py-1 text-xs text-gray-500 dark:text-dusk-400">
                  +{remainingTripsCount} more
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {hoveredDay && hoveredDay.count > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
          <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            {formatDate(hoveredDay.date)}
          </div>
          <div className="text-xs text-gray-600 dark:text-dusk-400">
            {hoveredDay.count} active trip{hoveredDay.count !== 1 ? 's' : ''}:
          </div>
          <ul className="mt-1 text-xs text-gray-700 dark:text-dusk-300 list-disc list-inside">
            {hoveredDay.trips.map((tripTitle, index) => (
              <li key={index}>{tripTitle}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
