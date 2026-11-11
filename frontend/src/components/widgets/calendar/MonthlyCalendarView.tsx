import { useState, useMemo } from 'react';
import type { TripWithColor } from './calendarUtils';
import {
  getWeeksInMonth,
  getTripDaysInMonth,
  getTripsForMonth,
  parseDate,
} from './calendarUtils';
import TripPopup from './TripPopup';

interface MonthlyCalendarViewProps {
  year: number;
  month: number;
  trips: TripWithColor[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface TripBar {
  trip: TripWithColor;
  startCol: number; // 0-6 (column in week)
  span: number; // number of columns to span
  continuesFromPrevWeek: boolean;
  continuesToNextWeek: boolean;
}

export default function MonthlyCalendarView({ year, month, trips }: MonthlyCalendarViewProps) {
  const [selectedTrip, setSelectedTrip] = useState<TripWithColor | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

  const weeks = useMemo(() => getWeeksInMonth(year, month), [year, month]);
  const monthTrips = useMemo(() => getTripsForMonth(trips, year, month), [trips, year, month]);

  // Calculate trip bars for each week
  const weekTripBars = useMemo(() => {
    return weeks.map((week) => {
      const bars: TripBar[] = [];

      monthTrips.forEach((trip) => {
        const tripDays = getTripDaysInMonth(trip, year, month);
        if (!tripDays) return;

        // Find which days of this week the trip spans
        const weekDays = week.filter((d) => d !== 0);
        const weekStart = weekDays[0];
        const weekEnd = weekDays[weekDays.length - 1];

        // Check if trip overlaps this week
        if (tripDays.endDay < weekStart || tripDays.startDay > weekEnd) return;

        // Calculate which column the trip starts and ends in this week
        let startCol = -1;
        let endCol = -1;

        week.forEach((day, colIndex) => {
          if (day === 0) return;
          if (day >= tripDays.startDay && day <= tripDays.endDay) {
            if (startCol === -1) startCol = colIndex;
            endCol = colIndex;
          }
        });

        if (startCol === -1) return;

        const tripStart = parseDate(trip.startDate!);
        const tripEnd = parseDate(trip.endDate!);

        // Create actual date objects for comparison
        const weekStartDate = new Date(year, month, weekStart);
        const weekEndDate = new Date(year, month, weekEnd);

        bars.push({
          trip,
          startCol,
          span: endCol - startCol + 1,
          continuesFromPrevWeek: tripStart < weekStartDate,
          continuesToNextWeek: tripEnd > weekEndDate,
        });
      });

      // Sort bars by start column, then by span (longer trips first for better stacking)
      bars.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        return b.span - a.span;
      });

      return bars;
    });
  }, [weeks, monthTrips, year, month]);

  const handleTripClick = (trip: TripWithColor, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedTrip(trip);
    setPopupPosition({ x: event.clientX, y: event.clientY });
  };

  const isToday = (day: number): boolean => {
    const today = new Date();
    return (
      day !== 0 &&
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  return (
    <div className="overflow-x-auto">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-navy-700 rounded-t-lg overflow-hidden">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="bg-gray-50 dark:bg-navy-800 py-2 text-center text-sm font-medium text-gray-600 dark:text-gray-400"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="bg-gray-200 dark:bg-navy-700 rounded-b-lg overflow-hidden">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="relative">
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px">
              {week.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  className={`
                    min-h-[80px] bg-white dark:bg-navy-800 p-1
                    ${day === 0 ? 'bg-gray-50 dark:bg-navy-900/50' : ''}
                  `}
                >
                  {day !== 0 && (
                    <span
                      className={`
                        inline-flex items-center justify-center w-7 h-7 text-sm rounded-full
                        ${isToday(day)
                          ? 'bg-primary-600 text-white font-bold'
                          : 'text-gray-700 dark:text-gray-300'
                        }
                      `}
                    >
                      {day}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Trip bars overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="grid grid-cols-7 h-full">
                {/* Spacer for day numbers */}
                {week.map((_, i) => (
                  <div key={i} className="pt-9" />
                ))}
              </div>

              {/* Render trip bars */}
              <div className="absolute left-0 right-0 top-9 bottom-1 px-px">
                {weekTripBars[weekIndex].map((bar, barIndex) => {
                  const leftPercent = (bar.startCol / 7) * 100;
                  const widthPercent = (bar.span / 7) * 100;
                  const topOffset = barIndex * 22; // Stack bars vertically

                  return (
                    <div
                      key={`${bar.trip.id}-${weekIndex}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${bar.trip.title}: ${bar.trip.startDate} to ${bar.trip.endDate}`}
                      className="absolute pointer-events-auto cursor-pointer hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 transition-all"
                      style={{
                        left: `calc(${leftPercent}% + 2px)`,
                        width: `calc(${widthPercent}% - 4px)`,
                        top: `${topOffset}px`,
                        height: '20px',
                        backgroundColor: bar.trip.color,
                        borderRadius: bar.continuesFromPrevWeek
                          ? bar.continuesToNextWeek
                            ? '0'
                            : '0 4px 4px 0'
                          : bar.continuesToNextWeek
                          ? '4px 0 0 4px'
                          : '4px',
                      }}
                      onClick={(e) => handleTripClick(bar.trip, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          handleTripClick(bar.trip, {
                            clientX: rect.left + rect.width / 2,
                            clientY: rect.top + rect.height / 2,
                            stopPropagation: () => {},
                          } as React.MouseEvent);
                        }
                      }}
                    >
                      <span className="block px-2 text-xs text-white font-medium truncate leading-5">
                        {!bar.continuesFromPrevWeek && bar.trip.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trip popup */}
      {selectedTrip && (
        <TripPopup
          trip={selectedTrip}
          position={popupPosition}
          onClose={() => setSelectedTrip(null)}
        />
      )}
    </div>
  );
}
