import { useMemo } from 'react';
import type { TripComparisonTrip } from '../../types/tripComparison';
import { buildTimelineLayout, tripColor } from '../../utils/tripComparison';
import { formatDateOnly } from '../../utils/timezone';

interface ComparisonTimelineProps {
  trips: TripComparisonTrip[];
}

/**
 * One bar per trip on a shared date axis, so overlaps and gaps are visible.
 * Dates are date-only values: they are positioned and labelled in UTC, never
 * converted to a local zone.
 */
export default function ComparisonTimeline({ trips }: ComparisonTimelineProps) {
  const layout = useMemo(() => buildTimelineLayout(trips), [trips]);
  const indexById = useMemo(() => new Map(trips.map((trip, i) => [trip.id, i])), [trips]);
  const tripById = useMemo(() => new Map(trips.map((trip) => [trip.id, trip])), [trips]);

  if (!layout) {
    return (
      <p className="rounded-xl border-2 border-primary-100 dark:border-gold/20 bg-white dark:bg-navy-800 p-6 text-center text-slate dark:text-warm-gray/70">
        None of these trips have both a start and an end date, so there is nothing to place on a timeline.
      </p>
    );
  }

  const barById = new Map(layout.bars.map((bar) => [bar.id, bar]));

  return (
    <div className="rounded-xl border-2 border-primary-100 dark:border-gold/20 bg-white dark:bg-navy-800 p-4">
      <div className="overflow-x-auto">
        <div className="min-w-[36rem]" data-testid="comparison-timeline">
          <ul className="space-y-2">
            {trips.map((trip, index) => {
              const bar = barById.get(trip.id);
              return (
                <li key={trip.id} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-charcoal dark:text-warm-gray" title={trip.title}>
                    {index + 1}. {trip.title}
                  </span>
                  <div className="relative h-6 flex-1 rounded bg-parchment dark:bg-navy-700">
                    {bar ? (
                      <div
                        className="absolute top-0 h-6 rounded border border-white/80 ring-1 ring-black/40"
                        style={{
                          left: `${bar.left}%`,
                          width: `${bar.width}%`,
                          backgroundColor: tripColor(index).fill,
                        }}
                        role="img"
                        aria-label={`${trip.title}: ${formatDateOnly(trip.startDate)} to ${formatDateOnly(trip.endDate)}`}
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center px-2 text-xs text-slate/70 dark:text-warm-gray/60">
                        No dates
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-start gap-3">
            <span className="w-32 shrink-0" aria-hidden="true" />
            <div className="relative h-5 flex-1 border-t border-slate/30 dark:border-warm-gray/30">
              {layout.ticks.map((tick, i) => (
                <span
                  key={tick.date}
                  className={`absolute top-1 whitespace-nowrap text-xs text-slate dark:text-warm-gray/70 ${
                    i === 0 ? '' : i === layout.ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                  }`}
                  style={{ left: `${tick.left}%` }}
                >
                  {formatDateOnly(tick.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm text-charcoal dark:text-warm-gray" data-testid="timeline-summary">
        {layout.overlaps.length === 0 ? (
          <p>No two of these trips overlap.</p>
        ) : (
          <div>
            <p className="font-medium">Overlapping trips</p>
            <ul className="list-disc pl-5">
              {layout.overlaps.map(([a, b]) => (
                <li key={`${a}-${b}`}>
                  {(indexById.get(a) ?? 0) + 1}. {tripById.get(a)?.title} and {(indexById.get(b) ?? 0) + 1}.{' '}
                  {tripById.get(b)?.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
