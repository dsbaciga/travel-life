/**
 * TodayModeCard
 *
 * The on-trip version of "Next up": what is happening now or comes next, with a
 * live countdown, the address, the booking number and a one-tap route, beside
 * the local and home clocks.
 *
 * Everything here is computed on the device from the lists it is given and the
 * current time, so with the network off it renders from the cached trip data
 * without a spinner or a thrown error. Trips that are not under way (planning,
 * completed, cancelled, no dated items) keep the existing NextUpCard.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import type { Location } from '../../types/location';
import type { TripStatusType } from '../../types/trip';
import entityLinkService from '../../services/entityLink.service';
import { useNow } from '../../hooks/useNow';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';
import DirectionsButton from '../DirectionsButton';
import NextUpCard from './NextUpCard';
import TodayClocks from './TodayClocks';
import {
  formatDateTimeInTimezone,
  formatTimeInTimezone,
} from '../../utils/timezone';
import { getNextUpDisplayState } from '../../utils/tripDashboardUtils';
import { formatCountdown, selectNextUp } from '../../utils/todayNextUp';
import { buildTodayItems, originPlaceFor, type TodayItem } from '../../utils/todayItems';
import type { LocationLink } from '../../utils/dayAgenda';

export interface TodayModeCardProps {
  tripId: number;
  activities: Activity[];
  transportation: Transportation[];
  lodging: Lodging[];
  locations: Location[];
  tripStatus: TripStatusType;
  tripStartDate: string | null;
  tripEndDate: string | null;
  /** The trip's own timezone as stored; resolved here, never defaulted to UTC. */
  tripTimezone: string | null;
  photosCount?: number;
  onNavigateToTab: (tabName: string) => void;
  /**
   * Called with true while the card is showing its own clocks, and false when it falls
   * back to the Next Up card or unmounts, so the dashboard can avoid a second clock.
   */
  onClocksShownChange?: (shown: boolean) => void;
}

interface TodayModeCardViewProps extends Omit<TodayModeCardProps, 'tripId'> {
  locationLinks: LocationLink[];
}

function CopyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

/** The booking number with a one-tap copy. Falls back quietly if copying is blocked. */
function ConfirmationRow({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState('idle'), 2000);
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-primary-50/60 dark:bg-navy-700/60 pl-3">
      <div className="min-w-0">
        <p className="text-xs text-slate dark:text-dusk-400">Confirmation</p>
        <p className="font-mono text-sm font-semibold text-charcoal dark:text-white break-all select-all">
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy confirmation number ${value}`}
        className="flex-none min-w-[44px] min-h-[44px] px-3 flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-primary-600 dark:text-teal-300 hover:bg-primary-100/60 dark:hover:bg-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
      >
        <CopyIcon />
        <span role="status">
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
        </span>
      </button>
    </div>
  );
}

function ItemDetails({
  item,
  items,
  badge,
  showDate,
  onOpen,
}: {
  item: TodayItem;
  items: TodayItem[];
  badge: string;
  showDate: boolean;
  onOpen: () => void;
}) {
  const when = item.start
    ? showDate
      ? formatDateTimeInTimezone(item.start, item.timezone)
      : formatTimeInTimezone(item.start, item.timezone)
    : '';
  const origin = useMemo(() => originPlaceFor(items, item), [items, item]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
        >
          <span className="block text-lg font-semibold text-charcoal dark:text-white break-words">
            {item.title}
          </span>
          {item.subtitle && (
            <span className="block text-sm text-slate dark:text-dusk-400 truncate">
              {item.subtitle}
            </span>
          )}
        </button>
        <span
          data-testid="countdown"
          className="flex-none rounded-full bg-accent-500/15 px-3 py-1 text-sm font-semibold text-accent-700 dark:text-accent-300 tabular-nums whitespace-nowrap"
        >
          {badge}
        </span>
      </div>

      <p className="text-sm text-charcoal dark:text-warm-gray">{when}</p>

      {item.address && (
        <p className="text-sm text-slate dark:text-dusk-400 break-words" data-testid="next-up-address">
          {item.address}
        </p>
      )}

      {item.confirmation && <ConfirmationRow value={item.confirmation} />}

      {item.destination && (
        <DirectionsButton
          destination={item.destination}
          origin={origin}
          variant="inline"
          className="[&>button]:w-full [&>button]:justify-center [&>button]:border [&>button]:border-primary-500/20 dark:[&>button]:border-navy-600 [&>button]:text-primary-600 dark:[&>button]:text-teal-300 [&>button]:font-medium"
        />
      )}
    </div>
  );
}

/**
 * The card without its data fetching, so it can be driven directly from props
 * (tests, or a screen that already holds the lists).
 */
export function TodayModeCardView({
  activities,
  transportation,
  lodging,
  locations,
  locationLinks,
  tripStatus,
  tripStartDate,
  tripEndDate,
  tripTimezone,
  photosCount = 0,
  onNavigateToTab,
  onClocksShownChange,
}: TodayModeCardViewProps) {
  const resolveTz = useTimezoneResolver();
  const now = useNow();

  const resolveEntityTz = useCallback(
    (entityTimezone: string | null | undefined) => resolveTz(entityTimezone, tripTimezone),
    [resolveTz, tripTimezone]
  );

  const items = useMemo(
    () =>
      buildTodayItems({
        activities,
        transportation,
        lodging,
        locations,
        locationLinks,
        resolveTimezone: resolveEntityTz,
      }),
    [activities, transportation, lodging, locations, locationLinks, resolveEntityTz]
  );

  const selection = useMemo(
    () => selectNextUp(items, now, resolveTz(tripTimezone)),
    [items, now, resolveTz, tripTimezone]
  );

  // Not under way, or nothing dated to show: the existing card already handles it.
  const displayState = getNextUpDisplayState(
    tripStatus,
    items.length > 0,
    tripStartDate,
    tripEndDate
  );
  const clocksShown = displayState === 'in_progress';
  useEffect(() => {
    onClocksShownChange?.(clocksShown);
    return () => onClocksShownChange?.(false);
  }, [clocksShown, onClocksShownChange]);

  if (displayState !== 'in_progress') {
    return (
      <NextUpCard
        activities={activities}
        transportation={transportation}
        lodging={lodging}
        tripStatus={tripStatus}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        tripTimezone={resolveTz(tripTimezone)}
        photosCount={photosCount}
        onNavigateToTab={onNavigateToTab}
      />
    );
  }

  const { current, next, nextWhen, untimedToday } = selection;
  const homeTimezone = resolveTz();
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: selection.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const nextMs = next?.start ? Date.parse(next.start) : null;
  const nextCountdown = nextMs === null ? 'now' : formatCountdown(nextMs - now.getTime());
  const nextIsToday = nextWhen === 'today';

  return (
    <section className="card animate-fade-in" aria-labelledby="today-mode-heading">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 mb-4">
        <div>
          <h3
            id="today-mode-heading"
            className="font-semibold text-lg text-charcoal dark:text-warm-gray"
          >
            {current
              ? 'Happening now'
              : nextIsToday
                ? 'Up next'
                : nextWhen === 'tomorrow'
                  ? 'Up next tomorrow'
                  : 'Today'}
          </h3>
          <p className="text-sm text-slate dark:text-dusk-400">{todayLabel}</p>
        </div>
        <TodayClocks now={now} localTimezone={selection.timezone} homeTimezone={homeTimezone} />
      </div>

      {current && (
        <ItemDetails
          item={current}
          items={items}
          badge="Now"
          showDate={false}
          onOpen={() => onNavigateToTab(current.tab)}
        />
      )}

      {!current && next && (nextIsToday || nextWhen === 'tomorrow') && (
        <>
          {nextWhen === 'tomorrow' && (
            <p className="mb-3 text-sm text-slate dark:text-warm-gray/80">
              Nothing more is scheduled today. First up tomorrow:
            </p>
          )}
          <ItemDetails
            item={next}
            items={items}
            badge={nextCountdown}
            showDate={nextWhen === 'tomorrow'}
            onOpen={() => onNavigateToTab(next.tab)}
          />
        </>
      )}

      {!current && (!next || nextWhen === 'later') && (
        <div className="py-2">
          <p className="text-sm font-medium text-charcoal dark:text-warm-gray">
            Nothing else is scheduled today.
          </p>
          {next && next.start && (
            <p className="mt-1 text-sm text-slate dark:text-dusk-400">
              Next: {next.title}, {formatDateTimeInTimezone(next.start, next.timezone)}
            </p>
          )}
        </div>
      )}

      {current && next && nextIsToday && (
        <p className="mt-4 pt-3 border-t border-primary-500/10 dark:border-navy-700 text-sm text-slate dark:text-dusk-400">
          Then: <span className="font-medium text-charcoal dark:text-warm-gray">{next.title}</span>{' '}
          {nextCountdown}
        </p>
      )}

      {untimedToday.length > 0 && (
        <p className="mt-3 text-sm text-slate dark:text-dusk-400">
          All day: {untimedToday.map((item) => item.title).join(', ')}
        </p>
      )}
    </section>
  );
}

/**
 * The card for a trip's Overview. Reads the location links with the same query
 * key as the itinerary views, which is persisted for offline use, so the
 * places behind activities and stays are there with the network off.
 */
export default function TodayModeCard({ tripId, ...rest }: TodayModeCardProps) {
  const { data: locationLinks = [] } = useQuery({
    queryKey: ['locationLinks', tripId],
    queryFn: () => entityLinkService.getLinksByTargetType(tripId, 'LOCATION'),
    enabled: tripId > 0,
  });

  return <TodayModeCardView {...rest} locationLinks={locationLinks} />;
}
