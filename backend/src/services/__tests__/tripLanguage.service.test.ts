/**
 * TripLanguage Service Tests
 *
 * Test cases:
 * - TL-001: Get languages for a trip
 * - TL-002: Add a language to a trip
 * - TL-003: Remove a language from a trip
 * - TL-004: Access control - trip not found
 * - TL-005: Prevent duplicate language
 * - TL-006: Remove non-existent language
 */

// Mock the middleware/errorHandler BEFORE imports (it transitively loads config which validates DATABASE_URL)
jest.mock('../../middleware/errorHandler', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    isOperational: boolean;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = true;
    }
  },
}));

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
  },
  tripLanguage: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import tripLanguageService from '../tripLanguage.service';

describe('TripLanguageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockTrip = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 1,
    title: 'Test Trip',
    ...overrides,
  });

  const createMockTripLanguage = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    tripId: 1,
    languageCode: 'es',
    language: 'Spanish',
    createdAt: new Date(),
    ...overrides,
  });

  // ============================================================
  // TL-001: Get languages for a trip
  // ============================================================
  describe('TL-001: Get languages for a trip', () => {
    it('should return all languages selected for a trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.tripLanguage.findMany.mockResolvedValue([
        createMockTripLanguage({ id: 1, languageCode: 'es', language: 'Spanish' }),
        createMockTripLanguage({ id: 2, languageCode: 'fr', language: 'French' }),
      ]);

      const result = await tripLanguageService.getLanguagesForTrip(1, 1);

      expect(result.length).toBe(2);
      expect(result[0].languageCode).toBe('es');
      expect(result[1].languageCode).toBe('fr');
    });

    it('should return empty array when no languages selected', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.tripLanguage.findMany.mockResolvedValue([]);

      const result = await tripLanguageService.getLanguagesForTrip(1, 1);

      expect(result).toEqual([]);
    });

    it('should order languages by ID ascending', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.tripLanguage.findMany.mockResolvedValue([]);

      await tripLanguageService.getLanguagesForTrip(1, 1);

      expect(mockPrisma.tripLanguage.findMany).toHaveBeenCalledWith({
        where: { tripId: 1 },
        orderBy: { id: 'asc' },
      });
    });
  });

  // ============================================================
  // TL-002: Add a language to a trip
  // ============================================================
  describe('TL-002: Add a language to a trip', () => {
    it('should add a language to the trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.tripLanguage.findUnique.mockResolvedValue(null); // Not already added
      const newLanguage = createMockTripLanguage({ languageCode: 'de', language: 'German' });
      mockPrisma.tripLanguage.create.mockResolvedValue(newLanguage);

      const result = await tripLanguageService.addLanguageToTrip(1, 1, {
        languageCode: 'de',
        language: 'German',
      });

      expect(result.languageCode).toBe('de');
      expect(result.language).toBe('German');
      expect(mockPrisma.tripLanguage.create).toHaveBeenCalledWith({
        data: {
          tripId: 1,
          languageCode: 'de',
          language: 'German',
        },
      });
    });

    it('should check for edit permission via collaborators', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.tripLanguage.findUnique.mockResolvedValue(null);
      mockPrisma.tripLanguage.create.mockResolvedValue(createMockTripLanguage());

      await tripLanguageService.addLanguageToTrip(1, 1, {
        languageCode: 'es',
        language: 'Spanish',
      });

      expect(mockPrisma.trip.findFirst).toHaveBeenCalledWith({
        where: {
          id: 1,
          OR: [
            { userId: 1 },
            { collaborators: { some: { userId: 1, permissionLevel: { in: ['edit', 'admin'] } } } },
          ],
        },
      });
    });
  });

  // ============================================================
  // TL-003: Remove a language from a trip
  // ============================================================
  describe('TL-003: Remove a language from a trip', () => {
    it('should remove a language from the trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      const existingLang = createMockTripLanguage({ id: 5 });
      mockPrisma.tripLanguage.findUnique.mockResolvedValue(existingLang);
      mockPrisma.tripLanguage.delete.mockResolvedValue(existingLang);

      await tripLanguageService.removeLanguageFromTrip(1, 1, 'es');

      expect(mockPrisma.tripLanguage.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });

    it('should use composite key to find language', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.tripLanguage.findUnique.mockResolvedValue(createMockTripLanguage());
      mockPrisma.tripLanguage.delete.mockResolvedValue({});

      await tripLanguageService.removeLanguageFromTrip(1, 1, 'es');

      expect(mockPrisma.tripLanguage.findUnique).toHaveBeenCalledWith({
        where: {
          tripId_languageCode: {
            tripId: 1,
            languageCode: 'es',
          },
        },
      });
    });
  });

  // ============================================================
  // TL-004: Access control
  // ============================================================
  describe('TL-004: Access control', () => {
    it('should throw 404 when trip not found for getLanguagesForTrip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripLanguageService.getLanguagesForTrip(999, 1)
      ).rejects.toThrow('Trip not found or access denied');
    });

    it('should throw 404 when trip not found for addLanguageToTrip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripLanguageService.addLanguageToTrip(999, 1, {
          languageCode: 'es',
          language: 'Spanish',
        })
      ).rejects.toThrow('Trip not found or access denied');
    });

    it('should throw 404 when trip not found for removeLanguageFromTrip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripLanguageService.removeLanguageFromTrip(999, 1, 'es')
      ).rejects.toThrow('Trip not found or access denied');
    });
  });

  // ============================================================
  // TL-005: Prevent duplicate language
  // ============================================================
  describe('TL-005: Prevent duplicate language', () => {
    it('should throw error when adding a language that already exists', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.tripLanguage.findUnique.mockResolvedValue(createMockTripLanguage()); // Already exists

      await expect(
        tripLanguageService.addLanguageToTrip(1, 1, {
          languageCode: 'es',
          language: 'Spanish',
        })
      ).rejects.toThrow('Language already added to this trip');
    });
  });

  // ============================================================
  // TL-006: Remove non-existent language
  // ============================================================
  describe('TL-006: Remove non-existent language', () => {
    it('should throw 404 when removing a language not in the trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.tripLanguage.findUnique.mockResolvedValue(null);

      await expect(
        tripLanguageService.removeLanguageFromTrip(1, 1, 'nonexistent')
      ).rejects.toThrow('Language not found for this trip');
    });
  });
});
