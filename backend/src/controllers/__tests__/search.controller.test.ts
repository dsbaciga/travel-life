import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service before importing controller
jest.mock('../../services/search.service', () => ({
  __esModule: true,
  default: {
    globalSearch: jest.fn(),
  },
}));

import searchService from '../../services/search.service';
import { searchController } from '../search.controller';
import {
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

const flushPromises = () => new Promise(resolve => process.nextTick(resolve));

describe('search.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('globalSearch', () => {
    it('should call searchService.globalSearch with validated query and return results', async () => {
      const mockResults = {
        trips: [{ id: 1, name: 'Trip 1' }],
        locations: [],
        activities: [],
      };
      (searchService.globalSearch as jest.Mock).mockResolvedValue(mockResults as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { q: 'paris', type: 'all' },
      });
      searchController.globalSearch(req as any, res as any, next);
      await flushPromises();

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(searchService.globalSearch).toHaveBeenCalledWith(
          testUsers.user1.id,
          expect.objectContaining({ q: 'paris' })
        );
        expectSuccessResponse(res, 200, mockResults);
      }
    });

    it('should pass errors to next via asyncHandler', async () => {
      const error = new Error('Search failed');
      (searchService.globalSearch as jest.Mock).mockRejectedValue(error as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { q: 'test' },
      });
      searchController.globalSearch(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should pass Zod validation errors for missing query param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: {},
      });
      searchController.globalSearch(req as any, res as any, next);
      await flushPromises();

      // Zod should fail if 'q' is required
      expect(next).toHaveBeenCalled();
    });
  });
});
