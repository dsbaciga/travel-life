/**
 * Trip Stop Legs Tests (Multi-City Trip Planner: road distances)
 *
 * Test cases:
 * - TSL-001: Routed legs return road distance and duration with routed=true and write the routing cache
 * - TSL-002: Without an OpenRouteService API key every leg is a straight line and ORS is never called
 * - TSL-003: One failing leg falls back on its own; the others stay routed and the response succeeds
 * - TSL-004: A cached route is used without calling ORS
 * - TSL-005: Legs beyond the routing range and identical points are not sent to ORS
 * - TSL-006: Needs only view access; a denied permission propagates and nothing is routed
 * - TSL-007: Fewer than two stops gives no legs
 * - TSL-008: The profile is passed through to the router; the query schema defaults to driving-car and rejects unknown values
 * - TSL-009: Every leg has a mode; short legs are 'drive'
 * - TSL-010: A flight leg (600 km or more straight-line) is never sent to ORS or the cache, with mode 'flight' and no duration
 * - TSL-011: The flight threshold is 600 km, defined once, and applies even when a cached route exists
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { AppError } from '../../errors/errors';

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
  return { Prisma: { Decimal: MockDecimal, JsonNull: null } };
});

const mockPrisma = {
  tripStop: { findMany: jest.fn() },
  routeCache: { findFirst: jest.fn(), upsert: jest.fn() },
};
jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
  verifyEntityInTrip: jest.fn(),
}));

jest.mock('axios');
import axios from 'axios';
const mockAxios = axios as jest.Mocked<typeof axios>;

import { tripStopLegsQuerySchema, FLIGHT_LEG_THRESHOLD_KM } from '../../types/tripStop.types';

type LegsService = {
  getLegs: (
    userId: number,
    tripId: number,
    profile: 'driving-car' | 'cycling-regular' | 'foot-walking'
  ) => Promise<{
    profile: string;
    legs: Array<{
      fromStopId: number;
      toStopId: number;
      mode: 'drive' | 'flight';
      distanceKm: number;
      durationMinutes: number | null;
      routed: boolean;
    }>;
  }>;
};

/** Loads a fresh service graph, because RoutingService reads the API key once at construction. */
function loadService(apiKey: string | undefined): LegsService {
  let svc!: LegsService;
  jest.isolateModules(() => {
    jest.doMock('../../config', () => ({
      __esModule: true,
      default: { openRouteService: { apiKey, url: 'https://ors.test' } },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    svc = require('../tripStop.service').default as LegsService;
  });
  return svc;
}

// Munich -> Salzburg -> Vienna -> Budapest (all within road range)
const stopRow = (id: number, latitude: number, longitude: number) => ({ id, latitude, longitude });
const MUNICH = stopRow(1, 48.1351, 11.582);
const SALZBURG = stopRow(2, 47.8095, 13.055);
const VIENNA = stopRow(3, 48.2082, 16.3738);
const BUDAPEST = stopRow(4, 47.4979, 19.0402);

const orsResponse = (meters: number, seconds: number) => ({
  status: 200,
  data: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { summary: { distance: meters, duration: seconds }, segments: [] },
        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      },
    ],
  },
});

describe('TripStopService.getLegs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockVerifyTrip.mockResolvedValue(undefined);
    mockPrisma.routeCache.findFirst.mockResolvedValue(null);
    mockPrisma.routeCache.upsert.mockResolvedValue({});
  });

  it('TSL-001: returns road distance and duration for routed legs and caches them', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, SALZBURG, VIENNA]);
    mockAxios.post
      .mockResolvedValueOnce(orsResponse(150_000, 5400))
      .mockResolvedValueOnce(orsResponse(300_000, 10_800));

    const result = await loadService('key').getLegs(5, 10, 'driving-car');

    expect(mockVerifyTrip).toHaveBeenCalledWith(5, 10, 'view');
    expect(result.profile).toBe('driving-car');
    expect(result.legs).toEqual([
      { fromStopId: 1, toStopId: 2, mode: 'drive', distanceKm: 150, durationMinutes: 90, routed: true },
      { fromStopId: 2, toStopId: 3, mode: 'drive', distanceKm: 300, durationMinutes: 180, routed: true },
    ]);
    expect(mockPrisma.routeCache.upsert).toHaveBeenCalledTimes(2);
    expect(mockAxios.post).toHaveBeenCalledTimes(2);
    expect(mockAxios.post.mock.calls[0][0]).toBe('https://ors.test/v2/directions/driving-car/geojson');
  });

  it('TSL-002: without an API key every leg is straight-line and ORS is never called', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, SALZBURG, VIENNA]);

    const result = await loadService(undefined).getLegs(5, 10, 'driving-car');

    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(result.legs).toHaveLength(2);
    for (const leg of result.legs) {
      expect(leg.routed).toBe(false);
      expect(leg.durationMinutes).toBeNull();
      expect(leg.distanceKm).toBeGreaterThan(50);
    }
    // Munich to Salzburg is about 117 km in a straight line.
    expect(result.legs[0].distanceKm).toBeGreaterThan(100);
    expect(result.legs[0].distanceKm).toBeLessThan(130);
  });

  it('TSL-003: a failing leg falls back on its own while the others stay routed', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, SALZBURG, VIENNA, BUDAPEST]);
    mockAxios.post.mockImplementation(async (_url: string, body: unknown) => {
      const coords = (body as { coordinates: number[][] }).coordinates;
      // The Salzburg -> Vienna leg (second) is the one ORS refuses.
      if (Math.abs(coords[0][0] - 13.055) < 1e-6) {
        const error = Object.assign(new Error('Request failed with status code 500'), {
          isAxiosError: true,
          response: { status: 500, statusText: 'Server Error', data: {} },
        });
        throw error;
      }
      return orsResponse(200_000, 7200);
    });

    const result = await loadService('key').getLegs(5, 10, 'driving-car');

    expect(result.legs.map((l) => l.routed)).toEqual([true, false, true]);
    expect(result.legs[1].durationMinutes).toBeNull();
    expect(result.legs[1].distanceKm).toBeGreaterThan(200);
    expect(result.legs[0]).toMatchObject({ distanceKm: 200, durationMinutes: 120 });
  });

  it('TSL-003b: a rate-limit or bad-key error is also a per-leg fallback, not a failure', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, SALZBURG]);
    mockAxios.post.mockRejectedValue(
      Object.assign(new Error('Too many'), { isAxiosError: true, response: { status: 429, data: {} } })
    );

    const result = await loadService('key').getLegs(5, 10, 'driving-car');

    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].routed).toBe(false);
  });

  it('TSL-004: a cached route is used without calling ORS', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, SALZBURG]);
    mockPrisma.routeCache.findFirst.mockResolvedValue({
      id: 1,
      fromLat: 48.1351,
      fromLon: 11.582,
      toLat: 47.8095,
      toLon: 13.055,
      distance: 145.5,
      duration: 95,
      profile: 'driving-car',
      routeGeometry: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await loadService('key').getLegs(5, 10, 'driving-car');

    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(result.legs[0]).toMatchObject({ distanceKm: 145.5, durationMinutes: 95, routed: true });
  });

  it('TSL-005: legs beyond routing range and identical points are not sent to ORS', async () => {
    const SYDNEY = stopRow(5, -33.8688, 151.2093);
    const SYDNEY_AGAIN = stopRow(6, -33.8688, 151.2093);
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, SYDNEY, SYDNEY_AGAIN]);

    const result = await loadService('key').getLegs(5, 10, 'driving-car');

    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(result.legs[0]).toMatchObject({ routed: false, durationMinutes: null });
    expect(result.legs[0].distanceKm).toBeGreaterThan(15_000);
    expect(result.legs[1]).toEqual({
      fromStopId: 5,
      toStopId: 6,
      mode: 'drive',
      distanceKm: 0,
      durationMinutes: 0,
      routed: true,
    });
  });

  it('TSL-006: a denied permission propagates and nothing is routed', async () => {
    mockVerifyTrip.mockRejectedValue(new AppError("We couldn't find that trip, or you don't have access to it.", 404));

    await expect(loadService('key').getLegs(5, 10, 'driving-car')).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.tripStop.findMany).not.toHaveBeenCalled();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('TSL-007: fewer than two stops gives no legs', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH]);
    expect((await loadService('key').getLegs(5, 10, 'driving-car')).legs).toEqual([]);

    mockPrisma.tripStop.findMany.mockResolvedValue([]);
    expect((await loadService('key').getLegs(5, 10, 'driving-car')).legs).toEqual([]);
  });

  it('TSL-009: every leg has a mode, and short legs are drive', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, SALZBURG, VIENNA]);

    const unrouted = await loadService(undefined).getLegs(5, 10, 'driving-car');
    expect(unrouted.legs.map((l) => l.mode)).toEqual(['drive', 'drive']);

    mockAxios.post.mockResolvedValue(orsResponse(150_000, 5400));
    const routed = await loadService('key').getLegs(5, 10, 'driving-car');
    expect(routed.legs.map((l) => l.mode)).toEqual(['drive', 'drive']);
  });

  it('TSL-010: a flight leg is not sent to ORS and returns mode flight with a null duration', async () => {
    // Munich -> Madrid (about 1,480 km) -> Lisbon (about 500 km, a drive).
    const MADRID = stopRow(7, 40.4168, -3.7038);
    const LISBON = stopRow(8, 38.7223, -9.1393);
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, MADRID, LISBON]);
    mockAxios.post.mockResolvedValue(orsResponse(630_000, 25_000));

    const result = await loadService('key').getLegs(5, 10, 'driving-car');

    expect(result.legs).toHaveLength(2);
    expect(result.legs[0]).toMatchObject({ fromStopId: 1, toStopId: 7, mode: 'flight', durationMinutes: null, routed: false });
    expect(result.legs[0].distanceKm).toBeGreaterThan(1300);
    expect(result.legs[0].distanceKm).toBeLessThan(1700);
    expect(result.legs[1]).toMatchObject({ mode: 'drive', routed: true, durationMinutes: expect.any(Number) });
    // Only the drive leg reached ORS and the cache; the flight cost no call at all.
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(mockPrisma.routeCache.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.routeCache.upsert).toHaveBeenCalledTimes(1);
  });

  it('TSL-011: the threshold is 600 km and a flight ignores any cached route', async () => {
    expect(FLIGHT_LEG_THRESHOLD_KM).toBe(600);

    // Munich -> Rome is about 700 km straight-line; a cached road route must not turn it into a drive.
    const ROME = stopRow(9, 41.9028, 12.4964);
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, ROME]);
    mockPrisma.routeCache.findFirst.mockResolvedValue({
      id: 1, fromLat: 48.1351, fromLon: 11.582, toLat: 41.9028, toLon: 12.4964,
      distance: 900, duration: 540, profile: 'driving-car', routeGeometry: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await loadService('key').getLegs(5, 10, 'driving-car');

    expect(result.legs[0]).toMatchObject({ mode: 'flight', routed: false, durationMinutes: null });
    expect(result.legs[0].distanceKm).toBeGreaterThanOrEqual(FLIGHT_LEG_THRESHOLD_KM);
    expect(mockPrisma.routeCache.findFirst).not.toHaveBeenCalled();
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('TSL-008: the profile reaches the router, and the query schema validates it', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([MUNICH, SALZBURG]);
    mockAxios.post.mockResolvedValue(orsResponse(150_000, 30_000));

    const result = await loadService('key').getLegs(5, 10, 'foot-walking');

    expect(result.profile).toBe('foot-walking');
    expect(mockAxios.post.mock.calls[0][0]).toBe('https://ors.test/v2/directions/foot-walking/geojson');

    expect(tripStopLegsQuerySchema.parse({}).profile).toBe('driving-car');
    expect(tripStopLegsQuerySchema.parse({ profile: 'cycling-regular' }).profile).toBe('cycling-regular');
    expect(tripStopLegsQuerySchema.safeParse({ profile: 'driving-hgv' }).success).toBe(false);
  });
});
