/**
 * Activity Controller Tests
 *
 * Tests that the activity controller config is correct, since it uses createCrudController.
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

// Mock the activity service
const mockActivityService = {
  createActivity: jest.fn(),
  getActivitiesByTrip: jest.fn(),
  getActivityById: jest.fn(),
  updateActivity: jest.fn(),
  deleteActivity: jest.fn(),
  bulkDeleteActivities: jest.fn(),
  bulkUpdateActivities: jest.fn(),
};

jest.mock('../../services/activity.service', () => ({
  __esModule: true,
  default: mockActivityService,
}));

import { activityController } from '../activity.controller';
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

describe('activityController', () => {
  beforeEach(() => {
    resetPrismaMocks();
    Object.values(mockActivityService).forEach((fn) => fn.mockReset());
  });

  describe('createActivity', () => {
    it('calls activityService.createActivity with userId and validated body, returns 201', async () => {
      const body = { tripId: 5, name: 'Visit Museum' };
      const created = { id: 1, ...body };
      mockActivityService.createActivity.mockResolvedValue(created);

      const req = createMockRequest({ user: authUser, body });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.createActivity, req, res as unknown as Response, next);

      expect(mockActivityService.createActivity).toHaveBeenCalledWith(
        testUsers.user1.id,
        body
      );
      expectSuccessResponse(res, 201, created);
    });

    it('fails validation for missing required name field', async () => {
      const body = { tripId: 5 }; // missing name
      const req = createMockRequest({ user: authUser, body });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.createActivity, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockActivityService.createActivity).not.toHaveBeenCalled();
    });
  });

  describe('getActivitiesByTrip', () => {
    it('extracts tripId from params and calls service', async () => {
      const activities = [{ id: 1, name: 'Activity 1' }];
      mockActivityService.getActivitiesByTrip.mockResolvedValue(activities);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.getActivitiesByTrip, req, res as unknown as Response, next);

      expect(mockActivityService.getActivitiesByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        5
      );
      expectSuccessResponse(res, 200, activities);
    });

    it('fails with invalid tripId', async () => {
      const req = createMockRequest({
        user: authUser,
        params: { tripId: 'abc' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.getActivitiesByTrip, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockActivityService.getActivitiesByTrip).not.toHaveBeenCalled();
    });
  });

  describe('getActivityById', () => {
    it('extracts id from params and calls service', async () => {
      const activity = { id: 42, name: 'Museum Tour' };
      mockActivityService.getActivityById.mockResolvedValue(activity);

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.getActivityById, req, res as unknown as Response, next);

      expect(mockActivityService.getActivityById).toHaveBeenCalledWith(
        testUsers.user1.id,
        42
      );
      expectSuccessResponse(res, 200, activity);
    });
  });

  describe('updateActivity', () => {
    it('extracts id from params and body, calls service', async () => {
      const body = { name: 'Updated Name', notes: 'Updated notes' };
      const updated = { id: 42, ...body };
      mockActivityService.updateActivity.mockResolvedValue(updated);

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.updateActivity, req, res as unknown as Response, next);

      expect(mockActivityService.updateActivity).toHaveBeenCalledWith(
        testUsers.user1.id,
        42,
        body
      );
      expectSuccessResponse(res, 200, updated);
    });
  });

  describe('deleteActivity', () => {
    it('extracts id from params and calls service', async () => {
      mockActivityService.deleteActivity.mockResolvedValue({ success: true });

      const req = createMockRequest({
        user: authUser,
        params: { id: '42' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.deleteActivity, req, res as unknown as Response, next);

      expect(mockActivityService.deleteActivity).toHaveBeenCalledWith(
        testUsers.user1.id,
        42
      );
      expectSuccessResponse(res, 200, { success: true });
    });
  });

  describe('bulkDeleteActivities', () => {
    it('extracts tripId from params and ids from body', async () => {
      const body = { ids: [1, 2, 3] };
      const result = { success: true, deletedCount: 3 };
      mockActivityService.bulkDeleteActivities.mockResolvedValue(result);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.bulkDeleteActivities, req, res as unknown as Response, next);

      expect(mockActivityService.bulkDeleteActivities).toHaveBeenCalledWith(
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

      await callHandler(activityController.bulkDeleteActivities, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(mockActivityService.bulkDeleteActivities).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateActivities', () => {
    it('extracts tripId from params and updates from body', async () => {
      const body = { ids: [1, 2], updates: { category: 'Dining' } };
      const result = { success: true, updatedCount: 2 };
      mockActivityService.bulkUpdateActivities.mockResolvedValue(result);

      const req = createMockRequest({
        user: authUser,
        params: { tripId: '5' },
        body,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.bulkUpdateActivities, req, res as unknown as Response, next);

      expect(mockActivityService.bulkUpdateActivities).toHaveBeenCalledWith(
        testUsers.user1.id,
        5,
        body
      );
      expectSuccessResponse(res, 200, result);
    });
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      const req = createMockRequest({ params: { tripId: '5' } }); // no user
      const res = createMockResponse();
      const next = createMockNext();

      await callHandler(activityController.getActivitiesByTrip, req, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as Error & { statusCode?: number };
      expect(error.statusCode).toBe(401);
    });
  });
});
