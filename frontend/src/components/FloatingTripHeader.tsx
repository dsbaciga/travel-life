import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatTripDates, getTripDateStatus } from '../utils/dateFormat';
import type { Trip } from '../types/trip';

interface FloatingTripHeaderProps {
  trip: Trip;
  observeRef: React.RefObject<HTMLElement | null>;
}

/**
 * Floating context bar that appears when the main trip header scrolls out of view.
 * Shows trip name, dates, and countdown status.
 */
export default function FloatingTripHeader({ trip, observeRef }: FloatingTripHeaderProps) {
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Create intersection observer
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        // Show floating header when the main header is NOT visible
        setIsVisible(!entry.isIntersecting);
      },
      {
        // Trigger when header completely leaves viewport
        threshold: 0,
        // Use mobile navbar height (64px/h-16) as minimum to ensure no gap
        // On desktop (80px/h-20), floating header appears 16px early which is preferable
        rootMargin: '-64px 0px 0px 0px',
      }
    );

    // Start observing
    if (observeRef.current) {
      observerRef.current.observe(observeRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [observeRef]);

  // Don't render if not visible
  if (!isVisible) return null;

  const dateStatus = getTripDateStatus(trip.startDate, trip.endDate);
  const isActive = dateStatus?.includes('progress') || dateStatus?.includes('today');

  return (
    <div
      className="fixed top-16 sm:top-20 left-0 right-0 z-30 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 shadow-md transform animate-slide-in-down"
      role="banner"
      aria-label="Trip quick info"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Trip info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">
              {trip.title}
            </h2>
            {trip.tripType && (
              <span className="hidden sm:inline text-xs px-2 py-0.5 rounded bg-primary-100/80 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 whitespace-nowrap">
                {trip.tripTypeEmoji && <span className="mr-1">{trip.tripTypeEmoji}</span>}
                {trip.tripType}
              </span>
            )}
            <span className="hidden sm:inline-block h-4 w-px bg-gray-300 dark:bg-gray-600" />
            <span className="hidden sm:inline text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              {formatTripDates(trip.startDate, trip.endDate)}
            </span>
            {dateStatus && (
              <>
                <span className="hidden md:inline-block h-4 w-px bg-gray-300 dark:bg-gray-600" />
                <span
                  className={`hidden md:inline text-xs sm:text-sm ${
                    isActive
                      ? 'text-green-600 dark:text-green-400 font-medium'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {dateStatus}
                </span>
              </>
            )}
          </div>

          {/* Right: Edit button */}
          <Link
            to={`/trips/${trip.id}/edit`}
            className="flex-shrink-0 px-3 py-1.5 text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
          >
            Edit
          </Link>
        </div>
      </div>
    </div>
  );
}
