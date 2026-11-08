import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { WeatherDataInput } from '../types/weather.types';
import config from '../config';
import axios, { AxiosRequestConfig } from 'axios';
import { verifyTripAccess } from '../services/_shared/tripAccess';
import { convertDecimals } from '../services/_shared/decimalConversion';
import { isAxiosError } from '../types/prisma-helpers';
import { decryptSecret } from '../security/encryption';

interface OpenWeatherResponse {
  daily: {
    dt: number;
    sunrise: number; // Unix timestamp for sunrise
    sunset: number; // Unix timestamp for sunset
    temp: {
      day: number;
      min: number;
      max: number;
    };
    weather: {
      description: string;
      main: string;
    }[];
    pop: number; // Probability of precipitation (0-1)
    humidity: number;
    wind_speed: number;
    rain?: number | { '1h'?: number }; // Rain volume in mm (can be number or nested object)
    snow?: number | { '1h'?: number }; // Snow volume in mm (can be number or nested object)
  }[];
}

interface OpenWeatherHistoricalResponse {
  data: {
    dt: number;
    temp: number;
    humidity: number;
    wind_speed: number;
    weather: {
      description: string;
      main: string;
    }[];
    rain?: {
      '1h'?: number; // Rain volume for last hour, mm
    };
    snow?: {
      '1h'?: number; // Snow volume for last hour, mm
    };
  }[];
}

/**
 * Simple concurrency limiter - processes promises with max concurrent limit.
 * Avoids unbounded parallel API calls that can trigger rate limiting.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  const executing: Set<Promise<void>> = new Set();

  for (let i = 0; i < items.length; i++) {
    const promise = fn(items[i]).then(result => {
      results[i] = result;
    });
    const wrapped = promise.finally(() => { executing.delete(wrapped); });
    executing.add(wrapped);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

class WeatherService {
  private readonly API_KEY = config.openWeatherMap.apiKey;
  private readonly CACHE_HOURS = 6;

  /**
   * Get weather data for a trip's date range
   * Uses per-day location selection to support trips spanning multiple regions
   */
  async getWeatherForTrip(tripId: number, userId: number) {
    // Verify user owns the trip
    await verifyTripAccess(userId, tripId);

    // Get user's API key
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        user: {
          select: {
            weatherApiKey: true,
          },
        },
      },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    // Check if trip has dates
    if (!trip.startDate || !trip.endDate) {
      return []; // No dates, no weather
    }

    // Get API key (user's key or system key)
    const apiKey = decryptSecret(trip.user.weatherApiKey) || this.API_KEY;

    if (!apiKey) {
      console.warn('No weather API key configured');
      return []; // No API key available
    }

    // Generate array of dates in the trip range
    const dates = this.getDateRange(trip.startDate, trip.endDate);

    // Fetch or retrieve weather for each date
    // Each day gets its own coordinates based on locations/activities/lodging for that day
    let weatherData: (Awaited<ReturnType<typeof this.getWeatherForDate>> | null)[];
    try {
      weatherData = await mapWithConcurrency(
        dates,
        async (date) => {
          // Get coordinates for this specific day
          const coordinates = await this.getTripCoordinates(tripId, date);
          const dateString = date.toISOString().split('T')[0];

          if (!coordinates) {
            console.warn(`No coordinates available for ${dateString}`);
            return null;
          }

          if (process.env.NODE_ENV === 'development') {
            console.log(`[Weather] ${dateString}: Using location "${coordinates.locationName || 'Unknown'}" (lat: ${coordinates.lat.toFixed(4)}, lon: ${coordinates.lon.toFixed(4)})`);
          }

          return this.getWeatherForDate(tripId, coordinates, date, apiKey);
        },
        5 // Max 5 concurrent API requests to avoid rate limiting
      );
    } catch (error) {
      console.error(`Failed to fetch weather data for trip ${tripId}:`, error);
      throw new Error('Failed to fetch weather data for trip: ' + (error as Error).message);
    }

    return convertDecimals(weatherData.filter((w) => w !== null));
  }

  /**
   * Get weather for a specific date, using cache when appropriate
   */
  private async getWeatherForDate(
    tripId: number,
    coordinates: { lat: number; lon: number; locationId?: number; locationName?: string },
    date: Date,
    apiKey: string
  ) {
    const dateString = date.toISOString().split('T')[0];

    // Check if we have cached weather data (include location for name)
    const cached = await prisma.weatherData.findFirst({
      where: {
        tripId,
        date: new Date(dateString),
      },
      include: {
        location: {
          select: { name: true },
        },
      },
    });

    // Determine if we should use the cache
    if (cached && !this.shouldRefreshWeather(cached, date)) {
      // Return with locationName added
      return {
        ...cached,
        locationName: cached.location?.name || coordinates.locationName || null,
      };
    }

    // Fetch fresh weather data from API
    try {
      const weatherData = await this.fetchWeatherFromAPI(
        coordinates.lat,
        coordinates.lon,
        date,
        apiKey
      );

      // If API returned null (e.g., historical data unavailable), return cached or null
      if (!weatherData) {
        console.warn(`Weather data not available for date ${dateString}`);
        if (cached) {
          return {
            ...cached,
            locationName: cached.location?.name || coordinates.locationName || null,
          };
        }
        return null;
      }

      // Save to database
      if (cached) {
        // Update existing record (also update locationId if changed)
        const updated = await prisma.weatherData.update({
          where: { id: cached.id },
          data: {
            temperatureHigh: weatherData.temperatureHigh,
            temperatureLow: weatherData.temperatureLow,
            conditions: weatherData.conditions,
            precipitation: weatherData.precipitation,
            humidity: weatherData.humidity,
            windSpeed: weatherData.windSpeed,
            sunrise: weatherData.sunrise ? new Date(weatherData.sunrise) : null,
            sunset: weatherData.sunset ? new Date(weatherData.sunset) : null,
            locationId: coordinates.locationId || null,
            fetchedAt: new Date(),
          },
          include: {
            location: {
              select: { name: true },
            },
          },
        });
        return {
          ...updated,
          locationName: updated.location?.name || coordinates.locationName || null,
        };
      } else {
        // Upsert rather than create: the cache check above is a read, so two
        // concurrent requests for the same trip/day could both miss it and both
        // insert. `@@unique([tripId, date])` plus upsert makes that race a
        // no-op update instead of a duplicate row (or a constraint violation).
        const weatherRow = {
          temperatureHigh: weatherData.temperatureHigh,
          temperatureLow: weatherData.temperatureLow,
          conditions: weatherData.conditions,
          precipitation: weatherData.precipitation,
          humidity: weatherData.humidity,
          windSpeed: weatherData.windSpeed,
          sunrise: weatherData.sunrise ? new Date(weatherData.sunrise) : null,
          sunset: weatherData.sunset ? new Date(weatherData.sunset) : null,
          locationId: coordinates.locationId || null,
          fetchedAt: new Date(),
        };

        const created = await prisma.weatherData.upsert({
          where: {
            tripId_date: {
              tripId,
              date: new Date(dateString),
            },
          },
          create: {
            tripId,
            date: new Date(dateString),
            ...weatherRow,
          },
          update: weatherRow,
          include: {
            location: {
              select: { name: true },
            },
          },
        });
        return {
          ...created,
          locationName: created.location?.name || coordinates.locationName || null,
        };
      }
    } catch (error) {
      console.error('Failed to fetch weather from API:', error);
      // Return cached data if available, even if stale
      if (cached) {
        return {
          ...cached,
          locationName: cached.location?.name || coordinates.locationName || null,
        };
      }
      return null;
    }
  }

  /**
   * Fetch weather from OpenWeatherMap API
   *
   * Uses One Call API 3.0 which requires a separate subscription:
   * - Forecast data: /data/3.0/onecall (8-day daily forecast)
   * - Historical data: /data/3.0/onecall/timemachine (requires paid subscription)
   *
   * Note: One Call API 3.0 provides 1,000 complimentary daily calls,
   * additional calls are billed on a pay-per-use basis.
   *
   * Returns null if historical data is unavailable (403 error for paid subscription)
   */
  private async fetchWeatherFromAPI(
    lat: number,
    lon: number,
    targetDate: Date,
    apiKey: string
  ): Promise<WeatherDataInput | null> {
    const now = new Date();
    const daysFromNow = Math.floor(
      (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Use One Call API 3.0 for forecast data
    // Supports current + 8-day daily forecast (0-7 days ahead)
    if (daysFromNow >= 0 && daysFromNow <= 7) {
      return await this.fetchForecastWeather(lat, lon, targetDate, daysFromNow, apiKey);
    }

    // For dates beyond 7 days in the future, use the last available forecast day
    if (daysFromNow > 7) {
      // Use day 7 forecast as placeholder
      return await this.fetchForecastWeather(lat, lon, targetDate, 7, apiKey);
    }

    // For past dates, try to fetch historical data
    // Note: Historical data requires a paid One Call API 3.0 subscription
    if (daysFromNow < 0) {
      return await this.fetchHistoricalWeather(lat, lon, targetDate, apiKey);
    }

    throw new AppError(
      'Unable to fetch weather data for this date',
      400
    );
  }

  /**
   * Fetch forecast weather from One Call API 3.0
   */
  private async fetchForecastWeather(
    lat: number,
    lon: number,
    targetDate: Date,
    dayIndex: number,
    apiKey: string
  ): Promise<WeatherDataInput> {
    const url = 'https://api.openweathermap.org/data/3.0/onecall';

    try {
      const response = await this.fetchWithRetry(url, {
        params: {
          lat,
          lon,
          exclude: 'current,minutely,hourly,alerts',
          units: 'imperial', // Default to Fahrenheit, can be made configurable
          appid: apiKey,
        },
      });

      const data = response as OpenWeatherResponse;

      if (!data.daily || !data.daily[dayIndex]) {
        throw new AppError('Weather data not available for this date', 404);
      }

      const dayData = data.daily[dayIndex];

      // Debug: log what the API returns including temperature data
      if (process.env.NODE_ENV === 'development') {
        console.log(`Weather API response for day ${dayIndex}:`, {
          date: targetDate.toISOString().split('T')[0],
          conditions: dayData.weather[0]?.description,
          temp: {
            max: dayData.temp.max,
            min: dayData.temp.min,
            day: dayData.temp.day,
          },
          pop: dayData.pop,
          rain: dayData.rain,
          snow: dayData.snow,
          hasRainField: 'rain' in dayData,
          hasSnowField: 'snow' in dayData,
        });
      }

      // Calculate total precipitation (rain + snow) in mm
      // Note: rain/snow fields are only present when there's measurable precipitation
      // The API returns these as numbers (daily totals) for One Call API 3.0
      const getRainAmount = (rain: number | { '1h'?: number } | undefined): number => {
        if (rain === undefined) return 0;
        if (typeof rain === 'number') return rain;
        return rain['1h'] || 0;
      };
      const getSnowAmount = (snow: number | { '1h'?: number } | undefined): number => {
        if (snow === undefined) return 0;
        if (typeof snow === 'number') return snow;
        return snow['1h'] || 0;
      };
      const rainAmount = getRainAmount(dayData.rain);
      const snowAmount = getSnowAmount(dayData.snow);
      const totalPrecipitation = rainAmount + snowAmount;

      // Convert Unix timestamps to ISO datetime strings for sunrise/sunset
      const sunriseDate = dayData.sunrise ? new Date(dayData.sunrise * 1000).toISOString() : null;
      const sunsetDate = dayData.sunset ? new Date(dayData.sunset * 1000).toISOString() : null;

      return {
        tripId: 0, // Will be set by caller
        date: targetDate.toISOString().split('T')[0],
        temperatureHigh: Math.round(dayData.temp.max),
        temperatureLow: Math.round(dayData.temp.min),
        conditions: dayData.weather[0]?.description || null,
        precipitation: totalPrecipitation > 0 ? Math.round(totalPrecipitation * 10) / 10 : null, // mm, rounded to 1 decimal
        humidity: dayData.humidity,
        windSpeed: Math.round(dayData.wind_speed * 10) / 10, // Round to 1 decimal
        sunrise: sunriseDate,
        sunset: sunsetDate,
      };
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 401) {
        throw new AppError('Invalid OpenWeatherMap API key', 500);
      }
      throw error;
    }
  }

  /**
   * Fetch historical weather data from OpenWeatherMap Timemachine API
   * This uses the One Call API 3.0 Timemachine endpoint
   *
   * Note: Returns null gracefully if historical data is unavailable (403 error for paid subscription)
   */
  private async fetchHistoricalWeather(
    lat: number,
    lon: number,
    targetDate: Date,
    apiKey: string
  ): Promise<WeatherDataInput | null> {
    // Convert date to Unix timestamp (seconds)
    const timestamp = Math.floor(targetDate.getTime() / 1000);
    const url = 'https://api.openweathermap.org/data/3.0/onecall/timemachine';

    try {
      const response = await this.fetchWithRetry(url, {
        params: {
          lat,
          lon,
          dt: timestamp,
          units: 'imperial',
          appid: apiKey,
        },
      });

      const data = response as OpenWeatherHistoricalResponse;

      if (!data.data || data.data.length === 0) {
        throw new AppError('Historical weather data not available for this date', 404);
      }

      // The API returns hourly data for the requested day
      // We need to aggregate it to get min/max temperatures
      const hourlyData = data.data;
      const temps = hourlyData.map(h => h.temp);
      const humidities = hourlyData.map(h => h.humidity);
      const windSpeeds = hourlyData.map(h => h.wind_speed);

      // Calculate total precipitation from hourly rain/snow data
      // Sum up all hourly precipitation amounts
      let totalPrecipitation = 0;
      for (const h of hourlyData) {
        if (h.rain?.['1h']) {
          totalPrecipitation += h.rain['1h'];
        }
        if (h.snow?.['1h']) {
          totalPrecipitation += h.snow['1h'];
        }
      }

      // Debug: log historical precipitation calculation
      if (process.env.NODE_ENV === 'development') {
        console.log(`Historical weather for ${targetDate.toISOString().split('T')[0]}:`, {
          hourlyRecords: hourlyData.length,
          recordsWithRain: hourlyData.filter(h => h.rain?.['1h']).length,
          recordsWithSnow: hourlyData.filter(h => h.snow?.['1h']).length,
          totalPrecipitation,
        });
      }

      // Get the most common weather condition
      const weatherDescriptions = hourlyData
        .map(h => h.weather[0]?.description)
        .filter(Boolean);
      const mostCommonCondition = this.getMostFrequent(weatherDescriptions) || null;

      return {
        tripId: 0, // Will be set by caller
        date: targetDate.toISOString().split('T')[0],
        temperatureHigh: Math.round(Math.max(...temps)),
        temperatureLow: Math.round(Math.min(...temps)),
        conditions: mostCommonCondition,
        precipitation: totalPrecipitation > 0 ? Math.round(totalPrecipitation * 10) / 10 : null,
        humidity: Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length),
        windSpeed: Math.round((windSpeeds.reduce((a, b) => a + b, 0) / windSpeeds.length) * 10) / 10,
      };
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new AppError('Invalid OpenWeatherMap API key', 500);
        }
        if (error.response?.status === 403) {
          // Historical data requires paid subscription - log and return null gracefully
          console.warn(`Historical weather data not available (requires paid OpenWeatherMap subscription) for date: ${targetDate.toISOString().split('T')[0]}`);
          return null;
        }
      }
      throw error;
    }
  }

  /**
   * Helper to find most frequent element in array
   */
  private getMostFrequent(arr: string[]): string | null {
    if (arr.length === 0) return null;

    const frequency: Record<string, number> = {};
    let maxFreq = 0;
    let mostFrequent = arr[0];

    for (const item of arr) {
      frequency[item] = (frequency[item] || 0) + 1;
      if (frequency[item] > maxFreq) {
        maxFreq = frequency[item];
        mostFrequent = item;
      }
    }

    return mostFrequent;
  }

  /**
   * Fetch with retry logic for rate limiting
   */
  private async fetchWithRetry(
    url: string,
    requestConfig: AxiosRequestConfig,
    retries = 3
  ): Promise<OpenWeatherResponse | OpenWeatherHistoricalResponse> {
    try {
      const response = await axios.get(url, requestConfig);
      return response.data as OpenWeatherResponse | OpenWeatherHistoricalResponse;
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 429 && retries > 0) {
        // Rate limited, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.fetchWithRetry(url, requestConfig, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Determine if cached weather data should be refreshed
   */
  private shouldRefreshWeather(
    weatherData: { date: Date; fetchedAt: Date },
    targetDate: Date
  ): boolean {
    const now = new Date();
    const today = new Date(now.toDateString());
    const weatherDate = new Date(targetDate.toDateString());

    // Past dates never refresh
    if (weatherDate < today) {
      return false;
    }

    // Future dates refresh after CACHE_HOURS
    const hoursSinceFetch =
      (now.getTime() - weatherData.fetchedAt.getTime()) / (1000 * 60 * 60);

    return hoursSinceFetch > this.CACHE_HOURS;
  }

  /**
   * Get coordinates for a trip on a specific date using fallback strategy
   *
   * Priority for selecting location on a given day:
   * 1. First location visited on that day (by visitDatetime)
   * 2. First activity's location on that day (by startTime)
   * 3. Lodging location where user is staying that day (by check-in/check-out range)
   * 4. First location in the entire trip (fallback for days without specific locations)
   *
   * This enables accurate weather for multi-region trips (e.g., Paris → Rome → Barcelona)
   */
  private async getTripCoordinates(
    tripId: number,
    date?: Date
  ): Promise<{ lat: number; lon: number; locationId?: number; locationName?: string } | null> {
    // If no date provided, use trip-wide fallback (backwards compatibility)
    if (!date) {
      return this.getTripWideFallbackCoordinates(tripId);
    }

    // Normalize date to start of day for comparison
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Try to get first location visited on this specific day
    const location = await prisma.location.findFirst({
      where: {
        tripId,
        latitude: { not: null },
        longitude: { not: null },
        visitDatetime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { visitDatetime: 'asc' },
    });

    if (location?.latitude && location?.longitude) {
      return {
        lat: parseFloat(location.latitude.toString()),
        lon: parseFloat(location.longitude.toString()),
        locationId: location.id,
        locationName: location.name,
      };
    }

    // 2. Fallback: check activities on this day with locations
    const activity = await prisma.activity.findFirst({
      where: {
        tripId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // Activity locations are now via EntityLink - fetch linked location
    if (activity) {
      const activityLocationLink = await prisma.entityLink.findFirst({
        where: {
          tripId,
          sourceType: 'ACTIVITY',
          sourceId: activity.id,
          targetType: 'LOCATION',
        },
      });
      if (activityLocationLink) {
        const linkedLocation = await prisma.location.findUnique({
          where: { id: activityLocationLink.targetId },
        });
        if (linkedLocation?.latitude && linkedLocation?.longitude) {
          return {
            lat: parseFloat(linkedLocation.latitude.toString()),
            lon: parseFloat(linkedLocation.longitude.toString()),
            locationId: linkedLocation.id,
            locationName: linkedLocation.name,
          };
        }
      }
    }

    // 3. Fallback: check lodging where user is staying on this day
    // Lodging overlaps with target day if:
    // - Check-in is before or during target day (checkInDate <= end of day)
    // - Check-out is during or after target day (checkOutDate >= start of day)
    const lodging = await prisma.lodging.findFirst({
      where: {
        tripId,
        checkInDate: { lte: endOfDay },
        checkOutDate: { gte: startOfDay },
      },
      orderBy: { checkInDate: 'asc' },
    });

    // Lodging locations are now via EntityLink - fetch linked location
    if (lodging) {
      const lodgingLocationLink = await prisma.entityLink.findFirst({
        where: {
          tripId,
          sourceType: 'LODGING',
          sourceId: lodging.id,
          targetType: 'LOCATION',
        },
      });
      if (lodgingLocationLink) {
        const linkedLocation = await prisma.location.findUnique({
          where: { id: lodgingLocationLink.targetId },
        });
        if (linkedLocation?.latitude && linkedLocation?.longitude) {
          return {
            lat: parseFloat(linkedLocation.latitude.toString()),
            lon: parseFloat(linkedLocation.longitude.toString()),
            locationId: linkedLocation.id,
            locationName: linkedLocation.name,
          };
        }
      }
    }

    // 4. Final fallback: use first location in entire trip
    return this.getTripWideFallbackCoordinates(tripId);
  }

  /**
   * Get trip-wide fallback coordinates (first location/activity/lodging in entire trip)
   */
  private async getTripWideFallbackCoordinates(
    tripId: number
  ): Promise<{ lat: number; lon: number; locationId?: number; locationName?: string } | null> {
    // 1. Try to get first location with coordinates
    const location = await prisma.location.findFirst({
      where: {
        tripId,
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { visitDatetime: 'asc' },
    });

    if (location?.latitude && location?.longitude) {
      return {
        lat: parseFloat(location.latitude.toString()),
        lon: parseFloat(location.longitude.toString()),
        locationId: location.id,
        locationName: location.name,
      };
    }

    // 2. Fallback: check activities with linked locations (via EntityLink)
    const activity = await prisma.activity.findFirst({
      where: { tripId },
      orderBy: { startTime: 'asc' },
    });

    if (activity) {
      const activityLocationLink = await prisma.entityLink.findFirst({
        where: {
          tripId,
          sourceType: 'ACTIVITY',
          sourceId: activity.id,
          targetType: 'LOCATION',
        },
      });
      if (activityLocationLink) {
        const linkedLocation = await prisma.location.findUnique({
          where: { id: activityLocationLink.targetId },
        });
        if (linkedLocation?.latitude && linkedLocation?.longitude) {
          return {
            lat: parseFloat(linkedLocation.latitude.toString()),
            lon: parseFloat(linkedLocation.longitude.toString()),
            locationId: linkedLocation.id,
            locationName: linkedLocation.name,
          };
        }
      }
    }

    // 3. Fallback: check lodging with linked locations (via EntityLink)
    const lodging = await prisma.lodging.findFirst({
      where: { tripId },
      orderBy: { checkInDate: 'asc' },
    });

    if (lodging) {
      const lodgingLocationLink = await prisma.entityLink.findFirst({
        where: {
          tripId,
          sourceType: 'LODGING',
          sourceId: lodging.id,
          targetType: 'LOCATION',
        },
      });
      if (lodgingLocationLink) {
        const linkedLocation = await prisma.location.findUnique({
          where: { id: lodgingLocationLink.targetId },
        });
        if (linkedLocation?.latitude && linkedLocation?.longitude) {
          return {
            lat: parseFloat(linkedLocation.latitude.toString()),
            lon: parseFloat(linkedLocation.longitude.toString()),
            locationId: linkedLocation.id,
            locationName: linkedLocation.name,
          };
        }
      }
    }

    return null; // No coordinates available
  }

  /**
   * Generate array of dates between start and end (inclusive)
   * Handles date-only values properly to avoid timezone shifts
   */
  private getDateRange(startDate: Date, endDate: Date): Date[] {
    const dates: Date[] = [];

    // Extract year, month, day from the date objects to avoid timezone issues
    // The database stores date-only values (@db.Date), which come back as Date objects at UTC midnight
    // We need to extract the date components and create new Date objects to ensure we get all days
    const getDateOnly = (date: Date) => {
      const str = date.toISOString().split('T')[0]; // "YYYY-MM-DD"
      const [year, month, day] = str.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Use noon UTC to avoid edge cases
    };

    const current = getDateOnly(startDate);
    const end = getDateOnly(endDate);

    while (current <= end) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1); // Use UTC methods to avoid DST issues
    }

    return dates;
  }

  /**
   * Force refresh weather for a specific date
   */
  async refreshWeatherForDate(
    tripId: number,
    userId: number,
    dateString: string
  ) {
    // Verify user owns the trip
    await verifyTripAccess(userId, tripId);

    // Get user's API key
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        user: {
          select: {
            weatherApiKey: true,
          },
        },
      },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    // Get API key (user's key or system key)
    const apiKey = decryptSecret(trip.user.weatherApiKey) || this.API_KEY;

    if (!apiKey) {
      throw new AppError('No weather API key configured', 400);
    }

    // Get coordinates for this specific date
    const targetDate = new Date(dateString);
    const coordinates = await this.getTripCoordinates(tripId, targetDate);

    if (!coordinates) {
      throw new AppError('No coordinates available for this date', 400);
    }

    // Delete existing weather data to force refresh
    await prisma.weatherData.deleteMany({
      where: {
        tripId,
        date: new Date(dateString),
      },
    });

    // Fetch fresh data
    return convertDecimals(await this.getWeatherForDate(tripId, coordinates, targetDate, apiKey));
  }

  /**
   * Force refresh all weather data for a trip
   * Clears all cached weather and fetches fresh data for all dates
   */
  async refreshAllWeatherForTrip(tripId: number, userId: number) {
    // Verify user owns the trip
    await verifyTripAccess(userId, tripId);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Weather] Refreshing all weather data for trip ${tripId}`);
    }

    // Delete all cached weather data for this trip
    const deletedCount = await prisma.weatherData.deleteMany({
      where: {
        tripId,
      },
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Weather] Deleted ${deletedCount.count} cached weather records`);
    }

    // Fetch fresh weather data (will use new locations if entities were added)
    return await this.getWeatherForTrip(tripId, userId);
  }
}

export default new WeatherService();
