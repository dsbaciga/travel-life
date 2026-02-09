/**
 * Location Controller Tests
 *
 * Tests that the location controller correctly delegates to the location service
 * and returns properly formatted responses.
 */

// Mock dependencies before imports
jest.mock('../../services/location.service', () => ({
  __esModule: true,
  default: {
    createLocation: jest.fn(),
    getLocationsByTrip: jest.fn(),
    getLocationById: jest.fn(),
    updateLocation: jest.fn(),
    deleteLocation: jest.fn(),
    getCategories: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    getAllVisitedLocations: jest.fn(),
    bulkDeleteLocations: jest.fn(),
    bulkUpdateLocations: jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import locationService from '../../services/location.service';
import { locationController } from '../location.controller';
import { createAuthenticatedControllerArgs } from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

/** Flush all pending promises for asyncHandler testing */
const flushPromises = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe('locationController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------
  // createLocation
  // -------------------------------------------------------
  describe('createLocation', () => {
    const mockLocation = { id: 1, tripId: 1, name: 'Eiffel Tower' };

    it('should create a location and return 201', async () => {
      (locationService.createLocation as jest.Mock).mockResolvedValue(mockLocation);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 1, name: 'Eiffel Tower' },
      });

      locationController.createLocation(req as any, res as any, next);
      await flushPromises();

      expect(locationService.createLocation).toHaveBeenCalledWith(
        testUsers.user1.id,
        expect.objectContaining({ tripId: 1, name: 'Eiffel Tower' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLocation,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Trip not found');
      (locationService.createLocation as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 1, name: 'Test' },
      });

      locationController.createLocation(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getLocationsByTrip
  // -------------------------------------------------------
  describe('getLocationsByTrip', () => {
    const mockLocations = [
      { id: 1, tripId: 1, name: 'Location A' },
      { id: 2, tripId: 1, name: 'Location B' },
    ];

    it('should return locations for a trip', async () => {
      (locationService.getLocationsByTrip as jest.Mock).mockResolvedValue(mockLocations);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      locationController.getLocationsByTrip(req as any, res as any, next);
      await flushPromises();

      expect(locationService.getLocationsByTrip).toHaveBeenCalledWith(testUsers.user1.id, 1);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLocations,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (locationService.getLocationsByTrip as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      locationController.getLocationsByTrip(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getLocationById
  // -------------------------------------------------------
  describe('getLocationById', () => {
    const mockLocation = { id: 5, tripId: 1, name: 'Louvre Museum' };

    it('should return a location by id', async () => {
      (locationService.getLocationById as jest.Mock).mockResolvedValue(mockLocation);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      locationController.getLocationById(req as any, res as any, next);
      await flushPromises();

      expect(locationService.getLocationById).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLocation,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Location not found');
      (locationService.getLocationById as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      locationController.getLocationById(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // updateLocation
  // -------------------------------------------------------
  describe('updateLocation', () => {
    const mockUpdated = { id: 5, tripId: 1, name: 'Updated Name' };

    it('should update a location and return it', async () => {
      (locationService.updateLocation as jest.Mock).mockResolvedValue(mockUpdated);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { name: 'Updated Name' },
      });

      locationController.updateLocation(req as any, res as any, next);
      await flushPromises();

      expect(locationService.updateLocation).toHaveBeenCalledWith(
        testUsers.user1.id,
        5,
        expect.objectContaining({ name: 'Updated Name' })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockUpdated,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      (locationService.updateLocation as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { name: 'Updated' },
      });

      locationController.updateLocation(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // deleteLocation
  // -------------------------------------------------------
  describe('deleteLocation', () => {
    it('should delete a location and return result', async () => {
      const mockResult = { message: 'Location deleted' };
      (locationService.deleteLocation as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      locationController.deleteLocation(req as any, res as any, next);
      await flushPromises();

      expect(locationService.deleteLocation).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      (locationService.deleteLocation as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      locationController.deleteLocation(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getCategories
  // -------------------------------------------------------
  describe('getCategories', () => {
    const mockCategories = [
      { id: 1, name: 'Restaurant', icon: null, color: null },
      { id: 2, name: 'Museum', icon: null, color: null },
    ];

    it('should return location categories', async () => {
      (locationService.getCategories as jest.Mock).mockResolvedValue(mockCategories);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      locationController.getCategories(req as any, res as any, next);
      await flushPromises();

      expect(locationService.getCategories).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCategories,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (locationService.getCategories as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      locationController.getCategories(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // createCategory
  // -------------------------------------------------------
  describe('createCategory', () => {
    const mockCategory = { id: 3, name: 'Beach', icon: null, color: '#0000FF' };

    it('should create a category and return 201', async () => {
      (locationService.createCategory as jest.Mock).mockResolvedValue(mockCategory);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'Beach', color: '#0000FF' },
      });

      locationController.createCategory(req as any, res as any, next);
      await flushPromises();

      expect(locationService.createCategory).toHaveBeenCalledWith(
        testUsers.user1.id,
        expect.objectContaining({ name: 'Beach', color: '#0000FF' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCategory,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Category creation failed');
      (locationService.createCategory as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'Beach' },
      });

      locationController.createCategory(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // updateCategory
  // -------------------------------------------------------
  describe('updateCategory', () => {
    const mockUpdated = { id: 3, name: 'Updated Beach', icon: null, color: '#0000FF' };

    it('should update a category and return it', async () => {
      (locationService.updateCategory as jest.Mock).mockResolvedValue(mockUpdated);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
        body: { name: 'Updated Beach' },
      });

      locationController.updateCategory(req as any, res as any, next);
      await flushPromises();

      expect(locationService.updateCategory).toHaveBeenCalledWith(
        testUsers.user1.id,
        3,
        expect.objectContaining({ name: 'Updated Beach' })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockUpdated,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      (locationService.updateCategory as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
        body: { name: 'Test' },
      });

      locationController.updateCategory(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // deleteCategory
  // -------------------------------------------------------
  describe('deleteCategory', () => {
    it('should delete a category and return result', async () => {
      const mockResult = { message: 'Category deleted' };
      (locationService.deleteCategory as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });

      locationController.deleteCategory(req as any, res as any, next);
      await flushPromises();

      expect(locationService.deleteCategory).toHaveBeenCalledWith(testUsers.user1.id, 3);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      (locationService.deleteCategory as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });

      locationController.deleteCategory(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getAllVisitedLocations
  // -------------------------------------------------------
  describe('getAllVisitedLocations', () => {
    const mockResult = {
      locations: [{ id: 1, name: 'Place A' }],
      total: 1,
      page: 1,
      limit: 200,
    };

    it('should return visited locations with default pagination', async () => {
      (locationService.getAllVisitedLocations as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      locationController.getAllVisitedLocations(req as any, res as any, next);
      await flushPromises();

      expect(locationService.getAllVisitedLocations).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,   // default page
        200  // default limit
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should use provided query params for pagination', async () => {
      (locationService.getAllVisitedLocations as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { page: '2', limit: '50' },
      });

      locationController.getAllVisitedLocations(req as any, res as any, next);
      await flushPromises();

      expect(locationService.getAllVisitedLocations).toHaveBeenCalledWith(
        testUsers.user1.id,
        2,
        50
      );
    });

    it('should clamp limit to max 500', async () => {
      (locationService.getAllVisitedLocations as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { page: '1', limit: '1000' },
      });

      locationController.getAllVisitedLocations(req as any, res as any, next);
      await flushPromises();

      expect(locationService.getAllVisitedLocations).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        500
      );
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (locationService.getAllVisitedLocations as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      locationController.getAllVisitedLocations(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // bulkDeleteLocations
  // -------------------------------------------------------
  describe('bulkDeleteLocations', () => {
    const mockResult = { deletedCount: 3 };

    it('should bulk delete locations and return result', async () => {
      (locationService.bulkDeleteLocations as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        body: { ids: [1, 2, 3] },
      });

      locationController.bulkDeleteLocations(req as any, res as any, next);
      await flushPromises();

      expect(locationService.bulkDeleteLocations).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ ids: [1, 2, 3] })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Bulk delete failed');
      (locationService.bulkDeleteLocations as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        body: { ids: [1, 2] },
      });

      locationController.bulkDeleteLocations(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // bulkUpdateLocations
  // -------------------------------------------------------
  describe('bulkUpdateLocations', () => {
    const mockResult = { updatedCount: 2 };

    it('should bulk update locations and return result', async () => {
      (locationService.bulkUpdateLocations as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        body: { ids: [1, 2], updates: { categoryId: 5 } },
      });

      locationController.bulkUpdateLocations(req as any, res as any, next);
      await flushPromises();

      expect(locationService.bulkUpdateLocations).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ ids: [1, 2], updates: { categoryId: 5 } })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Bulk update failed');
      (locationService.bulkUpdateLocations as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        body: { ids: [1], updates: { categoryId: 3 } },
      });

      locationController.bulkUpdateLocations(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
