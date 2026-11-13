import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import entityLinkService from '../../services/entityLink.service';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';
import { buildDayAgenda, tripDayKeys, type AgendaItem } from '../../utils/dayAgenda';
import { dayKeyInTimezone, formatDateOnly } from '../../utils/timezone';
import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import type { Location } from '../../types/location';
import AgendaList from './AgendaList';
import AgendaMap from './AgendaMap';

interface ItineraryDayViewProps {
  tripId: number;
  tripStartDate: string | null;
  tripEndDate: string | null;
  tripTimezone: string | null;
  activities: Activity[];
  transportation: Transportation[];
  lodging: Lodging[];
  locations: Location[];
  /** Day to open on (YYYY-MM-DD), e.g. when arriving from the Overview. */
  initialDay?: string | null;
  /** Open one of the trip's editing tabs. */
  onOpenTab: (tab: 'activities' | 'transportation' | 'lodging' | 'unscheduled') => void;
}

interface UnscheduledRow {
  key: string;
  title: string;
  kind: string;
}

/**
 * One day of a trip as a numbered list beside a map. Pick a day, and the
 * list and the pins share numbers. Below `lg` the list and the map are
 * alternatives behind a List / Map switch rather than stacked, so neither
 * is squeezed.
 */
export default function ItineraryDayView({
  tripId,
  tripStartDate,
  tripEndDate,
  tripTimezone,
  activities,
  transportation,
  lodging,
  locations,
  initialDay,
  onOpenTab,
}: ItineraryDayViewProps) {
  const resolveTz = useTimezoneResolver();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'list' | 'map'>('list');

  const { data: locationLinks = [] } = useQuery({
    queryKey: ['locationLinks', tripId],
    queryFn: () => entityLinkService.getLinksByTargetType(tripId, 'LOCATION'),
  });

  const resolveEntityTz = useMemo(
    () => (entityTimezone: string | null | undefined) => resolveTz(entityTimezone, tripTimezone),
    [resolveTz, tripTimezone]
  );

  // The trip's own date range, widened by any item scheduled outside it so
  // nothing is unreachable. A trip with no dates still gets its item days.
  const days = useMemo(() => {
    const keys = new Set(tripDayKeys(tripStartDate, tripEndDate));
    const add = (iso: string | null, timezone: string | null) => {
      const key = dayKeyInTimezone(iso, resolveEntityTz(timezone));
      if (key) keys.add(key);
    };
    activities.forEach((item) => add(item.startTime, item.timezone));
    transportation.forEach((item) => add(item.departureTime, item.startTimezone));
    lodging.forEach((item) => {
      add(item.checkInDate, item.timezone);
      add(item.checkOutDate, item.timezone);
    });
    return [...keys].sort();
  }, [tripStartDate, tripEndDate, activities, transportation, lodging, resolveEntityTz]);

  const todayKey = dayKeyInTimezone(new Date().toISOString(), resolveTz(tripTimezone));
  const [chosenDay, setChosenDay] = useState<string | null>(initialDay ?? null);
  useEffect(() => {
    if (initialDay) setChosenDay(initialDay);
  }, [initialDay]);

  const day =
    chosenDay && days.includes(chosenDay)
      ? chosenDay
      : todayKey && days.includes(todayKey)
        ? todayKey
        : (days[0] ?? null);

  const agenda = useMemo<AgendaItem[]>(
    () =>
      day
        ? buildDayAgenda({
            activities,
            transportation,
            lodging,
            locations,
            locationLinks,
            dayKey: day,
            resolveTimezone: resolveEntityTz,
          })
        : [],
    [day, activities, transportation, lodging, locations, locationLinks, resolveEntityTz]
  );

  const unscheduled = useMemo<UnscheduledRow[]>(
    () => [
      ...activities
        .filter((item) => !item.startTime && !item.allDay)
        .map((item) => ({ key: `a-${item.id}`, title: item.name, kind: 'Activity' })),
      ...transportation
        .filter((item) => !item.departureTime)
        .map((item) => ({
          key: `t-${item.id}`,
          title:
            [item.fromLocation?.name || item.fromLocationName, item.toLocation?.name || item.toLocationName]
              .filter(Boolean)
              .join(' to ') || 'Transport',
          kind: 'Transport',
        })),
      ...lodging
        .filter((item) => !item.checkInDate)
        .map((item) => ({ key: `l-${item.id}`, title: item.name, kind: 'Stay' })),
    ],
    [activities, transportation, lodging]
  );

  // Keep the chosen day's chip in view when it changes from outside.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [day]);

  if (days.length === 0) {
    return (
      <p className="py-8 text-center text-slate dark:text-dusk-400">
        This trip has no dates and nothing scheduled yet. Set the trip dates, or give an
        activity a time, and its days will appear here.
      </p>
    );
  }

  const firstDay = tripDayKeys(tripStartDate, tripEndDate)[0] ?? days[0];
  const dayNumber = (key: string) =>
    Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / 86_400_000) + 1;

  return (
    <div>
      <div
        ref={stripRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-4"
        role="group"
        aria-label="Choose a day"
      >
        {days.map((key) => {
          const selected = key === day;
          const number = dayNumber(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setChosenDay(key);
                setActiveKey(null);
              }}
              className={`flex-none min-h-[44px] min-w-[4.5rem] px-3 py-1.5 rounded-lg border text-left transition-colors ${
                selected
                  ? 'border-primary-500 dark:border-gold bg-primary-50 dark:bg-gold/10'
                  : 'border-primary-500/15 dark:border-navy-700 hover:bg-primary-50/60 dark:hover:bg-navy-700/60'
              }`}
            >
              <span
                className={`block text-xs font-semibold ${
                  selected ? 'text-primary-700 dark:text-gold' : 'text-slate dark:text-dusk-400'
                }`}
              >
                {number >= 1 ? `Day ${number}` : 'Before'}
                {key === todayKey && ' · today'}
              </span>
              <span className="block text-sm font-medium text-charcoal dark:text-white whitespace-nowrap">
                {formatDateOnly(key, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="lg:hidden inline-flex rounded-lg border border-primary-500/15 dark:border-navy-700 p-0.5 mb-3"
        role="group"
        aria-label="Show"
      >
        {(['list', 'map'] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            aria-pressed={mobilePane === pane}
            onClick={() => setMobilePane(pane)}
            className={`min-h-[40px] px-4 text-sm font-medium rounded-md capitalize transition-colors ${
              mobilePane === pane
                ? 'bg-primary-50 dark:bg-navy-700 text-primary-700 dark:text-white'
                : 'text-slate dark:text-dusk-400'
            }`}
          >
            {pane}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-6">
        <div className={mobilePane === 'list' ? '' : 'hidden lg:block'}>
          <AgendaList
            items={agenda}
            activeKey={activeKey}
            onActiveChange={setActiveKey}
            onOpen={(item) => onOpenTab(item.tab)}
          />

          {unscheduled.length > 0 && (
            <section className="mt-6" aria-labelledby="itinerary-unscheduled-heading">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h3
                  id="itinerary-unscheduled-heading"
                  className="text-sm font-semibold text-charcoal dark:text-warm-gray"
                >
                  Not scheduled yet ({unscheduled.length})
                </h3>
                <button
                  type="button"
                  onClick={() => onOpenTab('unscheduled')}
                  className="min-h-[44px] px-2 text-sm font-medium text-primary-600 dark:text-teal-300 hover:underline"
                >
                  Schedule
                </button>
              </div>
              <ul className="text-sm text-slate dark:text-dusk-300 space-y-1">
                {unscheduled.slice(0, 6).map((row) => (
                  <li key={row.key} className="flex gap-2 min-w-0">
                    <span className="flex-none text-slate dark:text-dusk-400">{row.kind}</span>
                    <span className="truncate">{row.title}</span>
                  </li>
                ))}
                {unscheduled.length > 6 && (
                  <li className="text-slate dark:text-dusk-400">and {unscheduled.length - 6} more</li>
                )}
              </ul>
            </section>
          )}
        </div>

        <div
          className={`${
            mobilePane === 'map' ? '' : 'hidden lg:block'
          } h-[60vh] lg:h-[calc(100vh-18rem)] lg:min-h-[420px] lg:sticky lg:top-48`}
        >
          <AgendaMap items={agenda} activeKey={activeKey} onSelect={setActiveKey} className="h-full" />
        </div>
      </div>
    </div>
  );
}
