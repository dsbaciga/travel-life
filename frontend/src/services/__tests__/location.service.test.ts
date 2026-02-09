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
import locationService from '../location.service';

describe('LocationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLocation', () => {
    it('should call POST /locations with location data', async () => {
      const locationData = { tripId: 1, name: 'Eiffel Tower', latitude: 48.8584, longitude: 2.2945 };
      const mockLocation = { id: 1, ...locationData };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLocation });

      const result = await locationService.createLocation(locationData as any);

      expect(api.post).toHaveBeenCalledWith('/locations', locationData);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockLocation);
    });

    it('should propagate errors on creation failure', async () => {
      const error = new Error('Validation error');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(locationService.createLocation({} as any)).rejects.toThrow('Validation error');
    });
  });

  describe('getLocationsByTrip', () => {
    it('should call GET /locations/trip/:tripId', async () => {
      const mockLocations = [
        { id: 1, name: 'Location 1' },
        { id: 2, name: 'Location 2' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLocations });

      const result = await locationService.getLocationsByTrip(5);

      expect(api.get).toHaveBeenCalledWith('/locations/trip/5');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockLocations);
    });

    it('should return empty array when no locations exist', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

      const result = await locationService.getLocationsByTrip(99);

      expect(result).toEqual([]);
    });
  });

  describe('getAllVisitedLocations', () => {
    it('should call GET /locations/visited and return array data', async () => {
      const mockLocations = [{ id: 1, name: 'Visited Place' }];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLocations });

      const result = await locationService.getAllVisitedLocations();

      expect(api.get).toHaveBeenCalledWith('/locations/visited');
      expect(result).toEqual(mockLocations);
    });

    it('should handle paginated response and extract locations array', async () => {
      const mockPaginatedResponse = {
        locations: [{ id: 1, name: 'Visited Place' }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockPaginatedResponse });

      const result = await locationService.getAllVisitedLocations();

      expect(result).toEqual(mockPaginatedResponse.locations);
    });
  });

  describe('getLocationById', () => {
    it('should call GET /locations/:id', async () => {
      const mockLocation = { id: 3, name: 'Colosseum', latitude: 41.8902, longitude: 12.4922 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLocation });

      const result = await locationService.getLocationById(3);

      expect(api.get).toHaveBeenCalledWith('/locations/3');
      expect(result).toEqual(mockLocation);
    });

    it('should propagate errors when location not found', async () => {
      const error = new Error('Not found');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(locationService.getLocationById(999)).rejects.toThrow('Not found');
    });
  });

  describe('updateLocation', () => {
    it('should call PUT /locations/:id with update data', async () => {
      const updateData = { name: 'Updated Location' };
      const mockLocation = { id: 2, name: 'Updated Location' };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLocation });

      const result = await locationService.updateLocation(2, updateData as any);

      expect(api.put).toHaveBeenCalledWith('/locations/2', updateData);
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockLocation);
    });

    it('should propagate errors on update failure', async () => {
      const error = new Error('Forbidden');
      (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(locationService.updateLocation(2, {} as any)).rejects.toThrow('Forbidden');
    });
  });

  describe('deleteLocation', () => {
    it('should call DELETE /locations/:id', async () => {
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await locationService.deleteLocation(4);

      expect(api.delete).toHaveBeenCalledWith('/locations/4');
      expect(api.delete).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors on delete failure', async () => {
      const error = new Error('Not found');
      (api.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(locationService.deleteLocation(999)).rejects.toThrow('Not found');
    });
  });

  describe('getCategories', () => {
    it('should call GET /locations/categories/list', async () => {
      const mockCategories = [
        { id: 1, name: 'Restaurant', icon: 'utensils' },
        { id: 2, name: 'Museum', icon: 'landmark' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockCategories });

      const result = await locationService.getCategories();

      expect(api.get).toHaveBeenCalledWith('/locations/categories/list');
      expect(result).toEqual(mockCategories);
    });
  });

  describe('createCategory', () => {
    it('should call POST /locations/categories with category data', async () => {
      const categoryData = { name: 'Park', icon: 'tree', color: '#00ff00' };
      const mockCategory = { id: 3, ...categoryData };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockCategory });

      const result = await locationService.createCategory(categoryData);

      expect(api.post).toHaveBeenCalledWith('/locations/categories', categoryData);
      expect(result).toEqual(mockCategory);
    });

    it('should create category with name only', async () => {
      const categoryData = { name: 'Beach' };
      const mockCategory = { id: 4, name: 'Beach' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockCategory });

      const result = await locationService.createCategory(categoryData);

      expect(api.post).toHaveBeenCalledWith('/locations/categories', categoryData);
      expect(result).toEqual(mockCategory);
    });
  });

  describe('bulkDeleteLocations', () => {
    it('should call DELETE /locations/trip/:tripId/bulk with ids in body', async () => {
      const mockResult = { success: true, deletedCount: 3 };
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await locationService.bulkDeleteLocations(1, [1, 2, 3]);

      expect(api.delete).toHaveBeenCalledWith('/locations/trip/1/bulk', { data: { ids: [1, 2, 3] } });
      expect(result).toEqual(mockResult);
    });
  });

  describe('bulkUpdateLocations', () => {
    it('should call PATCH /locations/trip/:tripId/bulk with ids and updates', async () => {
      const mockResult = { success: true, updatedCount: 2 };
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await locationService.bulkUpdateLocations(1, [1, 2], { categoryId: 5, notes: 'Updated' });

      expect(api.patch).toHaveBeenCalledWith('/locations/trip/1/bulk', {
        ids: [1, 2],
        updates: { categoryId: 5, notes: 'Updated' },
      });
      expect(result).toEqual(mockResult);
    });
  });
});
