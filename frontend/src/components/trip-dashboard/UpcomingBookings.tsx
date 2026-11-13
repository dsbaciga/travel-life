import { useMemo } from 'react';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import { nextBookings } from '../../utils/nextBookings';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';
import { formatDateTimeInTimezone } from '../../utils/timezone';

interface UpcomingBookingsProps {
  transportation: Transportation[];
  lodging: Lodging[];
  tripTimezone: string | null;
  /** Open the tab that holds a booking. */
  onOpenTab: (tab: 'transportation' | 'lodging') => void;
  /** How many to show. */
  limit?: number;
}

/**
 * Next bookings on the trip Overview: the upcoming transport legs and stays,
 * each shown in its own timezone. Renders nothing when none are ahead.
 */
export default function UpcomingBookings({
  transportation,
  lodging,
  tripTimezone,
  onOpenTab,
  limit = 3,
}: UpcomingBookingsProps) {
  const resolveTz = useTimezoneResolver();

  const rows = useMemo(
    () =>
      nextBookings(
        transportation,
        lodging,
        (entityTimezone) => resolveTz(entityTimezone, tripTimezone),
        limit
      ),
    [transportation, lodging, tripTimezone, limit, resolveTz]
  );

  if (rows.length === 0) return null;

  return (
    <section className="card p-0 overflow-hidden" aria-labelledby="upcoming-bookings-heading">
      <h3
        id="upcoming-bookings-heading"
        className="px-5 pt-5 pb-3 font-body font-semibold text-lg text-charcoal dark:text-warm-gray"
      >
        Next bookings
      </h3>
      <ul className="divide-y divide-primary-500/10 dark:divide-navy-700 border-t border-primary-500/10 dark:border-navy-700">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => onOpenTab(row.tab)}
              className="w-full min-h-[56px] px-5 py-2.5 text-left transition-colors hover:bg-primary-50/60 dark:hover:bg-navy-700/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
            >
              <span className="block font-medium text-charcoal dark:text-white truncate">
                {row.title}
              </span>
              <span className="block text-sm text-slate dark:text-dusk-400 truncate">
                {formatDateTimeInTimezone(row.at, row.timezone)}
                {row.detail && ` · ${row.detail}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
