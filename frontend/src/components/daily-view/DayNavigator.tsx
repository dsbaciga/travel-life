import { useState, useRef, useEffect, useCallback } from 'react';
import type { WeatherDisplay } from '../../types/weather';
import { getTimezoneAbbr } from './utils';
import { useDropdownPosition } from '../../hooks/useDropdownPosition';

interface DayNavigatorProps {
  currentDay: number;
  totalDays: number;
  currentDate: string;
  onDayChange: (dayNumber: number) => void;
  allDates: { dayNumber: number; dateKey: string; displayDate: string }[];
  weather?: WeatherDisplay;
  tripTimezone?: string;
  onPrint?: () => void;
}

export default function DayNavigator({
  currentDay,
  totalDays,
  currentDate,
  onDayChange,
  allDates,
  weather,
  tripTimezone,
  onPrint,
}: DayNavigatorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonTriggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Use dropdown position hook for optimal menu placement
  const { triggerRef: positionTriggerRef, position } = useDropdownPosition<HTMLButtonElement>({
    isOpen: isDropdownOpen,
    dropdownHeight: 320, // max-h-80 = 320px
    dropdownWidth: 256, // w-64 = 256px
    viewportPadding: 16,
  });

  // Combine refs for the trigger button
  const setTriggerRefs = useCallback((el: HTMLButtonElement | null) => {
    buttonTriggerRef.current = el;
    (positionTriggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = el;
  }, [positionTriggerRef]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset focused index when dropdown opens/closes
  useEffect(() => {
    if (isDropdownOpen) {
      // Focus on current day when dropdown opens
      const currentIndex = allDates.findIndex((d) => d.dayNumber === currentDay);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isDropdownOpen, currentDay, allDates]);

  // Focus the item when focusedIndex changes
  useEffect(() => {
    if (isDropdownOpen && focusedIndex >= 0 && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, isDropdownOpen]);

  const canGoBack = currentDay > 1;
  const canGoForward = currentDay < totalDays;

  const handlePrevious = () => {
    if (canGoBack) {
      onDayChange(currentDay - 1);
    }
  };

  const handleNext = () => {
    if (canGoForward) {
      onDayChange(currentDay + 1);
    }
  };

  const handleDaySelect = useCallback((dayNumber: number) => {
    onDayChange(dayNumber);
    setIsDropdownOpen(false);
  }, [onDayChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isDropdownOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsDropdownOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsDropdownOpen(false);
        buttonTriggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev < allDates.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(allDates.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < allDates.length) {
          handleDaySelect(allDates[focusedIndex].dayNumber);
        }
        break;
    }
  }, [isDropdownOpen, focusedIndex, allDates, handleDaySelect]);

  return (
    <div className="grid grid-cols-[auto_1fr_auto_1fr_auto_auto] items-center bg-white dark:bg-dusk-800 rounded-lg shadow-sm border border-gray-200 dark:border-dusk-700 p-3 gap-2">
      {/* Column 1: Previous Day Button */}
      <button
        type="button"
        onClick={handlePrevious}
        disabled={!canGoBack}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
          canGoBack
            ? 'text-gray-700 dark:text-dusk-300 hover:bg-gray-100 dark:hover:bg-dusk-700'
            : 'text-gray-300 dark:text-dusk-600 cursor-not-allowed'
        }`}
        aria-label="Previous day"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <span className="hidden sm:inline font-medium">Previous</span>
      </button>

      {/* Column 2: Weather badge (centered in this column) */}
      <div className="flex justify-center">
        {weather && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
            <span className="text-lg">{weather.icon}</span>
            <div className="text-sm">
              <span className="font-medium">
                {weather.high !== null && weather.high !== undefined
                  ? Math.round(weather.high)
                  : '--'}
                °
              </span>
              {weather.low !== null && weather.low !== undefined && (
                <span className="text-blue-500 dark:text-blue-400">
                  /{Math.round(weather.low)}°
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Column 3: Day Indicator - Clickable dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          ref={setTriggerRefs}
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          onKeyDown={handleKeyDown}
          {...{ 'aria-expanded': isDropdownOpen }}
          aria-haspopup="listbox"
          aria-label={`Day ${currentDay} of ${totalDays}. ${currentDate}. Press Enter to select a different day.`}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dusk-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-dusk-800"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              Day {currentDay}
            </span>
            <span className="text-sm text-gray-500 dark:text-dusk-400">
              of {totalDays}
            </span>
            <svg
              className={`w-4 h-4 text-gray-500 dark:text-dusk-400 transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
          <span className="text-sm text-gray-600 dark:text-dusk-400">
            {currentDate}
          </span>
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div
            role="listbox"
            aria-label="Select a day"
            className={`absolute ${position.openUpward ? 'bottom-full mb-2' : 'top-full mt-2'} left-1/2 transform -translate-x-1/2 w-[calc(100vw-2rem)] sm:w-64 max-w-64 max-h-80 overflow-y-auto bg-white dark:bg-dusk-800 rounded-lg shadow-lg border border-gray-200 dark:border-dusk-700 z-20`}
            onKeyDown={handleKeyDown}
          >
            <div className="p-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-dusk-400 uppercase px-3 py-2">
                Jump to Day
              </div>
              {allDates.map((day, index) => (
                <button
                  key={day.dayNumber}
                  ref={(el) => { itemRefs.current[index] = el; }}
                  type="button"
                  role="option"
                  {...{ 'aria-selected': day.dayNumber === currentDay }}
                  onClick={() => handleDaySelect(day.dayNumber)}
                  onKeyDown={handleKeyDown}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                    day.dayNumber === currentDay
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-dusk-300 hover:bg-gray-100 dark:hover:bg-dusk-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Day {day.dayNumber}</span>
                    {day.dayNumber === currentDay && (
                      <svg
                        className="w-4 h-4 text-blue-600 dark:text-blue-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-dusk-400">
                    {day.displayDate}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Column 4: Timezone badge (centered in this column) */}
      <div className="flex justify-center">
        {tripTimezone && (
          <div className="hidden sm:flex items-center px-2 py-1 rounded bg-gray-100 dark:bg-dusk-700 text-xs text-gray-500 dark:text-dusk-400">
            {getTimezoneAbbr(tripTimezone)}
          </div>
        )}
      </div>

      {/* Column 5: Print Button */}
      <div className="flex justify-center">
        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-600 dark:text-dusk-400 hover:bg-gray-100 dark:hover:bg-dusk-700 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Print this day"
            title="Print this day"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            <span className="hidden sm:inline text-sm font-medium">Print</span>
          </button>
        )}
      </div>

      {/* Column 6: Next Day Button */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!canGoForward}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
          canGoForward
            ? 'text-gray-700 dark:text-dusk-300 hover:bg-gray-100 dark:hover:bg-dusk-700'
            : 'text-gray-300 dark:text-dusk-600 cursor-not-allowed'
        }`}
        aria-label="Next day"
      >
        <span className="hidden sm:inline font-medium">Next</span>
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
    </div>
  );
}
