import type { Trip } from '../../../types/trip';

// Visually distinct color palette for trips
export const TRIP_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // purple
];

export interface TripWithColor extends Trip {
  color: string;
}

/**
 * Assigns unique colors to trips from the palette
 */
export function assignTripColors(trips: Trip[]): TripWithColor[] {
  return trips.map((trip, index) => ({
    ...trip,
    color: TRIP_COLORS[index % TRIP_COLORS.length],
  }));
}

/**
 * Parse date string without UTC interpretation issues
 * Handles both "2025-01-15" and "2025-01-15T00:00:00.000Z" formats
 */
export function parseDate(dateStr: string): Date {
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get the number of days in a given month
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get the day of week (0-6, Sunday=0) for the first day of a month
 */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/**
 * Format date as YYYY-MM-DD for comparison
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a trip is active on a specific date
 */
export function isTripActiveOnDate(trip: Trip, date: Date): boolean {
  if (!trip.startDate || !trip.endDate) return false;

  const tripStart = parseDate(trip.startDate);
  const tripEnd = parseDate(trip.endDate);
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  return checkDate >= tripStart && checkDate <= tripEnd;
}

/**
 * Check if a trip overlaps with a given month
 */
export function tripOverlapsMonth(trip: Trip, year: number, month: number): boolean {
  if (!trip.startDate || !trip.endDate) return false;

  const tripStart = parseDate(trip.startDate);
  const tripEnd = parseDate(trip.endDate);

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  return tripStart <= monthEnd && tripEnd >= monthStart;
}

/**
 * Get trips that are active during a specific month
 */
export function getTripsForMonth<T extends Trip>(trips: T[], year: number, month: number): T[] {
  return trips.filter(trip => tripOverlapsMonth(trip, year, month));
}

/**
 * Get the start and end day indices (1-based) for a trip within a specific month
 */
export function getTripDaysInMonth(
  trip: Trip,
  year: number,
  month: number
): { startDay: number; endDay: number } | null {
  if (!trip.startDate || !trip.endDate) return null;

  const tripStart = parseDate(trip.startDate);
  const tripEnd = parseDate(trip.endDate);

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  // Check if trip overlaps this month
  if (tripStart > monthEnd || tripEnd < monthStart) return null;

  // Calculate effective start and end within this month
  const effectiveStart = tripStart < monthStart ? monthStart : tripStart;
  const effectiveEnd = tripEnd > monthEnd ? monthEnd : tripEnd;

  return {
    startDay: effectiveStart.getDate(),
    endDay: effectiveEnd.getDate(),
  };
}

/**
 * Get week rows for a month (array of arrays of day numbers, 0 = empty cell)
 */
export function getWeeksInMonth(year: number, month: number): number[][] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const weeks: number[][] = [];
  let currentWeek: number[] = [];

  // Fill empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    currentWeek.push(0);
  }

  // Fill days
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Fill remaining empty cells
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(0);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

/**
 * Get month name from index (0-11)
 */
export function getMonthName(month: number, format: 'long' | 'short' = 'long'): string {
  const date = new Date(2000, month, 1);
  return date.toLocaleDateString('en-US', { month: format });
}

/**
 * Check if we can navigate to a year (past: no limit, future: current year + 3)
 */
export function canNavigateToYear(targetYear: number): boolean {
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 3;
  return targetYear <= maxYear;
}

/**
 * Get trips that are active during a specific year
 */
export function getTripsForYear<T extends Trip>(trips: T[], year: number): T[] {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  return trips.filter(trip => {
    if (!trip.startDate || !trip.endDate) return false;
    const tripStart = parseDate(trip.startDate);
    const tripEnd = parseDate(trip.endDate);
    return tripStart <= yearEnd && tripEnd >= yearStart;
  });
}

/**
 * Filter trips to exclude Dream status
 */
export function filterVisibleTrips(trips: Trip[]): Trip[] {
  return trips.filter(trip => trip.status !== 'Dream');
}
