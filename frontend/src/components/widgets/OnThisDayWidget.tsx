/**
 * OnThisDayWidget - Resurfaces memories from this date in prior years:
 * trips that were underway, photos taken, and journal entries written.
 * Renders nothing when there are no memories for today.
 */

import Icon from '../ui/Icon';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import memoriesService from '../../services/memories.service';
import type { MemoryPhoto, OnThisDayYear } from '../../services/memories.service';
import { useImmichThumbnailCache } from '../../hooks/useImmichThumbnail';
import { formatDateOnly } from '../../utils/timezone';

function yearsAgoLabel(year: number): string {
  const diff = new Date().getFullYear() - year;
  return diff === 1 ? '1 year ago' : `${diff} years ago`;
}

function formatTripDates(startDate: string | null, endDate: string | null): string {
  // Trip dates are calendar dates — see formatDateOnly for why these stay UTC.
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const start = formatDateOnly(startDate, options, 'en-US');
  const end = formatDateOnly(endDate, options, 'en-US');
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? '';
}

export default function OnThisDayWidget() {
  const { data: memories } = useQuery<OnThisDayYear[]>({
    queryKey: ['memories', 'on-this-day'],
    queryFn: () => memoriesService.getOnThisDay(),
    staleTime: 60 * 60 * 1000, // Memories only change once a day
  });

  const allPhotos = useMemo<MemoryPhoto[]>(
    () => (memories ?? []).flatMap((group) => group.photos),
    [memories]
  );

  const { cache, loadThumbnails } = useImmichThumbnailCache();

  useEffect(() => {
    if (allPhotos.length > 0) {
      loadThumbnails(allPhotos);
    }
    // loadThumbnails is recreated each render; keying on the photos is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPhotos]);

  // Render nothing while loading, on error, or when there are no memories
  if (!memories || memories.length === 0) {
    return null;
  }

  const todayLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <div className="animate-fade-in bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20 hover:shadow-xl transition-shadow duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Icon name="history" className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white">
            On this day
          </h3>
          <p className="text-xs text-gray-500 dark:text-dusk-400">{todayLabel}, in years past</p>
        </div>
      </div>

      {/* Year groups */}
      <div className="space-y-6">
        {memories.map((group) => (
          <div key={group.year}>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-lg font-display font-bold text-primary-600 dark:text-gold">
                {group.year}
              </span>
              <span className="text-xs text-gray-500 dark:text-dusk-400">
                {yearsAgoLabel(group.year)}
              </span>
            </div>

            {/* Trips underway on this day */}
            {group.trips.length > 0 && (
              <div className="space-y-2 mb-3">
                {group.trips.map((trip) => (
                  <Link
                    key={trip.id}
                    to={`/trips/${trip.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-navy-900/50 dark:to-navy-900/30 hover:from-primary-50 hover:to-primary-100 dark:hover:from-navy-700/60 dark:hover:to-navy-700/40 transition-colors group"
                  >
                    <span className="text-2xl flex-shrink-0" aria-hidden="true">
                      {trip.tripTypeEmoji || <Icon name="trip" size={24} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-gold transition-colors">
                        You were on “{trip.title}”
                      </p>
                      <p className="text-xs text-gray-500 dark:text-dusk-400">
                        {formatTripDates(trip.startDate, trip.endDate)}
                      </p>
                    </div>
                    <Icon name="chevronRight" className="w-4 h-4 text-gray-400 dark:text-dusk-400 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {/* Photos taken on this day */}
            {group.photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
                {group.photos.map((photo) => {
                  const url = cache[photo.id] ?? null;
                  return (
                    <Link
                      key={photo.id}
                      to={`/trips/${photo.tripId}`}
                      className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-navy-900/50 hover:ring-2 hover:ring-accent-500 transition-all"
                      title={photo.caption || photo.tripTitle}
                    >
                      {url ? (
                        <img
                          src={url}
                          alt={photo.caption || `Photo from ${photo.tripTitle}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon name="photo" className="w-6 h-6 text-gray-300 dark:text-dusk-600" />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Journal entries written on this day */}
            {group.journalEntries.length > 0 && (
              <div className="space-y-2">
                {group.journalEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    to={`/trips/${entry.tripId}`}
                    className="block p-3 rounded-xl border border-primary-100 dark:border-navy-700 bg-primary-50/50 dark:bg-navy-900/30 hover:border-accent-400 dark:hover:border-accent-400 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {entry.title || 'Journal entry'}
                      <span className="font-normal text-gray-500 dark:text-dusk-400"> · {entry.tripTitle}</span>
                    </p>
                    <p className="text-xs text-gray-600 dark:text-dusk-400 line-clamp-2 mt-1 italic">
                      “{entry.excerpt}”
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
