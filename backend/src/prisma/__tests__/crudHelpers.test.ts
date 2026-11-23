/**
 * crudHelpers Tests
 *
 * Tests for:
 * - createCrudController factory
 * - deleteEntity generic delete
 * - bulkDeleteEntities generic bulk delete
 * - bulkUpdateEntities generic bulk update
 */

import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

// Mock @prisma/client before any imports that depend on it
jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) {
        this.value = String(value);
      }
      toString(): string {
        return this.value;
      }
      toNumber(): number {
        return parseFloat(this.value);
      }
    },
  },
  EntityType: {
    PHOTO: 'PHOTO',
    LOCATION: 'LOCATION',
    ACTIVITY: 'ACTIVITY',
    LODGING: 'LODGING',
    TRANSPORTATION: 'TRANSPORTATION',
    JOURNAL_ENTRY: 'JOURNAL_ENTRY',
    PHOTO_ALBUM: 'PHOTO_ALBUM',
  },
}));

// Mock the database module with mockPrismaClient
import { mockPrismaClient, resetPrismaMocks } from '../../__tests__/mocks/prisma';

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrismaClient,
}));

// Mock trip access verification
const mockVerifyTripAccessWithPermission = jest.fn();
const mockVerifyEntityAccessWithPermission = jest.fn();

jest.mock('../../services/_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) =>
    mockVerifyTripAccessWithPermission(...args),
  verifyEntityAccessWithPermission: (...args: unknown[]) =>
    mockVerifyEntityAccessWithPermission(...args),
}));

import { z } from 'zod';
import {
  createCrudController,
  deleteEntity,
  bulkDeleteEntities,
  bulkUpdateEntities,
} from '../crudHelpers';
import { AppError } from '../../errors/errors';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  expectAppError,
  expectSuccessResponse,
} from '../../__tests__/mockBuilders/requests';
import { createAuthenticatedUser } from '../../__tests__/mockBuilders/auth';
import { testUsers } from '../../__tests__/fixtures/users';

// =============================================================================
// TEST HELPERS
// =============================================================================

/** Create a simple mock service with jest.fn() methods */
function createMockService() {
  return {
    doSomething: jest.fn(),
    createItem: jest.fn(),
    getItems: jest.fn(),
    getItemById: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
    notAFunction: 'just a string',
  };
}

/** Call a controller handler and wait for async completion */
async function callHandler(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  handler(req, res, next);
  // asyncHandler uses Promise.resolve().catch(next), so we need to flush microtasks
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// =============================================================================
// createCrudController
// =============================================================================

describe('createCrudController', () => {
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    resetPrismaMocks();
    mockService = createMockService();
    mockVerifyTripAccessWithPermission.mockReset();
    mockVerifyEntityAccessWithPermission.mockReset();
  });

  describe('factory creation', () => {
    it('creates handlers from config correctly', () => {
      const controller = createCrudController({
        service: mockService,
        handlers: {
          doSomething: { method: 'doSomething' },
          createItem: { method: 'createItem', statusCode: 201 },
        },
      });

      expect(controller).toHaveProperty('doSomething');
      expect(controller).toHaveProperty('createItem');
      expect(typeof controller.doSomething).toBe('function');
      expect(typeof controller.createItem).toBe('function');
    });

    it('throws if service method does not exist on service', () => {
      // Widening the service to an index signature makes "nonExistentMethod" a
      // legal key *type* that is simply absent at runtime -- which is precisely
      // the failure this guard exists to catch. Modelling it this way needs no
      // cast: the point of the test is the missing method, not a bad type.
      const serviceWithUnknownMethods: Record<string, unknown> = mockService;

      expect(() =>
        createCrudController({
          service: serviceWithUnknownMethods,
          handlers: {
            bad: { method: 'nonExistentMethod' },
          },
        })
      ).toThrow(
        'Handler "bad": service method "nonExistentMethod" is not a function on the provided service'
      );
    });

    it('throws if service method is not a function', () => {
      // `notAFunction` IS a real key of mockService -- it just holds a string
      // rather than a function, so no cast is needed here at all.
      expect(() =>
        createCrudController({
          service: mockService,
          handlers: {
            bad: { method: 'notAFunction' },
          },
        })
      ).toThrow(
        'Handler "bad": service method "notAFunction" is not a function on the provided service'
      );
    });
  });

  describe('handler execution', () => {
    it('extracts userId via requireUserId', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      mockService.doSomething.mockResolvedValue({ id: 1 });

      const controller = createCrudController({
        service: mockService,
        handlers: {
          doSomething: { method: 'doSomething' },
        },
      });

      const req = createMockRequest({ user: authUser });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.doSomething, req, res, next);

      // Should have been called with user1's userId
      expect(mockService.doSomething).toHaveBeenCalledWith(testUsers.user1.id);
    });

    it('throws 401 when user is not authenticated', async () => {
      mockService.doSomething.mockResolvedValue({ id: 1 });

      const controller = createCrudController({
        service: mockService,
        handlers: {
          doSomething: { method: 'doSomething' },
        },
      });

      const req = createMockRequest({}); // no user
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.doSomething, req, res, next);

      // asyncHandler catches errors and passes them to next
      expect(next).toHaveBeenCalled();
      const error = expectAppError(next);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(401);
    });

    it('validates body with Zod schema when provided', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      const bodySchema = z.object({
        name: z.string(),
        tripId: z.number(),
      });
      mockService.createItem.mockResolvedValue({ id: 1, name: 'Test' });

      const controller = createCrudController({
        service: mockService,
        handlers: {
          createItem: {
            method: 'createItem',
            statusCode: 201,
            bodySchema,
          },
        },
      });

      const req = createMockRequest({
        user: authUser,
        body: { name: 'Test', tripId: 5 },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.createItem, req, res, next);

      expect(mockService.createItem).toHaveBeenCalledWith(
        testUsers.user1.id,
        { name: 'Test', tripId: 5 }
      );
      expectSuccessResponse(res, 201, { id: 1, name: 'Test' });
    });

    it('passes Zod validation error to next when body is invalid', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      const bodySchema = z.object({
        name: z.string(),
        tripId: z.number(),
      });

      const controller = createCrudController({
        service: mockService,
        handlers: {
          createItem: {
            method: 'createItem',
            statusCode: 201,
            bodySchema,
          },
        },
      });

      const req = createMockRequest({
        user: authUser,
        body: { name: 123 }, // invalid: name should be string, tripId missing
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.createItem, req, res, next);

      // Zod error should be passed to next
      expect(next).toHaveBeenCalled();
    });

    it('calls service method with correct args (default: [userId, body])', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      const bodySchema = z.object({ name: z.string() });
      mockService.createItem.mockResolvedValue({ id: 1, name: 'Test' });

      const controller = createCrudController({
        service: mockService,
        handlers: {
          createItem: {
            method: 'createItem',
            bodySchema,
          },
        },
      });

      const req = createMockRequest({
        user: authUser,
        body: { name: 'Test' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.createItem, req, res, next);

      // Default args: [userId, body]
      expect(mockService.createItem).toHaveBeenCalledWith(
        testUsers.user1.id,
        { name: 'Test' }
      );
    });

    it('calls service method with [userId] when no body schema', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      mockService.doSomething.mockResolvedValue({ items: [] });

      const controller = createCrudController({
        service: mockService,
        handlers: {
          doSomething: { method: 'doSomething' },
        },
      });

      const req = createMockRequest({ user: authUser });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.doSomething, req, res, next);

      expect(mockService.doSomething).toHaveBeenCalledWith(testUsers.user1.id);
    });

    it('uses buildArgs to construct arguments when provided', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      mockService.getItemById.mockResolvedValue({ id: 42, name: 'Found' });

      const controller = createCrudController({
        service: mockService,
        handlers: {
          getItemById: {
            method: 'getItemById',
            buildArgs: (userId, req) => [userId, Number(req.params.id)],
          },
        },
      });

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.getItemById, req, res, next);

      expect(mockService.getItemById).toHaveBeenCalledWith(testUsers.user1.id, 42);
    });

    it('passes validated body to buildArgs when both bodySchema and buildArgs are provided', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      const bodySchema = z.object({ notes: z.string() });
      mockService.updateItem.mockResolvedValue({ id: 5, notes: 'Updated' });

      const controller = createCrudController({
        service: mockService,
        handlers: {
          updateItem: {
            method: 'updateItem',
            bodySchema,
            buildArgs: (userId, req, body) => [userId, Number(req.params.id), body],
          },
        },
      });

      const req = createMockRequest({
        user: authUser,
        params: { id: '5' },
        body: { notes: 'Updated' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.updateItem, req, res, next);

      expect(mockService.updateItem).toHaveBeenCalledWith(
        testUsers.user1.id,
        5,
        { notes: 'Updated' }
      );
    });

    it('returns { status: "success", data } with correct statusCode', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      const result = { id: 1, name: 'Created Item' };
      mockService.createItem.mockResolvedValue(result);

      const controller = createCrudController({
        service: mockService,
        handlers: {
          createItem: {
            method: 'createItem',
            statusCode: 201,
          },
        },
      });

      const req = createMockRequest({ user: authUser });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.createItem, req, res, next);

      expectSuccessResponse(res, 201, result);
    });

    it('defaults to statusCode 200 when not specified', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      const result = [{ id: 1 }, { id: 2 }];
      mockService.getItems.mockResolvedValue(result);

      const controller = createCrudController({
        service: mockService,
        handlers: {
          getItems: { method: 'getItems' },
        },
      });

      const req = createMockRequest({ user: authUser });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.getItems, req, res, next);

      expectSuccessResponse(res, 200, result);
    });

    it('propagates service errors via next', async () => {
      const authUser = createAuthenticatedUser(testUsers.user1);
      const serviceError = new AppError("We couldn't find that.", 404);
      mockService.getItemById.mockRejectedValue(serviceError);

      const controller = createCrudController({
        service: mockService,
        handlers: {
          getItemById: {
            method: 'getItemById',
            buildArgs: (userId, req) => [userId, Number(req.params.id)],
          },
        },
      });

      const req = createMockRequest({
        user: authUser,
        params: { id: '999' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(controller.getItemById, req, res, next);

      expect(next).toHaveBeenCalledWith(serviceError);
    });
  });
});

// =============================================================================
// deleteEntity
// =============================================================================

describe('deleteEntity', () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockVerifyEntityAccessWithPermission.mockReset();
    mockVerifyTripAccessWithPermission.mockReset();
  });

  it('verifies access, cleans up entity links, and deletes entity', async () => {
    const entityId = 10;
    const userId = 1;
    const tripId = 5;

    mockVerifyEntityAccessWithPermission.mockResolvedValue({
      entity: { id: entityId, tripId },
      tripAccess: { trip: { id: tripId, userId }, isOwner: true, permissionLevel: 'admin' },
    });

    // $transaction calls the callback with the mock client
    // entityLink.deleteMany and activity.delete are already mocked via mockPrismaClient
    mockPrismaClient.entityLink.deleteMany.mockResolvedValue({ count: 2 });
    mockPrismaClient.activity.delete.mockResolvedValue({ id: entityId });
    // Deleting an activity walks its child activities so their links can be
    // cleaned up too; no children here.
    mockPrismaClient.activity.findMany.mockResolvedValue([]);

    const result = await deleteEntity('activity', entityId, userId);

    expect(result).toEqual({ success: true });
    expect(mockVerifyEntityAccessWithPermission).toHaveBeenCalledWith(
      'activity',
      entityId,
      userId,
      'edit'
    );
    // The $transaction should have been called
    expect(mockPrismaClient.$transaction).toHaveBeenCalled();
  });

  it('cleans up entity links for entity types that have link types', async () => {
    const entityId = 10;
    const userId = 1;
    const tripId = 5;

    mockVerifyEntityAccessWithPermission.mockResolvedValue({
      entity: { id: entityId, tripId },
      tripAccess: { trip: { id: tripId, userId }, isOwner: true, permissionLevel: 'admin' },
    });

    mockPrismaClient.entityLink.deleteMany.mockResolvedValue({ count: 1 });
    mockPrismaClient.lodging.delete.mockResolvedValue({ id: entityId });

    await deleteEntity('lodging', entityId, userId);

    // Verify entityLink.deleteMany was called within the transaction.
    // Ids are matched with `in` because the activity case can span an entity
    // and all of its cascade-deleted descendants.
    expect(mockPrismaClient.entityLink.deleteMany).toHaveBeenCalledWith({
      where: {
        tripId,
        OR: [
          { sourceType: 'LODGING', sourceId: { in: [entityId] } },
          { targetType: 'LODGING', targetId: { in: [entityId] } },
        ],
      },
    });

    // Only activities have a child hierarchy to walk.
    expect(mockPrismaClient.activity.findMany).not.toHaveBeenCalled();
  });

  it('also cleans up links belonging to cascade-deleted child activities', async () => {
    const entityId = 10;
    const userId = 1;
    const tripId = 5;

    mockVerifyEntityAccessWithPermission.mockResolvedValue({
      entity: { id: entityId, tripId },
      tripAccess: { trip: { id: tripId, userId }, isOwner: true, permissionLevel: 'admin' },
    });

    mockPrismaClient.entityLink.deleteMany.mockResolvedValue({ count: 3 });
    mockPrismaClient.activity.delete.mockResolvedValue({ id: entityId });

    // Two levels of nesting: 10 -> [11, 12] -> [13]. Child activities are
    // cascade-deleted by the database, so nothing else would clean their links.
    mockPrismaClient.activity.findMany
      .mockResolvedValueOnce([{ id: 11 }, { id: 12 }])
      .mockResolvedValueOnce([{ id: 13 }])
      .mockResolvedValueOnce([]);

    await deleteEntity('activity', entityId, userId);

    expect(mockPrismaClient.entityLink.deleteMany).toHaveBeenCalledWith({
      where: {
        tripId,
        OR: [
          { sourceType: 'ACTIVITY', sourceId: { in: [10, 11, 12, 13] } },
          { targetType: 'ACTIVITY', targetId: { in: [10, 11, 12, 13] } },
        ],
      },
    });
  });

  it('propagates errors from verifyEntityAccessWithPermission', async () => {
    mockVerifyEntityAccessWithPermission.mockRejectedValue(
      new AppError("We couldn't find that activity.", 404)
    );

    await expect(deleteEntity('activity', 999, 1)).rejects.toThrow("We couldn't find that activity.");
  });
});

// =============================================================================
// bulkDeleteEntities
// =============================================================================

describe('bulkDeleteEntities', () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockVerifyTripAccessWithPermission.mockReset();
    mockVerifyEntityAccessWithPermission.mockReset();
  });

  it('verifies trip access, validates entity ownership, and deletes in batch', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [10, 11, 12];

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    // findMany returns matching entities
    mockPrismaClient.activity.findMany.mockResolvedValue(
      ids.map((id) => ({ id, tripId }))
    );

    // Transaction returns the deleteMany result
    mockPrismaClient.entityLink.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaClient.activity.deleteMany.mockResolvedValue({ count: 3 });

    const result = await bulkDeleteEntities('activity', userId, tripId, ids);

    expect(result).toEqual({ success: true, deletedCount: 3 });
    expect(mockVerifyTripAccessWithPermission).toHaveBeenCalledWith(userId, tripId, 'edit');
    expect(mockPrismaClient.activity.findMany).toHaveBeenCalledWith({
      where: { id: { in: ids }, tripId },
    });
  });

  it('throws when entities not found or not belonging to trip', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [10, 11, 12];

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    // Only 2 of 3 entities found
    mockPrismaClient.activity.findMany.mockResolvedValue([
      { id: 10, tripId },
      { id: 11, tripId },
    ]);

    await expect(
      bulkDeleteEntities('activity', userId, tripId, ids)
    ).rejects.toThrow("Some of those activities aren't on this trip.");
  });

  it('handles lodging entity type correctly', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [20, 21];

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    mockPrismaClient.lodging.findMany.mockResolvedValue(
      ids.map((id) => ({ id, tripId }))
    );

    mockPrismaClient.entityLink.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaClient.lodging.deleteMany.mockResolvedValue({ count: 2 });

    const result = await bulkDeleteEntities('lodging', userId, tripId, ids);

    expect(result).toEqual({ success: true, deletedCount: 2 });
    expect(mockPrismaClient.lodging.findMany).toHaveBeenCalled();
  });
});

// =============================================================================
// bulkUpdateEntities
// =============================================================================

describe('bulkUpdateEntities', () => {
  beforeEach(() => {
    resetPrismaMocks();
    mockVerifyTripAccessWithPermission.mockReset();
    mockVerifyEntityAccessWithPermission.mockReset();
  });

  it('verifies trip access, validates ownership, and builds update data', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [10, 11];
    const updates = { category: 'Dining', notes: 'Updated notes' };

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    mockPrismaClient.activity.findMany.mockResolvedValue(
      ids.map((id) => ({ id, tripId }))
    );

    mockPrismaClient.activity.updateMany.mockResolvedValue({ count: 2 });

    const result = await bulkUpdateEntities('activity', userId, tripId, ids, updates);

    expect(result).toEqual({ success: true, updatedCount: 2 });
    expect(mockVerifyTripAccessWithPermission).toHaveBeenCalledWith(userId, tripId, 'edit');
    expect(mockPrismaClient.activity.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ids }, tripId },
      data: { category: 'Dining', notes: 'Updated notes' },
    });
  });

  it('respects field mapping', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [10];
    const updates = { carrier: 'United Airlines', notes: 'Flight notes' };
    const fieldMapping = { carrier: 'company' };

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    mockPrismaClient.transportation.findMany.mockResolvedValue([{ id: 10, tripId }]);
    mockPrismaClient.transportation.updateMany.mockResolvedValue({ count: 1 });

    const result = await bulkUpdateEntities(
      'transportation',
      userId,
      tripId,
      ids,
      updates,
      { fieldMapping }
    );

    expect(result).toEqual({ success: true, updatedCount: 1 });
    // 'carrier' should be mapped to 'company'
    expect(mockPrismaClient.transportation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ids }, tripId },
      data: { company: 'United Airlines', notes: 'Flight notes' },
    });
  });

  it('respects allowedFields whitelist', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [10];
    const updates = { category: 'Dining', notes: 'Updated', secretField: 'hacked' };
    const allowedFields = ['category', 'notes'];

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    mockPrismaClient.activity.findMany.mockResolvedValue([{ id: 10, tripId }]);
    mockPrismaClient.activity.updateMany.mockResolvedValue({ count: 1 });

    const result = await bulkUpdateEntities(
      'activity',
      userId,
      tripId,
      ids,
      updates,
      { allowedFields }
    );

    expect(result).toEqual({ success: true, updatedCount: 1 });
    // secretField should not be in the update data
    expect(mockPrismaClient.activity.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ids }, tripId },
      data: { category: 'Dining', notes: 'Updated' },
    });
  });

  it('throws when no valid update fields', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [10];
    const updates = { nonExistentField: undefined };

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    mockPrismaClient.activity.findMany.mockResolvedValue([{ id: 10, tripId }]);

    await expect(
      bulkUpdateEntities('activity', userId, tripId, ids, updates)
    ).rejects.toThrow('Nothing to save. Change a field first.');
  });

  it('throws when entities not found or not belonging to trip', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [10, 11, 12];
    const updates = { notes: 'Updated' };

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    // Only 1 of 3 found
    mockPrismaClient.activity.findMany.mockResolvedValue([{ id: 10, tripId }]);

    await expect(
      bulkUpdateEntities('activity', userId, tripId, ids, updates)
    ).rejects.toThrow("Some of those activities aren't on this trip.");
  });

  it('skips undefined values in updates', async () => {
    const userId = 1;
    const tripId = 5;
    const ids = [10];
    const updates = { category: 'Dining', notes: undefined };

    mockVerifyTripAccessWithPermission.mockResolvedValue({
      trip: { id: tripId, userId },
      isOwner: true,
      permissionLevel: 'admin',
    });

    mockPrismaClient.activity.findMany.mockResolvedValue([{ id: 10, tripId }]);
    mockPrismaClient.activity.updateMany.mockResolvedValue({ count: 1 });

    const result = await bulkUpdateEntities('activity', userId, tripId, ids, updates);

    expect(result).toEqual({ success: true, updatedCount: 1 });
    // Only category should be in update data, notes is undefined and skipped
    expect(mockPrismaClient.activity.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ids }, tripId },
      data: { category: 'Dining' },
    });
  });
});
