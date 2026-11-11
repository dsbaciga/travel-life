/**
 * YearInReviewPage - A shareable-looking recap of a calendar year of travel:
 * hero stats, a month-by-month travel bar, highlight photos, the year's
 * trips, and a map of the places visited that year.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import memoriesService from '../services/memories.service';
import type { YearInReview } from '../services/memories.service';
import locationService from '../services/location.service';
import transportationService from '../services/transportation.service';
import { useImmichThumbnailCache } from '../hooks/useImmichThumbnail';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import PlacesVisitedMapContainer from '../components/PlacesVisitedMapContainer';
import 'leaflet/dist/leaflet.css';
import '../utils/mapUtils'; // Runs the leaflet icon setup
import { formatTripDates } from '../utils/dateFormat';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  Dream: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  Planning: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  Planned: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
  'In Progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  Completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  Cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  gradient: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, subtext, gradient, icon }: StatCardProps) {
  return (
    <div className="p-4 rounded-xl bg-white dark:bg-navy-800 shadow-md border-2 border-primary-100 dark:border-gold/20 hover:shadow-lg transition-shadow duration-300">
      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md mb-3`}>
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          {icon}
        </svg>
      </div>
      <div className="text-2xl sm:text-3xl font-display font-bold text-gray-900 dark:text-white leading-none">
        {value}
      </div>
      {subtext && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtext}</div>}
      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium mt-1">{label}</div>
    </div>
  );
}

export default function YearInReviewPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? currentYear;
  const [includePlanning, setIncludePlanning] = useState(false);

  const { data: review, isLoading, isError } = useQuery<YearInReview>({
    queryKey: ['memories', 'year-in-review', year, includePlanning],
    queryFn: () => memoriesService.getYearInReview(year, includePlanning),
    staleTime: 5 * 60 * 1000,
  });

  // Default to the latest year that has data when the current year is empty
  useEffect(() => {
    if (
      selectedYear === null &&
      review &&
      review.tripCount === 0 &&
      review.availableYears.length > 0
    ) {
      setSelectedYear(review.availableYears[0]);
    }
  }, [review, selectedYear]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>(review?.availableYears ?? []);
    years.add(year);
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [review, year, currentYear]);

  // Highlight photo thumbnails (handles Immich auth via blob URLs)
  const { cache, loadThumbnails } = useImmichThumbnailCache();
  const highlightPhotos = review?.highlightPhotos ?? [];
  useEffect(() => {
    if (highlightPhotos.length > 0) {
      loadThumbnails(highlightPhotos);
    }
    // loadThumbnails is recreated each render; keying on the photos is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightPhotos]);

  // Map data: reuse the Places Visited data sources, scoped to this year's trips
  const tripIds = useMemo(() => new Set((review?.trips ?? []).map((t) => t.id)), [review]);
  const { data: mapData } = useQuery({
    queryKey: ['memories', 'year-in-review-map'],
    queryFn: async () => {
      const [locations, transportation] = await Promise.all([
        locationService.getAllVisitedLocations(),
        transportationService.getAllTransportation(),
      ]);
      return { locations, transportation };
    },
    enabled: !!review && review.tripCount > 0,
    staleTime: 5 * 60 * 1000,
  });

  const yearLocations = useMemo(
    () =>
      (mapData?.locations ?? []).filter(
        (loc) => tripIds.has(loc.tripId) && loc.latitude != null && loc.longitude != null
      ),
    [mapData, tripIds]
  );
  const yearTransportation = useMemo(
    () => (mapData?.transportation ?? []).filter((t) => tripIds.has(t.tripId)),
    [mapData, tripIds]
  );

  const maxMonthlyDays = Math.max(1, ...(review?.monthlyTripDays ?? [0]));
  const distanceMiles = (review?.totalDistanceKm ?? 0) * 0.621371;

  const hasAnyData = !!review && (review.tripCount > 0 || review.availableYears.length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-parchment dark:from-navy-900 dark:to-navy-800">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="mb-8 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-accent-500 dark:text-gold mb-2">
                Year in Review
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-primary-600 dark:text-sky tracking-tight leading-none">
                {year}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePlanning}
                  onChange={(e) => setIncludePlanning(e.target.checked)}
                  className="w-4 h-4 rounded border-primary-200 dark:border-gold/30 text-primary-600 dark:text-gold focus:ring-primary-500 dark:focus:ring-gold/50"
                />
                Include trips still being planned
              </label>
              <label htmlFor="year-select" className="sr-only">
                Select year
              </label>
              <select
                id="year-select"
                value={year}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-4 py-2.5 rounded-lg border-2 border-primary-100 dark:border-gold/20 bg-white dark:bg-navy-800 text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-gold/50"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {isLoading && <LoadingSpinner.FullPage message="Building your year in review…" />}

        {isError && (
          <EmptyState
            icon="⚠️"
            message="Could not load your year in review"
            subMessage="Please try again in a moment"
          />
        )}

        {review && !isLoading && review.tripCount === 0 && (
          <EmptyState
            icon="🧳"
            message={`No travel recorded in ${year}`}
            subMessage={
              hasAnyData
                ? 'Pick another year above to relive your adventures'
                : 'Add dates to your trips and they will show up here'
            }
            actionLabel="Go to Trips"
            actionHref="/trips"
          />
        )}

        {review && !isLoading && review.tripCount > 0 && (
          <div className="space-y-8">
            {/* Hero stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 animate-fade-in">
              <StatCard
                label={review.tripCount === 1 ? 'Trip' : 'Trips'}
                value={review.tripCount.toLocaleString()}
                gradient="from-blue-500 to-blue-600"
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
              />
              <StatCard
                label="Days Traveled"
                value={review.daysTraveled.toLocaleString()}
                gradient="from-amber-500 to-orange-600"
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
              />
              <StatCard
                label={review.countries.length === 1 ? 'Country' : 'Countries'}
                value={review.countries.length.toLocaleString()}
                gradient="from-green-500 to-emerald-600"
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />}
              />
              <StatCard
                label={review.cities.length === 1 ? 'City' : 'Cities'}
                value={review.cities.length.toLocaleString()}
                gradient="from-teal-500 to-cyan-600"
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />}
              />
              <StatCard
                label="Traveled"
                value={`${review.totalDistanceKm.toLocaleString()} km`}
                subtext={`${Math.round(distanceMiles).toLocaleString()} mi · ${review.flightCount} flight${review.flightCount !== 1 ? 's' : ''}`}
                gradient="from-cyan-500 to-blue-600"
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />}
              />
              <StatCard
                label="Photos"
                value={review.photoCount.toLocaleString()}
                subtext={`${review.journalEntryCount} journal entr${review.journalEntryCount !== 1 ? 'ies' : 'y'}`}
                gradient="from-pink-500 to-rose-600"
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />}
              />
            </div>

            {/* Top tags */}
            {review.topTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 animate-fade-in">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Top tags:</span>
                {review.topTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300"
                    style={
                      tag.color
                        ? { backgroundColor: tag.color, color: tag.textColor ?? undefined }
                        : undefined
                    }
                  >
                    {tag.name}
                    <span className="opacity-70">×{tag.tripCount}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Month-by-month travel bar */}
            <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 shadow-lg border-2 border-primary-100 dark:border-gold/20 animate-fade-in">
              <h2 className="text-xl font-display font-bold text-gray-900 dark:text-white mb-4">
                Travel by Month
              </h2>
              <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-end h-32">
                {review.monthlyTripDays.map((days, index) => (
                  <div key={MONTH_LABELS[index]} className="flex flex-col items-center justify-end h-full gap-1">
                    <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                      {days > 0 ? days : ''}
                    </span>
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        days > 0
                          ? 'bg-gradient-to-t from-primary-600 to-accent-400 dark:from-accent-600 dark:to-gold'
                          : 'bg-gray-100 dark:bg-navy-900/40'
                      }`}
                      style={{ height: days > 0 ? `${Math.max(8, (days / maxMonthlyDays) * 100)}%` : '4px' }}
                      title={`${MONTH_LABELS[index]}: ${days} travel day${days !== 1 ? 's' : ''}`}
                    />
                    <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">
                      {MONTH_LABELS[index]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Highlight photos */}
            {highlightPhotos.length > 0 && (
              <div className="animate-fade-in">
                <h2 className="text-xl font-display font-bold text-gray-900 dark:text-white mb-4">
                  Highlights
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {highlightPhotos.map((photo) => {
                    const url = cache[photo.id] ?? null;
                    const takenLabel = photo.takenAt
                      ? new Date(photo.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : null;
                    return (
                      <Link
                        key={photo.id}
                        to={`/trips/${photo.tripId}`}
                        className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-navy-900/50 group shadow-md hover:shadow-lg transition-shadow"
                      >
                        {url ? (
                          <img
                            src={url}
                            alt={photo.caption || `Photo from ${photo.tripTitle}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-xs font-medium truncate">
                            {takenLabel ? `${takenLabel} · ` : ''}
                            {photo.tripTitle}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Places visited map */}
            {yearLocations.length > 0 && (
              <div className="animate-fade-in">
                <h2 className="text-xl font-display font-bold text-gray-900 dark:text-white mb-4">
                  Where You Went
                </h2>
                <div className="h-[420px] rounded-2xl overflow-hidden shadow-lg border-2 border-primary-100 dark:border-gold/20 relative z-0">
                  <PlacesVisitedMapContainer
                    locations={yearLocations}
                    transportation={yearTransportation}
                  />
                </div>
              </div>
            )}

            {/* The year's trips */}
            <div className="animate-fade-in">
              <h2 className="text-xl font-display font-bold text-gray-900 dark:text-white mb-4">
                {year} Trips
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {review.trips.map((trip) => (
                  <Link
                    key={trip.id}
                    to={`/trips/${trip.id}`}
                    className="block bg-white dark:bg-navy-800 rounded-2xl p-4 shadow-md border-2 border-primary-100 dark:border-gold/20 hover:shadow-lg hover:border-accent-400 dark:hover:border-accent-400 transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-3">
                      <TripCoverThumb
                        photo={trip.coverPhoto}
                        emoji={trip.tripTypeEmoji}
                        title={trip.title}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display font-bold text-gray-900 dark:text-white truncate group-hover:text-primary-600 dark:group-hover:text-gold transition-colors">
                          {trip.title}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {formatTripDates(trip.startDate, trip.endDate)}
                        </p>
                        <span
                          className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            STATUS_BADGE_CLASSES[trip.status] ??
                            'bg-gray-100 text-gray-700 dark:bg-navy-700 dark:text-gray-300'
                          }`}
                        >
                          {trip.status}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TripCoverThumb({
  photo,
  emoji,
  title,
}: {
  photo: { id: number; source: string; thumbnailPath: string | null; localPath: string | null } | null;
  emoji: string | null;
  title: string;
}) {
  const { cache, loadThumbnail } = useImmichThumbnailCache();

  useEffect(() => {
    if (photo) {
      loadThumbnail(photo.id, photo.thumbnailPath, photo.source);
    }
    // loadThumbnail is recreated each render; keying on the photo is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  const url = photo ? cache[photo.id] ?? null : null;

  return (
    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-primary-100 to-primary-200 dark:from-navy-900/60 dark:to-navy-700/60 flex items-center justify-center flex-shrink-0">
      {url ? (
        <img src={url} alt={`Cover for ${title}`} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <span className="text-2xl" aria-hidden="true">
          {emoji || '🧭'}
        </span>
      )}
    </div>
  );
}
