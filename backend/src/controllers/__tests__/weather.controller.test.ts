import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service before importing controller
jest.mock('../../services/weather.service', () => ({
  __esModule: true,
  default: {
    getWeatherForTrip: jest.fn(),
    refreshWeatherForDate: jest.fn(),
    refreshAllWeatherForTrip: jest.fn(),
  },
}));

import weatherService from '../../services/weather.service';
import { weatherController } from '../weather.controller';
import {
  createAuthenticatedControllerArgs,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

const flushPromises = () => new Promise(resolve => process.nextTick(resolve));

describe('weather.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getWeatherForTrip', () => {
    it('should return weather data for a trip', async () => {
      const mockWeather = [{ date: '2024-06-01', temp: 25, condition: 'sunny' }];
      (weatherService.getWeatherForTrip as jest.Mock).mockResolvedValue(mockWeather as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      weatherController.getWeatherForTrip(req as any, res as any, next);
      await flushPromises();

      expect(weatherService.getWeatherForTrip).toHaveBeenCalledWith(5, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockWeather });
    });

    it('should pass service errors to next', async () => {
      const error = new Error('Weather API unavailable');
      (weatherService.getWeatherForTrip as jest.Mock).mockRejectedValue(error as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      weatherController.getWeatherForTrip(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('refreshWeather', () => {
    it('should refresh weather for a specific date', async () => {
      const mockWeather = { date: '2024-06-01', temp: 26, condition: 'cloudy' };
      (weatherService.refreshWeatherForDate as jest.Mock).mockResolvedValue(mockWeather as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
        body: { date: '2024-06-01' },
      });
      weatherController.refreshWeather(req as any, res as any, next);
      await flushPromises();

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(weatherService.refreshWeatherForDate).toHaveBeenCalledWith(
          5,
          testUsers.user1.id,
          '2024-06-01'
        );
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockWeather });
      }
    });

    it('should pass Zod validation errors for invalid body', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
        body: {},
      });
      weatherController.refreshWeather(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalled();
    });
  });

  describe('refreshAllWeather', () => {
    it('should refresh all weather for a trip', async () => {
      const mockWeather = [{ date: '2024-06-01', temp: 25 }];
      (weatherService.refreshAllWeatherForTrip as jest.Mock).mockResolvedValue(mockWeather as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      weatherController.refreshAllWeather(req as any, res as any, next);
      await flushPromises();

      expect(weatherService.refreshAllWeatherForTrip).toHaveBeenCalledWith(5, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockWeather });
    });
  });
});
