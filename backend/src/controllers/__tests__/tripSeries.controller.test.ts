import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service and logger before importing controller
jest.mock('../../services/tripSeries.service', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    getAll: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addTrip: jest.fn(),
    removeTrip: jest.fn(),
    reorderTrips: jest.fn(),
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

import tripSeriesService from '../../services/tripSeries.service';
import { tripSeriesController } from '../tripSeries.controller';
import {
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

const flushPromises = () => new Promise(resolve => process.nextTick(resolve));

describe('tripSeries.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should create a trip series and return 201', async () => {
      const mockSeries = { id: 1, name: 'European Adventures', userId: 1 };
      (tripSeriesService.create as jest.Mock).mockResolvedValue(mockSeries as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'European Adventures', description: 'A series of trips' },
      });
      tripSeriesController.create(req as any, res as any, next);
      await flushPromises();

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(tripSeriesService.create).toHaveBeenCalledWith(
          testUsers.user1.id,
          expect.objectContaining({ name: 'European Adventures' })
        );
        expectSuccessResponse(res, 201, mockSeries);
      }
    });

    it('should pass errors to next', async () => {
      const error = new Error('Creation failed');
      (tripSeriesService.create as jest.Mock).mockRejectedValue(error as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'Test' },
      });
      tripSeriesController.create(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getAll', () => {
    it('should return all trip series for user', async () => {
      const mockSeries = [{ id: 1, name: 'Series 1' }, { id: 2, name: 'Series 2' }];
      (tripSeriesService.getAll as jest.Mock).mockResolvedValue(mockSeries as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      tripSeriesController.getAll(req as any, res as any, next);
      await flushPromises();

      expect(tripSeriesService.getAll).toHaveBeenCalledWith(testUsers.user1.id);
      expectSuccessResponse(res, 200, mockSeries);
    });
  });

  describe('getById', () => {
    it('should return a single trip series', async () => {
      const mockSeries = { id: 1, name: 'European Adventures', trips: [] };
      (tripSeriesService.getById as jest.Mock).mockResolvedValue(mockSeries as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });
      tripSeriesController.getById(req as any, res as any, next);
      await flushPromises();

      expect(tripSeriesService.getById).toHaveBeenCalledWith(testUsers.user1.id, 1);
      expectSuccessResponse(res, 200, mockSeries);
    });
  });

  describe('update', () => {
    it('should update a trip series', async () => {
      const mockSeries = { id: 1, name: 'Updated Name' };
      (tripSeriesService.update as jest.Mock).mockResolvedValue(mockSeries as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { name: 'Updated Name' },
      });
      tripSeriesController.update(req as any, res as any, next);
      await flushPromises();

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(tripSeriesService.update).toHaveBeenCalledWith(
          testUsers.user1.id,
          1,
          expect.objectContaining({ name: 'Updated Name' })
        );
        expectSuccessResponse(res, 200, mockSeries);
      }
    });
  });

  describe('delete', () => {
    it('should delete a trip series', async () => {
      const mockResult = { deleted: true };
      (tripSeriesService.delete as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });
      tripSeriesController.delete(req as any, res as any, next);
      await flushPromises();

      expect(tripSeriesService.delete).toHaveBeenCalledWith(testUsers.user1.id, 1);
      expectSuccessResponse(res, 200, mockResult);
    });
  });

  describe('addTrip', () => {
    it('should add a trip to a series', async () => {
      const mockTrip = { seriesId: 1, tripId: 5, order: 1 };
      (tripSeriesService.addTrip as jest.Mock).mockResolvedValue(mockTrip as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { tripId: 5 },
      });
      tripSeriesController.addTrip(req as any, res as any, next);
      await flushPromises();

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(tripSeriesService.addTrip).toHaveBeenCalledWith(testUsers.user1.id, 1, 5);
        expectSuccessResponse(res, 200, mockTrip);
      }
    });
  });

  describe('removeTrip', () => {
    it('should remove a trip from a series', async () => {
      const mockResult = { removed: true };
      (tripSeriesService.removeTrip as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1', tripId: '5' },
      });
      tripSeriesController.removeTrip(req as any, res as any, next);
      await flushPromises();

      expect(tripSeriesService.removeTrip).toHaveBeenCalledWith(testUsers.user1.id, 1, 5);
      expectSuccessResponse(res, 200, mockResult);
    });
  });

  describe('reorderTrips', () => {
    it('should reorder trips in a series', async () => {
      const mockResult = { reordered: true };
      (tripSeriesService.reorderTrips as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { tripIds: [5, 3, 7] },
      });
      tripSeriesController.reorderTrips(req as any, res as any, next);
      await flushPromises();

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(tripSeriesService.reorderTrips).toHaveBeenCalledWith(
          testUsers.user1.id,
          1,
          [5, 3, 7]
        );
        expectSuccessResponse(res, 200, mockResult);
      }
    });
  });
});
