import Icon from '../ui/Icon';
import { useMemo } from 'react';
import { ChevronRightIcon } from '../icons';

interface Flight {
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

interface FlightStatusWidgetProps {
  flights: Flight[];
  tripTimezone: string;
  onNavigateToFlight: (flightId: number) => void;
  onNavigateToTransportation?: () => void;
  onRefreshStatus?: () => void;
  isLoading?: boolean;
}

/**
 * Airplane icon for flight representation
 */
function AirplaneIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <Icon name="flight" className={className} />
  );
}

/**
 * Airplane taking off icon
 */
function AirplaneTakeoffIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <Icon name="flightLand" className={className} />
  );
}

/**
 * Refresh icon for status refresh
 */
function RefreshIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <Icon name="refresh" className={className} />
  );
}

/**
 * Get status color classes based on flight status
 */
function getStatusColors(status: Flight['status']) {
  switch (status) {
    case 'on_time':
    case 'arrived':
      return {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-400',
        dot: 'bg-green-500 dark:bg-green-400',
      };
    case 'delayed':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        dot: 'bg-amber-500 dark:bg-amber-400',
      };
    case 'cancelled':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        dot: 'bg-red-500 dark:bg-red-400',
      };
    case 'departed':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-400',
        dot: 'bg-blue-500 dark:bg-blue-400',
      };
    case 'scheduled':
    default:
      return {
        bg: 'bg-slate/10 dark:bg-navy-700',
        text: 'text-slate dark:text-warm-gray/70',
        dot: 'bg-slate dark:bg-warm-gray/50',
      };
  }
}

/**
 * Format status display text
 */
function getStatusText(status: Flight['status'], delayMinutes?: number) {
  switch (status) {
    case 'on_time':
      return 'On Time';
    case 'delayed':
      return delayMinutes ? `Delayed ${delayMinutes}m` : 'Delayed';
    case 'cancelled':
      return 'Cancelled';
    case 'departed':
      return 'Departed';
    case 'arrived':
      return 'Arrived';
    case 'scheduled':
    default:
      return 'Scheduled';
  }
}

/**
 * Format time to a readable format
 */
function formatTime(dateString: string, timezone: string) {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    });
  } catch {
    return '--:--';
  }
}

/**
 * Get relative time string (e.g., "Departs in 2 hours")
 */
function getRelativeTimeString(dateString: string): string {
  const now = new Date();
  const departureDate = new Date(dateString);
  const diffMs = departureDate.getTime() - now.getTime();

  // If in the past
  if (diffMs < 0) {
    const pastDiffMs = Math.abs(diffMs);
    const pastMinutes = Math.floor(pastDiffMs / 60000);
    const pastHours = Math.floor(pastMinutes / 60);

    if (pastMinutes < 60) {
      return `Departed ${pastMinutes}m ago`;
    } else if (pastHours < 24) {
      return `Departed ${pastHours}h ago`;
    }
    return 'Departed';
  }

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 60) {
    return `Departs in ${minutes}m`;
  } else if (hours < 24) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `Departs in ${hours}h ${remainingMinutes}m`;
    }
    return `Departs in ${hours}h`;
  } else if (days === 1) {
    return 'Departs tomorrow';
  } else {
    return `Departs in ${days} days`;
  }
}

/**
 * Status badge component
 */
function StatusBadge({ status, delayMinutes }: { status: Flight['status']; delayMinutes?: number }) {
  const colors = getStatusColors(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {getStatusText(status, delayMinutes)}
    </span>
  );
}

/**
 * Visual flight path indicator showing departure to arrival
 */
function FlightPath({
  departure,
  arrival,
  status,
}: {
  departure: string;
  arrival: string;
  status: Flight['status'];
}) {
  const isActive = status === 'departed';
  const isCancelled = status === 'cancelled';

  return (
    <div className="flex items-center gap-2 my-2">
      {/* Departure */}
      <div className="flex-shrink-0 text-center">
        <span
          className={`text-sm font-semibold ${
            isCancelled
              ? 'text-red-500 dark:text-red-400 line-through'
              : 'text-charcoal dark:text-warm-gray'
          }`}
        >
          {departure}
        </span>
      </div>

      {/* Flight path line with airplane */}
      <div className="flex-1 flex items-center gap-1 min-w-0">
        {/* Left line segment */}
        <div
          className={`flex-1 h-0.5 ${
            isCancelled
              ? 'bg-red-200 dark:bg-red-900/50'
              : isActive
              ? 'bg-blue-400 dark:bg-blue-500'
              : 'bg-slate/20 dark:bg-warm-gray/20'
          }`}
        />

        {/* Airplane indicator */}
        <div
          className={`flex-shrink-0 transform ${
            isActive ? 'translate-x-0 animate-pulse-subtle' : ''
          }`}
        >
          <AirplaneIcon
            className={`w-4 h-4 rotate-90 ${
              isCancelled
                ? 'text-red-400 dark:text-red-500'
                : isActive
                ? 'text-blue-500 dark:text-blue-400'
                : 'text-primary-500 dark:text-gold'
            }`}
          />
        </div>

        {/* Right line segment */}
        <div
          className={`flex-1 h-0.5 ${
            isCancelled
              ? 'bg-red-200 dark:bg-red-900/50'
              : 'bg-slate/20 dark:bg-warm-gray/20'
          }`}
        />
      </div>

      {/* Arrival */}
      <div className="flex-shrink-0 text-center">
        <span
          className={`text-sm font-semibold ${
            isCancelled
              ? 'text-red-500 dark:text-red-400 line-through'
              : 'text-charcoal dark:text-warm-gray'
          }`}
        >
          {arrival}
        </span>
      </div>
    </div>
  );
}

/**
 * Individual flight card component
 */
function FlightCard({
  flight,
  tripTimezone,
  onNavigate,
}: {
  flight: Flight;
  tripTimezone: string;
  onNavigate: () => void;
}) {
  const relativeTime = getRelativeTimeString(flight.departureTime);
  const departureTimeFormatted = formatTime(flight.departureTime, tripTimezone);
  const arrivalTimeFormatted = flight.arrivalTime
    ? formatTime(flight.arrivalTime, tripTimezone)
    : null;

  return (
    <button
      onClick={onNavigate}
      className="w-full text-left p-3 rounded-xl bg-slate/5 dark:bg-navy-700/50
        hover:bg-primary-50/50 dark:hover:bg-navy-700
        border border-transparent hover:border-primary-200 dark:hover:border-gold/20
        transition-all duration-200 group"
    >
      {/* Header: Flight number, airline, status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {flight.flightNumber && (
            <span className="font-semibold text-charcoal dark:text-warm-gray">
              {flight.flightNumber}
            </span>
          )}
          {flight.airline && (
            <span className="text-sm text-slate dark:text-warm-gray/60">
              {flight.airline}
            </span>
          )}
        </div>
        <StatusBadge status={flight.status} delayMinutes={flight.delayMinutes} />
      </div>

      {/* Flight path visualization */}
      <FlightPath
        departure={flight.departureLocation}
        arrival={flight.arrivalLocation}
        status={flight.status}
      />

      {/* Times and gate info */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-slate dark:text-warm-gray/60">Dep: </span>
            <span className={`font-medium ${
              flight.status === 'cancelled'
                ? 'text-red-500 dark:text-red-400 line-through'
                : 'text-charcoal dark:text-warm-gray'
            }`}>
              {departureTimeFormatted}
            </span>
          </div>
          {arrivalTimeFormatted && (
            <div>
              <span className="text-slate dark:text-warm-gray/60">Arr: </span>
              <span className={`font-medium ${
                flight.status === 'cancelled'
                  ? 'text-red-500 dark:text-red-400 line-through'
                  : 'text-charcoal dark:text-warm-gray'
              }`}>
                {arrivalTimeFormatted}
              </span>
            </div>
          )}
        </div>

        {/* Gate/Terminal info */}
        {(flight.gate || flight.terminal) && (
          <div className="flex items-center gap-2 text-sm">
            {flight.terminal && (
              <span className="text-slate dark:text-warm-gray/60">
                T{flight.terminal}
              </span>
            )}
            {flight.gate && (
              <span className="px-1.5 py-0.5 rounded bg-primary-100 dark:bg-gold/20 text-primary-700 dark:text-gold font-medium">
                Gate {flight.gate}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Relative time footer */}
      <div className="mt-2 pt-2 border-t border-slate/10 dark:border-warm-gray/10 flex items-center justify-between">
        <span className={`text-xs font-medium ${
          flight.status === 'delayed'
            ? 'text-amber-600 dark:text-amber-400'
            : flight.status === 'cancelled'
            ? 'text-red-600 dark:text-red-400'
            : 'text-primary-600 dark:text-gold'
        }`}>
          {flight.status === 'cancelled' ? 'Flight cancelled' : relativeTime}
        </span>
        <ChevronRightIcon className="w-4 h-4 text-slate dark:text-warm-gray/50
          group-hover:text-primary-600 dark:group-hover:text-gold transition-colors" />
      </div>
    </button>
  );
}

/**
 * Empty state when no flights are scheduled
 */
function EmptyState() {
  return (
    <div className="text-center py-6">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary-50 dark:bg-gold/10 flex items-center justify-center">
        <AirplaneTakeoffIcon className="w-6 h-6 text-primary-400 dark:text-gold/60" />
      </div>
      <p className="text-sm text-slate dark:text-warm-gray/70 mb-1">
        No upcoming flights
      </p>
      <p className="text-xs text-slate/70 dark:text-warm-gray/50">
        Flight information will appear here when scheduled
      </p>
    </div>
  );
}

/**
 * Loading skeleton for the widget
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="p-3 rounded-xl bg-slate/5 dark:bg-navy-700/50 animate-pulse"
        >
          {/* Header skeleton */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-16 bg-slate/10 dark:bg-navy-700 rounded" />
              <div className="h-4 w-24 bg-slate/10 dark:bg-navy-700 rounded" />
            </div>
            <div className="h-5 w-16 bg-slate/10 dark:bg-navy-700 rounded-full" />
          </div>

          {/* Flight path skeleton */}
          <div className="flex items-center gap-2 my-3">
            <div className="h-4 w-12 bg-slate/10 dark:bg-navy-700 rounded" />
            <div className="flex-1 h-0.5 bg-slate/10 dark:bg-navy-700 rounded" />
            <div className="w-4 h-4 bg-slate/10 dark:bg-navy-700 rounded" />
            <div className="flex-1 h-0.5 bg-slate/10 dark:bg-navy-700 rounded" />
            <div className="h-4 w-12 bg-slate/10 dark:bg-navy-700 rounded" />
          </div>

          {/* Times skeleton */}
          <div className="flex items-center gap-4">
            <div className="h-4 w-20 bg-slate/10 dark:bg-navy-700 rounded" />
            <div className="h-4 w-20 bg-slate/10 dark:bg-navy-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * FlightStatusWidget - Dashboard widget showing upcoming flight status
 *
 * Features:
 * - Display next 1-2 upcoming flights
 * - Visual flight path indicator (departure -> arrival)
 * - Status indicators: on-time (green), delayed (yellow), cancelled (red)
 * - Gate and terminal information
 * - Relative time display ("Departs in 2 hours")
 * - Loading and empty states
 * - Dark mode support
 */
export default function FlightStatusWidget({
  flights,
  tripTimezone,
  onNavigateToFlight,
  onNavigateToTransportation,
  onRefreshStatus,
  isLoading = false,
}: FlightStatusWidgetProps) {
  // Filter and sort flights to show next 1-2 upcoming ones
  const upcomingFlights = useMemo(() => {
    const now = new Date();

    return flights
      .filter((flight) => {
        // Include scheduled, on_time, delayed, departed flights
        // Exclude arrived and cancelled (unless recent)
        if (flight.status === 'arrived') return false;

        const departureDate = new Date(flight.departureTime);
        // Include flights up to 2 hours after departure (to show in-flight status)
        const cutoffTime = new Date(departureDate.getTime() + 2 * 60 * 60 * 1000);

        // For cancelled flights, only show if departure is in the future
        if (flight.status === 'cancelled') {
          return departureDate > now;
        }

        return cutoffTime > now;
      })
      .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
      .slice(0, 2);
  }, [flights]);

  // Loading state
  if (isLoading) {
    return (
      <div className="card animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-28 bg-slate/10 dark:bg-navy-700 rounded animate-pulse" />
          <div className="h-4 w-4 bg-slate/10 dark:bg-navy-700 rounded animate-pulse" />
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AirplaneIcon className="w-5 h-5 text-primary-500 dark:text-gold" />
          <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
            Flight status
          </h3>
        </div>

        {/* Refresh button */}
        {onRefreshStatus && upcomingFlights.length > 0 && (
          <button
            onClick={onRefreshStatus}
            className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
              hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
            aria-label="Refresh flight status"
          >
            <RefreshIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {upcomingFlights.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {upcomingFlights.map((flight) => (
            <FlightCard
              key={flight.id}
              flight={flight}
              tripTimezone={tripTimezone}
              onNavigate={() => onNavigateToFlight(flight.id)}
            />
          ))}
        </div>
      )}

      {/* Footer link if there are more flights */}
      {flights.length > 2 && (
        <div className="mt-4 pt-3 border-t border-slate/10 dark:border-warm-gray/10">
          <button
            onClick={onNavigateToTransportation || (() => onNavigateToFlight(flights[0]?.id))}
            className="w-full text-center text-sm font-medium text-primary-600 dark:text-gold hover:underline
              py-1.5 rounded-lg hover:bg-primary-50/50 dark:hover:bg-navy-700/30 transition-colors duration-200"
          >
            View all {flights.length} flights
          </button>
        </div>
      )}
    </div>
  );
}
