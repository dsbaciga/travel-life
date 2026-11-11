import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router';
import { useState } from 'react';
import UpcomingTripsWidget from '../components/widgets/UpcomingTripsWidget';
import TravelStatsWidget from '../components/widgets/TravelStatsWidget';
import RecentPhotosWidget from '../components/widgets/RecentPhotosWidget';
import QuickActionsWidget from '../components/widgets/QuickActionsWidget';
import OnThisDayWidget from '../components/widgets/OnThisDayWidget';
import DeadlinesWidget from '../components/widgets/DeadlinesWidget';
import TripCalendarWidget from '../components/widgets/TripCalendarWidget';
import YearInReviewWidget from '../components/widgets/YearInReviewWidget';
import PendingInvitations from '../components/PendingInvitations';
import { usePullToRefresh, PullToRefreshIndicator } from '../hooks/usePullToRefresh';
import { useActiveTrip, getDayOfTrip, getTripLength } from '../hooks/useActiveTrip';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [refreshKey, setRefreshKey] = useState(0);
  const { trip: activeTrip } = useActiveTrip();

  // "Day 3 of 10 · Iceland Ring Road" — the one thing a mid-trip user wants,
  // in place of the generic greeting. Falls back to null (generic copy) when
  // no trip is under way.
  const dayOfTrip = getDayOfTrip(activeTrip);
  const tripLength = getTripLength(activeTrip);
  const activeTripLine =
    activeTrip && dayOfTrip
      ? `Day ${dayOfTrip}${tripLength ? ` of ${tripLength}` : ''} of ${activeTrip.title}`
      : null;

  const handleRefresh = async () => {
    // Trigger refresh by updating key (causes widgets to reload)
    await new Promise(resolve => setTimeout(resolve, 500)); // Minimum refresh time for better UX
    setRefreshKey(prev => prev + 1);
  };

  const [containerRef, { pullDistance, isRefreshing }] = usePullToRefresh<HTMLDivElement>({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-gradient-to-br from-cream to-parchment dark:from-navy-900 dark:to-navy-800 overflow-y-auto"
    >
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <main className="max-w-[1600px] mx-auto px-6 py-8 sm:py-12 md:py-16 pt-20 sm:pt-24">
        {/* Hero Section — compact on mobile so the first widget is above the
            fold; the full-size hero returns at md. The subtitle states where
            the user is in their active trip rather than a generic greeting. */}
        <div className="mb-6 md:mb-12 animate-fade-in">
          <h1 className="text-2xl md:text-5xl lg:text-7xl font-display font-bold text-primary-600 dark:text-sky tracking-tight leading-none mb-1 md:mb-4 break-words">
            <span className="md:hidden">Hi, </span>
            <span className="hidden md:inline">Welcome back,<br /></span>
            {/* primary-600, not accent-500: accent-500 on the cream page is
                2.05:1, under the 3:1 that even display-size text needs. */}
            <span className="text-primary-600 dark:text-warm-gray">{user?.username}</span>
          </h1>
          <p className="text-sm md:text-xl text-slate dark:text-warm-gray font-body max-w-2xl">
            {activeTripLine ?? 'Your adventures await. Continue documenting your journey.'}
          </p>
        </div>

        {/* Pending Invitations + Year in Review — both render nothing when they
            have no content, so the container collapses instead of leaving a gap */}
        <div className="flex flex-col gap-8 mb-8 animate-fade-in empty:hidden">
          <PendingInvitations />
          <YearInReviewWidget />
        </div>

        {/* Widgets Grid */}
        <div key={refreshKey} className="mb-8">
          {/* Top Row - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Left Column */}
            <div className="flex flex-col gap-6">
              {/* On This Day Memories (renders nothing when there are none,
                  so it is not wrapped — an empty wrapper would add a flex gap) */}
              <OnThisDayWidget />

              {/* Booking deadlines (renders nothing when there are none) */}
              <DeadlinesWidget />

              {/* Upcoming Trips */}
              <div className="animate-fade-in">
                <UpcomingTripsWidget />
              </div>

              {/* Quick Actions */}
              <div className="animate-fade-in stagger-4 flex-1">
                <QuickActionsWidget />
              </div>
            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-6">
              {/* Travel Stats */}
              <div className="animate-fade-in stagger-1">
                <TravelStatsWidget />
              </div>

              {/* Recent Photos */}
              <div className="animate-fade-in stagger-3 flex-1">
                <RecentPhotosWidget />
              </div>
            </div>
          </div>

          {/* Full Width Row - Trip Calendar */}
          <div className="animate-fade-in stagger-2">
            <TripCalendarWidget />
          </div>
        </div>

        {/* Quick Links Section — desktop only. On mobile every one of these
            four destinations is already in the bottom nav, so the block was a
            third route to the same screens costing ~220px of scroll. */}
        <div className="hidden lg:block mb-8 animate-fade-in stagger-4">
          <h2 className="text-2xl font-display font-bold text-charcoal dark:text-warm-gray mb-4">
            Quick Links
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to="/trips"
              className="block group"
            >
              <div className="h-24 bg-white/80 dark:bg-navy-800/80 backdrop-blur-sm rounded-xl p-4 shadow-md hover:shadow-lg transition-shadow duration-300 border-2 border-primary-500/10 dark:border-sky/10 hover:border-accent-400 dark:hover:border-accent-400">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">🗺️</div>
                  <div>
                    <h3 className="font-display font-bold text-primary-600 dark:text-sky group-hover:text-accent-500 dark:group-hover:text-accent-400 transition-colors">
                      Trips
                    </h3>
                    <p className="text-xs text-slate dark:text-warm-gray">
                      View all trips
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link
              to="/companions"
              className="block group"
            >
              <div className="h-24 bg-white/80 dark:bg-navy-800/80 backdrop-blur-sm rounded-xl p-4 shadow-md hover:shadow-lg transition-shadow duration-300 border-2 border-primary-500/10 dark:border-sky/10 hover:border-accent-400 dark:hover:border-accent-400">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">👥</div>
                  <div>
                    <h3 className="font-display font-bold text-primary-600 dark:text-sky group-hover:text-accent-500 dark:group-hover:text-accent-400 transition-colors">
                      Companions
                    </h3>
                    <p className="text-xs text-slate dark:text-warm-gray">
                      Travel buddies
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link
              to="/places-visited"
              className="block group"
            >
              <div className="h-24 bg-white/80 dark:bg-navy-800/80 backdrop-blur-sm rounded-xl p-4 shadow-md hover:shadow-lg transition-shadow duration-300 border-2 border-primary-500/10 dark:border-sky/10 hover:border-accent-400 dark:hover:border-accent-400">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">📍</div>
                  <div>
                    <h3 className="font-display font-bold text-primary-600 dark:text-sky group-hover:text-accent-500 dark:group-hover:text-accent-400 transition-colors">
                      Places
                    </h3>
                    <p className="text-xs text-slate dark:text-warm-gray">
                      Explore map
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link
              to="/checklists"
              className="block group"
            >
              <div className="h-24 bg-white/80 dark:bg-navy-800/80 backdrop-blur-sm rounded-xl p-4 shadow-md hover:shadow-lg transition-shadow duration-300 border-2 border-primary-500/10 dark:border-sky/10 hover:border-accent-400 dark:hover:border-accent-400">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">✅</div>
                  <div>
                    <h3 className="font-display font-bold text-primary-600 dark:text-sky group-hover:text-accent-500 dark:group-hover:text-accent-400 transition-colors">
                      Checklists
                    </h3>
                    <p className="text-xs text-slate dark:text-warm-gray">
                      Stay organized
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
