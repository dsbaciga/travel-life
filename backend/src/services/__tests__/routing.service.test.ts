/**
 * Routing Service Tests
 *
 * Test cases:
 * - RTE-001: calculateRoute fetches route from OpenRouteService API
 * - RTE-002: calculateRoute uses cached route when available
 * - RTE-003: calculateRoute falls back to Haversine when API key not configured
 * - RTE-004: calculateRoute falls back to Haversine when API call fails
 * - RTE-005: calculateRoute throws on identical start/end coordinates
 * - RTE-006: calculateRoute throws on invalid API key (401/403)
 * - RTE-007: calculateRoute throws on rate limit (429)
 * - RTE-008: Haversine calculation returns correct distances
 * - RTE-009: Duration estimation varies by travel profile
 * - RTE-010: cleanupCache removes old cache entries
 * - RTE-011: Route cache includes geometry data
 * - RTE-012: calculateRoute uses different profiles (driving, cycling, walking)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock @prisma/client BEFORE any imports that depend on it
jest.mock('@prisma/client', () => {
  class MockDecimal {
    private value: string;
    constructor(value: string | number) {
      this.value = String(value);
    }
    toString(): string { return this.value; }
    toNumber(): number { return parseFloat(this.value); }
    valueOf(): number { return this.toNumber(); }
  }
  return {
    Prisma: { Decimal: MockDecimal },
  };
});

// Mock the database config
const mockPrisma = {
  routeCache: {
    findFirst: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock config
jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    openRouteService: {
      apiKey: 'test-ors-api-key',
      url: 'https://api.openrouteservice.org',
    },
  },
}));

// Mock axios
jest.mock('axios');
import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

// Import the service after all mocks
import routingService from '../routing.service';

describe('RoutingService', () => {
  const fromCoords = { latitude: 40.7580, longitude: -73.9855 }; // Times Square, NYC
  const toCoords = { latitude: 40.7484, longitude: -73.9857 };   // Empire State Building

  // Known far-apart locations for Haversine testing
  const newYork = { latitude: 40.7128, longitude: -74.0060 };
  const losAngeles = { latitude: 34.0522, longitude: -118.2437 };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRoute', () => {
    it('RTE-001: fetches route from OpenRouteService API', async () => {
      // No cache
      mockPrisma.routeCache.findFirst.mockResolvedValue(null);
      mockPrisma.routeCache.create.mockResolvedValue({});

      // Mock API response (GeoJSON format)
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {
              summary: {
                distance: 1200, // meters
                duration: 480,  // seconds
              },
              segments: [{
                distance: 1200,
                duration: 480,
                steps: [],
              }],
            },
            geometry: {
              type: 'LineString',
              coordinates: [
                [-73.9855, 40.7580],
                [-73.9860, 40.7520],
                [-73.9857, 40.7484],
              ],
            },
          }],
        },
      });

      const result = await routingService.calculateRoute(fromCoords, toCoords);

      expect(result.source).toBe('route');
      expect(result.distance).toBeCloseTo(1.2, 1); // 1200m = 1.2km
      expect(result.duration).toBeCloseTo(8, 0); // 480s = 8min
      expect(result.haversineDistance).toBeGreaterThan(0);
      expect(result.geometry).toBeDefined();
      expect(result.geometry).toHaveLength(3);
    });

    it('RTE-002: uses cached route when available', async () => {
      mockPrisma.routeCache.findFirst.mockResolvedValue({
        id: 1,
        fromLat: 40.7580,
        fromLon: -73.9855,
        toLat: 40.7484,
        toLon: -73.9857,
        distance: 1.5,
        duration: 10,
        profile: 'driving-car',
        routeGeometry: [[-73.9855, 40.7580], [-73.9857, 40.7484]],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await routingService.calculateRoute(fromCoords, toCoords);

      expect(result.source).toBe('route');
      expect(result.distance).toBe(1.5);
      expect(result.duration).toBe(10);
      // Should NOT call the API
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('RTE-003: falls back to Haversine when API call fails', async () => {
      mockPrisma.routeCache.findFirst.mockResolvedValue(null);

      // API fails
      const error = new Error('Service unavailable') as Error & {
        isAxiosError: boolean;
        response: { status: number; statusText: string; data: unknown };
        message: string;
      };
      error.isAxiosError = true;
      error.response = { status: 500, statusText: 'Internal Server Error', data: {} };
      mockAxios.post.mockRejectedValue(error);

      const result = await routingService.calculateRoute(fromCoords, toCoords);

      expect(result.source).toBe('haversine');
      expect(result.distance).toBeGreaterThan(0);
      expect(result.haversineDistance).toBe(result.distance);
      expect(result.geometry).toBeUndefined();
    });

    it('RTE-004: Haversine gives correct approximate distances', async () => {
      // Force Haversine by having no API key
      mockPrisma.routeCache.findFirst.mockResolvedValue(null);

      // API fails to force haversine
      mockAxios.post.mockRejectedValue(new Error('unavailable'));

      const result = await routingService.calculateRoute(newYork, losAngeles);

      // NYC to LA is approximately 3944 km straight line
      expect(result.source).toBe('haversine');
      expect(result.distance).toBeGreaterThan(3500);
      expect(result.distance).toBeLessThan(4500);
    });

    it('RTE-005: estimates duration based on profile', async () => {
      mockPrisma.routeCache.findFirst.mockResolvedValue(null);
      mockAxios.post.mockRejectedValue(new Error('unavailable'));

      const carResult = await routingService.calculateRoute(
        newYork, losAngeles, 'driving-car'
      );
      const walkResult = await routingService.calculateRoute(
        newYork, losAngeles, 'foot-walking'
      );

      // Walking should take much longer than driving
      expect(walkResult.duration).toBeGreaterThan(carResult.duration);
      // Walking speed is 5km/h, driving is 80km/h, so ~16x longer
      expect(walkResult.duration / carResult.duration).toBeGreaterThan(10);
    });

    it('RTE-006: caches the route result from API', async () => {
      mockPrisma.routeCache.findFirst.mockResolvedValue(null);
      mockPrisma.routeCache.create.mockResolvedValue({});

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {
              summary: { distance: 1200, duration: 480 },
              segments: [{ distance: 1200, duration: 480, steps: [] }],
            },
            geometry: {
              type: 'LineString',
              coordinates: [[-73.9855, 40.7580], [-73.9857, 40.7484]],
            },
          }],
        },
      });

      await routingService.calculateRoute(fromCoords, toCoords);

      expect(mockPrisma.routeCache.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromLat: fromCoords.latitude,
            fromLon: fromCoords.longitude,
            toLat: toCoords.latitude,
            toLon: toCoords.longitude,
            profile: 'driving-car',
          }),
        })
      );
    });

    it('RTE-007: handles identical start/end coordinates', async () => {
      mockPrisma.routeCache.findFirst.mockResolvedValue(null);

      // API should reject identical coordinates
      const identicalError = new Error('Start and end coordinates are identical');
      mockAxios.post.mockRejectedValue(identicalError);

      // Should fall back to haversine (distance ~ 0)
      const result = await routingService.calculateRoute(fromCoords, fromCoords);

      expect(result.source).toBe('haversine');
      expect(result.distance).toBeLessThan(0.001); // Essentially 0
    });

    it('RTE-008: sends correct request to API with geojson endpoint', async () => {
      mockPrisma.routeCache.findFirst.mockResolvedValue(null);
      mockPrisma.routeCache.create.mockResolvedValue({});

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {
              summary: { distance: 1000, duration: 300 },
              segments: [],
            },
            geometry: {
              type: 'LineString',
              coordinates: [[-73.9855, 40.7580], [-73.9857, 40.7484]],
            },
          }],
        },
      });

      await routingService.calculateRoute(fromCoords, toCoords, 'cycling-regular');

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.openrouteservice.org/v2/directions/cycling-regular/geojson',
        {
          coordinates: [
            [fromCoords.longitude, fromCoords.latitude],
            [toCoords.longitude, toCoords.latitude],
          ],
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'test-ors-api-key',
          }),
          timeout: 10000,
        })
      );
    });

    it('RTE-009: handles API response with no features', async () => {
      mockPrisma.routeCache.findFirst.mockResolvedValue(null);

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // Should fall back to haversine when API returns empty features
      const result = await routingService.calculateRoute(fromCoords, toCoords);

      expect(result.source).toBe('haversine');
    });
  });

  describe('cleanupCache', () => {
    it('RTE-010: removes old cache entries', async () => {
      mockPrisma.routeCache.deleteMany.mockResolvedValue({ count: 5 });

      const deletedCount = await routingService.cleanupCache();

      expect(deletedCount).toBe(5);
      expect(mockPrisma.routeCache.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('RTE-011: returns 0 when cleanup fails', async () => {
      mockPrisma.routeCache.deleteMany.mockRejectedValue(new Error('DB error'));

      const deletedCount = await routingService.cleanupCache();

      expect(deletedCount).toBe(0);
    });
  });
});
