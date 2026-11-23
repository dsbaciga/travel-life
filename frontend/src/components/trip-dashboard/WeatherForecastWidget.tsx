/**
 * WeatherForecastWidget Component
 *
 * Displays a 5-day weather forecast for the trip destination:
 * - Temperature range (high/low) with unit conversion
 * - Weather condition icons (sunny, cloudy, rainy, etc.)
 * - Humidity and precipitation data
 * - Optional pack recommendations based on conditions
 * - Only intended for upcoming or in-progress trips
 *
 * Features:
 * - Horizontal scrollable on mobile
 * - Loading skeleton state
 * - Error state with refresh option
 * - Empty state when no forecast available
 * - Full dark mode support
 */

import Icon from '../ui/Icon';
import { useMemo } from 'react';
import { useUnits } from '../../hooks/useUnits';

// Weather condition type
type WeatherCondition =
  | 'sunny'
  | 'partly_cloudy'
  | 'cloudy'
  | 'rainy'
  | 'stormy'
  | 'snowy'
  | 'windy';

export interface ForecastDay {
  date: string;
  high: number;
  low: number;
  condition: WeatherCondition;
  humidity?: number;
  precipitation?: number;
}

export interface WeatherForecastWidgetProps {
  forecast: ForecastDay[] | null;
  location: string;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

/**
 * Weather condition icon components
 */
function SunnyIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <Icon name="weatherClear" className={className} />
  );
}

function PartlyCloudyIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <Icon name="weatherPartlyCloudy" className={className} />
  );
}

function CloudyIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <Icon name="weatherCloudy" className={className} />
  );
}

function RainyIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <Icon name="weatherRain" className={className} />
  );
}

function StormyIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <Icon name="weatherStorm" className={className} />
  );
}

function SnowyIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <Icon name="weatherSnow" className={className} />
  );
}

function WindyIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <Icon name="weatherWind" className={className} />
  );
}

/**
 * Get the appropriate icon component for a weather condition
 */
function WeatherIcon({
  condition,
  className,
}: {
  condition: WeatherCondition;
  className?: string;
}) {
  const iconMap: Record<WeatherCondition, React.FC<{ className?: string }>> = {
    sunny: SunnyIcon,
    partly_cloudy: PartlyCloudyIcon,
    cloudy: CloudyIcon,
    rainy: RainyIcon,
    stormy: StormyIcon,
    snowy: SnowyIcon,
    windy: WindyIcon,
  };

  const IconComponent = iconMap[condition];
  return <IconComponent className={className} />;
}

/**
 * Get icon color based on condition
 */
function getConditionColor(condition: WeatherCondition): string {
  const colorMap: Record<WeatherCondition, string> = {
    sunny: 'text-amber-500 dark:text-amber-400',
    partly_cloudy: 'text-amber-400 dark:text-amber-300',
    cloudy: 'text-slate dark:text-warm-gray',
    rainy: 'text-blue-500 dark:text-blue-400',
    stormy: 'text-purple-500 dark:text-purple-400',
    snowy: 'text-sky-400 dark:text-sky-300',
    windy: 'text-teal-500 dark:text-teal-400',
  };
  return colorMap[condition];
}

/**
 * Get human-readable condition name
 */
function getConditionLabel(condition: WeatherCondition): string {
  const labelMap: Record<WeatherCondition, string> = {
    sunny: 'Sunny',
    partly_cloudy: 'Partly Cloudy',
    cloudy: 'Cloudy',
    rainy: 'Rainy',
    stormy: 'Stormy',
    snowy: 'Snowy',
    windy: 'Windy',
  };
  return labelMap[condition];
}

/**
 * Format date for display (e.g., "Mon", "Tue")
 */
function formatDayName(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Format date for accessibility (e.g., "Monday, January 27")
 */
function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Check if date is today
 */
function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Generate pack recommendations based on weather conditions
 * Forecast temperatures are stored in degrees Fahrenheit whatever the user's units, so the
 * thresholds are Fahrenheit; only the display is converted.
 */
function getPackRecommendations(forecast: ForecastDay[]): string[] {
  const recommendations: Set<string> = new Set();

  const coldThreshold = 50; // 10°C
  const hotThreshold = 86; // 30°C

  forecast.forEach((day) => {
    // Temperature-based recommendations
    if (day.low < coldThreshold) {
      recommendations.add('Warm jacket');
      recommendations.add('Layers');
    }
    if (day.high > hotThreshold) {
      recommendations.add('Sunscreen');
      recommendations.add('Hat');
      recommendations.add('Light clothing');
    }

    // Condition-based recommendations
    switch (day.condition) {
      case 'rainy':
      case 'stormy':
        recommendations.add('Umbrella');
        recommendations.add('Rain jacket');
        recommendations.add('Waterproof shoes');
        break;
      case 'snowy':
        recommendations.add('Winter boots');
        recommendations.add('Warm gloves');
        recommendations.add('Scarf');
        break;
      case 'sunny':
        recommendations.add('Sunglasses');
        recommendations.add('Sunscreen');
        break;
      case 'windy':
        recommendations.add('Windbreaker');
        break;
    }

    // Humidity-based recommendations
    if (day.humidity && day.humidity > 80) {
      recommendations.add('Moisture-wicking clothes');
    }
  });

  return Array.from(recommendations).slice(0, 5);
}

/**
 * Refresh icon
 */
function RefreshIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <Icon name="refresh" className={className} />
  );
}

/**
 * Location pin icon
 */
function LocationIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <Icon name="place" className={className} />
  );
}

/**
 * Individual forecast day card
 */
interface ForecastDayCardProps {
  day: ForecastDay;
  isFirst?: boolean;
}

function ForecastDayCard({ day, isFirst = false }: ForecastDayCardProps) {
  const { formatTemperature } = useUnits();
  const today = isToday(day.date);

  return (
    <li
      className={`flex-shrink-0 flex flex-col items-center p-3 rounded-xl transition-all duration-200
        ${
          today
            ? 'bg-primary-50 dark:bg-gold/10 ring-1 ring-primary-200 dark:ring-gold/30'
            : 'bg-slate/5 dark:bg-navy-700/50 hover:bg-slate/10 dark:hover:bg-navy-700'
        }
        ${isFirst ? 'ml-0' : ''}
      `}
      aria-label={`Weather for ${formatFullDate(day.date)}`}
    >
      {/* Day name */}
      <span
        className={`eyebrow mb-2
          ${today ? 'text-primary-600 dark:text-gold' : 'text-slate dark:text-warm-gray/70'}
        `}
      >
        {today ? 'Today' : formatDayName(day.date)}
      </span>

      {/* Weather icon */}
      <div className={`mb-2 ${getConditionColor(day.condition)}`}>
        <WeatherIcon condition={day.condition} className="w-10 h-10" />
      </div>

      {/* Temperature range */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-base font-bold text-charcoal dark:text-warm-gray">
          {formatTemperature(day.high)}
        </span>
        <span className="text-sm text-slate dark:text-warm-gray/60">
          {formatTemperature(day.low)}
        </span>
      </div>

      {/* Condition label */}
      <span className="text-xs text-slate dark:text-warm-gray/70 mt-1.5 text-center">
        {getConditionLabel(day.condition)}
      </span>

      {/* Precipitation if available */}
      {day.precipitation !== undefined && day.precipitation > 0 && (
        <div className="flex items-center gap-1 mt-1.5 text-blue-500 dark:text-blue-400">
          <Icon name="humidity" className="w-3 h-3" />
          <span className="text-xs font-medium">{day.precipitation}%</span>
        </div>
      )}
    </li>
  );
}

/**
 * Loading skeleton state
 */
function LoadingSkeleton() {
  return (
    <div className="card animate-fade-in">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 bg-slate/10 dark:bg-navy-700 rounded w-32 animate-pulse" />
        <div className="h-4 bg-slate/10 dark:bg-navy-700 rounded w-4 animate-pulse" />
      </div>

      {/* Location skeleton */}
      <div className="flex items-center gap-2 mb-4">
        <div className="h-4 w-4 bg-slate/10 dark:bg-navy-700 rounded animate-pulse" />
        <div className="h-4 bg-slate/10 dark:bg-navy-700 rounded w-24 animate-pulse" />
      </div>

      {/* Forecast cards skeleton */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 flex flex-col items-center p-3 rounded-xl bg-slate/5 dark:bg-navy-700/50 w-20"
          >
            <div className="h-3 bg-slate/10 dark:bg-navy-600 rounded w-8 mb-2 animate-pulse" />
            <div className="h-10 w-10 bg-slate/10 dark:bg-navy-600 rounded-full mb-2 animate-pulse" />
            <div className="h-4 bg-slate/10 dark:bg-navy-600 rounded w-10 mb-1 animate-pulse" />
            <div className="h-3 bg-slate/10 dark:bg-navy-600 rounded w-8 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState({ error, onRefresh }: { error: string; onRefresh?: () => void }) {
  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
          Weather Forecast
        </h3>
      </div>

      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-3">
          <Icon name="alert" className="w-6 h-6 text-red-500 dark:text-red-400" />
        </div>
        <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">
          Unable to load forecast
        </p>
        <p className="text-xs text-slate dark:text-warm-gray/70 mb-4">{error}</p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium
              text-primary-600 dark:text-gold hover:text-primary-700 dark:hover:text-amber-300
              rounded-lg hover:bg-primary-50 dark:hover:bg-navy-700
              transition-colors duration-200
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
          >
            <RefreshIcon className="w-4 h-4" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState({ location }: { location: string }) {
  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
          Weather Forecast
        </h3>
      </div>

      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="w-12 h-12 rounded-full bg-slate/10 dark:bg-navy-700 flex items-center justify-center mb-3">
          <CloudyIcon className="w-6 h-6 text-slate/50 dark:text-warm-gray/50" />
        </div>
        <p className="text-sm text-slate dark:text-warm-gray font-medium mb-1">
          Forecast unavailable
        </p>
        <p className="text-xs text-slate/70 dark:text-warm-gray/70">
          {location
            ? `Weather data for ${location} is not available at this time`
            : 'Add a destination to see weather forecast'}
        </p>
      </div>
    </div>
  );
}

/**
 * Pack recommendations badge
 */
function PackRecommendation({ item }: { item: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
        bg-primary-50 text-primary-700 dark:bg-gold/10 dark:text-gold
        transition-colors duration-200"
    >
      {item}
    </span>
  );
}

/**
 * Main WeatherForecastWidget component
 */
export default function WeatherForecastWidget({
  forecast,
  location,
  isLoading = false,
  error = null,
  onRefresh,
}: WeatherForecastWidgetProps) {
  // Generate pack recommendations
  const packRecommendations = useMemo(() => {
    if (!forecast || forecast.length === 0) return [];
    return getPackRecommendations(forecast);
  }, [forecast]);

  // Loading state
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (error) {
    return <ErrorState error={error} onRefresh={onRefresh} />;
  }

  // Empty state
  if (!forecast || forecast.length === 0) {
    return <EmptyState location={location} />;
  }

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-charcoal dark:text-warm-gray font-body">
          Weather Forecast
        </h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg text-slate hover:text-primary-600 dark:text-warm-gray/50 dark:hover:text-gold
              hover:bg-primary-50 dark:hover:bg-navy-700 transition-colors duration-200"
            aria-label="Refresh forecast"
          >
            <RefreshIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Location */}
      {location && (
        <div className="flex items-center gap-1.5 mb-4 text-slate dark:text-warm-gray/70">
          <LocationIcon className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm truncate">{location}</span>
        </div>
      )}

      {/* Forecast cards - horizontal scroll on mobile */}
      <ul
        className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide list-none"
        aria-label="5-day weather forecast"
      >
        {forecast.map((day, index) => (
          <ForecastDayCard
            key={day.date}
            day={day}
            isFirst={index === 0}
          />
        ))}
      </ul>

      {/* Pack recommendations */}
      {packRecommendations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate/10 dark:border-warm-gray/10">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="luggage" className="w-4 h-4 text-primary-500 dark:text-gold" />
            <span className="text-slate dark:text-warm-gray/70 eyebrow">
              Pack for your trip
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {packRecommendations.map((item) => (
              <PackRecommendation key={item} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
