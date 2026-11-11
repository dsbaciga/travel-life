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
import QuickActionsBar from './QuickActionsBar';
import TodaysItinerary from './TodaysItinerary';
import ChecklistsWidget from './ChecklistsWidget';
import CompanionsWidget from './CompanionsWidget';
import MapPreviewWidget from './MapPreviewWidget';
import CountdownTimerWidget from './CountdownTimerWidget';
import LocalTimeWidget from './LocalTimeWidget';
import BudgetSummaryWidget from './BudgetSummaryWidget';
import WeatherForecastWidget from './WeatherForecastWidget';
import FlightStatusWidget from './FlightStatusWidget';
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
  onStatusChange: (newStatus: string) => Promise<void>;
  onPrintItinerary: () => void;
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
 * - Quick actions based on trip status
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
 * Layout:
 * - Top row: Countdown and/or Local Time (responsive 1-2 columns)
 * - Trip at a Glance stats (full width)
 * - Quick Actions Bar (full width)
 * - Main Grid:
 *   - Left column (1/3): Recent Activity, Companions, Map, Checklists
 *   - Right column (2/3): Next Up, Itinerary, Weather, Flights, Budget
 * - Mobile: Single column stacked layout
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
  onStatusChange,
  onPrintItinerary,
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

  // Handle navigate to transportation tab
  const handleNavigateToTransportation = useCallback(() => {
    onNavigateToTab('transportation');
  }, [onNavigateToTab]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Top Row: Countdown Timer and/or Local Time Widget */}
      {(showCountdown || isInternationalTrip) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
          {/* Countdown Timer - for planning/planned trips */}
          {showCountdown && (
            <CountdownTimerWidget
              tripStartDate={trip.startDate}
              tripEndDate={trip.endDate}
              tripStatus={trip.status}
            />
          )}

          {/* Local Time Widget - for international trips */}
          {isInternationalTrip && (
            <LocalTimeWidget
              tripTimezone={tripTimezone}
              homeTimezone={homeTimezone}
              locationName={trip.title}
            />
          )}
        </div>
      )}

      {/* Trip at a Glance - Full Width */}
      <div className="card p-6 animate-fade-in stagger-1">
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

      {/* Quick Actions Bar - Full Width */}
      <div className="animate-fade-in stagger-2">
        <QuickActionsBar
          tripStatus={trip.status}
          onNavigateToTab={onNavigateToTab}
          onStatusChange={onStatusChange}
          onPrintItinerary={onPrintItinerary}
        />
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Activity, Companions, Map, Checklists */}
        <div className="lg:col-span-1 space-y-6">
          {/* Recent Activity Card */}
          <div className="animate-fade-in stagger-2">
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

          {/* Companions Widget */}
          <div className="animate-fade-in stagger-3">
            <CompanionsWidget
              companions={companions}
              onNavigateToCompanions={() => onNavigateToTab('companions')}
              onInviteCompanion={() => onNavigateToTab('companions', { action: 'add' })}
            />
          </div>

          {/* Map Preview Widget */}
          {locations.length > 0 && (
            <div className="animate-fade-in stagger-4">
              <MapPreviewWidget
                locations={mapLocations}
                onNavigateToMap={() => onNavigateToTab('locations')}
                onLocationClick={handleLocationClick}
              />
            </div>
          )}

          {/* Checklists Widget */}
          {checklists.length > 0 && (
            <div className="animate-fade-in stagger-5">
              <ChecklistsWidget
                checklists={checklists}
                onToggleItem={onToggleChecklistItem}
                onNavigateToChecklists={() => onNavigateToTab('checklists')}
              />
            </div>
          )}
        </div>

        {/* Right Column - Next Up, Itinerary, Weather, Flights, Budget */}
        <div className="lg:col-span-2 space-y-6">
          {/* Next Up Card */}
          <div className="animate-fade-in stagger-2">
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
          </div>

          {/* Today's Itinerary - Only show for in-progress trips */}
          {trip.status === TripStatus.IN_PROGRESS && (
            <div className="animate-fade-in stagger-3">
              <TodaysItinerary
                activities={activities}
                transportation={transportation}
                lodging={lodging}
                tripTimezone={tripTimezone}
                onEventClick={handleEventClick}
                onNavigateToTimeline={(date) => onNavigateToTab('timeline', { scrollToDate: date })}
              />
            </div>
          )}

          {/* Weather Forecast Widget - show if data provided */}
          {(weatherForecast || weatherLoading) && (
            <div className="animate-fade-in stagger-4">
              <WeatherForecastWidget
                forecast={weatherForecast || null}
                location={weatherLocation || trip.title}
                temperatureUnit={temperatureUnit}
                isLoading={weatherLoading}
                error={weatherError || null}
                onRefresh={onRefreshWeather}
              />
            </div>
          )}

          {/* Flight Status Widget - show if flight data provided */}
          {(flightStatus || flightStatusLoading) && (
            <div className="animate-fade-in stagger-5">
              <FlightStatusWidget
                flights={flightStatus || []}
                tripTimezone={tripTimezone}
                onNavigateToFlight={handleFlightClick}
                onNavigateToTransportation={handleNavigateToTransportation}
                onRefreshStatus={onRefreshFlightStatus}
                isLoading={flightStatusLoading}
              />
            </div>
          )}

          {/* Budget Summary Widget - show if budget data provided */}
          {budgetData && (
            <div className="animate-fade-in stagger-6">
              <BudgetSummaryWidget
                budget={budgetData.budget}
                spent={budgetData.spent}
                breakdown={budgetData.breakdown}
                currency={budgetData.currency}
                onNavigateToBudget={() => onNavigateToTab('budget')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
