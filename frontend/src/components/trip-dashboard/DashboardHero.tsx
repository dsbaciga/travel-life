import { TripStatus, type Trip } from '../../types/trip';
import TripDayIndicator from './TripDayIndicator';
import { formatTripDates } from '../../utils/dateFormat';
import { stripMarkdown } from '../../utils/stripMarkdown';

interface DashboardHeroProps {
  trip: Trip;
  coverPhotoUrl: string | null;
  className?: string;
}

/**
 * Hero section for the Trip Dashboard.
 *
 * Displays:
 * - Trip title (large display font)
 * - Trip dates
 * - Current status badge
 * - Cover photo as background if available
 * - TripDayIndicator component for countdown/day display
 */
export default function DashboardHero({
  trip,
  coverPhotoUrl,
  className = '',
}: DashboardHeroProps) {
  const formatDateRange = (startDate: string | null, endDate: string | null): string =>
    formatTripDates(startDate, endDate);

  const getStatusBadgeClasses = (status: string): string => {
    switch (status) {
      case TripStatus.DREAM:
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
      case TripStatus.PLANNING:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
      case TripStatus.PLANNED:
        return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
      case TripStatus.IN_PROGRESS:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      case TripStatus.COMPLETED:
        return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      case TripStatus.CANCELLED:
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  // Hero with cover photo
  if (coverPhotoUrl) {
    return (
      <div
        className={`relative rounded-2xl overflow-hidden animate-fade-in ${className}`}
        style={{ minHeight: '280px' }}
      >
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${coverPhotoUrl})` }}
        />

        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

        {/* Content */}
        <div className="relative h-full flex flex-col justify-end p-6 sm:p-8">
          {/* Status badge - top */}
          <div className="absolute top-4 left-4 sm:top-6 sm:left-8">
            <span
              className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${getStatusBadgeClasses(
                trip.status
              )}`}
            >
              {trip.status}
            </span>
          </div>

          {/* Main content - bottom */}
          <div className="space-y-4">
            {/* Title */}
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white drop-shadow-lg break-words">
              {trip.title}
            </h1>

            {/* Description (if exists) */}
            {trip.description && (
              <p className="text-white/90 text-base sm:text-lg max-w-2xl line-clamp-2 drop-shadow-md">
                {stripMarkdown(trip.description)}
              </p>
            )}

            {/* Dates and day indicator row */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              {/* Dates */}
              <div className="flex items-center gap-2 text-white/80">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm sm:text-base font-medium">
                  {formatDateRange(trip.startDate, trip.endDate)}
                </span>
              </div>

              {/* Day indicator */}
              <TripDayIndicator
                status={trip.status}
                startDate={trip.startDate}
                endDate={trip.endDate}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Hero without cover photo - solid background with gradient
  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700 dark:from-navy-700 dark:to-navy-900 animate-fade-in ${className}`}
      style={{ minHeight: '240px' }}
    >
      {/* Decorative pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <svg
          className="w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <pattern
            id="hero-pattern"
            x="0"
            y="0"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="10" cy="10" r="1" fill="currentColor" />
          </pattern>
          <rect x="0" y="0" width="100" height="100" fill="url(#hero-pattern)" />
        </svg>
      </div>

      {/* Gold accent line - dark mode */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent dark:opacity-100 opacity-0" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end p-6 sm:p-8">
        {/* Status badge - top */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-8">
          <span
            className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${getStatusBadgeClasses(
              trip.status
            )}`}
          >
            {trip.status}
          </span>
        </div>

        {/* Main content - bottom */}
        <div className="space-y-4 pt-12">
          {/* Title */}
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white break-words">
            {trip.title}
          </h1>

          {/* Description (if exists) */}
          {trip.description && (
            <p className="text-white/80 text-base sm:text-lg max-w-2xl line-clamp-2">
              {stripMarkdown(trip.description)}
            </p>
          )}

          {/* Dates and day indicator row */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            {/* Dates */}
            <div className="flex items-center gap-2 text-white/70">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm sm:text-base font-medium">
                {formatDateRange(trip.startDate, trip.endDate)}
              </span>
            </div>

            {/* Day indicator - adjust colors for light background */}
            <div className="[&_.bg-purple-100]:bg-white/20 [&_.bg-blue-100]:bg-white/20 [&_.bg-sky-100]:bg-white/20 [&_.bg-amber-100]:bg-white/20 [&_.bg-green-100]:bg-white/20 [&_.bg-red-100]:bg-white/20 [&_.text-purple-600]:text-white [&_.text-blue-600]:text-white [&_.text-sky-600]:text-white [&_.text-amber-600]:text-white [&_.text-green-600]:text-white [&_.text-red-600]:text-white">
              <TripDayIndicator
                status={trip.status}
                startDate={trip.startDate}
                endDate={trip.endDate}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
