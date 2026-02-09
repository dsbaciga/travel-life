import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service before importing controller
jest.mock('../../services/packingSuggestion.service', () => ({
  __esModule: true,
  default: {
    getSuggestionsForTrip: jest.fn(),
  },
}));

import packingSuggestionService from '../../services/packingSuggestion.service';
import { packingSuggestionController } from '../packingSuggestion.controller';
import {
  createAuthenticatedControllerArgs,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

describe('packingSuggestion.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getSuggestions', () => {
    it('should return packing suggestions for a trip', async () => {
      const mockSuggestions = {
        categories: [
          { name: 'Clothing', items: ['Rain jacket', 'Warm layers'] },
          { name: 'Essentials', items: ['Passport', 'Charger'] },
        ],
        weatherSummary: { avgTemp: 15, conditions: ['rainy'] },
      };
      (packingSuggestionService.getSuggestionsForTrip as jest.Mock).mockResolvedValue(mockSuggestions as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      await packingSuggestionController.getSuggestions(req as any, res as any, next);

      expect(packingSuggestionService.getSuggestionsForTrip).toHaveBeenCalledWith(5, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockSuggestions });
    });

    it('should pass errors to next', async () => {
      const error = new Error('No weather data available');
      (packingSuggestionService.getSuggestionsForTrip as jest.Mock).mockRejectedValue(error as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      await packingSuggestionController.getSuggestions(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should parse tripId from params correctly', async () => {
      (packingSuggestionService.getSuggestionsForTrip as jest.Mock).mockResolvedValue({} as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '42' },
      });
      await packingSuggestionController.getSuggestions(req as any, res as any, next);

      expect(packingSuggestionService.getSuggestionsForTrip).toHaveBeenCalledWith(42, testUsers.user1.id);
    });
  });
});
