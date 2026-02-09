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
import { activityService } from '../activity.service';

describe('activityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createActivity', () => {
    it('should call POST /activities with activity data', async () => {
      const activityData = { tripId: 1, name: 'Museum Visit', category: 'sightseeing', date: '2024-06-01' };
      const mockActivity = { id: 1, ...activityData };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockActivity });

      const result = await activityService.createActivity(activityData as any);

      expect(api.post).toHaveBeenCalledWith('/activities', activityData);
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockActivity);
    });

    it('should propagate errors on creation failure', async () => {
      const error = new Error('Validation error');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(activityService.createActivity({} as any)).rejects.toThrow('Validation error');
    });
  });

  describe('getActivitiesByTrip', () => {
    it('should call GET /activities/trip/:tripId', async () => {
      const mockActivities = [
        { id: 1, name: 'Activity 1' },
        { id: 2, name: 'Activity 2' },
      ];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockActivities });

      const result = await activityService.getActivitiesByTrip(5);

      expect(api.get).toHaveBeenCalledWith('/activities/trip/5');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockActivities);
    });

    it('should return empty array when no activities exist', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

      const result = await activityService.getActivitiesByTrip(99);

      expect(result).toEqual([]);
    });
  });

  describe('getActivityById', () => {
    it('should call GET /activities/:activityId', async () => {
      const mockActivity = { id: 3, name: 'Hiking Tour', category: 'adventure' };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockActivity });

      const result = await activityService.getActivityById(3);

      expect(api.get).toHaveBeenCalledWith('/activities/3');
      expect(result).toEqual(mockActivity);
    });

    it('should propagate errors when activity not found', async () => {
      const error = new Error('Not found');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(activityService.getActivityById(999)).rejects.toThrow('Not found');
    });
  });

  describe('updateActivity', () => {
    it('should call PUT /activities/:activityId with update data', async () => {
      const updateData = { name: 'Updated Activity', category: 'dining' };
      const mockActivity = { id: 2, ...updateData };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockActivity });

      const result = await activityService.updateActivity(2, updateData as any);

      expect(api.put).toHaveBeenCalledWith('/activities/2', updateData);
      expect(api.put).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockActivity);
    });

    it('should propagate errors on update failure', async () => {
      const error = new Error('Forbidden');
      (api.put as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(activityService.updateActivity(2, {} as any)).rejects.toThrow('Forbidden');
    });
  });

  describe('deleteActivity', () => {
    it('should call DELETE /activities/:activityId', async () => {
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await activityService.deleteActivity(4);

      expect(api.delete).toHaveBeenCalledWith('/activities/4');
      expect(api.delete).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors on delete failure', async () => {
      const error = new Error('Not found');
      (api.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(activityService.deleteActivity(999)).rejects.toThrow('Not found');
    });
  });

  describe('bulkDeleteActivities', () => {
    it('should call DELETE /activities/trip/:tripId/bulk with ids in body', async () => {
      const mockResult = { success: true, deletedCount: 3 };
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await activityService.bulkDeleteActivities(1, [1, 2, 3]);

      expect(api.delete).toHaveBeenCalledWith('/activities/trip/1/bulk', { data: { ids: [1, 2, 3] } });
      expect(result).toEqual(mockResult);
    });
  });

  describe('bulkUpdateActivities', () => {
    it('should call PATCH /activities/trip/:tripId/bulk with ids and updates', async () => {
      const mockResult = { success: true, updatedCount: 2 };
      const updates = { category: 'dining', notes: 'Updated note', timezone: 'UTC' };
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await activityService.bulkUpdateActivities(1, [1, 2], updates);

      expect(api.patch).toHaveBeenCalledWith('/activities/trip/1/bulk', {
        ids: [1, 2],
        updates,
      });
      expect(result).toEqual(mockResult);
    });
  });
});
