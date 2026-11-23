import axios from 'axios';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import config from '../config';
import { AppError } from '../errors/errors';
import prisma from '../config/database';
import { RouteStep, isAxiosError } from '../types/prisma-helpers';

function toJsonValue(geometry: number[][] | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!geometry) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(geometry)) as Prisma.InputJsonValue;
}

const routeErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
  }).optional(),
}).passthrough();

function parseGeometry(value: Prisma.JsonValue | null): number[][] | null {
  if (!value || !Array.isArray(value)) return null;
  return value as number[][];
}

interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

// GeoJSON response format from /v2/directions/{profile}/geojson endpoint
interface OpenRouteServiceResponse {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      segments: Array<{
        distance: number;
        duration: number;
        steps: RouteStep[];
      }>;
      summary: {
        distance: number; // in meters
        duration: number; // in seconds
      };
    };
    geometry: {
      coordinates: number[][]; // Array of [longitude, latitude]
      type: 'LineString';
    };
  }>;
}

interface RouteResult {
  distance: number; // in kilometers
  duration: number; // in minutes
  haversineDistance: number; // fallback distance in kilometers
  source: 'route' | 'haversine';
  geometry?: number[][]; // Array of [longitude, latitude] coordinates
}

interface RouteCacheEntry {
  id: number;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distance: number; // in kilometers
  duration: number; // in minutes
  profile: string;
  routeGeometry?: number[][] | null; // JSON field with coordinates
  createdAt: Date;
  updatedAt: Date;
}

class RoutingService {
  private readonly API_KEY = config.openRouteService.apiKey;
  private readonly API_URL = config.openRouteService.url ?? 'https://api.openrouteservice.org';
  private readonly CACHE_DAYS = 30; // Cache routes for 30 days

  /** True when an OpenRouteService API key is configured (routed results are possible). */
  hasApiKey(): boolean {
    return !!this.API_KEY && this.API_KEY.trim().length > 0;
  }

  /**
   * Calculate route distance and duration between two points
   * Falls back to Haversine formula if routing service is unavailable
   */
  async calculateRoute(
    from: RouteCoordinates,
    to: RouteCoordinates,
    profile: 'driving-car' | 'cycling-regular' | 'foot-walking' = 'driving-car'
  ): Promise<RouteResult> {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Routing Service] calculateRoute called: profile=${profile}, from=(${from.latitude}, ${from.longitude}), to=(${to.latitude}, ${to.longitude})`);
    }

    // Check cache first
    const cached = await this.getCachedRoute(from, to, profile);
    if (cached) {
      const geometry = cached.routeGeometry;
      const hasGeometry = geometry && Array.isArray(geometry) && geometry.length > 0;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Routing Service] Using cached route (hasGeometry: ${hasGeometry}, points: ${hasGeometry ? geometry.length : 0})`);
      }
      return {
        distance: cached.distance,
        duration: cached.duration,
        haversineDistance: this.calculateHaversineDistance(from, to),
        source: 'route',
        geometry: cached.routeGeometry ?? undefined,
      };
    }

    // Try to fetch from OpenRouteService
    // Check for truthy API key (not undefined, null, or empty string)
    if (this.API_KEY && this.API_KEY.trim().length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Routing Service] API key configured, fetching from OpenRouteService...`);
      }
      try {
        const routeData = await this.fetchRouteFromAPI(from, to, profile);
        const hasGeometry = routeData.geometry && routeData.geometry.length > 0;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Routing Service] API response received: distance=${routeData.distance.toFixed(2)}km, hasGeometry=${hasGeometry}, points=${hasGeometry ? routeData.geometry!.length : 0}`);
        }

        // Cache the result
        await this.cacheRoute(from, to, routeData.distance, routeData.duration, profile, routeData.geometry);

        return {
          distance: routeData.distance,
          duration: routeData.duration,
          haversineDistance: this.calculateHaversineDistance(from, to),
          source: 'route',
          geometry: routeData.geometry,
        };
      } catch (error: unknown) {
        if (isAxiosError(error)) {
          const parsed = routeErrorSchema.safeParse(error.response?.data);
          const errorMsg = (parsed.success ? parsed.data.error?.message : undefined) ?? error.message;
          const statusCode = error.response?.status ?? 'N/A';
          console.warn(`[Routing Service] API call failed (status: ${statusCode}): ${errorMsg}`);
        } else if (error instanceof Error) {
          console.warn(`[Routing Service] API call failed: ${error.message}`);
        } else {
          console.warn('[Routing Service] API call failed: Unknown error');
        }
        console.warn('[Routing Service] Falling back to Haversine formula');
      }
    } else {
      if (this.API_KEY === undefined) {
        console.warn('[Routing Service] No API key configured (OPENROUTESERVICE_API_KEY not set), using Haversine formula');
      } else if (this.API_KEY === '') {
        console.warn('[Routing Service] API key is empty string, using Haversine formula');
      } else {
        console.warn(`[Routing Service] API key is whitespace-only (length: ${this.API_KEY.length}), using Haversine formula`);
      }
    }

    // Fallback to Haversine
    const haversineDistance = this.calculateHaversineDistance(from, to);
    return {
      distance: haversineDistance,
      duration: this.estimateDuration(haversineDistance, profile),
      haversineDistance,
      source: 'haversine',
    };
  }

  /**
   * Fetch route from OpenRouteService API
   */
  private async fetchRouteFromAPI(
    from: RouteCoordinates,
    to: RouteCoordinates,
    profile: string
  ): Promise<{ distance: number; duration: number; geometry?: number[][] }> {
    // Use geojson endpoint to get coordinates array instead of encoded polyline
    const url = `${this.API_URL}/v2/directions/${profile}/geojson`;

    // OpenRouteService expects coordinates as [longitude, latitude]
    const coordinates = [
      [from.longitude, from.latitude],
      [to.longitude, to.latitude],
    ];

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Routing Service] Calling API: ${url}`);
      console.log(`[Routing Service] Request coordinates: ${JSON.stringify(coordinates)}`);
    }

    // Check for identical start/end coordinates (can't route to same point)
    if (from.latitude === to.latitude && from.longitude === to.longitude) {
      console.warn(`[Routing Service] Start and end coordinates are identical (${from.latitude}, ${from.longitude}), cannot calculate route`);
      throw new Error('Start and end coordinates are identical');
    }

    try {
      const response = await axios.post<OpenRouteServiceResponse>(
        url,
        { coordinates },
        {
          headers: {
            'Authorization': this.API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Routing Service] API response status: ${response.status}`);
      }

      // GeoJSON format: features[0] contains the route
      if (!response.data.features || response.data.features.length === 0) {
        console.warn('[Routing Service] API returned empty features array');
        throw new Error('No routes found in response');
      }

      const feature = response.data.features[0];
      const geometryCoords = feature.geometry?.coordinates;
      const summary = feature.properties?.summary;

      // Calculate summary from segments if not directly available
      let distance = 0;
      let duration = 0;
      if (summary) {
        distance = summary.distance;
        duration = summary.duration;
      } else if (feature.properties?.segments) {
        // Sum up all segments
        for (const segment of feature.properties.segments) {
          distance += segment.distance;
          duration += segment.duration;
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Routing Service] Route summary: distance=${distance}m, duration=${duration}s, geometry type=${feature.geometry?.type}, coords count=${geometryCoords?.length || 0}`);
      }

      return {
        distance: distance / 1000, // Convert meters to kilometers
        duration: duration / 60, // Convert seconds to minutes
        geometry: geometryCoords, // Array of [longitude, latitude]
      };
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const errorMessage = error.message;

        // Log error details including coordinates to help debug 404 errors
        console.error(`[Routing Service] API error details:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: errorMessage,
          url: url,
          coordinates: coordinates,
        });

        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new AppError("OpenRouteService didn't accept that API key. Check it and try again.", 401);
        }
        if (error.response?.status === 429) {
          throw new AppError('OpenRouteService is limiting requests. Try again in a minute.', 429);
        }
        throw new Error(`OpenRouteService API error: ${errorMessage}`);
      } else if (error instanceof Error) {
        console.error(`[Routing Service] API error: ${error.message}`);
        throw new Error(`OpenRouteService API error: ${error.message}`);
      } else {
        console.error('[Routing Service] API error: Unknown error');
        throw new Error('OpenRouteService API error: Unknown error');
      }
    }
  }

  /**
   * Calculate straight-line distance using Haversine formula
   * Returns distance in kilometers
   */
  private calculateHaversineDistance(from: RouteCoordinates, to: RouteCoordinates): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(to.latitude - from.latitude);
    const dLon = this.toRad(to.longitude - from.longitude);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.latitude)) *
        Math.cos(this.toRad(to.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Estimate duration based on distance and travel mode
   * Returns duration in minutes
   */
  private estimateDuration(distanceKm: number, profile: string): number {
    // Average speeds in km/h
    const speeds: Record<string, number> = {
      'driving-car': 80,
      'cycling-regular': 20,
      'foot-walking': 5,
    };

    const speed = speeds[profile] ?? 80;
    return (distanceKm / speed) * 60; // Convert hours to minutes
  }

  /**
   * Get cached route from database
   */
  private async getCachedRoute(
    from: RouteCoordinates,
    to: RouteCoordinates,
    profile: string
  ): Promise<RouteCacheEntry | null> {
    // Find routes within a small tolerance (0.001 degrees ~ 100 meters)
    const tolerance = 0.001;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.CACHE_DAYS);

    try {
      const cached = await prisma.routeCache.findFirst({
        where: {
          profile,
          fromLat: {
            gte: from.latitude - tolerance,
            lte: from.latitude + tolerance,
          },
          fromLon: {
            gte: from.longitude - tolerance,
            lte: from.longitude + tolerance,
          },
          toLat: {
            gte: to.latitude - tolerance,
            lte: to.latitude + tolerance,
          },
          toLon: {
            gte: to.longitude - tolerance,
            lte: to.longitude + tolerance,
          },
          createdAt: {
            gte: cutoffDate,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (cached) {
        return {
          id: cached.id,
          fromLat: parseFloat(cached.fromLat.toString()),
          fromLon: parseFloat(cached.fromLon.toString()),
          toLat: parseFloat(cached.toLat.toString()),
          toLon: parseFloat(cached.toLon.toString()),
          distance: parseFloat(cached.distance.toString()),
          duration: parseFloat(cached.duration.toString()),
          profile: cached.profile,
          routeGeometry: parseGeometry(cached.routeGeometry),
          createdAt: cached.createdAt,
          updatedAt: cached.updatedAt,
        };
      }

      return null;
    } catch (error) {
      console.warn('[Routing Service] Error checking cache:', error);
      return null;
    }
  }

  /**
   * Cache a route in the database
   */
  private async cacheRoute(
    from: RouteCoordinates,
    to: RouteCoordinates,
    distance: number,
    duration: number,
    profile: string,
    geometry?: number[][]
  ): Promise<void> {
    try {
      await prisma.routeCache.upsert({
        where: {
          route_cache_coords_profile_unique: {
            fromLat: from.latitude,
            fromLon: from.longitude,
            toLat: to.latitude,
            toLon: to.longitude,
            profile,
          },
        },
        update: {
          distance,
          duration,
          routeGeometry: toJsonValue(geometry),
        },
        create: {
          fromLat: from.latitude,
          fromLon: from.longitude,
          toLat: to.latitude,
          toLon: to.longitude,
          distance,
          duration,
          profile,
          routeGeometry: toJsonValue(geometry),
        },
      });
    } catch (error) {
      console.warn('[Routing Service] Error caching route:', error);
      // Don't throw - caching failure shouldn't break the request
    }
  }

  /**
   * Clean up old cache entries (call periodically)
   */
  async cleanupCache(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.CACHE_DAYS);

    try {
      const result = await prisma.routeCache.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Routing Service] Cleaned up ${result.count} old cache entries`);
      }
      return result.count;
    } catch (error) {
      console.error('[Routing Service] Error cleaning cache:', error);
      return 0;
    }
  }
}

export default new RoutingService();
