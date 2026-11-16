/**
 * RecentlyViewedWidget - The last few trips the user opened, from localStorage.
 * Reconciled against the cached trips list so deleted, archived or inaccessible
 * trips never show as dead links. Renders nothing when there is nothing to show.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import tripService from '../../services/trip.service';
import { useImmichThumbnail } from '../../hooks/useImmichThumbnail';
import { formatDateOnly } from '../../utils/timezone';
import {
  pruneRecentTrips,
  readRecentTrips,
  writeRecentTrips,
  type RecentTrip,
} from '../../utils/recentTrips';
import type { Trip } from '../../types/trip';

/** Page size of the shared trips query; a full page means the list may be truncated. */
const TRIPS_PAGE_SIZE = 50;

/** Path and source to hand to useImmichThumbnail for a trip's cover, if it has one. */
function coverSource(trip: Trip | undefined): { path: string | null; source: string | null } {
  if (!trip) return { path: null, source: null };
  if (trip.coverImagePath) {
    return { path: trip.coverImageThumbnailPath || trip.coverImagePath, source: 'local' };
  }
  const photo = trip.coverPhoto;
  if (!photo) return { path: null, source: null };
  return { path: photo.thumbnailPath || photo.localPath, source: photo.source };
}

/**
 * One row's thumbnail. A component of its own because the hook cannot be called
 * in a loop. Immich covers go through the authenticated proxy and the hook revokes
 * the object URL; the placeholder shows while loading, offline, or on failure.
 */
function TripThumb({ trip }: { trip: Trip | undefined }) {
  const { path, source } = coverSource(trip);
  const url = useImmichThumbnail(path, source);
  return url ? (
    <img src={url} alt="" loading="lazy" className="w-10 h-10 flex-none rounded-lg object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="w-10 h-10 flex-none rounded-lg bg-primary-100 dark:bg-navy-700"
    />
  );
}

function dateRange(trip: Trip | undefined): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const start = formatDateOnly(trip?.startDate, options, 'en-US');
  const end = formatDateOnly(trip?.endDate, options, 'en-US');
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? '';
}

export default function RecentlyViewedWidget() {
  const userId = useAuthStore((state) => state.user?.id);
  const [stored, setStored] = useState<RecentTrip[]>(() => (userId ? readRecentTrips(userId) : []));

  // Same key and fetch as useActiveTrip, so this shares its cache.
  const { data: trips } = useQuery({
    queryKey: ['trips', 'active-candidates'],
    queryFn: async () => {
      const response = await tripService.getTrips({ limit: TRIPS_PAGE_SIZE, sort: 'startDate-asc' });
      return response.trips;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });

  useEffect(() => {
    setStored(userId ? readRecentTrips(userId) : []);
  }, [userId]);

  const byId = useMemo(() => new Map((trips ?? []).map((trip) => [trip.id, trip])), [trips]);

  // A full page may hide trips beyond it, so only prune when the list is complete.
  const listComplete = trips !== undefined && trips.length < TRIPS_PAGE_SIZE;
  const entries = useMemo(
    () => (listComplete ? pruneRecentTrips(stored, new Set(byId.keys())) : stored),
    [stored, byId, listComplete]
  );

  useEffect(() => {
    if (userId && entries !== stored) {
      writeRecentTrips(userId, entries);
      setStored(entries);
    }
  }, [userId, entries, stored]);

  const visible = entries
    .map((entry) => ({ entry, trip: byId.get(entry.tripId) }))
    .filter(({ entry, trip }) => trip?.title || entry.title);

  if (!userId || visible.length === 0) return null;

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      className="animate-fade-in bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20"
    >
      <h3
        id="recently-viewed-heading"
        className="text-xl font-display font-bold text-gray-900 dark:text-white mb-3"
      >
        Recently viewed
      </h3>
      <ul className="space-y-1">
        {visible.map(({ entry, trip }) => {
          const dates = dateRange(trip);
          return (
            <li key={entry.tripId}>
              <Link
                to={`/trips/${entry.tripId}`}
                className="flex items-center gap-3 min-h-[44px] rounded-lg p-1 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
              >
                <TripThumb trip={trip} />
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-900 dark:text-white truncate">
                    {trip?.title ?? entry.title}
                  </span>
                  {dates && (
                    <span className="block text-sm text-gray-600 dark:text-dusk-400 truncate">
                      {dates}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
