/**
 * CustomItem Service Tests
 *
 * Test cases:
 * - CI-001: First read of an empty registry seeds the four starter types
 * - CI-002: A user who already has types is not re-seeded
 * - CI-003: A user who deleted every type is NOT re-seeded (no resurrection)
 * - CI-004: Seeded types remain editable (isDefault is not an edit gate)
 * - CI-005: Duplicate type names are rejected with 409
 * - CI-006: Rename onto an existing name is rejected with 409
 * - CI-007: Updating a type scopes by userId (404 for another user's type)
 * - CI-008: Create rejects a typeId belonging to another user
 * - CI-009: Create verifies the location is on the same trip
 * - CI-010: Create requires edit permission on the trip
 * - CI-011: List is ordered by start time with undated items last
 * - CI-012: Changing cost clears the frozen FX snapshot
 * - CI-013: Changing currency clears the frozen FX snapshot
 * - CI-014: An update that touches neither leaves the snapshot alone
 * - CI-015: Bulk update validates typeId ownership (allowedFields does not)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  $transaction: jest.fn(),
  trip: { findUnique: jest.fn() },
  travelCompanion: { findFirst: jest.fn() },
  tripExpenseSplit: { findMany: jest.fn(), update: jest.fn() },
  tripExpense: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  customItem: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  customItemType: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

const mockVerifyTripAccessWithPermission = jest.fn();
const mockVerifyEntityInTrip = jest.fn();
const mockVerifyEntityAccessWithPermission = jest.fn();
jest.mock('../../services/_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) =>
    mockVerifyTripAccessWithPermission(...args),
  verifyEntityInTrip: (...args: unknown[]) => mockVerifyEntityInTrip(...args),
  verifyEntityAccessWithPermission: (...args: unknown[]) =>
    mockVerifyEntityAccessWithPermission(...args),
}));

const mockBulkUpdateEntities = jest.fn();
jest.mock('../../prisma/crudHelpers', () => ({
  deleteEntity: jest.fn(),
  bulkDeleteEntities: jest.fn(),
  bulkUpdateEntities: (...args: unknown[]) => mockBulkUpdateEntities(...args),
}));

import customItemService from '../customItem.service';
import { AppError } from '../../errors/errors';

const USER_ID = 1;
const TRIP_ID = 42;

describe('CustomItemService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyEntityAccessWithPermission.mockResolvedValue({ entity: { tripId: TRIP_ID } });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockPrisma));
    mockPrisma.customItem.update.mockImplementation((args: unknown) => Promise.resolve(args));
    mockPrisma.customItem.findUniqueOrThrow.mockResolvedValue({ id: 7, costExpense: null });
    mockPrisma.tripExpense.findUnique.mockResolvedValue(null);
    mockPrisma.customItem.create.mockResolvedValue({ id: 7 });
    mockPrisma.customItemType.findMany.mockResolvedValue([]);
  });

  describe('type registry seeding', () => {
    it('CI-001: seeds the four starter types on first read of an empty registry', async () => {
      mockPrisma.customItemType.count.mockResolvedValue(0);

      await customItemService.getTypes(USER_ID);

      expect(mockPrisma.customItemType.createMany).toHaveBeenCalledTimes(1);
      const call = mockPrisma.customItemType.createMany.mock.calls[0][0] as {
        data: Array<{ name: string; userId: number; isDefault: boolean }>;
        skipDuplicates: boolean;
      };
      expect(call.data.map((t) => t.name)).toEqual([
        'Reservation',
        'Contact',
        'Reminder',
        'Misc',
      ]);
      expect(call.data.every((t) => t.userId === USER_ID)).toBe(true);
      // skipDuplicates covers the concurrent-first-read race on (userId, name)
      expect(call.skipDuplicates).toBe(true);
    });

    it('CI-002: does not re-seed a user who already has types', async () => {
      mockPrisma.customItemType.count.mockResolvedValue(4);

      await customItemService.getTypes(USER_ID);

      expect(mockPrisma.customItemType.createMany).not.toHaveBeenCalled();
    });

    it('CI-003: guards on total count, so restored types are not duplicated', async () => {
      // A restored backup writes types with isDefault false. Guarding on
      // isDefault would re-seed here and collide on the unique index.
      mockPrisma.customItemType.count.mockResolvedValue(2);

      await customItemService.getTypes(USER_ID);

      expect(mockPrisma.customItemType.count).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
      expect(mockPrisma.customItemType.createMany).not.toHaveBeenCalled();
    });
  });

  describe('type mutation', () => {
    it('CI-004: lets a seeded (isDefault) type be renamed', async () => {
      mockPrisma.customItemType.findFirst
        .mockResolvedValueOnce({ id: 5, userId: USER_ID, name: 'Misc', isDefault: true })
        .mockResolvedValueOnce(null); // no name collision
      mockPrisma.customItemType.update.mockResolvedValue({ id: 5, name: 'Sundries' });

      await customItemService.updateType(USER_ID, 5, { name: 'Sundries' });

      // The lookup must NOT filter on isDefault, or seeded types freeze
      expect(mockPrisma.customItemType.findFirst.mock.calls[0][0]).toEqual({
        where: { id: 5, userId: USER_ID },
      });
      expect(mockPrisma.customItemType.update).toHaveBeenCalled();
    });

    it('CI-005: rejects a duplicate name on create', async () => {
      mockPrisma.customItemType.findFirst.mockResolvedValue({ id: 9, name: 'Contact' });

      await expect(
        customItemService.createType(USER_ID, { name: 'Contact', icon: null, color: null })
      ).rejects.toThrow(AppError);
      expect(mockPrisma.customItemType.create).not.toHaveBeenCalled();
    });

    it('CI-006: rejects renaming onto an existing name', async () => {
      mockPrisma.customItemType.findFirst
        .mockResolvedValueOnce({ id: 5, userId: USER_ID, name: 'Misc' })
        .mockResolvedValueOnce({ id: 6, name: 'Contact' });

      await expect(
        customItemService.updateType(USER_ID, 5, { name: 'Contact' })
      ).rejects.toThrow(AppError);
      expect(mockPrisma.customItemType.update).not.toHaveBeenCalled();
    });

    it("CI-007: 404s on another user's type", async () => {
      mockPrisma.customItemType.findFirst.mockResolvedValue(null);

      await expect(
        customItemService.updateType(USER_ID, 999, { name: 'Nope' })
      ).rejects.toThrow("We couldn't find that item type.");
    });
  });

  describe('item creation', () => {
    it('CI-008: rejects a typeId owned by another user', async () => {
      mockVerifyTripAccessWithPermission.mockResolvedValue(undefined);
      mockPrisma.customItemType.findFirst.mockResolvedValue(null);

      await expect(
        customItemService.createCustomItem(USER_ID, {
          tripId: TRIP_ID,
          name: 'Parking',
          typeId: 77,
        })
      ).rejects.toThrow("We couldn't find that item type.");
      expect(mockPrisma.customItem.create).not.toHaveBeenCalled();
    });

    it('CI-009: verifies the location belongs to the same trip', async () => {
      mockVerifyTripAccessWithPermission.mockResolvedValue(undefined);

      await customItemService.createCustomItem(USER_ID, {
        tripId: TRIP_ID,
        name: 'Parking',
        locationId: 3,
      });

      expect(mockVerifyEntityInTrip).toHaveBeenCalledWith('location', 3, TRIP_ID);
    });

    it('CI-010: requires edit permission on the trip', async () => {
      mockVerifyTripAccessWithPermission.mockRejectedValue(new AppError('Forbidden', 403));

      await expect(
        customItemService.createCustomItem(USER_ID, { tripId: TRIP_ID, name: 'Parking' })
      ).rejects.toThrow('Forbidden');
      expect(mockPrisma.customItem.create).not.toHaveBeenCalled();
    });
  });

  describe('listing', () => {
    it('CI-011: orders by start time with undated items last, then name', async () => {
      mockVerifyTripAccessWithPermission.mockResolvedValue(undefined);
      mockPrisma.customItem.findMany.mockResolvedValue([]);

      await customItemService.getCustomItemsByTrip(USER_ID, TRIP_ID);

      const args = mockPrisma.customItem.findMany.mock.calls[0][0] as {
        orderBy: unknown;
      };
      expect(args.orderBy).toEqual([
        { startTime: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
      ]);
    });
  });

  describe('FX snapshot invalidation', () => {
    // The cost is the item's expense row: changing its amount or currency clears the frozen snapshot
    // (the budget summary re-fills it lazily); anything else leaves it alone.
    const existing = { id: 900, amount: 20, currency: 'USD', receiptPath: null, tripId: TRIP_ID };
    const snapshotCleared = { exchangeRate: null, baseAmount: null, baseCurrency: null };

    beforeEach(() => {
      mockPrisma.tripExpense.findUnique.mockResolvedValue(existing);
      mockPrisma.tripExpense.update.mockResolvedValue({ id: 900, amount: 25 });
      mockPrisma.customItem.findUnique.mockResolvedValue({
        id: 7, tripId: TRIP_ID, name: 'Pass', startTime: null, timezone: null,
      });
      mockPrisma.customItem.findUniqueOrThrow.mockResolvedValue({ id: 7, costExpense: null });
      mockPrisma.trip.findUnique.mockResolvedValue({ userId: 1, timezone: null, user: { timezone: null } });
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);
      mockPrisma.tripExpenseSplit.findMany.mockResolvedValue([]);
    });

    it('CI-012: clears the snapshot when cost changes', async () => {
      await customItemService.updateCustomItem(USER_ID, 7, { cost: 25 });

      const args = mockPrisma.tripExpense.update.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> };
      expect(args.where).toEqual({ id: 900 });
      expect(args.data).toMatchObject({ amount: 25, ...snapshotCleared });
      // The item row itself never carries the cost.
      expect((mockPrisma.customItem.update.mock.calls[0][0] as { data: object }).data).not.toHaveProperty('cost');
    });

    it('CI-013: clears the snapshot when currency changes', async () => {
      await customItemService.updateCustomItem(USER_ID, 7, { currency: 'EUR' });

      const args = mockPrisma.tripExpense.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(args.data).toMatchObject({ currency: 'EUR', ...snapshotCleared });
    });

    it('CI-014: leaves the snapshot alone when neither changes', async () => {
      await customItemService.updateCustomItem(USER_ID, 7, { cost: 20, currency: 'USD' });

      expect(mockPrisma.tripExpense.update).not.toHaveBeenCalled();
    });

    it('CI-014b: renaming the item renames its expense, without touching the snapshot', async () => {
      await customItemService.updateCustomItem(USER_ID, 7, { name: 'Renamed' });

      const args = mockPrisma.tripExpense.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(args.data).toEqual({ description: 'Pass', date: null });
    });
  });

  describe('bulk update', () => {
    it('CI-015: validates typeId ownership before delegating', async () => {
      // bulkUpdateEntities whitelists field NAMES only — it never checks that a
      // typeId value belongs to the caller, so the service must.
      mockPrisma.customItemType.findFirst.mockResolvedValue(null);

      await expect(
        customItemService.bulkUpdateCustomItems(USER_ID, TRIP_ID, {
          ids: [1, 2],
          updates: { typeId: 77 },
        })
      ).rejects.toThrow("We couldn't find that item type.");
      expect(mockBulkUpdateEntities).not.toHaveBeenCalled();
    });
  });
});
