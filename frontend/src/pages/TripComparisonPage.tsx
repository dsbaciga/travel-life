/**
 * TripComparisonPage - pick two or more trips (own and shared with you) and compare
 * them: a side-by-side table, a map with every trip colour-coded, and a timeline.
 * The selection lives in `?ids=1,2,3` so a comparison is linkable and survives reload.
 */

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import tripService from '../services/trip.service';
import collaborationService from '../services/collaboration.service';
import tripComparisonService from '../services/tripComparison.service';
import LoadingSpinner from '../components/LoadingSpinner';
import ComparisonTable from '../components/trip-comparison/ComparisonTable';
import ComparisonMap from '../components/trip-comparison/ComparisonMap';
import ComparisonTimeline from '../components/trip-comparison/ComparisonTimeline';
import { formatDateOnly } from '../utils/timezone';
import { parseIdsParam } from '../utils/tripComparison';
import { MAX_COMPARE_TRIPS, MIN_COMPARE_TRIPS } from '../types/tripComparison';
import Icon from '../components/ui/Icon';

interface PickerTrip {
  id: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  shared: boolean;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return "Couldn't load the comparison. Try again.";
}

export default function TripComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState('');

  const selectedIds = useMemo(() => parseIdsParam(searchParams.get('ids')), [searchParams]);

  const { data: pickerTrips = [], isLoading: loadingTrips } = useQuery({
    queryKey: ['trip-comparison', 'picker'],
    queryFn: async (): Promise<PickerTrip[]> => {
      const [own, shared] = await Promise.all([
        tripService.getTrips({ limit: 1000, archived: 'all', sort: 'startDate-desc' }),
        collaborationService.getSharedTrips().catch(() => []),
      ]);
      const ownIds = new Set(own.trips.map((trip) => trip.id));
      return [
        ...own.trips.map((trip) => ({
          id: trip.id,
          title: trip.title,
          startDate: trip.startDate,
          endDate: trip.endDate,
          shared: false,
        })),
        ...shared
          .filter((trip) => !ownIds.has(trip.id))
          .map((trip) => ({
            id: trip.id,
            title: trip.title,
            startDate: trip.startDate,
            endDate: trip.endDate,
            shared: true,
          })),
      ];
    },
  });

  const canCompare = selectedIds.length >= MIN_COMPARE_TRIPS;

  const {
    data: comparison,
    isLoading: loadingComparison,
    error,
  } = useQuery({
    queryKey: ['trip-comparison', selectedIds],
    queryFn: () => tripComparisonService.compare(selectedIds),
    enabled: canCompare,
    retry: false,
  });

  const toggle = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((existing) => existing !== id)
      : [...selectedIds, id];
    setSearchParams(next.length > 0 ? { ids: next.join(',') } : {}, { replace: true });
  };

  const visibleTrips = pickerTrips.filter((trip) =>
    trip.title.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const atLimit = selectedIds.length >= MAX_COMPARE_TRIPS;

  return (
    <div className="bg-cream dark:bg-navy-900 min-h-screen">
      <main className="max-w-[1600px] mx-auto px-4 py-8">
        <Link
          to="/trips"
          className="text-primary-600 dark:text-gold hover:text-primary-800 dark:hover:text-gold/80 mb-2 inline-flex items-center min-h-[44px]"
        >
          <Icon name="back" size={16} className="mr-1" />
          My trips
        </Link>
        <h1 className="text-3xl font-bold text-charcoal dark:text-warm-gray font-display">
          Compare trips
        </h1>
        <p className="mt-1 mb-6 text-slate dark:text-warm-gray/70">
          Choose {MIN_COMPARE_TRIPS} to {MAX_COMPARE_TRIPS} trips to see them side by side.
        </p>

        <section
          aria-labelledby="picker-heading"
          className="mb-8 rounded-xl border-2 border-primary-100 dark:border-gold/20 bg-white dark:bg-navy-800 p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="picker-heading" className="text-lg font-semibold text-charcoal dark:text-warm-gray">
              Trips ({selectedIds.length} selected)
            </h2>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter trips"
              aria-label="Filter trips"
              className="input w-full sm:w-64"
            />
          </div>
          {loadingTrips ? (
            <LoadingSpinner />
          ) : pickerTrips.length === 0 ? (
            <p className="text-slate dark:text-warm-gray/70">You have no trips to compare yet.</p>
          ) : (
            <ul className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
              {visibleTrips.map((trip) => {
                const checked = selectedIds.includes(trip.id);
                const disabled = !checked && atLimit;
                const dates = [formatDateOnly(trip.startDate), formatDateOnly(trip.endDate)]
                  .filter(Boolean)
                  .join(' – ');
                return (
                  <li key={trip.id}>
                    <label
                      className={`flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-parchment dark:hover:bg-navy-700 ${
                        disabled ? 'opacity-50' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(trip.id)}
                        className="mt-1"
                      />
                      <span className="text-sm text-charcoal dark:text-warm-gray">
                        <span className="font-medium">{trip.title}</span>
                        {trip.shared && (
                          <span className="ml-2 rounded bg-primary-50 dark:bg-navy-600 px-1.5 py-0.5 text-xs">
                            Shared with me
                          </span>
                        )}
                        {dates && (
                          <span className="block text-xs text-slate dark:text-warm-gray/60">{dates}</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {atLimit && (
            <p className="mt-2 text-sm text-slate dark:text-warm-gray/70">
              You can compare at most {MAX_COMPARE_TRIPS} trips at once.
            </p>
          )}
        </section>

        {!canCompare && (
          <p className="text-slate dark:text-warm-gray/70" data-testid="compare-hint">
            Select at least {MIN_COMPARE_TRIPS} trips to start comparing.
          </p>
        )}

        {canCompare && loadingComparison && <LoadingSpinner />}

        {canCompare && error && (
          <div
            role="alert"
            className="rounded-xl border-2 border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {getErrorMessage(error)}
          </div>
        )}

        {canCompare && comparison && (
          <div className="space-y-8">
            <section aria-labelledby="table-heading">
              <h2 id="table-heading" className="mb-3 text-xl font-semibold text-charcoal dark:text-warm-gray">
                Side by side
              </h2>
              <ComparisonTable comparison={comparison} />
            </section>
            <section aria-labelledby="timeline-heading">
              <h2 id="timeline-heading" className="mb-3 text-xl font-semibold text-charcoal dark:text-warm-gray">
                Timeline
              </h2>
              <ComparisonTimeline trips={comparison.trips} />
            </section>
            <section aria-labelledby="map-heading">
              <h2 id="map-heading" className="mb-3 text-xl font-semibold text-charcoal dark:text-warm-gray">
                Map
              </h2>
              <ComparisonMap comparison={comparison} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
