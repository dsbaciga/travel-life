import { useMemo } from 'react';
import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';
import { buildDayAgenda, tripDayKeys } from '../../utils/dayAgenda';
import { dayKeyInTimezone, formatDateOnly } from '../../utils/timezone';

interface TripDayByDayProps {
  tripStartDate: string | null;
  tripEndDate: string | null;
  tripTimezone: string | null;
  activities: Activity[];
  transportation: Transportation[];
  lodging: Lodging[];
  /** Open the Day Plan view on a day (YYYY-MM-DD). */
  onOpenDay: (dayKey: string) => void;
}

/**
 * The trip at a glance, one row per day: how many things are planned and
 * what the first of them are. Rows open that day in the Day Plan view.
 * Renders nothing for a trip without dates.
 */
export default function TripDayByDay({
  tripStartDate,
  tripEndDate,
  tripTimezone,
  activities,
  transportation,
  lodging,
  onOpenDay,
}: TripDayByDayProps) {
  const resolveTz = useTimezoneResolver();

  const rows = useMemo(() => {
    const resolveTimezone = (entityTimezone: string | null | undefined) =>
      resolveTz(entityTimezone, tripTimezone);
    return tripDayKeys(tripStartDate, tripEndDate).map((dayKey, index) => {
      // Pins are not needed here, so locations and links are left out.
      const items = buildDayAgenda({
        activities,
        transportation,
        lodging,
        locations: [],
        locationLinks: [],
        dayKey,
        resolveTimezone,
      }).filter((item) => !item.key.endsWith('-stay'));
      return { dayKey, number: index + 1, items };
    });
  }, [tripStartDate, tripEndDate, tripTimezone, activities, transportation, lodging, resolveTz]);

  if (rows.length === 0) return null;

  const todayKey = dayKeyInTimezone(new Date().toISOString(), resolveTz(tripTimezone));

  return (
    <section className="card p-0 overflow-hidden" aria-labelledby="trip-day-by-day-heading">
      <h3
        id="trip-day-by-day-heading"
        className="px-5 pt-5 pb-3 font-body font-semibold text-lg text-charcoal dark:text-warm-gray"
      >
        Day by day
      </h3>
      <ol className="max-h-[26rem] overflow-y-auto divide-y divide-primary-500/10 dark:divide-navy-700 border-t border-primary-500/10 dark:border-navy-700">
        {rows.map((row) => {
          const isToday = row.dayKey === todayKey;
          return (
            <li key={row.dayKey}>
              <button
                type="button"
                onClick={() => onOpenDay(row.dayKey)}
                className={`w-full min-h-[52px] flex items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-primary-50/60 dark:hover:bg-navy-700/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50 ${
                  isToday ? 'bg-primary-50 dark:bg-gold/10' : ''
                }`}
              >
                <span className="flex-none w-20">
                  <span
                    className={`block text-xs font-semibold ${
                      isToday ? 'text-primary-700 dark:text-gold' : 'text-slate dark:text-dusk-400'
                    }`}
                  >
                    Day {row.number}
                    {isToday && ' · today'}
                  </span>
                  <span className="block text-sm text-charcoal dark:text-white whitespace-nowrap">
                    {formatDateOnly(row.dayKey, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-sm truncate text-slate dark:text-dusk-300">
                  {row.items.length === 0
                    ? 'Nothing planned'
                    : row.items
                        .slice(0, 3)
                        .map((item) => item.title)
                        .join(' · ')}
                </span>
                {row.items.length > 0 && (
                  <span className="flex-none text-xs tabular-nums text-slate dark:text-dusk-400">
                    {row.items.length}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
