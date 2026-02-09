/**
 * TripCalendarWidget - Full calendar view showing trips as colored bars
 * Supports monthly and yearly views with navigation to past years and up to 3 years in future
 * Replaces the GitHub-style heatmap with a more detailed calendar visualization
 */

import { useState, useEffect, useMemo } from 'react';
import tripService from '../../services/trip.service';
import { Skeleton } from '../Skeleton';
import {
  assignTripColors,
  filterVisibleTrips,
  getMonthName,
  getTripsForMonth,
  getTripsForYear,
  canNavigateToYear,
  type TripWithColor,
} from './calendar/calendarUtils';
import MonthlyCalendarView from './calendar/MonthlyCalendarView';
import YearlyCalendarView from './calendar/YearlyCalendarView';

type ViewMode = 'monthly' | 'yearly';

export default function TripCalendarWidget() {
  const [isLoading, setIsLoading] = useState(true);
  const [trips, setTrips] = useState<TripWithColor[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      // Fetch all trips (no pagination limit for calendar)
      const response = await tripService.getTrips({ limit: 1000 });
      const visibleTrips = filterVisibleTrips(response.trips);
      const tripsWithColors = assignTripColors(visibleTrips);
      setTrips(tripsWithColors);
    } catch (error) {
      console.error('Failed to load trips:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const legendTrips = useMemo(() => {
    return viewMode === 'monthly'
      ? getTripsForMonth(trips, currentYear, currentMonth)
      : getTripsForYear(trips, currentYear);
  }, [trips, viewMode, currentYear, currentMonth]);

  const maxYear = today.getFullYear() + 3;

  const canGoNext = useMemo(() => {
    if (viewMode === 'yearly') {
      return canNavigateToYear(currentYear + 1);
    }
    // Monthly: can go to next month if within year range
    if (currentMonth === 11) {
      return canNavigateToYear(currentYear + 1);
    }
    return true;
  }, [viewMode, currentYear, currentMonth]);

  const handlePrevious = () => {
    if (viewMode === 'yearly') {
      setCurrentYear((y) => y - 1);
    } else {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear((y) => y - 1);
      } else {
        setCurrentMonth((m) => m - 1);
      }
    }
  };

  const handleNext = () => {
    if (!canGoNext) return;

    if (viewMode === 'yearly') {
      setCurrentYear((y) => y + 1);
    } else {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear((y) => y + 1);
      } else {
        setCurrentMonth((m) => m + 1);
      }
    }
  };

  const handleToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    // Reset to current date when switching views
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-sky/10">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <Skeleton className="h-6 w-48 rounded" />
        </div>
        <Skeleton className="h-64 w-full rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-sky/10 hover:shadow-xl transition-shadow duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white">
            Trip Calendar
          </h3>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 dark:bg-navy-900 p-1">
            <button
              onClick={() => handleViewModeChange('monthly')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'monthly'
                  ? 'bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => handleViewModeChange('yearly')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'yearly'
                  ? 'bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Yearly
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevious}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-700 text-gray-600 dark:text-gray-400 transition-colors"
          aria-label="Previous"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
            {viewMode === 'monthly'
              ? `${getMonthName(currentMonth)} ${currentYear}`
              : currentYear}
          </h4>
          <button
            onClick={handleToday}
            className="px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md transition-colors"
          >
            Today
          </button>
        </div>

        <button
          onClick={handleNext}
          disabled={!canGoNext}
          className={`p-2 rounded-lg transition-colors ${
            canGoNext
              ? 'hover:bg-gray-100 dark:hover:bg-navy-700 text-gray-600 dark:text-gray-400'
              : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
          }`}
          aria-label="Next"
          title={!canGoNext ? `Cannot navigate beyond ${maxYear}` : undefined}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Calendar view */}
      {viewMode === 'monthly' ? (
        <MonthlyCalendarView year={currentYear} month={currentMonth} trips={trips} />
      ) : (
        <YearlyCalendarView year={currentYear} trips={trips} />
      )}

      {/* Legend - only show trips visible in current view */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-navy-700">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Trips:</span>
          {legendTrips.slice(0, 6).map((trip) => (
            <div key={trip.id} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: trip.color }}
              />
              <span className="truncate max-w-[100px]">{trip.title}</span>
            </div>
          ))}
          {legendTrips.length > 6 && (
            <span className="text-gray-500">+{legendTrips.length - 6} more</span>
          )}
          {legendTrips.length === 0 && (
            <span className="text-gray-500 italic">No trips to display</span>
          )}
        </div>
      </div>
    </div>
  );
}
