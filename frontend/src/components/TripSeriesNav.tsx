import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import tripSeriesService from '../services/tripSeries.service';

interface TripSeriesNavProps {
  tripId: number;
  seriesId: number;
  seriesName: string;
}

/**
 * Previous/Next navigation for trips within a series.
 * Shows on TripDetailPage when the trip belongs to a series.
 */
export default function TripSeriesNav({ tripId, seriesId, seriesName }: TripSeriesNavProps) {
  const { data: series, isLoading } = useQuery({
    queryKey: ['tripSeries', seriesId],
    queryFn: () => tripSeriesService.getById(seriesId),
    enabled: !!seriesId,
  });

  if (isLoading || !series?.trips || series.trips.length <= 1) {
    return null;
  }

  // Sort trips by series order
  const sortedTrips = [...series.trips].sort((a, b) => {
    const orderA = a.seriesOrder ?? 0;
    const orderB = b.seriesOrder ?? 0;
    return orderA - orderB;
  });

  const currentIndex = sortedTrips.findIndex((t) => t.id === tripId);
  if (currentIndex === -1) return null;

  const prevTrip = currentIndex > 0 ? sortedTrips[currentIndex - 1] : null;
  const nextTrip = currentIndex < sortedTrips.length - 1 ? sortedTrips[currentIndex + 1] : null;
  const currentPosition = currentIndex + 1;
  const totalTrips = sortedTrips.length;

  return (
    <div className="bg-white dark:bg-dusk-800 border border-gray-200 dark:border-dusk-700 rounded-lg shadow-sm mb-4">
      <div className="px-4 py-3">
        {/* Series name and position */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <Link
            to={`/trip-series/${seriesId}`}
            className="text-sm font-body font-medium text-primary-600 dark:text-gold hover:underline"
          >
            📚 {seriesName}
          </Link>
          <span className="text-xs text-slate dark:text-warm-gray/70">
            Trip {currentPosition} of {totalTrips}
          </span>
        </div>

        {/* Prev / Position dots / Next */}
        <div className="flex items-center justify-between gap-4">
          {/* Previous */}
          <div className="flex-1 min-w-0">
            {prevTrip ? (
              <Link
                to={`/trips/${prevTrip.id}`}
                className="group flex items-center gap-2 text-sm text-slate dark:text-warm-gray hover:text-primary-600 dark:hover:text-gold transition-colors"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0 group-hover:-translate-x-0.5 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="truncate font-body">{prevTrip.title}</span>
              </Link>
            ) : (
              <div />
            )}
          </div>

          {/* Position indicator dots */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {sortedTrips.map((t, i) => (
              <div
                key={t.id}
                className={`rounded-full transition-all ${
                  i === currentIndex
                    ? 'w-2.5 h-2.5 bg-primary-500 dark:bg-gold'
                    : 'w-1.5 h-1.5 bg-gray-300 dark:bg-dusk-600'
                }`}
                title={t.title}
              />
            ))}
          </div>

          {/* Next */}
          <div className="flex-1 min-w-0 text-right">
            {nextTrip ? (
              <Link
                to={`/trips/${nextTrip.id}`}
                className="group inline-flex items-center gap-2 text-sm text-slate dark:text-warm-gray hover:text-primary-600 dark:hover:text-gold transition-colors"
              >
                <span className="truncate font-body">{nextTrip.title}</span>
                <svg
                  className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
