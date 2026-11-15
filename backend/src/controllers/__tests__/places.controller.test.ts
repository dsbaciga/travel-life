/**
 * Places Controller Tests
 *
 * Test cases:
 * - PLC-001: Validates the query, hands it to the service and returns the result
 * - PLC-002: Defaults the radius and page size, and passes the diet through
 * - PLC-003: Rejects out-of-range and unknown values before calling the service
 * - PLC-004: Service errors reach the error handler
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../services/nearbyFood.service', () => ({
  __esModule: true,
  default: { searchNearbyFood: jest.fn() },
}));

import nearbyFoodService from '../../services/nearbyFood.service';
import { placesController } from '../places.controller';
import { nearbyFoodQuerySchema } from '../../types/places.types';
import {
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/mockBuilders/requests';
import { testUsers } from '../../__tests__/fixtures/users';

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));
const mockSearch = nearbyFoodService.searchNearbyFood as jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const result = {
  center: { latitude: 64.1466, longitude: -21.9426 },
  radiusMeters: 1000,
  diet: 'vegan',
  places: [],
  excludedCount: 0,
};

describe('places.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PLC-001: validates the query, calls the service and returns the result', async () => {
    mockSearch.mockResolvedValue(result);
    const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
      query: { lat: '64.1466', lng: '-21.9426', radius: '1500', diet: 'vegan', limit: '20' },
    });

    placesController.nearbyFood(req as never, res as never, next);
    await flushPromises();

    expect(next).not.toHaveBeenCalled();
    // Query-string values arrive as strings and are coerced.
    expect(mockSearch).toHaveBeenCalledWith({
      latitude: 64.1466,
      longitude: -21.9426,
      radiusMeters: 1500,
      diet: 'vegan',
      limit: 20,
    });
    expectSuccessResponse(res, 200, result);
  });

  it('PLC-002: defaults the radius and page size, and a missing diet stays undefined', () => {
    expect(nearbyFoodQuerySchema.parse({ lat: '1', lng: '2' })).toEqual({
      lat: 1,
      lng: 2,
      radius: 1000,
      limit: 50,
    });
    expect(nearbyFoodQuerySchema.parse({ lat: 1, lng: 2, diet: 'gluten_free' }).diet).toBe('gluten_free');
  });

  it('PLC-003: rejects out-of-range and unknown values before calling the service', async () => {
    const bad = [
      { lng: '2' }, // no lat
      { lat: '91', lng: '2' },
      { lat: '1', lng: '181' },
      { lat: '1', lng: '2', radius: '50' },
      { lat: '1', lng: '2', radius: '5000' },
      { lat: '1', lng: '2', diet: 'carnivore' },
      { lat: '1', lng: '2', limit: '0' },
      { lat: '1', lng: '2', limit: '101' },
      { lat: 'abc', lng: '2' },
    ];
    for (const query of bad) {
      expect(nearbyFoodQuerySchema.safeParse(query).success).toBe(false);
    }

    const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
      query: { lat: '91', lng: '2' },
    });
    placesController.nearbyFood(req as never, res as never, next);
    await flushPromises();
    expect(next).toHaveBeenCalled();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('PLC-004: service errors reach the error handler', async () => {
    const error = new Error('Nearby search is unavailable right now.');
    mockSearch.mockRejectedValue(error);
    const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
      query: { lat: '1', lng: '2' },
    });

    placesController.nearbyFood(req as never, res as never, next);
    await flushPromises();

    expect(next).toHaveBeenCalledWith(error);
  });
});
