/**
 * Trip Dashboard Components
 *
 * These components provide the Dashboard view for trips, serving as the central
 * hub for trip information with an at-a-glance view of status, upcoming events,
 * statistics, and quick navigation.
 *
 * Main Components:
 * - TripDashboard: Main container component for the dashboard layout
 * - DashboardHero: Hero section with trip title, dates, status, and cover photo (legacy)
 * - TripDayIndicator: Displays countdown/day indicator based on trip status
 * - CountdownTimerWidget: Real-time countdown display for upcoming trips
 * - LocalTimeWidget: Shows current time at destination vs home timezone
 * - NextUpCard: Shows the next upcoming event based on trip status
 * - EventPreview: Reusable component to display any event type
 * - ChecklistsWidget: Quick view of checklist progress
 * - TodaysItinerary: Today's schedule for in-progress trips
 * - RecentActivityCard: Recent changes to the trip
 * - CompanionsWidget: Trip companions with avatars
 * - MapPreviewWidget: Mini map preview with location markers
 * - WeatherForecastWidget: 5-day weather forecast
 * - FlightStatusWidget: Real-time flight status for upcoming flights
 * - BudgetSummaryWidget: Budget vs spent summary with breakdown
 */

export { default as TripDashboard } from './TripDashboard';
export { default as DashboardHero } from './DashboardHero';
export { default as TripDayIndicator } from './TripDayIndicator';
export { default as NextUpCard } from './NextUpCard';
export { default as EventPreview } from './EventPreview';
export { EventIcon } from './eventHelpers';
export { getEventTypeColors } from './eventStyles';
export { default as ChecklistsWidget } from './ChecklistsWidget';
export { default as TodaysItinerary } from './TodaysItinerary';
export { default as RecentActivityCard } from './RecentActivityCard';
export { default as ActivityItem } from './ActivityItem';
export { default as CompanionsWidget } from './CompanionsWidget';
export { default as CountdownTimerWidget } from './CountdownTimerWidget';
export { default as LocalTimeWidget } from './LocalTimeWidget';
export { default as MapPreviewWidget } from './MapPreviewWidget';
export { default as WeatherForecastWidget } from './WeatherForecastWidget';
export { default as FlightStatusWidget } from './FlightStatusWidget';
export { default as BudgetSummaryWidget } from './BudgetSummaryWidget';
