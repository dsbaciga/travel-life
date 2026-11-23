import type { IconName } from '../components/ui/Icon';

export type WeatherData = {
  id: number;
  tripId: number;
  locationId: number | null;
  locationName?: string | null; // Name of the location used for weather data
  date: string; // ISO date string
  temperatureHigh: number | null;
  temperatureLow: number | null;
  conditions: string | null;
  precipitation: number | null;
  humidity: number | null;
  windSpeed: number | null;
  sunrise: string | null; // ISO datetime string for sunrise
  sunset: string | null; // ISO datetime string for sunset
  fetchedAt: string; // ISO datetime string
  createdAt: string;
};

export type WeatherDisplay = {
  date: string;
  high: number | null;
  low: number | null;
  conditions: string | null;
  icon: IconName;
  precipitation: number | null;
  humidity: number | null;
  windSpeed: number | null;
  locationName?: string | null;
  sunrise: string | null; // ISO datetime string for sunrise
  sunset: string | null; // ISO datetime string for sunset
};
