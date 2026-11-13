import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import UpcomingTripsWidget from '../components/widgets/UpcomingTripsWidget';
import OnThisDayWidget from '../components/widgets/OnThisDayWidget';
import DeadlinesWidget from '../components/widgets/DeadlinesWidget';
import YearInReviewWidget from '../components/widgets/YearInReviewWidget';
import PendingInvitations from '../components/PendingInvitations';
import AgendaList from '../components/agenda/AgendaList';
import TodayMap from '../components/today/TodayMap';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';
import { useActiveTrip, getDayOfTrip, getTripLength } from '../hooks/useActiveTrip';
import { useTripAgendaData } from '../hooks/useTripAgendaData';
import { useTimezoneResolver } from '../hooks/useTimezoneResolver';
import { buildDayAgenda, type AgendaItem } from '../utils/dayAgenda';
import { dayKeyInTimezone, formatDateOnly } from '../utils/timezone';
import pdfImportService from '../services/pdfImport.service';
import savedLinkService from '../services/savedLink.service';

/** Whole days from today until a date-only trip start. Compared in UTC on purpose. */
function daysUntil(startDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!startDate) return null;
  const start = Date.parse(`${startDate.split('T')[0]}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((start - today) / 86_400_000);
}

/**
 * Today: what is happening on the current trip, what needs doing, and where.
 *
 * On large screens a work column sits beside a map; each agenda row carries
 * the number of its pin. Below `lg` the map is a short strip above the
 * agenda that can be expanded. On This Day and Year in Review follow
 * underneath.
 */
export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const resolveTz = useTimezoneResolver();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);

  const { trip: activeTrip } = useActiveTrip();
  const dayOfTrip = getDayOfTrip(activeTrip);
  const tripLength = getTripLength(activeTrip);
  // Under way: started, and not past its last day (when it has one).
  const inProgress =
    activeTrip != null && dayOfTrip != null && (tripLength == null || dayOfTrip <= tripLength);

  const tripTimezone = resolveTz(activeTrip?.timezone);
  const todayKey = dayKeyInTimezone(new Date().toISOString(), tripTimezone) ?? '';

  const tripData = useTripAgendaData(activeTrip?.id);

  const agenda = useMemo<AgendaItem[]>(() => {
    if (!inProgress || !todayKey) return [];
    return buildDayAgenda({
      activities: tripData.activities,
      transportation: tripData.transportation,
      lodging: tripData.lodging,
      locations: tripData.locations,
      locationLinks: tripData.locationLinks,
      dayKey: todayKey,
      resolveTimezone: (entityTimezone) => resolveTz(entityTimezone, activeTrip?.timezone),
    });
  }, [
    inProgress,
    todayKey,
    tripData.activities,
    tripData.transportation,
    tripData.lodging,
    tripData.locations,
    tripData.locationLinks,
    resolveTz,
    activeTrip?.timezone,
  ]);

  // Same keys as the navigation bars, so these cost no extra request.
  const { data: inboxLinks } = useQuery({
    queryKey: ['savedLinksInboxCount'],
    queryFn: () => savedLinkService.getInboxCount(),
    enabled: !!user,
  });
  const { data: pendingImports } = useQuery({
    queryKey: ['pendingCount'],
    queryFn: () => pdfImportService.getPendingCount(),
    enabled: !!user,
  });
  const linkCount = inboxLinks?.count ?? 0;
  const importCount = pendingImports?.count ?? 0;

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries(),
      // Minimum refresh time so the indicator does not flash.
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    // The older widgets load in effects rather than queries; remount them.
    setRefreshKey((prev) => prev + 1);
  };

  const [containerRef, { pullDistance, isRefreshing }] = usePullToRefresh<HTMLDivElement>({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tripTimezone,
  });

  const countdown = daysUntil(activeTrip?.startDate);
  const openItem = (item: AgendaItem) => {
    if (activeTrip) navigate(`/trips/${activeTrip.id}?tab=${item.tab}`);
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-gradient-to-br from-cream to-parchment dark:from-navy-900 dark:to-navy-800 overflow-y-auto"
    >
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {/* Header, map and work column are three grid children so that below
            `lg` they stack as header, map, work, and at `lg` the map takes
            the whole right-hand column beside the other two. */}
        <div className="grid gap-4 lg:gap-x-6 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
          <header className="lg:col-start-1">
            <p className="text-sm text-slate dark:text-dusk-400">{todayLabel}</p>
            <h1 className="text-3xl md:text-4xl font-display font-bold text-charcoal dark:text-white tracking-tight">
              Today
            </h1>
          </header>

          <section
            aria-label="Map"
            className={`lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24 lg:self-start lg:h-[calc(100vh-7.5rem)] ${
              mapExpanded ? 'h-[70vh]' : 'h-56'
            } flex flex-col`}
          >
            <div className="flex-1 min-h-0">
              <TodayMap
                agenda={agenda}
                activeKey={activeKey}
                onSelect={setActiveKey}
                hasToday={inProgress}
                hasTrip={activeTrip != null}
                tripLocations={tripData.locations}
                tripTransportation={tripData.transportation}
              />
            </div>
            <button
              type="button"
              onClick={() => setMapExpanded((value) => !value)}
              aria-expanded={mapExpanded}
              className="lg:hidden flex-none mt-1 min-h-[44px] text-sm font-medium text-primary-600 dark:text-teal-300"
            >
              {mapExpanded ? 'Smaller map' : 'Larger map'}
            </button>
          </section>

          <div className="lg:col-start-1 flex flex-col gap-4 min-w-0">
            {/* Needs a decision, so it stays first. Renders nothing when empty. */}
            <PendingInvitations />

            {activeTrip && inProgress && (
              <section className="card" aria-labelledby="today-agenda-heading">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h2
                    id="today-agenda-heading"
                    className="text-lg font-display font-bold text-charcoal dark:text-white min-w-0 truncate"
                  >
                    Day {dayOfTrip}
                    {tripLength ? ` of ${tripLength}` : ''}
                    <span className="font-normal text-slate dark:text-dusk-400"> · {activeTrip.title}</span>
                  </h2>
                  <Link
                    to={`/trips/${activeTrip.id}`}
                    className="flex-none text-sm font-medium text-primary-600 dark:text-teal-300 hover:underline"
                  >
                    Open trip
                  </Link>
                </div>
                {tripData.isLoading ? (
                  <p className="py-6 text-sm text-slate dark:text-dusk-400">Loading today…</p>
                ) : tripData.isError ? (
                  <p className="py-6 text-sm text-red-700 dark:text-red-300">
                    Today's plan could not be loaded. Pull down to try again.
                  </p>
                ) : (
                  <AgendaList
                    items={agenda}
                    activeKey={activeKey}
                    onActiveChange={setActiveKey}
                    onOpen={openItem}
                    emptyMessage="Nothing is scheduled for today."
                  />
                )}
              </section>
            )}

            {activeTrip && !inProgress && (
              <section className="card" aria-labelledby="next-trip-heading">
                <p className="text-sm text-slate dark:text-dusk-400">Next trip</p>
                <h2
                  id="next-trip-heading"
                  className="text-xl font-display font-bold text-charcoal dark:text-white break-words"
                >
                  {activeTrip.title}
                </h2>
                <p className="mt-1 text-slate dark:text-warm-gray">
                  {countdown == null
                    ? 'No dates set yet'
                    : countdown > 1
                      ? `Starts in ${countdown} days, on ${formatDateOnly(activeTrip.startDate)}`
                      : countdown === 1
                        ? 'Starts tomorrow'
                        : countdown === 0
                          ? 'Starts today'
                          : `Was due to start ${formatDateOnly(activeTrip.startDate)}`}
                </p>
                <Link to={`/trips/${activeTrip.id}`} className="btn btn-primary mt-4 inline-flex">
                  Open trip
                </Link>
              </section>
            )}

            {!activeTrip && (
              <section className="card">
                <h2 className="text-xl font-display font-bold text-charcoal dark:text-white">
                  No trip planned
                </h2>
                <p className="mt-1 text-slate dark:text-warm-gray">
                  Start one and its days will show up here.
                </p>
                <Link to="/trips/new" className="btn btn-primary mt-4 inline-flex">
                  Plan a trip
                </Link>
              </section>
            )}

            {/* Renders nothing when there are no deadlines. */}
            <DeadlinesWidget />

            {linkCount + importCount > 0 && (
              <Link
                to="/saved-links"
                className="card flex items-center justify-between gap-4 hover:border-primary-300 dark:hover:border-navy-500 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block font-display font-bold text-charcoal dark:text-white">Inbox</span>
                  <span className="block text-sm text-slate dark:text-dusk-400">
                    {[
                      linkCount > 0 && `${linkCount} saved ${linkCount === 1 ? 'link' : 'links'} to file`,
                      importCount > 0 &&
                        `${importCount} imported ${importCount === 1 ? 'booking' : 'bookings'} to review`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="flex-none text-sm font-medium text-primary-600 dark:text-teal-300">Open</span>
              </Link>
            )}

            <div key={`trips-${refreshKey}`}>
              <UpcomingTripsWidget />
            </div>
          </div>
        </div>

        {/* Memories. Both render nothing when they have no content, and the
            wrapper collapses with them. Travel stats and the trip calendar
            have their own pages under Library. */}
        <div key={refreshKey} className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6 empty:hidden">
          <OnThisDayWidget />
          <YearInReviewWidget />
        </div>
      </div>
    </div>
  );
}
