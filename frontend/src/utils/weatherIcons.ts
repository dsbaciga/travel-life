import type { IconName } from '../components/ui/Icon';

/**
 * Get weather icon name based on conditions
 */
export const getWeatherIcon = (conditions: string | null): IconName => {
  if (!conditions) return 'weatherUnknown';

  const lower = conditions.toLowerCase();

  // Clear/Sunny
  if (lower.includes('clear') || lower.includes('sunny')) return 'weatherClear';

  // Partly cloudy
  if (lower.includes('partly cloudy') || lower.includes('few clouds'))
    return 'weatherPartlyCloudy';

  // Cloudy
  if (
    lower.includes('cloud') ||
    lower.includes('overcast') ||
    lower.includes('scattered clouds')
  )
    return 'weatherCloudy';

  // Rain
  if (
    lower.includes('rain') ||
    lower.includes('drizzle') ||
    lower.includes('shower')
  )
    return 'weatherRain';

  // Thunderstorm
  if (lower.includes('storm') || lower.includes('thunder')) return 'weatherStorm';

  // Snow
  if (lower.includes('snow') || lower.includes('sleet') || lower.includes('ice'))
    return 'weatherSnow';

  // Fog/Mist
  if (
    lower.includes('fog') ||
    lower.includes('mist') ||
    lower.includes('haze')
  )
    return 'weatherFog';

  // Wind
  if (lower.includes('wind')) return 'weatherWind';

  // Default
  return 'weatherUnknown';
};

/**
 * Format temperature with unit
 */
export const formatTemperature = (
  temp: number | null,
  unit: 'C' | 'F' = 'F'
): string => {
  if (temp === null) return '--';
  return `${Math.round(temp)}°${unit}`;
};

/**
 * Format temperature range (high/low)
 */
export const formatTemperatureRange = (
  high: number | null,
  low: number | null,
  unit: 'C' | 'F' = 'F'
): string => {
  const highStr = formatTemperature(high, unit);
  const lowStr = formatTemperature(low, unit);
  return `${highStr} / ${lowStr}`;
};

/**
 * Format precipitation amount (shows both mm and inches)
 */
export const formatPrecipitation = (precipitation: number | null): string => {
  if (precipitation === null) return '--';
  // Convert mm to inches (1mm = 0.0394 inches)
  const inches = precipitation * 0.0394;
  return `${precipitation.toFixed(1)}mm (${inches.toFixed(2)}")`;
};

/**
 * Format humidity percentage
 */
export const formatHumidity = (humidity: number | null): string => {
  if (humidity === null) return '--';
  return `${Math.round(humidity)}%`;
};

/**
 * Format wind speed
 */
export const formatWindSpeed = (
  windSpeed: number | null,
  unit: 'mph' | 'kph' = 'mph'
): string => {
  if (windSpeed === null) return '--';
  return `${Math.round(windSpeed)} ${unit}`;
};
