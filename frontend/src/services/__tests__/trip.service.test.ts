import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../lib/axios';
import tripService from '../trip.service';

describe('TripService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTrip', () => {
    it('should call POST /trips with trip data', async () => {
      const tripData = { name: 'Summer Vacation', startDate: '2024-06-01', endDate: '2024-06-15' };
      const mockTrip = { id: 1, ...tripData };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTrip });

      const result = await tripService.createTrip(tripData as any);

      expect(api.post).toHaveBeenCalledWith('/trips', tripData);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTrip);
    });

    it('should propagate errors on creation failure', async () => {
      const error = new Error('Validation error');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(tripService.createTrip({} as any)).rejects.toThrow('Validation error');
    });
  });

  describe('getTrips', () => {
    it('should call GET /trips without params', async () => {
      const mockResponse = { trips: [{ id: 1, name: 'Trip 1' }], total: 1 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await tripService.getTrips();

      expect(api.get).toHaveBeenCalledWith('/trips', { params: undefined });
      expect(result).toEqual(mockResponse);
    });

    it('should call GET /trips with filter params', async () => {
      const params = { status: 'active', search: 'vacation', page: 1, limit: 10 };
      const mockResponse = { trips: [], total: 0 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await tripService.getTrips(params);

      expect(api.get).toHaveBeenCalledWith('/trips', { params });
      expect(result).toEqual(mockResponse);
    });

    it('should call GET /trips with tripType param', async () => {
      const params = { tripType: 'international' };
      const mockResponse = { trips: [{ id: 2, name: 'Europe Trip' }], total: 1 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await tripService.getTrips(params);

      expect(api.get).toHaveBeenCalledWith('/trips', { params });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getTripById', () => {
    it('should call GET /trips/:id', async () => {
      const mockTrip = { id: 5, name: 'Beach Trip' };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTrip });

      const result = await tripService.getTripById(5);

      expect(api.get).toHaveBeenCalledWith('/trips/5');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTrip);
    });

    it('should propagate errors when trip not found', async () => {
      const error = new Error('Not found');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(tripService.getTripById(999)).rejects.toThrow('Not found');
    });
  });

  describe('updateTrip', () => {
    it('should call PUT /trips/:id with update data', async () => {
      const updateData = { name: 'Updated Trip Name' };
      const mockTrip = { id: 3, name: 'Updated Trip Name' };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTrip });

      const result = await tripService.updateTrip(3, updateData as any);

      expect(api.put).toHaveBeenCalledWith('/trips/3', updateData);
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTrip);
    });

    it('should propagate errors on update failure', async () => {
      const error = new Error('Forbidden');
      (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(tripService.updateTrip(3, {} as any)).rejects.toThrow('Forbidden');
    });
  });

  describe('deleteTrip', () => {
    it('should call DELETE /trips/:id', async () => {
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await tripService.deleteTrip(7);

      expect(api.delete).toHaveBeenCalledWith('/trips/7');
      expect(api.delete).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors on delete failure', async () => {
      const error = new Error('Not found');
      (api.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(tripService.deleteTrip(999)).rejects.toThrow('Not found');
    });
  });

  describe('updateCoverPhoto', () => {
    it('should call PUT /trips/:tripId/cover-photo with photoId', async () => {
      const mockTrip = { id: 1, coverPhotoId: 42 };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTrip });

      const result = await tripService.updateCoverPhoto(1, 42);

      expect(api.put).toHaveBeenCalledWith('/trips/1/cover-photo', { photoId: 42 });
      expect(result).toEqual(mockTrip);
    });

    it('should send null photoId to clear cover photo', async () => {
      const mockTrip = { id: 1, coverPhotoId: null };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTrip });

      const result = await tripService.updateCoverPhoto(1, null);

      expect(api.put).toHaveBeenCalledWith('/trips/1/cover-photo', { photoId: null });
      expect(result).toEqual(mockTrip);
    });
  });

  describe('validateTrip', () => {
    it('should call GET /trips/:tripId/validate', async () => {
      const mockValidation = { issues: [], isValid: true };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockValidation });

      const result = await tripService.validateTrip(1);

      expect(api.get).toHaveBeenCalledWith('/trips/1/validate');
      expect(result).toEqual(mockValidation);
    });
  });

  describe('getValidationStatus', () => {
    it('should call GET /trips/:tripId/validation-status', async () => {
      const mockStatus = { hasIssues: false, issueCount: 0 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockStatus });

      const result = await tripService.getValidationStatus(2);

      expect(api.get).toHaveBeenCalledWith('/trips/2/validation-status');
      expect(result).toEqual(mockStatus);
    });
  });

  describe('dismissValidationIssue', () => {
    it('should call POST /trips/:tripId/validation/dismiss with issue details', async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await tripService.dismissValidationIssue(1, 'missing_dates', 'key1', 'warning' as any);

      expect(api.post).toHaveBeenCalledWith('/trips/1/validation/dismiss', {
        issueType: 'missing_dates',
        issueKey: 'key1',
        category: 'warning',
      });
    });
  });

  describe('restoreValidationIssue', () => {
    it('should call POST /trips/:tripId/validation/restore with issue details', async () => {
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await tripService.restoreValidationIssue(1, 'missing_dates', 'key1');

      expect(api.post).toHaveBeenCalledWith('/trips/1/validation/restore', {
        issueType: 'missing_dates',
        issueKey: 'key1',
      });
    });
  });

  describe('duplicateTrip', () => {
    it('should call POST /trips/:tripId/duplicate with duplicate options', async () => {
      const duplicateData = { name: 'Trip Copy', includeLocations: true };
      const mockTrip = { id: 10, name: 'Trip Copy' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTrip });

      const result = await tripService.duplicateTrip(5, duplicateData as any);

      expect(api.post).toHaveBeenCalledWith('/trips/5/duplicate', duplicateData);
      expect(result).toEqual(mockTrip);
    });

    it('should propagate errors on duplicate failure', async () => {
      const error = new Error('Trip not found');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(tripService.duplicateTrip(999, {} as any)).rejects.toThrow('Trip not found');
    });
  });
});
