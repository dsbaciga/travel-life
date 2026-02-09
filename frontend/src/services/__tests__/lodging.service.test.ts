/* eslint-disable @typescript-eslint/no-explicit-any */
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
import lodgingService from '../lodging.service';

describe('LodgingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLodging', () => {
    it('should call POST /lodging with lodging data', async () => {
      const lodgingData = {
        tripId: 1,
        name: 'Grand Hotel',
        type: 'hotel',
        checkIn: '2024-06-01',
        checkOut: '2024-06-03',
      };
      const mockLodging = { id: 1, ...lodgingData };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLodging });

      const result = await lodgingService.createLodging(lodgingData as any);

      expect(api.post).toHaveBeenCalledWith('/lodging', lodgingData);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockLodging);
    });

    it('should propagate errors on creation failure', async () => {
      const error = new Error('Validation error');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(lodgingService.createLodging({} as any)).rejects.toThrow('Validation error');
    });
  });

  describe('getLodgingByTrip', () => {
    it('should call GET /lodging/trip/:tripId', async () => {
      const mockLodging = [
        { id: 1, name: 'Hotel A', type: 'hotel' },
        { id: 2, name: 'Airbnb B', type: 'airbnb' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLodging });

      const result = await lodgingService.getLodgingByTrip(5);

      expect(api.get).toHaveBeenCalledWith('/lodging/trip/5');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockLodging);
    });

    it('should return empty array when no lodging exists', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

      const result = await lodgingService.getLodgingByTrip(99);

      expect(result).toEqual([]);
    });
  });

  describe('getLodgingById', () => {
    it('should call GET /lodging/:id', async () => {
      const mockLodging = { id: 3, name: 'Beach Resort', type: 'resort' };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLodging });

      const result = await lodgingService.getLodgingById(3);

      expect(api.get).toHaveBeenCalledWith('/lodging/3');
      expect(result).toEqual(mockLodging);
    });

    it('should propagate errors when lodging not found', async () => {
      const error = new Error('Not found');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(lodgingService.getLodgingById(999)).rejects.toThrow('Not found');
    });
  });

  describe('updateLodging', () => {
    it('should call PUT /lodging/:id with update data', async () => {
      const updateData = { name: 'Updated Hotel Name', type: 'boutique' };
      const mockLodging = { id: 2, ...updateData };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockLodging });

      const result = await lodgingService.updateLodging(2, updateData as any);

      expect(api.put).toHaveBeenCalledWith('/lodging/2', updateData);
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockLodging);
    });

    it('should propagate errors on update failure', async () => {
      const error = new Error('Forbidden');
      (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(lodgingService.updateLodging(2, {} as any)).rejects.toThrow('Forbidden');
    });
  });

  describe('deleteLodging', () => {
    it('should call DELETE /lodging/:id', async () => {
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await lodgingService.deleteLodging(4);

      expect(api.delete).toHaveBeenCalledWith('/lodging/4');
      expect(api.delete).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors on delete failure', async () => {
      const error = new Error('Not found');
      (api.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(lodgingService.deleteLodging(999)).rejects.toThrow('Not found');
    });
  });

  describe('bulkDeleteLodging', () => {
    it('should call DELETE /lodging/trip/:tripId/bulk with ids in body', async () => {
      const mockResult = { success: true, deletedCount: 3 };
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await lodgingService.bulkDeleteLodging(1, [1, 2, 3]);

      expect(api.delete).toHaveBeenCalledWith('/lodging/trip/1/bulk', { data: { ids: [1, 2, 3] } });
      expect(result).toEqual(mockResult);
    });
  });

  describe('bulkUpdateLodging', () => {
    it('should call PATCH /lodging/trip/:tripId/bulk with ids and updates', async () => {
      const mockResult = { success: true, updatedCount: 2 };
      const updates = { type: 'hostel', notes: 'Budget option' };
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await lodgingService.bulkUpdateLodging(1, [1, 2], updates);

      expect(api.patch).toHaveBeenCalledWith('/lodging/trip/1/bulk', {
        ids: [1, 2],
        updates,
      });
      expect(result).toEqual(mockResult);
    });
  });
});
