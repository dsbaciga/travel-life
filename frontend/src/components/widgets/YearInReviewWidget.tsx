/**
 * YearInReviewWidget - A prominent dashboard banner teasing the year's travel
 * stats with a call to action into the full Year in Review page.
 * Renders nothing when there is no dated travel to recap.
 */

import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import memoriesService from '../../services/memories.service';
import type { YearInReview } from '../../services/memories.service';

interface TeaserStat {
  value: string;
  label: string;
}

function useYearInReview(year: number) {
  return useQuery<YearInReview>({
    queryKey: ['memories', 'year-in-review', year],
    queryFn: () => memoriesService.getYearInReview(year),
    staleTime: 5 * 60 * 1000,
  });
}

function buildStats(review: YearInReview): TeaserStat[] {
  const stats: TeaserStat[] = [
    { value: String(review.tripCount), label: review.tripCount === 1 ? 'Trip' : 'Trips' },
    { value: String(review.daysTraveled), label: review.daysTraveled === 1 ? 'Day away' : 'Days away' },
    {
      value: String(review.countries.length),
      label: review.countries.length === 1 ? 'Country' : 'Countries',
    },
  ];

  // Round out the row with whichever fourth stat the year actually has
  if (review.photoCount > 0) {
    stats.push({ value: String(review.photoCount), label: review.photoCount === 1 ? 'Photo' : 'Photos' });
  } else if (review.totalDistanceKm > 0) {
    stats.push({
      value: Math.round(review.totalDistanceKm * 0.621371).toLocaleString(),
      label: 'Miles',
    });
  } else {
    stats.push({
      value: String(review.cities.length),
      label: review.cities.length === 1 ? 'City' : 'Cities',
    });
  }

  return stats;
}

interface YearInReviewBannerProps {
  review: YearInReview;
  isPastYear: boolean;
}

function YearInReviewBanner({ review, isPastYear }: YearInReviewBannerProps) {
  const stats = buildStats(review);

  return (
    <Link
      to="/year-in-review"
      // from-primary-600, not -500: this card carries white/75-white/80 label
      // text, which on primary-500 lands at 2.43:1-2.57:1.
      className="block group rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 dark:from-navy-800 dark:to-navy-900 p-6 sm:p-8 shadow-lg hover:shadow-xl border-2 border-transparent dark:border-gold/20 hover:border-accent-300 dark:hover:border-gold/50 transition-all duration-300"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Year + stats */}
        <div className="min-w-0">
          <p className="text-xs font-body font-medium uppercase tracking-widest text-white dark:text-gold mb-1">
            Year in Review
          </p>
          <div className="flex items-baseline gap-3 mb-5">
            <span className="text-4xl sm:text-5xl font-display font-bold text-white leading-none">
              {review.year}
            </span>
            <span className="text-sm text-white dark:text-warm-gray">
              {isPastYear ? 'your most recent year of travel' : 'your travels so far'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl sm:text-3xl font-display font-bold text-white leading-none">
                  {stat.value}
                </div>
                <div className="text-xs sm:text-sm text-white dark:text-warm-gray mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Call to action */}
        <div className="flex-shrink-0">
          <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-primary-600 dark:bg-gold dark:text-navy-900 font-body font-semibold shadow-md group-hover:shadow-lg group-hover:gap-3 transition-all duration-300">
            See your {review.year}
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Recaps the most recent year that has travel. Used when the current year is
 * still empty, so the banner matches the year the Year in Review page opens on.
 */
function MostRecentYearBanner({ year }: { year: number }) {
  const { data: review } = useYearInReview(year);

  if (!review || review.tripCount === 0) {
    return null;
  }

  return <YearInReviewBanner review={review} isPastYear />;
}

export default function YearInReviewWidget() {
  const currentYear = new Date().getFullYear();
  const { data: review } = useYearInReview(currentYear);

  // Still loading, errored, or no dated trips at all — show nothing
  if (!review) {
    return null;
  }

  if (review.tripCount > 0) {
    return <YearInReviewBanner review={review} isPastYear={false} />;
  }

  if (review.availableYears.length === 0) {
    return null;
  }

  return <MostRecentYearBanner year={review.availableYears[0]} />;
}
