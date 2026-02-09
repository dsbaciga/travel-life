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
import transportationService from '../transportation.service';

describe('TransportationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTransportation', () => {
    it('should call POST /transportation with transportation data', async () => {
      const transportData = {
        tripId: 1,
        type: 'flight',
        carrier: 'United Airlines',
        departureLocation: 'SFO',
        arrivalLocation: 'JFK',
      };
      const mockTransport = { id: 1, ...transportData };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTransport });

      const result = await transportationService.createTransportation(transportData as any);

      expect(api.post).toHaveBeenCalledWith('/transportation', transportData);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTransport);
    });

    it('should propagate errors on creation failure', async () => {
      const error = new Error('Validation error');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(transportationService.createTransportation({} as any)).rejects.toThrow('Validation error');
    });
  });

  describe('getAllTransportation', () => {
    it('should call GET /transportation and return items from response', async () => {
      const mockItems = [
        { id: 1, type: 'flight' },
        { id: 2, type: 'train' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { items: mockItems } });

      const result = await transportationService.getAllTransportation();

      expect(api.get).toHaveBeenCalledWith('/transportation');
      expect(result).toEqual(mockItems);
    });
  });

  describe('getTransportationByTrip', () => {
    it('should call GET /transportation/trip/:tripId', async () => {
      const mockTransportation = [
        { id: 1, type: 'flight', carrier: 'Delta' },
        { id: 2, type: 'bus', carrier: 'Greyhound' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTransportation });

      const result = await transportationService.getTransportationByTrip(5);

      expect(api.get).toHaveBeenCalledWith('/transportation/trip/5');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTransportation);
    });

    it('should return empty array when no transportation exists', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

      const result = await transportationService.getTransportationByTrip(99);

      expect(result).toEqual([]);
    });
  });

  describe('getTransportationById', () => {
    it('should call GET /transportation/:id', async () => {
      const mockTransport = { id: 3, type: 'train', carrier: 'Amtrak' };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTransport });

      const result = await transportationService.getTransportationById(3);

      expect(api.get).toHaveBeenCalledWith('/transportation/3');
      expect(result).toEqual(mockTransport);
    });

    it('should propagate errors when not found', async () => {
      const error = new Error('Not found');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(transportationService.getTransportationById(999)).rejects.toThrow('Not found');
    });
  });

  describe('updateTransportation', () => {
    it('should call PUT /transportation/:id with update data', async () => {
      const updateData = { carrier: 'Updated Carrier', type: 'bus' };
      const mockTransport = { id: 2, ...updateData };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockTransport });

      const result = await transportationService.updateTransportation(2, updateData as any);

      expect(api.put).toHaveBeenCalledWith('/transportation/2', updateData);
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTransport);
    });

    it('should propagate errors on update failure', async () => {
      const error = new Error('Forbidden');
      (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(transportationService.updateTransportation(2, {} as any)).rejects.toThrow('Forbidden');
    });
  });

  describe('deleteTransportation', () => {
    it('should call DELETE /transportation/:id', async () => {
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await transportationService.deleteTransportation(4);

      expect(api.delete).toHaveBeenCalledWith('/transportation/4');
      expect(api.delete).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors on delete failure', async () => {
      const error = new Error('Not found');
      (api.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(transportationService.deleteTransportation(999)).rejects.toThrow('Not found');
    });
  });

  describe('recalculateDistancesForTrip', () => {
    it('should call POST /transportation/trip/:tripId/recalculate-distances', async () => {
      const mockResult = { count: 5 };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await transportationService.recalculateDistancesForTrip(1);

      expect(api.post).toHaveBeenCalledWith('/transportation/trip/1/recalculate-distances');
      expect(result).toEqual(mockResult);
    });
  });

  describe('bulkDeleteTransportation', () => {
    it('should call DELETE /transportation/trip/:tripId/bulk with ids in body', async () => {
      const mockResult = { success: true, deletedCount: 2 };
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await transportationService.bulkDeleteTransportation(1, [1, 2]);

      expect(api.delete).toHaveBeenCalledWith('/transportation/trip/1/bulk', { data: { ids: [1, 2] } });
      expect(result).toEqual(mockResult);
    });
  });

  describe('bulkUpdateTransportation', () => {
    it('should call PATCH /transportation/trip/:tripId/bulk with ids and updates', async () => {
      const mockResult = { success: true, updatedCount: 2 };
      const updates = { type: 'bus', carrier: 'Updated', notes: 'Updated note' };
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await transportationService.bulkUpdateTransportation(1, [1, 2], updates);

      expect(api.patch).toHaveBeenCalledWith('/transportation/trip/1/bulk', {
        ids: [1, 2],
        updates,
      });
      expect(result).toEqual(mockResult);
    });
  });
});
