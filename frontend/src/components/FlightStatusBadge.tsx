import type { FlightTracking } from '../types/transportation';
import { getFlightStatusColor, getDelayColor } from '../utils/statusColors';

interface FlightStatusBadgeProps {
  flightTracking: FlightTracking | null | undefined;
  compact?: boolean;
}

const FLIGHT_STATUS_ICONS: Record<string, string> = {
  scheduled: '🕐',
  active: '✈️',
  landed: '✅',
  cancelled: '❌',
  diverted: '⚠️',
};

/**
 * Format delay in minutes to human-readable string
 */
function formatDelay(delay: number | null): string | null {
  if (delay === null || delay === 0) return null;
  const mins = Math.abs(delay);
  const suffix = mins === 1 ? 'min' : 'mins';
  return delay > 0 ? `+${mins} ${suffix} late` : `${mins} ${suffix} early`;
}

/**
 * Displays flight status with appropriate styling
 * Uses project style guide colors from statusColors utility
 */
export default function FlightStatusBadge({ flightTracking, compact = false }: FlightStatusBadgeProps) {
  if (!flightTracking) {
    return null;
  }

  const { status, gate, terminal, baggageClaim, departureDelay, arrivalDelay, flightNumber } = flightTracking;

  const statusIcon = status ? FLIGHT_STATUS_ICONS[status] || '📋' : '📋';
  const statusColor = getFlightStatusColor(status);
  const departureDelayColor = getDelayColor(departureDelay);
  const arrivalDelayColor = getDelayColor(arrivalDelay);

  const departureDelayText = formatDelay(departureDelay);
  const arrivalDelayText = formatDelay(arrivalDelay);

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {status && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
            role="status"
            aria-label={`Flight status: ${status}`}
          >
            <span aria-hidden="true">{statusIcon}</span> {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )}
        {departureDelayText && (
          <span className={`text-xs ${departureDelayColor}`}>
            {departureDelayText}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-dusk-800 rounded-lg p-3 space-y-2">
      {/* Flight Number and Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {flightNumber && (
            <span className="font-mono font-semibold text-gray-900 dark:text-white">
              {flightNumber}
            </span>
          )}
        </div>
        {status && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}
            role="status"
            aria-label={`Flight status: ${status}`}
          >
            <span aria-hidden="true">{statusIcon}</span> {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )}
      </div>

      {/* Delay Info */}
      {(departureDelayText || arrivalDelayText) && (
        <div className="flex gap-4 text-sm">
          {departureDelayText && (
            <span className={departureDelayColor}>
              Departure: {departureDelayText}
            </span>
          )}
          {arrivalDelayText && (
            <span className={arrivalDelayColor}>
              Arrival: {arrivalDelayText}
            </span>
          )}
        </div>
      )}

      {/* Gate, Terminal, Baggage */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-dusk-400">
        {terminal && (
          <div className="flex items-center gap-1">
            <span className="font-medium">Terminal:</span>
            <span className="text-gray-900 dark:text-white">{terminal}</span>
          </div>
        )}
        {gate && (
          <div className="flex items-center gap-1">
            <span className="font-medium">Gate:</span>
            <span className="text-gray-900 dark:text-white">{gate}</span>
          </div>
        )}
        {baggageClaim && (
          <div className="flex items-center gap-1">
            <span className="font-medium">Baggage:</span>
            <span className="text-gray-900 dark:text-white">{baggageClaim}</span>
          </div>
        )}
      </div>

      {/* Last Updated */}
      {flightTracking.lastUpdatedAt && (
        <div className="text-xs text-gray-500 dark:text-dusk-400">
          Updated: {new Date(flightTracking.lastUpdatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
