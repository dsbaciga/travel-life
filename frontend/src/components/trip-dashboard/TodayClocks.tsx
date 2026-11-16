import {
  formatClockTime,
  formatClockWeekday,
  haveSameOffset,
  zoneCityLabel,
} from '../../utils/clockZones';
import { getTimezoneAbbreviation } from '../../utils/timezone';

interface TodayClocksProps {
  /** The instant to show. Ticking is the caller's job (see `useNow`). */
  now: Date;
  /** The zone the traveller is in right now. */
  localTimezone: string;
  /** The user's own zone. */
  homeTimezone: string;
}

/**
 * The time where the traveller is, with the time at home beside it. The home
 * clock is left out while both zones read the same, since a second identical
 * time is only noise. All of it is computed from `now` on the device.
 */
export default function TodayClocks({ now, localTimezone, homeTimezone }: TodayClocksProps) {
  const showHome = !haveSameOffset(localTimezone, homeTimezone, now);
  const localWeekday = formatClockWeekday(now, localTimezone);
  const homeWeekday = formatClockWeekday(now, homeTimezone);

  return (
    <div className="flex items-end gap-5" data-testid="today-clocks">
      <div data-testid="local-clock">
        <p className="text-xs font-medium uppercase tracking-wide text-slate dark:text-dusk-400">
          Local
        </p>
        <p className="text-2xl font-display font-bold text-charcoal dark:text-white tabular-nums leading-tight">
          {formatClockTime(now, localTimezone)}
        </p>
        <p className="text-xs text-slate dark:text-dusk-400">
          {getTimezoneAbbreviation(localTimezone, now)} · {zoneCityLabel(localTimezone)}
        </p>
      </div>

      {showHome && (
        <div data-testid="home-clock" className="border-l border-primary-500/15 dark:border-navy-700 pl-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate dark:text-dusk-400">
            Home
          </p>
          <p className="text-lg font-semibold text-charcoal/80 dark:text-warm-gray/80 tabular-nums leading-tight">
            {formatClockTime(now, homeTimezone)}
            {homeWeekday !== localWeekday && (
              <span className="ml-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {homeWeekday}
              </span>
            )}
          </p>
          <p className="text-xs text-slate dark:text-dusk-400">
            {getTimezoneAbbreviation(homeTimezone, now)} · {zoneCityLabel(homeTimezone)}
          </p>
        </div>
      )}
    </div>
  );
}
