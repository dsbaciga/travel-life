/**
 * Transportation Controller Tests
 *
 * The transportation controller does NOT use createCrudController - it uses
 * the manual asyncHandler pattern. Tests verify each handler method:
 * - Correct service method invocation
 * - Correct argument extraction from request params/body/query
 * - Correct status code
 * - Body validation via Zod schemas
 */

import { jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

// Mock @prisma/client before any imports
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

// Mock the database
import { mockPrismaClient, resetPrismaMocks } from '../../__tests__/mocks/prisma';

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrismaClient,
}));

// Mock serviceHelpers
jest.mock('../../utils/serviceHelpers', () => ({
  verifyTripAccessWithPermission: jest.fn(),
  verifyEntityAccessWithPermission: jest.fn(),
}));

// Mock the transportation service
const mockTransportationService = {
  createTransportation: jest.fn(),
  getAllTransportation: jest.fn(),
  getTransportationByTrip: jest.fn(),
  getTransportationById: jest.fn(),
  updateTransportation: jest.fn(),
  deleteTransportation: jest.fn(),
  recalculateDistancesForTrip: jest.fn(),
  bulkDeleteTransportation: jest.fn(),
  bulkUpdateTransportation: jest.fn(),
};

jest.mock('../../services/transportation.service', () => ({
  __esModule: true,
  default: mockTransportationService,
}));

import { transportationController } from '../transportation.controller';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { createAuthenticatedUser } from '../../__tests__/helpers/auth';
import { testUsers } from '../../__tests__/fixtures/users';

// =============================================================================
// HELPERS
// =============================================================================

const authUser = createAuthenticatedUser(testUsers.user1);

async function callHandler(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request>,
  res: Response,
  next: NextFunction
): Promise<void> {
  handler(req as Request, res, next);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// =============================================================================
// TESTS
// =============================================================================

describe('transportationController', () => {
  beforeEach(() => {
    resetPrismaMocks();
    Object.values(mockTransportationService).forEach((fn) => fn.mockReset());
  });

  describe('createTransportation', () => {
    it('calls transportationService.createTransportation with userId and validated body, returns 201', async () => {
      const body = { tripId: 5, type: 'flight' as const };
      const created = { id: 1, ...body };
      mockTransportationService.createTransportation.mockResolvedValue(created);

      const req = createMockRequest({ user: authUser, body });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.createTransportation, req, res as unknown as Response, next);

      expect(mockTransportationService.createTransportation).toHaveBeenCalledWith(
        testUsers.user1.id,
        body
      );
      expectSuccessResponse(res, 201, created);
    });

    it('fails validation for missing required type field', async () => {
      const body = { tripId: 5 }; // missing type
      const req = createMockRequest({ user: authUser, body });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.createTransportation, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockTransportationService.createTransportation).not.toHaveBeenCalled();
    });

    it('fails validation for invalid type value', async () => {
      const body = { tripId: 5, type: 'rocket' }; // invalid type
      const req = createMockRequest({ user: authUser, body });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.createTransportation, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockTransportationService.createTransportation).not.toHaveBeenCalled();
    });
  });

  describe('getAllTransportation', () => {
    it('parses pagination query params and calls service', async () => {
      const result = {
        data: [{ id: 1 }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      };
      mockTransportationService.getAllTransportation.mockResolvedValue(result);

      const req = createMockRequest({
        user: authUser,
        query: { page: '1', limit: '50' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.getAllTransportation, req, res as unknown as Response, next);

      expect(mockTransportationService.getAllTransportation).toHaveBeenCalledWith(
        testUsers.user1.id,
        { page: 1, limit: 50 }
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          items: result.data,
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    });

    it('uses default pagination when query params not provided', async () => {
      const result = {
        data: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
      };
      mockTransportationService.getAllTransportation.mockResolvedValue(result);

      const req = createMockRequest({ user: authUser });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.getAllTransportation, req, res as unknown as Response, next);

      expect(mockTransportationService.getAllTransportation).toHaveBeenCalledWith(
        testUsers.user1.id,
        { page: 1, limit: 50 }
      );
    });
  });

  describe('getTransportationByTrip', () => {
    it('extracts tripId from params and calls service', async () => {
      const transportations = [{ id: 1, type: 'flight' }];
      mockTransportationService.getTransportationByTrip.mockResolvedValue(transportations);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.getTransportationByTrip, req, res as unknown as Response, next);

      expect(mockTransportationService.getTransportationByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        5
      );
      expectSuccessResponse(res, 200, transportations);
    });

    it('fails with invalid tripId', async () => {
      const req = createMockRequest({
        user: authUser,
        params: { tripId: 'abc' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.getTransportationByTrip, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockTransportationService.getTransportationByTrip).not.toHaveBeenCalled();
    });
  });

  describe('getTransportationById', () => {
    it('extracts id from params and calls service', async () => {
      const transportation = { id: 42, type: 'train' };
      mockTransportationService.getTransportationById.mockResolvedValue(transportation);

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.getTransportationById, req, res as unknown as Response, next);

      expect(mockTransportationService.getTransportationById).toHaveBeenCalledWith(
        testUsers.user1.id,
        42
      );
      expectSuccessResponse(res, 200, transportation);
    });
  });

  describe('updateTransportation', () => {
    it('extracts id from params and body, calls service', async () => {
      const body = { carrier: 'Delta', notes: 'Window seat' };
      const updated = { id: 42, ...body };
      mockTransportationService.updateTransportation.mockResolvedValue(updated);

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.updateTransportation, req, res as unknown as Response, next);

      expect(mockTransportationService.updateTransportation).toHaveBeenCalledWith(
        testUsers.user1.id,
        42,
        body
      );
      expectSuccessResponse(res, 200, updated);
    });
  });

  describe('deleteTransportation', () => {
    it('extracts id from params and calls service', async () => {
      const result = { success: true };
      mockTransportationService.deleteTransportation.mockResolvedValue(result);

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.deleteTransportation, req, res as unknown as Response, next);

      expect(mockTransportationService.deleteTransportation).toHaveBeenCalledWith(
        testUsers.user1.id,
        42
      );
      expectSuccessResponse(res, 200, result);
    });
  });

  describe('recalculateDistances', () => {
    it('extracts tripId from params and calls service', async () => {
      mockTransportationService.recalculateDistancesForTrip.mockResolvedValue(3);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.recalculateDistances, req, res as unknown as Response, next);

      expect(mockTransportationService.recalculateDistancesForTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        5
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Recalculated distances for 3 transportation records',
          count: 3,
        },
      });
    });
  });

  describe('bulkDeleteTransportation', () => {
    it('extracts tripId from params and ids from body', async () => {
      const body = { ids: [1, 2, 3] };
      const result = { success: true, deletedCount: 3 };
      mockTransportationService.bulkDeleteTransportation.mockResolvedValue(result);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.bulkDeleteTransportation, req, res as unknown as Response, next);

      expect(mockTransportationService.bulkDeleteTransportation).toHaveBeenCalledWith(
        testUsers.user1.id,
        5,
        body
      );
      expectSuccessResponse(res, 200, result);
    });

    it('fails validation when ids array is empty', async () => {
      const body = { ids: [] };
      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.bulkDeleteTransportation, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockTransportationService.bulkDeleteTransportation).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateTransportation', () => {
    it('extracts tripId from params and updates from body', async () => {
      const body = { ids: [1, 2], updates: { type: 'bus' as const } };
      const result = { success: true, updatedCount: 2 };
      mockTransportationService.bulkUpdateTransportation.mockResolvedValue(result);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.bulkUpdateTransportation, req, res as unknown as Response, next);

      expect(mockTransportationService.bulkUpdateTransportation).toHaveBeenCalledWith(
        testUsers.user1.id,
        5,
        body
      );
      expectSuccessResponse(res, 200, result);
    });

    it('fails validation when ids array is empty', async () => {
      const body = { ids: [], updates: { type: 'bus' } };
      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.bulkUpdateTransportation, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockTransportationService.bulkUpdateTransportation).not.toHaveBeenCalled();
    });
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({ params: { tripId: '5' } }); // no user
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(transportationController.getTransportationByTrip, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as Error & { statusCode?: number };
      expect(error.statusCode).toBe(401);
    });
  });
});
