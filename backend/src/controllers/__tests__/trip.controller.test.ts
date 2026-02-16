/**
 * Trip Controller Tests
 *
 * Tests the trip controller as a thin wrapper around tripService and tripValidatorService.
 * Each test mocks the service layer and verifies:
 * - Correct service method is called with correct args
 * - Response has correct status code and { status: 'success', data } format
 * - Service errors propagate correctly via asyncHandler -> next()
 *
 * Test cases:
 * TRIP-CTRL-001: createTrip - validates body, calls tripService.createTrip, returns 201
 * TRIP-CTRL-002: createTrip - rejects invalid body (Zod validation error)
 * TRIP-CTRL-003: createTrip - propagates service errors
 * TRIP-CTRL-004: createTrip - throws 401 when unauthenticated
 * TRIP-CTRL-005: getTrips - validates query, calls tripService.getTrips, returns 200
 * TRIP-CTRL-006: getTrips - passes query parameters correctly
 * TRIP-CTRL-007: getTrips - propagates service errors
 * TRIP-CTRL-008: getTripById - parses id param, calls tripService.getTripById, returns 200
 * TRIP-CTRL-009: getTripById - rejects invalid id
 * TRIP-CTRL-010: getTripById - propagates service errors
 * TRIP-CTRL-011: updateTrip - validates body and id, calls tripService.updateTrip, returns 200
 * TRIP-CTRL-012: updateTrip - rejects invalid body
 * TRIP-CTRL-013: updateTrip - propagates service errors
 * TRIP-CTRL-014: deleteTrip - parses id, calls tripService.deleteTrip, returns 204
 * TRIP-CTRL-015: deleteTrip - propagates service errors
 * TRIP-CTRL-016: updateCoverPhoto - validates body, calls tripService.updateCoverPhoto, returns 200
 * TRIP-CTRL-017: updateCoverPhoto - rejects invalid body
 * TRIP-CTRL-018: updateCoverPhoto - propagates service errors
 * TRIP-CTRL-019: validateTrip - calls tripValidatorService.validateTrip, returns 200
 * TRIP-CTRL-020: validateTrip - propagates service errors
 * TRIP-CTRL-021: getValidationStatus - calls tripValidatorService.getQuickStatus, returns 200
 * TRIP-CTRL-022: getValidationStatus - propagates service errors
 * TRIP-CTRL-023: dismissValidationIssue - validates body, calls tripValidatorService.dismissIssue, returns 200
 * TRIP-CTRL-024: dismissValidationIssue - rejects invalid body
 * TRIP-CTRL-025: dismissValidationIssue - propagates service errors
 * TRIP-CTRL-026: restoreValidationIssue - validates body, calls tripValidatorService.restoreIssue, returns 200
 * TRIP-CTRL-027: restoreValidationIssue - rejects invalid body
 * TRIP-CTRL-028: restoreValidationIssue - propagates service errors
 * TRIP-CTRL-029: duplicateTrip - validates body, calls tripService.duplicateTrip, returns 201
 * TRIP-CTRL-030: duplicateTrip - rejects invalid body
 * TRIP-CTRL-031: duplicateTrip - propagates service errors
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mock setup (must be before imports that use the mocked modules) ---

// Mock tripService
const mockTripService = {
  createTrip: jest.fn(),
  getTrips: jest.fn(),
  getTripById: jest.fn(),
  updateTrip: jest.fn(),
  deleteTrip: jest.fn(),
  updateCoverPhoto: jest.fn(),
  duplicateTrip: jest.fn(),
};
jest.mock('../../services/trip.service', () => ({
  __esModule: true,
  default: mockTripService,
}));

// Mock tripValidatorService
const mockTripValidatorService = {
  validateTrip: jest.fn(),
  getQuickStatus: jest.fn(),
  dismissIssue: jest.fn(),
  restoreIssue: jest.fn(),
};
jest.mock('../../services/tripValidator.service', () => ({
  __esModule: true,
  default: mockTripValidatorService,
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// --- Imports (after mocks) ---
import { tripController } from '../trip.controller';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';
import { testTrips, validCreateTripInput, validUpdateTripInput } from '../../__tests__/fixtures/trips';
import { AppError } from '../../utils/errors';

// Helper to flush microtask queue so asyncHandler's .catch(next) resolves
const flushPromises = () => new Promise(resolve => process.nextTick(resolve));

// --- Test data ---
const userId = testUsers.user1.id;

const mockTrip = {
  id: 1,
  userId,
  title: 'New Test Trip',
  description: 'A test trip description',
  startDate: '2024-06-01',
  endDate: '2024-06-10',
  timezone: 'America/New_York',
  status: 'Planning',
  privacyLevel: 'Private',
  coverPhotoId: null,
  bannerPhotoId: null,
  addToPlacesVisited: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockTripList = {
  trips: [mockTrip],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
};

const mockValidationResult = {
  tripId: 1,
  status: 'okay' as const,
  issuesByCategory: {
    SCHEDULE: [],
    ACCOMMODATIONS: [],
    TRANSPORTATION: [],
    COMPLETENESS: [],
  },
  totalIssues: 0,
  activeIssues: 0,
  dismissedIssues: 0,
};

const mockQuickStatus = {
  status: 'okay',
  totalIssues: 0,
  activeIssues: 0,
};

describe('TripController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // createTrip
  // =========================================================================
  describe('createTrip', () => {
    it('should validate body, call tripService.createTrip, and return 201', async () => {
      mockTripService.createTrip.mockResolvedValue(mockTrip);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: validCreateTripInput as unknown as Record<string, unknown>,
      });

      tripController.createTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.createTrip).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ title: validCreateTripInput.title })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockTrip,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid body with Zod validation error', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { title: '' }, // title must be min 1 char
      });

      tripController.createTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.createTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Database error', 500);
      mockTripService.createTrip.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: validCreateTripInput as unknown as Record<string, unknown>,
      });

      tripController.createTrip(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should throw 401 when user is not authenticated', async () => {
      const req = createMockRequest({
        body: validCreateTripInput as unknown as Record<string, unknown>,
      });
      const res = createMockResponse();
      const next = createMockNext();

      tripController.createTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.createTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
    });

    it('should create trip with only required title field', async () => {
      mockTripService.createTrip.mockResolvedValue(mockTrip);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { title: 'Minimal Trip' },
      });

      tripController.createTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.createTrip).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          title: 'Minimal Trip',
          status: 'Planning', // default
          privacyLevel: 'Private', // default
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getTrips
  // =========================================================================
  describe('getTrips', () => {
    it('should validate query, call tripService.getTrips, and return 200', async () => {
      mockTripService.getTrips.mockResolvedValue(mockTripList);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: {},
      });

      tripController.getTrips(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.getTrips).toHaveBeenCalledWith(userId, {});
      expectSuccessResponse(res, 200, mockTripList);
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass query parameters correctly to service', async () => {
      mockTripService.getTrips.mockResolvedValue(mockTripList);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { status: 'Planning', search: 'Italy', page: '2', limit: '5' },
      });

      tripController.getTrips(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.getTrips).toHaveBeenCalledWith(userId, {
        status: 'Planning',
        search: 'Italy',
        page: '2',
        limit: '5',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Database error', 500);
      mockTripService.getTrips.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      tripController.getTrips(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should throw 401 when user is not authenticated', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      tripController.getTrips(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.getTrips).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // getTripById
  // =========================================================================
  describe('getTripById', () => {
    it('should parse id, call tripService.getTripById, and return 200', async () => {
      mockTripService.getTripById.mockResolvedValue(mockTrip);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      tripController.getTripById(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.getTripById).toHaveBeenCalledWith(userId, 1);
      expectSuccessResponse(res, 200, mockTrip);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid id parameter', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'abc' },
      });

      tripController.getTripById(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.getTripById).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(400);
    });

    it('should propagate service errors (e.g., trip not found)', async () => {
      const serviceError = new AppError('Trip not found', 404);
      mockTripService.getTripById.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '999' },
      });

      tripController.getTripById(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should reject negative id', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '-1' },
      });

      tripController.getTripById(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.getTripById).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // updateTrip
  // =========================================================================
  describe('updateTrip', () => {
    it('should validate body and id, call tripService.updateTrip, and return 200', async () => {
      const updatedTrip = { ...mockTrip, ...validUpdateTripInput };
      mockTripService.updateTrip.mockResolvedValue(updatedTrip);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: validUpdateTripInput as unknown as Record<string, unknown>,
      });

      tripController.updateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.updateTrip).toHaveBeenCalledWith(
        userId,
        1,
        expect.objectContaining({ title: validUpdateTripInput.title })
      );
      expectSuccessResponse(res, 200, updatedTrip);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid body with Zod validation error', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { status: 'InvalidStatus' },
      });

      tripController.updateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.updateTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Trip not found', 404);
      mockTripService.updateTrip.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: validUpdateTripInput as unknown as Record<string, unknown>,
      });

      tripController.updateTrip(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should reject invalid id parameter', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'invalid' },
        body: validUpdateTripInput as unknown as Record<string, unknown>,
      });

      tripController.updateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.updateTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // deleteTrip
  // =========================================================================
  describe('deleteTrip', () => {
    it('should parse id, call tripService.deleteTrip, and return 200', async () => {
      mockTripService.deleteTrip.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      tripController.deleteTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.deleteTrip).toHaveBeenCalledWith(userId, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Trip not found', 404);
      mockTripService.deleteTrip.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      tripController.deleteTrip(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should reject invalid id parameter', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'abc' },
      });

      tripController.deleteTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.deleteTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(400);
    });

    it('should throw 401 when user is not authenticated', async () => {
      const req = createMockRequest({ params: { id: '1' } });
      const res = createMockResponse();
      const next = createMockNext();

      tripController.deleteTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.deleteTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // updateCoverPhoto
  // =========================================================================
  describe('updateCoverPhoto', () => {
    it('should validate body, call tripService.updateCoverPhoto, and return 200', async () => {
      const updatedTrip = { ...mockTrip, coverPhotoId: 5 };
      mockTripService.updateCoverPhoto.mockResolvedValue(updatedTrip);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { photoId: 5 },
      });

      tripController.updateCoverPhoto(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.updateCoverPhoto).toHaveBeenCalledWith(userId, 1, 5);
      expectSuccessResponse(res, 200, updatedTrip);
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept null photoId to remove cover photo', async () => {
      const updatedTrip = { ...mockTrip, coverPhotoId: null };
      mockTripService.updateCoverPhoto.mockResolvedValue(updatedTrip);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { photoId: null },
      });

      tripController.updateCoverPhoto(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.updateCoverPhoto).toHaveBeenCalledWith(userId, 1, null);
      expectSuccessResponse(res, 200, updatedTrip);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid body (missing photoId)', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: {},
      });

      tripController.updateCoverPhoto(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.updateCoverPhoto).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Photo not found', 404);
      mockTripService.updateCoverPhoto.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { photoId: 999 },
      });

      tripController.updateCoverPhoto(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });
  });

  // =========================================================================
  // validateTrip
  // =========================================================================
  describe('validateTrip', () => {
    it('should call tripValidatorService.validateTrip and return 200', async () => {
      mockTripValidatorService.validateTrip.mockResolvedValue(mockValidationResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      tripController.validateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.validateTrip).toHaveBeenCalledWith(1, userId);
      expectSuccessResponse(res, 200, mockValidationResult);
      expect(next).not.toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Trip not found', 404);
      mockTripValidatorService.validateTrip.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '999' },
      });

      tripController.validateTrip(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should reject invalid id parameter', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'bad' },
      });

      tripController.validateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.validateTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getValidationStatus
  // =========================================================================
  describe('getValidationStatus', () => {
    it('should call tripValidatorService.getQuickStatus and return 200', async () => {
      mockTripValidatorService.getQuickStatus.mockResolvedValue(mockQuickStatus);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      tripController.getValidationStatus(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.getQuickStatus).toHaveBeenCalledWith(1, userId);
      expectSuccessResponse(res, 200, mockQuickStatus);
      expect(next).not.toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Trip not found', 404);
      mockTripValidatorService.getQuickStatus.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '999' },
      });

      tripController.getValidationStatus(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should reject invalid id parameter', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '0' }, // parseId rejects 0 (must be >= 1)
      });

      tripController.getValidationStatus(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.getQuickStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // dismissValidationIssue
  // =========================================================================
  describe('dismissValidationIssue', () => {
    const validDismissBody = {
      issueType: 'missing_lodging',
      issueKey: 'day-2024-07-01',
      category: 'ACCOMMODATIONS',
    };

    it('should validate body, call tripValidatorService.dismissIssue, and return 200', async () => {
      mockTripValidatorService.dismissIssue.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: validDismissBody as unknown as Record<string, unknown>,
      });

      tripController.dismissValidationIssue(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.dismissIssue).toHaveBeenCalledWith(
        1,
        userId,
        'missing_lodging',
        'day-2024-07-01',
        'ACCOMMODATIONS'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Issue dismissed',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid body (missing required fields)', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { issueType: 'missing_lodging' }, // missing issueKey and category
      });

      tripController.dismissValidationIssue(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.dismissIssue).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid category enum value', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: {
          issueType: 'test',
          issueKey: 'key',
          category: 'INVALID_CATEGORY',
        },
      });

      tripController.dismissValidationIssue(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.dismissIssue).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Trip not found', 404);
      mockTripValidatorService.dismissIssue.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: validDismissBody as unknown as Record<string, unknown>,
      });

      tripController.dismissValidationIssue(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });
  });

  // =========================================================================
  // restoreValidationIssue
  // =========================================================================
  describe('restoreValidationIssue', () => {
    const validRestoreBody = {
      issueType: 'missing_lodging',
      issueKey: 'day-2024-07-01',
    };

    it('should validate body, call tripValidatorService.restoreIssue, and return 200', async () => {
      mockTripValidatorService.restoreIssue.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: validRestoreBody as unknown as Record<string, unknown>,
      });

      tripController.restoreValidationIssue(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.restoreIssue).toHaveBeenCalledWith(
        1,
        userId,
        'missing_lodging',
        'day-2024-07-01'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Issue restored',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid body (missing required fields)', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { issueType: 'missing_lodging' }, // missing issueKey
      });

      tripController.restoreValidationIssue(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.restoreIssue).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Trip not found', 404);
      mockTripValidatorService.restoreIssue.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: validRestoreBody as unknown as Record<string, unknown>,
      });

      tripController.restoreValidationIssue(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should reject invalid id parameter', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'abc' },
        body: validRestoreBody as unknown as Record<string, unknown>,
      });

      tripController.restoreValidationIssue(req as never, res as never, next);
      await flushPromises();

      expect(mockTripValidatorService.restoreIssue).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // duplicateTrip
  // =========================================================================
  describe('duplicateTrip', () => {
    const validDuplicateBody = {
      title: 'Duplicated Trip',
      copyEntities: {
        locations: true,
        photos: false,
        activities: true,
      },
    };

    const mockDuplicatedTrip = {
      ...mockTrip,
      id: 2,
      title: 'Duplicated Trip',
    };

    it('should validate body, call tripService.duplicateTrip, and return 201', async () => {
      mockTripService.duplicateTrip.mockResolvedValue(mockDuplicatedTrip);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: validDuplicateBody as unknown as Record<string, unknown>,
      });

      tripController.duplicateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.duplicateTrip).toHaveBeenCalledWith(
        userId,
        1,
        expect.objectContaining({ title: 'Duplicated Trip' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockDuplicatedTrip,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid body (empty title)', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { title: '' },
      });

      tripController.duplicateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.duplicateTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Trip not found', 404);
      mockTripService.duplicateTrip.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: validDuplicateBody as unknown as Record<string, unknown>,
      });

      tripController.duplicateTrip(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should reject missing title field', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { copyEntities: { locations: true } },
      });

      tripController.duplicateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.duplicateTrip).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should use default copyEntities when not provided', async () => {
      mockTripService.duplicateTrip.mockResolvedValue(mockDuplicatedTrip);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { title: 'Duplicated Trip' },
      });

      tripController.duplicateTrip(req as never, res as never, next);
      await flushPromises();

      expect(mockTripService.duplicateTrip).toHaveBeenCalledWith(
        userId,
        1,
        expect.objectContaining({
          title: 'Duplicated Trip',
          copyEntities: expect.objectContaining({
            locations: false,
            photos: false,
            activities: false,
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
