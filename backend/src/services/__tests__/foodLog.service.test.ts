/**
 * Food Log Service Tests
 *
 * Test cases:
 * - FL-001: Create stores the entry with defaults and verifies linked activity/location belong to the trip
 * - FL-002: Create rejects a linked activity that is not in the trip and writes nothing
 * - FL-003: Update changes only supplied fields and can clear links
 * - FL-004: Update/delete of an entry from another trip is a 404
 * - FL-005: Search scopes to the user's trips and applies rating/order-again/text filters
 * - FL-006: Search without filters adds no filter clauses
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  foodLogEntry: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
const mockVerifyEntity = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
  verifyEntityInTrip: (...args: unknown[]) => mockVerifyEntity(...args),
}));

import foodLogService from '../foodLog.service';

describe('FoodLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTrip.mockResolvedValue({ trip: { id: 10, userId: 1 } });
    mockVerifyEntity.mockResolvedValue(undefined);
  });

  describe('FL-001/002: create', () => {
    it('stores defaults and verifies links', async () => {
      mockPrisma.foodLogEntry.create.mockResolvedValue({ id: 1 });

      await foodLogService.createEntry(1, 10, {
        restaurantName: 'Trattoria',
        dish: 'Carbonara',
        rating: 5,
        activityId: 4,
        locationId: 8,
      });

      expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'edit');
      expect(mockVerifyEntity).toHaveBeenCalledWith('activity', 4, 10);
      expect(mockVerifyEntity).toHaveBeenCalledWith('location', 8, 10);
      expect(mockPrisma.foodLogEntry.create).toHaveBeenCalledWith({
        data: {
          tripId: 10,
          restaurantName: 'Trattoria',
          dish: 'Carbonara',
          rating: 5,
          notes: null,
          orderAgain: false,
          activityId: 4,
          locationId: 8,
        },
      });
    });

    it('rejects a link outside the trip without writing', async () => {
      mockVerifyEntity.mockRejectedValue(new Error('Activity not found or does not belong to trip'));
      await expect(
        foodLogService.createEntry(1, 10, { restaurantName: 'X', dish: 'Y', rating: 3, activityId: 99 })
      ).rejects.toThrow('does not belong to trip');
      expect(mockPrisma.foodLogEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('FL-003: update', () => {
    it('updates only supplied fields and allows clearing links', async () => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue({ id: 3, tripId: 10 });
      mockPrisma.foodLogEntry.update.mockResolvedValue({ id: 3 });

      await foodLogService.updateEntry(1, 10, 3, { rating: 2, orderAgain: true, activityId: null });

      expect(mockVerifyEntity).not.toHaveBeenCalled();
      expect(mockPrisma.foodLogEntry.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { rating: 2, orderAgain: true, activityId: null },
      });
    });
  });

  describe('FL-004: wrong trip', () => {
    it('404s on update and delete', async () => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue(null);
      await expect(foodLogService.updateEntry(1, 10, 3, { rating: 2 })).rejects.toMatchObject({ statusCode: 404 });
      await expect(foodLogService.deleteEntry(1, 10, 3)).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.foodLogEntry.delete).not.toHaveBeenCalled();
    });

    it('deletes an entry in the trip', async () => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue({ id: 3, tripId: 10 });
      await expect(foodLogService.deleteEntry(1, 10, 3)).resolves.toEqual({ id: 3 });
      expect(mockPrisma.foodLogEntry.findFirst).toHaveBeenCalledWith({ where: { id: 3, tripId: 10 } });
    });
  });

  describe('FL-005/006: search', () => {
    it('applies filters and scopes to the user', async () => {
      mockPrisma.foodLogEntry.findMany.mockResolvedValue([]);

      await foodLogService.searchEntries(7, { minRating: 4, orderAgain: true, q: '  pasta ' });

      const arg = mockPrisma.foodLogEntry.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
      };
      expect(arg.where).toMatchObject({
        trip: { OR: [{ userId: 7 }, { collaborators: { some: { userId: 7 } } }] },
        rating: { gte: 4 },
        orderAgain: true,
        OR: [
          { dish: { contains: 'pasta', mode: 'insensitive' } },
          { restaurantName: { contains: 'pasta', mode: 'insensitive' } },
          { notes: { contains: 'pasta', mode: 'insensitive' } },
        ],
      });
      expect(arg.orderBy).toEqual([{ rating: 'desc' }, { createdAt: 'desc' }]);
    });

    it('adds no optional clauses when no filters are given', async () => {
      mockPrisma.foodLogEntry.findMany.mockResolvedValue([]);
      await foodLogService.searchEntries(7, {});
      const arg = mockPrisma.foodLogEntry.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(Object.keys(arg.where)).toEqual(['trip']);
    });
  });
});
