import { useMemo, useCallback } from 'react';
import type { Trip } from '../../types/trip';
import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import type { Location } from '../../types/location';
import type { JournalEntry } from '../../types/journalEntry';
import type { Checklist } from '../../types/checklist';
import type { Companion } from '../../types/companion';
import type { Photo } from '../../types/photo';
import { TripStatus } from '../../types/trip';
import TripStats from '../TripStats';
import RecentActivityCard from './RecentActivityCard';
import NextUpCard from './NextUpCard';
import TodaysItinerary from './TodaysItinerary';
import ChecklistsWidget from './ChecklistsWidget';
import CompanionsWidget from './CompanionsWidget';
import MapPreviewWidget from './MapPreviewWidget';
import CountdownTimerWidget from './CountdownTimerWidget';
import LocalTimeWidget from './LocalTimeWidget';
import BudgetSummaryWidget from './BudgetSummaryWidget';
import WeatherForecastWidget from './WeatherForecastWidget';
import FlightStatusWidget from './FlightStatusWidget';
import TripDayByDay from './TripDayByDay';
import UpcomingBookings from './UpcomingBookings';
import type { MapPreviewLeg } from './MapPreviewWidget';
import TripHealthCheck from '../TripHealthCheck';
import type { ValidationIssue } from '../../types/trip';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';

// Weather forecast data structure
interface WeatherForecast {
  date: string;
  high: number;
  low: number;
  condition: 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' | 'windy';
  humidity?: number;
  precipitation?: number;
}

// Budget data structure
interface BudgetData {
  budget: number | null;
  spent: number;
  breakdown: {
    lodging: number;
    transportation: number;
    activities: number;
    food: number;
    other: number;
  };
  currency: string;
}

// Flight status data structure
interface FlightData {
  id: number;
  flightNumber: string | null;
  airline: string | null;
  departureTime: string;
  arrivalTime: string | null;
  departureLocation: string;
  arrivalLocation: string;
  status: 'scheduled' | 'on_time' | 'delayed' | 'cancelled' | 'departed' | 'arrived';
  gate?: string | null;
  terminal?: string | null;
  delayMinutes?: number;
}

interface TripDashboardProps {
  trip: Trip;
  activities: Activity[];
  transportation: Transportation[];
  lodging: Lodging[];
  locations: Location[];
  journalEntries: JournalEntry[];
  photos: Photo[];
  photosCount: number;
  checklists: Checklist[];
  companions: Companion[];
  onNavigateToTab: (tab: string, options?: { action?: string; scrollToDate?: string }) => void;
  onToggleChecklistItem: (checklistId: number, itemId: number, completed: boolean) => Promise<void>;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
  // Optional data for enhanced widgets
  weatherForecast?: WeatherForecast[] | null;
  weatherLocation?: string;
  weatherLoading?: boolean;
  weatherError?: string | null;
  onRefreshWeather?: () => void;
  budgetData?: BudgetData | null;
  flightStatus?: FlightData[] | null;
  flightStatusLoading?: boolean;
  onRefreshFlightStatus?: () => void;
  userHomeTimezone?: string;
  temperatureUnit?: 'celsius' | 'fahrenheit';
  className?: string;
}

/**
 * Main Trip Dashboard component.
 *
 * Serves as the central hub for trip information, providing an at-a-glance view of:
 * - Countdown timer (for planning/planned trips with dates)
 * - Local time widget (for international trips with different timezone)
 * - Trip statistics (at a glance)
 * - Recent activity
 * - Companions widget
 * - Map preview with locations
 * - Next upcoming event with trip day indicator
 * - Today's itinerary (for in-progress trips)
 * - Weather forecast (when data provided)
 * - Flight status (when flight data provided)
 * - Budget summary (when budget data provided)
 * - Checklists progress
 *
 * Layout (the trip Overview):
 * - Trip at a Glance stats (full width)
 * - Two independent stacks, so a tall card never opens a gap beside it:
 *   - Wide (2/3): route map, Next up, today's itinerary, then the smaller
 *     cards (needs attention, budget, checklists, recent activity, weather,
 *     flights) flowed into two packed columns
 *   - Narrow (1/3): Day by day, Next bookings, countdown, local time, companions
 * - Mobile: single column, wide stack first
 */
export default function TripDashboard({
  trip,
  activities,
  transportation,
  lodging,
  locations,
  journalEntries,
  photos,
  photosCount,
  checklists,
  companions,
  onNavigateToTab,
  onToggleChecklistItem,
  onNavigateToEntity,
  weatherForecast,
  weatherLocation,
  weatherLoading,
  weatherError,
  onRefreshWeather,
  budgetData,
  flightStatus,
  flightStatusLoading,
  onRefreshFlightStatus,
  userHomeTimezone,
  temperatureUnit = 'fahrenheit',
  className = '',
}: TripDashboardProps) {
  // Calculate counts for stats
  const activitiesCount = activities.length;
  const transportationCount = transportation.length;
  const lodgingCount = lodging.length;
  const locationsCount = locations.length;
  const journalCount = journalEntries.length;
  const companionsCount = companions.length;

  // Calculate unscheduled items
  const unscheduledActivities = activities.filter((a) => !a.startTime && !a.allDay);
  const unscheduledTransportation = transportation.filter((t) => !t.departureTime);
  const unscheduledLodging = lodging.filter((l) => !l.checkInDate);
  const unscheduledCount =
    unscheduledActivities.length +
    unscheduledTransportation.length +
    unscheduledLodging.length;

  // Get trip timezone with fallback
  const resolveTz = useTimezoneResolver();
  // "Home" is the zone the viewer keeps their own clock in: their configured
  // one, then their browser's. resolveTz supplies the user's for us.
  const tripTimezone = resolveTz(trip.timezone);
  const homeTimezone = resolveTz(userHomeTimezone);

  // Check if trip is international (different timezone)
  const isInternationalTrip = tripTimezone !== homeTimezone;

  // Check if countdown should be shown (Planning or Planned status with dates)
  const showCountdown =
    (trip.status === TripStatus.PLANNING || trip.status === TripStatus.PLANNED) &&
    trip.startDate !== null;

  // Map locations for the map widget
  const mapLocations = useMemo(
    () =>
      locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        latitude: loc.latitude ? Number(loc.latitude) : null,
        longitude: loc.longitude ? Number(loc.longitude) : null,
        category: loc.category?.name,
        excludeFromMap: loc.excludeFromMap,
      })),
    [locations]
  );

  // Transport legs for the route map. A leg counts as travelled once it has
  // arrived (or, with no arrival time, once it has departed).
  const routeLegs = useMemo<MapPreviewLeg[]>(() => {
    const now = Date.now();
    const point = (
      place: { latitude?: number | null; longitude?: number | null } | null | undefined
    ): [number, number] | null => {
      if (place?.latitude == null || place.longitude == null) return null;
      const latitude = Number(place.latitude);
      const longitude = Number(place.longitude);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
    };
    return transportation.flatMap((leg) => {
      const from = point(leg.route?.from) ?? point(leg.fromLocation);
      const to = point(leg.route?.to) ?? point(leg.toLocation);
      const finished = leg.arrivalTime ?? leg.departureTime;
      if (!from || !to || !finished) return [];
      return [{ id: leg.id, from, to, travelled: Date.parse(finished) <= now }];
    });
  }, [transportation]);

  // Handle event click from TodaysItinerary
  const handleEventClick = useCallback((eventType: string, eventId: string) => {
    // Map event type to tab name
    const tabMap: Record<string, string> = {
      activity: 'activities',
      transportation: 'transportation',
      lodging: 'lodging',
    };
    const tabName = tabMap[eventType] || eventType;
    onNavigateToTab(tabName);
    // The onNavigateToEntity callback can be used for more specific navigation
    onNavigateToEntity(eventType, eventId);
  }, [onNavigateToTab, onNavigateToEntity]);

  // Handle location click from map
  const handleLocationClick = useCallback((locationId: number) => {
    onNavigateToEntity('location', String(locationId));
  }, [onNavigateToEntity]);

  // Handle flight click
  const handleFlightClick = useCallback((flightId: number) => {
    onNavigateToEntity('transportation', String(flightId));
  }, [onNavigateToEntity]);

  // "Needs attention" quick actions open the tab where the fix is made.
  const handleHealthAction = useCallback((action: ValidationIssue['quickAction']) => {
    if (!action) return;
    const tabs: Record<NonNullable<ValidationIssue['quickAction']>['type'], string> = {
      add_lodging: 'lodging',
      add_transportation: 'transportation',
      view_conflict: 'itinerary',
      edit_activity: 'activities',
    };
    onNavigateToTab(tabs[action.type]);
  }, [onNavigateToTab]);

  // Handle navigate to transportation tab
  const handleNavigateToTransportation = useCallback(() => {
    onNavigateToTab('transportation');
  }, [onNavigateToTab]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Trip at a Glance - Full Width */}
      <div className="card p-6">
        <h3 className="font-body font-semibold text-lg text-charcoal dark:text-warm-gray mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-primary-500 dark:text-gold"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          Trip at a Glance
        </h3>
        <TripStats
          locationsCount={locationsCount}
          photosCount={photosCount}
          activitiesCount={activitiesCount}
          transportationCount={transportationCount}
          lodgingCount={lodgingCount}
          journalCount={journalCount}
          companionsCount={companionsCount}
          unscheduledCount={unscheduledCount}
          tripStartDate={trip.startDate}
          tripEndDate={trip.endDate}
          onNavigateToTab={onNavigateToTab}
        />
      </div>

      {/* Two independent stacks. Cards pack upward in each, so one tall card
          never leaves a hole beside it the way aligned rows did. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {locations.length > 0 && (
            <MapPreviewWidget
              locations={mapLocations}
              legs={routeLegs}
              onNavigateToMap={() => onNavigateToTab('locations')}
              onLocationClick={handleLocationClick}
            />
          )}
          <NextUpCard
            activities={activities}
            transportation={transportation}
            lodging={lodging}
            tripStatus={trip.status}
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            tripTimezone={tripTimezone}
            photosCount={photosCount}
            onNavigateToTab={onNavigateToTab}
          />
          {/* Today's Itinerary - Only show for in-progress trips */}
          {trip.status === TripStatus.IN_PROGRESS && (
            <TodaysItinerary
              activities={activities}
              transportation={transportation}
              lodging={lodging}
              tripTimezone={tripTimezone}
              onEventClick={handleEventClick}
              onNavigateToTimeline={(date) => onNavigateToTab('timeline', { scrollToDate: date })}
            />
          )}

          {/* Smaller cards, flowed into two packed columns. Each wrapper
              hides itself when its widget renders nothing. The negative
              margin cancels the last row's bottom margin. */}
          <div className="md:columns-2 gap-6 -mb-6 [&>*]:mb-6 [&>*]:break-inside-avoid [&>*:empty]:hidden">
            <div>
              <TripHealthCheck tripId={trip.id} onQuickAction={handleHealthAction} />
            </div>
            <div>
              {budgetData && (
                <BudgetSummaryWidget
                  budget={budgetData.budget}
                  spent={budgetData.spent}
                  breakdown={budgetData.breakdown}
                  currency={budgetData.currency}
                  onNavigateToBudget={() => onNavigateToTab('budget')}
                />
              )}
            </div>
            <div>
              {checklists.length > 0 && (
                <ChecklistsWidget
                  checklists={checklists}
                  onToggleItem={onToggleChecklistItem}
                  onNavigateToChecklists={() => onNavigateToTab('checklists')}
                />
              )}
            </div>
            <div>
              <RecentActivityCard
                activities={activities}
                transportation={transportation}
                lodging={lodging}
                locations={locations}
                journal={journalEntries}
                photos={photos}
                onNavigateToEntity={onNavigateToEntity}
              />
            </div>
            <div>
              {(weatherForecast || weatherLoading) && (
                <WeatherForecastWidget
                  forecast={weatherForecast || null}
                  location={weatherLocation || trip.title}
                  temperatureUnit={temperatureUnit}
                  isLoading={weatherLoading}
                  error={weatherError || null}
                  onRefresh={onRefreshWeather}
                />
              )}
            </div>
            <div>
              {(flightStatus || flightStatusLoading) && (
                <FlightStatusWidget
                  flights={flightStatus || []}
                  tripTimezone={tripTimezone}
                  onNavigateToFlight={handleFlightClick}
                  onNavigateToTransportation={handleNavigateToTransportation}
                  onRefreshStatus={onRefreshFlightStatus}
                  isLoading={flightStatusLoading}
                />
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6 min-w-0">
          <TripDayByDay
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            tripTimezone={trip.timezone}
            activities={activities}
            transportation={transportation}
            lodging={lodging}
            onOpenDay={(dayKey) => onNavigateToTab('itinerary', { scrollToDate: dayKey })}
          />
          <UpcomingBookings
            transportation={transportation}
            lodging={lodging}
            tripTimezone={trip.timezone}
            onOpenTab={onNavigateToTab}
          />
          {/* Countdown - for planning/planned trips */}
          {showCountdown && (
            <CountdownTimerWidget
              tripStartDate={trip.startDate}
              tripEndDate={trip.endDate}
              tripStatus={trip.status}
            />
          )}
          {/* Local time - for trips in another timezone */}
          {isInternationalTrip && (
            <LocalTimeWidget
              tripTimezone={tripTimezone}
              homeTimezone={homeTimezone}
              locationName={trip.title}
            />
          )}
          <CompanionsWidget
            companions={companions}
            onNavigateToCompanions={() => onNavigateToTab('companions')}
            onInviteCompanion={() => onNavigateToTab('companions', { action: 'add' })}
          />
        </div>
      </div>
    </div>
  );
}
