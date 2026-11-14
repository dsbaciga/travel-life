import { useState, useMemo } from 'react';
import type { TripWithColor } from './calendarUtils';
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthName,
  isTripActiveOnDate,
  getTripsForMonth,
} from './calendarUtils';
import TripPopup from './TripPopup';

interface YearlyCalendarViewProps {
  year: number;
  trips: TripWithColor[];
}

const DAY_ABBREVS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function YearlyCalendarView({ year, trips }: YearlyCalendarViewProps) {
  const [selectedTrip, setSelectedTrip] = useState<TripWithColor | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const daysInMonth = getDaysInMonth(year, monthIndex);
      const firstDay = getFirstDayOfMonth(year, monthIndex);
      const monthTrips = getTripsForMonth(trips, year, monthIndex);

      // Build day cells for this month
      const dayCells: { day: number; trips: TripWithColor[] }[] = [];

      // Empty cells before first day
      for (let i = 0; i < firstDay; i++) {
        dayCells.push({ day: 0, trips: [] });
      }

      // Day cells
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day);
        const activeTrips = monthTrips.filter((trip) => isTripActiveOnDate(trip, date));
        dayCells.push({ day, trips: activeTrips });
      }

      // Fill to complete last row
      while (dayCells.length % 7 !== 0) {
        dayCells.push({ day: 0, trips: [] });
      }

      return {
        name: getMonthName(monthIndex, 'short'),
        monthIndex,
        dayCells,
      };
    });
  }, [year, trips]);

  const handleDayClick = (dayTrips: TripWithColor[], event: React.MouseEvent) => {
    if (dayTrips.length === 0) return;

    // If multiple trips, show the first one (user can navigate from popup)
    setSelectedTrip(dayTrips[0]);
    setPopupPosition({ x: event.clientX, y: event.clientY });
  };

  const isToday = (monthIndex: number, day: number): boolean => {
    if (day === 0) return false;
    const today = new Date();
    return (
      today.getFullYear() === year &&
      today.getMonth() === monthIndex &&
      today.getDate() === day
    );
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {months.map(({ name, monthIndex, dayCells }) => (
        <div
          key={monthIndex}
          className="bg-gray-50 dark:bg-navy-900/50 rounded-lg p-2"
        >
          {/* Month name */}
          <h4 className="text-sm font-semibold text-gray-700 dark:text-dusk-300 mb-2 text-center">
            {name}
          </h4>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {DAY_ABBREVS.map((abbrev, i) => (
              <div
                key={i}
                className="text-center text-[10px] text-gray-400 dark:text-dusk-400"
              >
                {abbrev}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px">
            {dayCells.map((cell, cellIndex) => {
              const hasTrips = cell.trips.length > 0;
              const tripColor = hasTrips ? cell.trips[0].color : undefined;
              const multipleTrips = cell.trips.length > 1;

              return (
                <div
                  key={cellIndex}
                  className={`
                    relative aspect-square flex items-center justify-center text-[10px] rounded-sm
                    ${cell.day === 0 ? '' : 'cursor-pointer'}
                    ${hasTrips ? 'hover:ring-1 hover:ring-white/50' : ''}
                    ${isToday(monthIndex, cell.day) && !hasTrips
                      ? 'bg-primary-500 text-white font-bold'
                      : ''
                    }
                    ${!hasTrips && cell.day !== 0
                      ? 'text-gray-600 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-navy-800'
                      : ''
                    }
                  `}
                  style={
                    hasTrips
                      ? {
                          backgroundColor: tripColor,
                          color: 'white',
                        }
                      : undefined
                  }
                  tabIndex={hasTrips ? 0 : -1}
                  {...(hasTrips && { role: 'button' })}
                  aria-label={hasTrips ? `${cell.day}: ${cell.trips.map(t => t.title).join(', ')}` : undefined}
                  onClick={(e) => cell.day !== 0 && handleDayClick(cell.trips, e)}
                  onKeyDown={(e) => {
                    if (hasTrips && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      handleDayClick(cell.trips, {
                        clientX: rect.left + rect.width / 2,
                        clientY: rect.top + rect.height / 2,
                      } as React.MouseEvent);
                    }
                  }}
                  title={
                    hasTrips
                      ? cell.trips.map((t) => t.title).join(', ')
                      : undefined
                  }
                >
                  {cell.day !== 0 && (
                    <span className={multipleTrips ? 'font-bold' : ''}>
                      {cell.day}
                    </span>
                  )}
                  {multipleTrips && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-white dark:bg-navy-200 rounded-full text-[6px] text-gray-800 dark:text-navy-900 flex items-center justify-center">
                      {cell.trips.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

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
