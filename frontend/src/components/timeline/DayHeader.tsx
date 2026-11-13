import { ChevronDownIcon, ChevronUpIcon } from './icons';
import { getTimezoneAbbr } from './utils';
import type { DayHeaderProps } from './types';
import type { WeatherDisplay } from '../../types/weather';

interface WeatherBadgeProps {
  weather: WeatherDisplay;
}

function WeatherBadge({ weather }: WeatherBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
      <span>{weather.icon}</span>
      <span className="font-medium">
        {weather.high !== null && weather.high !== undefined ? Math.round(weather.high) : '--'}°
        {weather.low !== null && weather.low !== undefined && (
          <span className="text-blue-500 dark:text-blue-400">
            /{Math.round(weather.low)}°
          </span>
        )}
      </span>
      {weather.conditions && (
        <span className="hidden sm:inline text-xs text-blue-600 dark:text-blue-400">
          {weather.conditions}
        </span>
      )}
    </div>
  );
}

interface SunriseSunsetBadgeProps {
  sunrise: string | null;
  sunset: string | null;
  tripTimezone?: string;
}

/**
 * Format a time string for display in a specific timezone
 * Returns time in format like "6:42 AM"
 */
function formatTimeInTimezone(isoDatetime: string, timezone?: string): string {
  try {
    const date = new Date(isoDatetime);
    if (isNaN(date.getTime())) return '';

    const options: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };

    if (timezone) {
      options.timeZone = timezone;
    }

    return date.toLocaleTimeString('en-US', options);
  } catch {
    return '';
  }
}

function SunriseSunsetBadge({ sunrise, sunset, tripTimezone }: SunriseSunsetBadgeProps) {
  // Only show if we have at least one of sunrise/sunset
  if (!sunrise && !sunset) {
    return null;
  }

  const sunriseTime = sunrise ? formatTimeInTimezone(sunrise, tripTimezone) : null;
  const sunsetTime = sunset ? formatTimeInTimezone(sunset, tripTimezone) : null;

  if (!sunriseTime && !sunsetTime) {
    return null;
  }

  return (
    <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
      {sunriseTime && (
        <span className="flex items-center gap-1">
          <span>sunrise</span>
          <span className="font-medium">{sunriseTime}</span>
        </span>
      )}
      {sunriseTime && sunsetTime && (
        <span className="text-amber-400 dark:text-amber-500">·</span>
      )}
      {sunsetTime && (
        <span className="flex items-center gap-1">
          <span>sunset</span>
          <span className="font-medium">{sunsetTime}</span>
        </span>
      )}
    </div>
  );
}

export default function DayHeader({
  date,
  dayNumber,
  tripTimezone,
  userTimezone,
  weather,
  stats,
  eventCount,
  isCollapsed,
  onToggleCollapse,
}: DayHeaderProps) {
  const showDualTimezone = tripTimezone && userTimezone && tripTimezone !== userTimezone;

  // Build stats string
  const statParts: string[] = [];
  if (stats.activities > 0) {
    statParts.push(`${stats.activities} ${stats.activities === 1 ? 'activity' : 'activities'}`);
  }
  if (stats.transportation > 0) {
    statParts.push(`${stats.transportation} ${stats.transportation === 1 ? 'transport' : 'transports'}`);
  }
  if (stats.lodging > 0) {
    statParts.push(`${stats.lodging} ${stats.lodging === 1 ? 'lodging' : 'lodgings'}`);
  }
  if (stats.journal > 0) {
    statParts.push(`${stats.journal} ${stats.journal === 1 ? 'journal' : 'journals'}`);
  }
  if (stats.customItems > 0) {
    statParts.push(`${stats.customItems} custom`);
  }
  if (stats.totalPhotosLinked > 0) {
    statParts.push(`${stats.totalPhotosLinked} ${stats.totalPhotosLinked === 1 ? 'photo' : 'photos'}`);
  }

  const statsString = statParts.length > 0 ? statParts.join(' · ') : 'No events';

  return (
    <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-dusk-800 dark:to-dusk-700 border-b border-gray-200 dark:border-dusk-700 px-4 py-3 rounded-t-xl">
      <div className="flex items-center justify-between">
        {/* Left side: Date and stats */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {dayNumber && dayNumber > 0 ? `Day ${dayNumber} - ` : ''}
              {new Date(date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
            {weather && <WeatherBadge weather={weather} />}
            {weather && (
              <SunriseSunsetBadge
                sunrise={weather.sunrise}
                sunset={weather.sunset}
                tripTimezone={tripTimezone}
              />
            )}
          </div>

          {/* Stats row */}
          <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-dusk-400">
            <span>{statsString}</span>

            {/* Dual timezone indicator - desktop only */}
            {showDualTimezone && (
              <span className="hidden lg:flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-dusk-700">
                  {getTimezoneAbbr(tripTimezone)}
                </span>
                <span className="text-gray-400">/</span>
                <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-dusk-700">
                  {getTimezoneAbbr(userTimezone)}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Right side: Collapse toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-600 dark:text-dusk-400 hover:bg-gray-200 dark:hover:bg-dusk-700 transition-colors"
        >
          <span className="text-sm font-medium">
            {eventCount} {eventCount === 1 ? 'event' : 'events'}
          </span>
          {isCollapsed ? (
            <ChevronDownIcon className="w-5 h-5" />
          ) : (
            <ChevronUpIcon className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
