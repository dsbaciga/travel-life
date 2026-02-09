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
import searchService from '../search.service';

describe('SearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('globalSearch', () => {
    it('should call GET /search with query and default type "all"', async () => {
      const mockResponse = {
        results: [
          { id: 1, type: 'trip', title: 'Paris Trip', url: '/trips/1' },
          { id: 2, type: 'location', title: 'Eiffel Tower', url: '/locations/2' },
        ],
        total: 2,
      };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await searchService.globalSearch('paris');

      expect(api.get).toHaveBeenCalledWith('/search', {
        params: { q: 'paris', type: 'all' },
      });
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('should call GET /search with specific type filter', async () => {
      const mockResponse = {
        results: [{ id: 1, type: 'trip', title: 'Beach Trip', url: '/trips/1' }],
        total: 1,
      };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await searchService.globalSearch('beach', 'trip');

      expect(api.get).toHaveBeenCalledWith('/search', {
        params: { q: 'beach', type: 'trip' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should return empty results when nothing matches', async () => {
      const mockResponse = { results: [], total: 0 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await searchService.globalSearch('nonexistent');

      expect(api.get).toHaveBeenCalledWith('/search', {
        params: { q: 'nonexistent', type: 'all' },
      });
      expect(result).toEqual(mockResponse);
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should call GET /search with type "location"', async () => {
      const mockResponse = {
        results: [{ id: 5, type: 'location', title: 'Central Park', url: '/locations/5' }],
        total: 1,
      };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await searchService.globalSearch('central park', 'location');

      expect(api.get).toHaveBeenCalledWith('/search', {
        params: { q: 'central park', type: 'location' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should call GET /search with type "photo"', async () => {
      const mockResponse = {
        results: [{ id: 10, type: 'photo', title: 'Sunset Photo', url: '/photos/10', thumbnail: '/thumbs/10.jpg' }],
        total: 1,
      };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await searchService.globalSearch('sunset', 'photo');

      expect(api.get).toHaveBeenCalledWith('/search', {
        params: { q: 'sunset', type: 'photo' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors on search failure', async () => {
      const error = new Error('Server error');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(searchService.globalSearch('test')).rejects.toThrow('Server error');
    });
  });
});
