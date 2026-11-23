import Icon from './ui/Icon';
import { useState } from 'react';
import { useUnits } from '../hooks/useUnits';
import type { WeatherDisplay } from '../types/weather';
import {
  getWeatherIcon,
  formatPrecipitation,
  formatHumidity,
  formatWindSpeed,
} from '../utils/weatherIcons';

interface WeatherCardProps {
  weather: WeatherDisplay;
  compact?: boolean;
  tripTimezone?: string;
}

/**
 * Format a time string for display in a specific timezone
 * Returns time in format like "6:42 AM"
 */
function formatTimeInTimezone(isoDatetime: string | null, timezone?: string): string | null {
  if (!isoDatetime) return null;
  try {
    const date = new Date(isoDatetime);
    if (isNaN(date.getTime())) return null;

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
    return null;
  }
}

export default function WeatherCard({
  weather,
  compact = true,
  tripTimezone,
}: WeatherCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const icon = getWeatherIcon(weather.conditions);
  const { formatTemperature } = useUnits();
  const fmt = (t: number | null) => (t === null ? '--' : formatTemperature(t));
  const tempRange = `${fmt(weather.high)} / ${fmt(weather.low)}`;

  if (compact) {
    return (
      <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name={icon} size={32} title="Weather icon" />
            <div className="min-w-0">
              {weather.locationName && (
                <div className="text-xs text-gray-500 dark:text-dusk-400 flex items-center gap-1 min-w-0">
                  <Icon name="place" className="w-3 h-3 shrink-0" />
                  <span className="truncate">{weather.locationName}</span>
                </div>
              )}
              <div className="text-sm font-medium text-gray-700 dark:text-dusk-300 capitalize truncate">
                {weather.conditions || 'No data'}
              </div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {tempRange}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-dusk-400 flex-shrink-0">
            {weather.precipitation !== null && (
              <div className="flex items-center gap-1">
                <Icon name="weatherRain" size={16} />
                <span>{formatPrecipitation(weather.precipitation)}</span>
              </div>
            )}

            {weather.humidity !== null && (
              <div className="flex items-center gap-1">
                <Icon name="humidity" size={16} />
                <span>{formatHumidity(weather.humidity)}</span>
              </div>
            )}

            {showDetails && weather.windSpeed !== null && (
              <div className="flex items-center gap-1">
                <Icon name="weatherWind" size={16} />
                <span>{formatWindSpeed(weather.windSpeed)}</span>
              </div>
            )}

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
              aria-label={showDetails ? 'Hide details' : 'Show details'}
            >
              {showDetails ? '−' : '+'}
            </button>
          </div>
        </div>

        {showDetails && (
          <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-500 dark:text-dusk-400">
                  Precipitation
                </div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {formatPrecipitation(weather.precipitation)}
                </div>
              </div>
              <div>
                <div className="text-gray-500 dark:text-dusk-400">Humidity</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {formatHumidity(weather.humidity)}
                </div>
              </div>
              <div>
                <div className="text-gray-500 dark:text-dusk-400">Wind speed</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {formatWindSpeed(weather.windSpeed)}
                </div>
              </div>
            </div>
            {(weather.sunrise || weather.sunset) && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 flex items-center gap-6 text-sm">
                {weather.sunrise && (
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500">sunrise</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatTimeInTimezone(weather.sunrise, tripTimezone)}
                    </span>
                  </div>
                )}
                {weather.sunset && (
                  <div className="flex items-center gap-2">
                    <span className="text-orange-500">sunset</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatTimeInTimezone(weather.sunset, tripTimezone)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Expanded view (for future use)
  return (
    <div className="p-4 bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-4 mb-4">
        <Icon name={icon} size={48} title="Weather icon" />
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {tempRange}
          </div>
          <div className="text-lg text-gray-700 dark:text-dusk-300 capitalize">
            {weather.conditions || 'No data'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-gray-500 dark:text-dusk-400">Precipitation</div>
          <div className="font-medium text-gray-900 dark:text-white">
            {formatPrecipitation(weather.precipitation)}
          </div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-dusk-400">Humidity</div>
          <div className="font-medium text-gray-900 dark:text-white">
            {formatHumidity(weather.humidity)}
          </div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-dusk-400">Wind speed</div>
          <div className="font-medium text-gray-900 dark:text-white">
            {formatWindSpeed(weather.windSpeed)}
          </div>
        </div>
      </div>

      {(weather.sunrise || weather.sunset) && (
        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800 flex items-center gap-6 text-sm">
          {weather.sunrise && (
            <div className="flex items-center gap-2">
              <span className="text-amber-500">sunrise</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatTimeInTimezone(weather.sunrise, tripTimezone)}
              </span>
            </div>
          )}
          {weather.sunset && (
            <div className="flex items-center gap-2">
              <span className="text-orange-500">sunset</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatTimeInTimezone(weather.sunset, tripTimezone)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
