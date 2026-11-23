import Icon from '../ui/Icon';
import { useState, useEffect, useMemo } from 'react';
import { useTimezoneResolver } from '../../hooks/useTimezoneResolver';

interface LocalTimeWidgetProps {
  tripTimezone: string; // IANA timezone like 'Europe/Paris'
  homeTimezone?: string; // User's home timezone, defaults to browser timezone
  locationName?: string; // Display name for the destination
  className?: string;
}

/**
 * Clock icon for the widget header
 */
function ClockIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <Icon name="schedule" className={className} />
  );
}

/**
 * Globe icon for home timezone
 */
function GlobeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <Icon name="timezone" className={className} />
  );
}

/**
 * Format time for display with error handling for invalid timezones
 */
function formatTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    }).format(date);
  } catch {
    // Fallback to local time if timezone is invalid
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}

/**
 * Get timezone abbreviation (e.g., 'PST', 'CET') with error handling
 */
function getTimezoneAbbr(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      timeZone: timezone,
    }).formatToParts(date);

    const tzPart = parts.find((part) => part.type === 'timeZoneName');
    return tzPart?.value || timezone.split('/').pop() || '';
  } catch {
    // Return a reasonable fallback for invalid timezone
    return timezone.split('/').pop()?.replace(/_/g, ' ') || 'Local';
  }
}

/**
 * Calculate time difference between two timezones in hours with error handling
 */
function getTimeDifferenceHours(timezone1: string, timezone2: string): number {
  try {
    const now = new Date();

    // Get the offset for each timezone
    const getOffset = (tz: string): number => {
      const date = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      return (date.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
    };

    const offset1 = getOffset(timezone1);
    const offset2 = getOffset(timezone2);

    return offset1 - offset2;
  } catch {
    // Return 0 (same timezone) if calculation fails
    return 0;
  }
}

/**
 * Format the time difference for display
 */
function formatTimeDifference(hours: number): string {
  if (hours === 0) return 'Same time';

  const absHours = Math.abs(hours);
  const sign = hours > 0 ? '+' : '-';

  if (Number.isInteger(absHours)) {
    return `${sign}${absHours} hour${absHours === 1 ? '' : 's'}`;
  }

  // Handle half hours (e.g., India's +5:30)
  const wholeHours = Math.floor(absHours);
  const minutes = Math.round((absHours - wholeHours) * 60);

  if (wholeHours === 0) {
    return `${sign}${minutes} min`;
  }

  return `${sign}${wholeHours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Get day indicator if different from home with error handling
 */
function getDayIndicator(tripTimezone: string, homeTimezone: string): string | null {
  try {
    const now = new Date();

    const tripDay = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: tripTimezone,
    }).format(now);

    const homeDay = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: homeTimezone,
    }).format(now);

    if (tripDay !== homeDay) {
      return tripDay;
    }

    return null;
  } catch {
    // Return null if timezone comparison fails
    return null;
  }
}

/**
 * LocalTimeWidget - Displays current time at trip destination with home timezone comparison
 *
 * Features:
 * - Real-time clock updates every second
 * - Shows time difference from home timezone
 * - Displays timezone abbreviations
 * - Indicates if it's a different day at the destination
 * - Compact design with dark mode support
 */
export default function LocalTimeWidget({
  tripTimezone,
  homeTimezone,
  locationName,
  className = '',
}: LocalTimeWidgetProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const resolveTz = useTimezoneResolver();

  // Home is the viewer's configured zone, then their browser's.
  const resolvedHomeTimezone = useMemo(
    () => resolveTz(homeTimezone),
    [homeTimezone, resolveTz]
  );

  // Check if timezones are the same
  const isSameTimezone = tripTimezone === resolvedHomeTimezone;

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate derived values
  const tripTime = formatTime(currentTime, tripTimezone);
  const tripTimezoneAbbr = getTimezoneAbbr(currentTime, tripTimezone);
  const homeTime = formatTime(currentTime, resolvedHomeTimezone);
  const homeTimezoneAbbr = getTimezoneAbbr(currentTime, resolvedHomeTimezone);
  const timeDifference = getTimeDifferenceHours(tripTimezone, resolvedHomeTimezone);
  const timeDifferenceDisplay = formatTimeDifference(timeDifference);
  const dayIndicator = getDayIndicator(tripTimezone, resolvedHomeTimezone);

  // Display name for destination
  const destinationLabel = locationName || tripTimezone.split('/').pop()?.replace(/_/g, ' ') || 'Destination';

  return (
    <div className={`card animate-fade-in ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <ClockIcon className="w-5 h-5 text-primary-500 dark:text-gold" />
        <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body text-sm">
          Local time
        </h3>
      </div>

      {/* Destination Time - Large Display */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-display font-bold text-charcoal dark:text-warm-gray tabular-nums">
            {tripTime}
          </span>
          <span className="text-sm font-medium text-slate dark:text-warm-gray/70">
            {tripTimezoneAbbr}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-slate dark:text-warm-gray/70 truncate">
            {destinationLabel}
          </span>
          {dayIndicator && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {dayIndicator}
            </span>
          )}
        </div>
      </div>

      {/* Time Difference Badge */}
      {!isSameTimezone && (
        <div className="mb-3">
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
              ${timeDifference > 0
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : timeDifference < 0
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}
          >
            {timeDifferenceDisplay} from home
          </span>
        </div>
      )}

      {/* Home Time - Compact Display */}
      {!isSameTimezone && (
        <div className="pt-3 border-t border-slate/10 dark:border-warm-gray/10">
          <div className="flex items-center gap-2">
            <GlobeIcon className="w-4 h-4 text-slate dark:text-warm-gray/50" />
            <span className="text-xs text-slate dark:text-warm-gray/60">Home</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-body font-semibold text-charcoal/80 dark:text-warm-gray/80 tabular-nums">
              {homeTime}
            </span>
            <span className="text-xs text-slate dark:text-warm-gray/60">
              {homeTimezoneAbbr}
            </span>
          </div>
        </div>
      )}

      {/* Same timezone indicator */}
      {isSameTimezone && (
        <div className="pt-2">
          <span className="text-xs text-slate dark:text-warm-gray/60">
            Same as home timezone
          </span>
        </div>
      )}
    </div>
  );
}
