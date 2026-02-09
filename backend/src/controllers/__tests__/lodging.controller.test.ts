/**
 * Lodging Controller Tests
 *
 * Tests that the lodging controller config is correct, since it uses createCrudController.
 * Each handler is verified for:
 * - Correct service method invocation
 * - Correct argument extraction from request params/body
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

// Mock serviceHelpers (required by crudHelpers)
jest.mock('../../utils/serviceHelpers', () => ({
  verifyTripAccessWithPermission: jest.fn(),
  verifyEntityAccessWithPermission: jest.fn(),
}));

// Mock the lodging service
const mockLodgingService = {
  createLodging: jest.fn(),
  getLodgingByTrip: jest.fn(),
  getLodgingById: jest.fn(),
  updateLodging: jest.fn(),
  deleteLodging: jest.fn(),
  bulkDeleteLodging: jest.fn(),
  bulkUpdateLodging: jest.fn(),
};

jest.mock('../../services/lodging.service', () => ({
  __esModule: true,
  default: mockLodgingService,
}));

import { lodgingController } from '../lodging.controller';
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

describe('lodgingController', () => {
  beforeEach(() => {
    resetPrismaMocks();
    Object.values(mockLodgingService).forEach((fn) => fn.mockReset());
  });

  describe('createLodging', () => {
    it('calls lodgingService.createLodging with userId and validated body, returns 201', async () => {
      const body = { tripId: 5, type: 'hotel' as const, name: 'Grand Hotel' };
      const created = { id: 1, ...body };
      mockLodgingService.createLodging.mockResolvedValue(created);

      const req = createMockRequest({ user: authUser, body });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.createLodging, req, res as unknown as Response, next);

      expect(mockLodgingService.createLodging).toHaveBeenCalledWith(
        testUsers.user1.id,
        body
      );
      expectSuccessResponse(res, 201, created);
    });

    it('fails validation for missing required name field', async () => {
      const body = { tripId: 5, type: 'hotel' }; // missing name
      const req = createMockRequest({ user: authUser, body });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.createLodging, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockLodgingService.createLodging).not.toHaveBeenCalled();
    });

    it('fails validation for invalid type value', async () => {
      const body = { tripId: 5, type: 'spaceship', name: 'Space Hotel' };
      const req = createMockRequest({ user: authUser, body });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.createLodging, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockLodgingService.createLodging).not.toHaveBeenCalled();
    });
  });

  describe('getLodgingByTrip', () => {
    it('extracts tripId from params and calls service', async () => {
      const lodgings = [{ id: 1, name: 'Grand Hotel' }];
      mockLodgingService.getLodgingByTrip.mockResolvedValue(lodgings);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.getLodgingByTrip, req, res as unknown as Response, next);

      expect(mockLodgingService.getLodgingByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        5
      );
      expectSuccessResponse(res, 200, lodgings);
    });

    it('fails with invalid tripId', async () => {
      const req = createMockRequest({
        user: authUser,
        params: { tripId: 'abc' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.getLodgingByTrip, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockLodgingService.getLodgingByTrip).not.toHaveBeenCalled();
    });
  });

  describe('getLodgingById', () => {
    it('extracts id from params and calls service', async () => {
      const lodging = { id: 42, name: 'Cozy Hostel' };
      mockLodgingService.getLodgingById.mockResolvedValue(lodging);

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.getLodgingById, req, res as unknown as Response, next);

      expect(mockLodgingService.getLodgingById).toHaveBeenCalledWith(
        testUsers.user1.id,
        42
      );
      expectSuccessResponse(res, 200, lodging);
    });
  });

  describe('updateLodging', () => {
    it('extracts id from params and body, calls service', async () => {
      const body = { name: 'Updated Hotel', notes: 'Great stay' };
      const updated = { id: 42, ...body };
      mockLodgingService.updateLodging.mockResolvedValue(updated);

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.updateLodging, req, res as unknown as Response, next);

      expect(mockLodgingService.updateLodging).toHaveBeenCalledWith(
        testUsers.user1.id,
        42,
        body
      );
      expectSuccessResponse(res, 200, updated);
    });
  });

  describe('deleteLodging', () => {
    it('extracts id from params and calls service', async () => {
      mockLodgingService.deleteLodging.mockResolvedValue({ success: true });

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.deleteLodging, req, res as unknown as Response, next);

      expect(mockLodgingService.deleteLodging).toHaveBeenCalledWith(
        testUsers.user1.id,
        42
      );
      expectSuccessResponse(res, 200, { success: true });
    });
  });

  describe('bulkDeleteLodging', () => {
    it('extracts tripId from params and ids from body', async () => {
      const body = { ids: [1, 2, 3] };
      const result = { success: true, deletedCount: 3 };
      mockLodgingService.bulkDeleteLodging.mockResolvedValue(result);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.bulkDeleteLodging, req, res as unknown as Response, next);

      expect(mockLodgingService.bulkDeleteLodging).toHaveBeenCalledWith(
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

      await callHandler(lodgingController.bulkDeleteLodging, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockLodgingService.bulkDeleteLodging).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateLodging', () => {
    it('extracts tripId from params and updates from body', async () => {
      const body = { ids: [1, 2], updates: { type: 'hostel' as const } };
      const result = { success: true, updatedCount: 2 };
      mockLodgingService.bulkUpdateLodging.mockResolvedValue(result);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.bulkUpdateLodging, req, res as unknown as Response, next);

      expect(mockLodgingService.bulkUpdateLodging).toHaveBeenCalledWith(
        testUsers.user1.id,
        5,
        body
      );
      expectSuccessResponse(res, 200, result);
    });

    it('fails validation when ids array is empty', async () => {
      const body = { ids: [], updates: { type: 'hostel' } };
      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.bulkUpdateLodging, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockLodgingService.bulkUpdateLodging).not.toHaveBeenCalled();
    });
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({ params: { tripId: '5' } }); // no user
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(lodgingController.getLodgingByTrip, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as Error & { statusCode?: number };
      expect(error.statusCode).toBe(401);
    });
  });
});
