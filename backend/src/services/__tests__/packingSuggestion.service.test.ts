/**
 * PackingSuggestion Service Tests
 *
 * Test cases:
 * - PS-001: Get suggestions for cold weather trip
 * - PS-002: Get suggestions for hot weather trip
 * - PS-003: Get suggestions for rainy weather trip
 * - PS-004: Get suggestions for snowy weather trip
 * - PS-005: Get suggestions for high humidity
 * - PS-006: Get suggestions for wide temperature range
 * - PS-007: Get suggestions for long trips (> 7 days)
 * - PS-008: Handle trip with no weather data
 * - PS-009: Handle trip access denied
 */

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock weather service
const mockGetWeatherForTrip = jest.fn();
jest.mock('../weather.service', () => ({
  __esModule: true,
  default: {
    getWeatherForTrip: mockGetWeatherForTrip,
  },
}));

// Mock serviceHelpers
jest.mock('../../utils/serviceHelpers', () => ({
  verifyTripAccess: jest.fn().mockImplementation(async (userId: number, tripId: number) => {
    const trip = await mockPrisma.trip.findFirst({ where: { id: tripId, userId } });
    if (!trip) {
      const { AppError } = require('../../utils/errors');
      throw new AppError('Trip not found or access denied', 404);
    }
    return trip;
  }),
}));

import packingSuggestionService from '../packingSuggestion.service';

describe('PackingSuggestionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockTrip = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 1,
    title: 'Test Trip',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-05'),
    ...overrides,
  });

  // ============================================================
  // PS-001: Cold weather suggestions
  // ============================================================
  describe('PS-001: Cold weather suggestions', () => {
    it('should suggest warm clothing for cold temperatures', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 45, temperatureLow: 30, conditions: 'Clear', precipitation: 0, humidity: 40, windSpeed: 5 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Warm jacket or coat');
      expect(items).toContain('Thermal underwear/base layers'); // Below freezing
    });

    it('should include freezing weather suggestions when below 32F', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 35, temperatureLow: 20, conditions: 'Clear', precipitation: 0, humidity: 40, windSpeed: 5 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Thermal underwear/base layers');
      expect(items).toContain('Insulated winter boots');
    });
  });

  // ============================================================
  // PS-002: Hot weather suggestions
  // ============================================================
  describe('PS-002: Hot weather suggestions', () => {
    it('should suggest sun protection for hot temperatures', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 95, temperatureLow: 75, conditions: 'Sunny', precipitation: 0, humidity: 30, windSpeed: 5 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Sunscreen (SPF 30+)');
      expect(items).toContain('Light, breathable clothing');
      expect(items).toContain('Reusable water bottle');
    });
  });

  // ============================================================
  // PS-003: Rainy weather suggestions
  // ============================================================
  describe('PS-003: Rainy weather suggestions', () => {
    it('should suggest rain gear when rain is predicted', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 70, temperatureLow: 60, conditions: 'Light rain', precipitation: 5, humidity: 80, windSpeed: 10 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Umbrella');
      expect(items).toContain('Rain jacket or poncho');
    });

    it('should suggest rain gear based on precipitation amount', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 70, temperatureLow: 60, conditions: 'Cloudy', precipitation: 3, humidity: 50, windSpeed: 5 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Umbrella');
    });
  });

  // ============================================================
  // PS-004: Snowy weather suggestions
  // ============================================================
  describe('PS-004: Snowy weather suggestions', () => {
    it('should suggest snow gear when snow is predicted', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 30, temperatureLow: 15, conditions: 'Snow', precipitation: 8, humidity: 50, windSpeed: 15 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Waterproof winter boots');
      expect(items).toContain('Waterproof outer layer');
      expect(items).toContain('Waterproof gloves');
    });
  });

  // ============================================================
  // PS-005: High humidity suggestions
  // ============================================================
  describe('PS-005: High humidity suggestions', () => {
    it('should suggest moisture-wicking clothes for high humidity', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 80, temperatureLow: 70, conditions: 'Partly cloudy', precipitation: 0, humidity: 85, windSpeed: 5 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Moisture-wicking clothes');
    });
  });

  // ============================================================
  // PS-006: Wide temperature range suggestions
  // ============================================================
  describe('PS-006: Wide temperature range suggestions', () => {
    it('should suggest versatile layers for wide temperature range', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 90, temperatureLow: 55, conditions: 'Clear', precipitation: 0, humidity: 40, windSpeed: 5 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Versatile layers');
    });
  });

  // ============================================================
  // PS-007: Long trip suggestions
  // ============================================================
  describe('PS-007: Long trip suggestions', () => {
    it('should add long-trip-specific suggestions for trips > 7 days', async () => {
      const trip = createMockTrip({
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-15'), // 15 days
      });
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 75, temperatureLow: 65, conditions: 'Clear', precipitation: 0, humidity: 40, windSpeed: 5 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      expect(result.tripDays).toBeGreaterThan(7);
      const items = result.suggestions.map(s => s.item);
      expect(items).toContain('Travel laundry kit or detergent');
      expect(items).toContain('First aid kit');
    });
  });

  // ============================================================
  // PS-008: No weather data
  // ============================================================
  describe('PS-008: Handle trip with no weather data', () => {
    it('should return empty suggestions when no weather data available', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      expect(result.suggestions.length).toBe(0);
      expect(result.weatherSummary.minTemp).toBeNull();
      expect(result.weatherSummary.maxTemp).toBeNull();
    });
  });

  // ============================================================
  // PS-009: Trip access denied
  // ============================================================
  describe('PS-009: Trip access denied', () => {
    it('should throw error when user does not have access', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        packingSuggestionService.getSuggestionsForTrip(999, 1)
      ).rejects.toThrow('Trip not found or access denied');
    });
  });

  // ============================================================
  // Additional: Suggestions are sorted by priority
  // ============================================================
  describe('Suggestions sorting', () => {
    it('should sort suggestions by priority (essential first)', async () => {
      const trip = createMockTrip();
      mockPrisma.trip.findFirst.mockResolvedValue(trip);
      mockGetWeatherForTrip.mockResolvedValue([
        { temperatureHigh: 95, temperatureLow: 75, conditions: 'Light rain', precipitation: 5, humidity: 85, windSpeed: 25 },
      ]);

      const result = await packingSuggestionService.getSuggestionsForTrip(1, 1);

      // Essential items should come first
      const priorities = result.suggestions.map(s => s.priority);
      const essentialIndex = priorities.indexOf('essential');
      const optionalIndex = priorities.indexOf('optional');
      if (essentialIndex !== -1 && optionalIndex !== -1) {
        expect(essentialIndex).toBeLessThan(optionalIndex);
      }
    });
  });
});
