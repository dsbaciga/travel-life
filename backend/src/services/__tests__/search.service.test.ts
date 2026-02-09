/**
 * Search Service Tests
 *
 * Test cases:
 * - SRC-001: Global search across all types
 * - SRC-002: Search for trips only
 * - SRC-003: Search for locations only
 * - SRC-004: Search for journal entries only
 * - SRC-005: Search for photos only
 * - SRC-006: Search for trip series only
 * - SRC-007: Search returns empty results
 * - SRC-008: Search respects limit parameter
 * - SRC-009: Search results are sorted by date
 */

// Mock @prisma/client BEFORE any imports that depend on it
jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) { this.value = String(value); }
      toString(): string { return this.value; }
      toNumber(): number { return parseFloat(this.value); }
      valueOf(): number { return this.toNumber(); }
    },
  },
  EntityType: {
    PHOTO: 'PHOTO',
    LOCATION: 'LOCATION',
    ACTIVITY: 'ACTIVITY',
    LODGING: 'LODGING',
    TRANSPORTATION: 'TRANSPORTATION',
    JOURNAL_ENTRY: 'JOURNAL_ENTRY',
    PHOTO_ALBUM: 'PHOTO_ALBUM',
  },
}));

// Mock the database config
const mockPrisma = {
  trip: {
    findMany: jest.fn(),
  },
  location: {
    findMany: jest.fn(),
  },
  journalEntry: {
    findMany: jest.fn(),
  },
  photo: {
    findMany: jest.fn(),
  },
  tripSeries: {
    findMany: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import searchService from '../search.service';

describe('SearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: all queries return empty
    mockPrisma.trip.findMany.mockResolvedValue([]);
    mockPrisma.location.findMany.mockResolvedValue([]);
    mockPrisma.journalEntry.findMany.mockResolvedValue([]);
    mockPrisma.photo.findMany.mockResolvedValue([]);
    mockPrisma.tripSeries.findMany.mockResolvedValue([]);
  });

  // ============================================================
  // SRC-001: Global search across all types
  // ============================================================
  describe('SRC-001: Global search across all types', () => {
    it('should search across all entity types', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([
        {
          id: 1,
          title: 'Beach Trip',
          description: 'Fun at the beach',
          status: 'Completed',
          tripType: 'Vacation',
          startDate: new Date('2024-07-01'),
          updatedAt: new Date('2024-07-15'),
        },
      ]);
      mockPrisma.location.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Beach Resort',
          address: '123 Beach Road',
          notes: null,
          tripId: 1,
          visitDatetime: new Date('2024-07-02'),
          updatedAt: new Date(),
          trip: { title: 'Beach Trip' },
        },
      ]);
      mockPrisma.journalEntry.findMany.mockResolvedValue([]);
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockPrisma.tripSeries.findMany.mockResolvedValue([]);

      const result = await searchService.globalSearch(1, {
        q: 'beach',
        type: 'all',
        limit: '20',
      });

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.results.find((r: { type: string }) => r.type === 'trip')).toBeDefined();
      expect(result.results.find((r: { type: string }) => r.type === 'location')).toBeDefined();
    });
  });

  // ============================================================
  // SRC-002: Search for trips only
  // ============================================================
  describe('SRC-002: Search for trips only', () => {
    it('should search only trips when type is trip', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([
        {
          id: 1,
          title: 'Summer Vacation',
          description: 'A great vacation',
          status: 'Completed',
          tripType: null,
          startDate: new Date('2024-06-01'),
          updatedAt: new Date(),
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'vacation',
        type: 'trip',
        limit: '20',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe('trip');
      expect(result.results[0].title).toBe('Summer Vacation');
      expect(result.results[0].url).toBe('/trips/1');
      // Only trip.findMany should be called
      expect(mockPrisma.location.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.journalEntry.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.photo.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.tripSeries.findMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // SRC-003: Search for locations only
  // ============================================================
  describe('SRC-003: Search for locations only', () => {
    it('should search only locations when type is location', async () => {
      mockPrisma.location.findMany.mockResolvedValue([
        {
          id: 5,
          name: 'Eiffel Tower',
          address: 'Paris, France',
          notes: 'Amazing view',
          tripId: 1,
          visitDatetime: new Date('2024-05-15'),
          updatedAt: new Date(),
          trip: { title: 'Paris Trip' },
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'eiffel',
        type: 'location',
        limit: '20',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe('location');
      expect(result.results[0].title).toBe('Eiffel Tower');
      expect(result.results[0].subtitle).toBe('Trip: Paris Trip');
      expect(mockPrisma.trip.findMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // SRC-004: Search for journal entries only
  // ============================================================
  describe('SRC-004: Search for journal entries only', () => {
    it('should search only journal entries when type is journal', async () => {
      mockPrisma.journalEntry.findMany.mockResolvedValue([
        {
          id: 3,
          title: 'Day at the Museum',
          content: 'Visited the Louvre today',
          date: new Date('2024-05-16'),
          tripId: 1,
          updatedAt: new Date(),
          trip: { title: 'Paris Trip' },
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'museum',
        type: 'journal',
        limit: '20',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe('journal');
      expect(result.results[0].title).toBe('Day at the Museum');
      expect(mockPrisma.trip.findMany).not.toHaveBeenCalled();
    });

    it('should handle journal entries without title', async () => {
      mockPrisma.journalEntry.findMany.mockResolvedValue([
        {
          id: 4,
          title: null,
          content: 'Quick thoughts',
          date: null,
          tripId: 1,
          updatedAt: new Date(),
          trip: { title: 'Trip' },
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'thoughts',
        type: 'journal',
        limit: '20',
      });

      expect(result.results[0].title).toBe('Untitled Journal Entry');
    });
  });

  // ============================================================
  // SRC-005: Search for photos only
  // ============================================================
  describe('SRC-005: Search for photos only', () => {
    it('should search only photos when type is photo', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([
        {
          id: 10,
          caption: 'Sunset at the beach',
          localPath: '/uploads/photo.jpg',
          thumbnailPath: '/uploads/thumb.jpg',
          tripId: 1,
          takenAt: new Date('2024-07-03'),
          updatedAt: new Date(),
          trip: { title: 'Beach Trip' },
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'sunset',
        type: 'photo',
        limit: '20',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe('photo');
      expect(result.results[0].title).toBe('Sunset at the beach');
      expect(result.results[0].thumbnail).toBe('/uploads/thumb.jpg');
      expect(mockPrisma.trip.findMany).not.toHaveBeenCalled();
    });

    it('should handle photos without caption', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([
        {
          id: 11,
          caption: null,
          localPath: '/uploads/photo.jpg',
          thumbnailPath: null,
          tripId: 1,
          takenAt: null,
          updatedAt: new Date(),
          trip: { title: 'Trip' },
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'photo',
        type: 'photo',
        limit: '20',
      });

      expect(result.results[0].title).toBe('Unnamed Photo');
      expect(result.results[0].thumbnail).toBe('/uploads/photo.jpg');
    });
  });

  // ============================================================
  // SRC-006: Search for trip series only
  // ============================================================
  describe('SRC-006: Search for trip series only', () => {
    it('should search only trip series when type is trip-series', async () => {
      mockPrisma.tripSeries.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Annual Europe Trips',
          description: 'Yearly trips to Europe',
          updatedAt: new Date(),
          _count: { trips: 3 },
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'europe',
        type: 'trip-series',
        limit: '20',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe('trip-series');
      expect(result.results[0].title).toBe('Annual Europe Trips');
      expect(result.results[0].subtitle).toBe('3 trips');
      expect(mockPrisma.trip.findMany).not.toHaveBeenCalled();
    });

    it('should use singular "trip" for single trip in series', async () => {
      mockPrisma.tripSeries.findMany.mockResolvedValue([
        {
          id: 2,
          name: 'Solo Series',
          description: null,
          updatedAt: new Date(),
          _count: { trips: 1 },
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'solo',
        type: 'trip-series',
        limit: '20',
      });

      expect(result.results[0].subtitle).toBe('1 trip');
    });
  });

  // ============================================================
  // SRC-007: Search returns empty results
  // ============================================================
  describe('SRC-007: Search returns empty results', () => {
    it('should return empty results when nothing matches', async () => {
      const result = await searchService.globalSearch(1, {
        q: 'nonexistent-query-xyz',
        type: 'all',
        limit: '20',
      });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ============================================================
  // SRC-008: Search respects limit parameter
  // ============================================================
  describe('SRC-008: Search respects limit parameter', () => {
    it('should limit results to specified count', async () => {
      const manyTrips = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        title: `Trip ${i + 1}`,
        description: null,
        status: 'Completed',
        tripType: null,
        startDate: new Date(`2024-0${Math.min(i + 1, 9)}-01`),
        updatedAt: new Date(),
      }));
      mockPrisma.trip.findMany.mockResolvedValue(manyTrips);

      const result = await searchService.globalSearch(1, {
        q: 'trip',
        type: 'trip',
        limit: '5',
      });

      expect(result.results.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================
  // SRC-009: Search results are sorted by date
  // ============================================================
  describe('SRC-009: Search results are sorted by date', () => {
    it('should sort results by date descending (newest first)', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([
        {
          id: 1,
          title: 'Old Trip',
          description: null,
          status: 'Completed',
          tripType: null,
          startDate: new Date('2023-01-01'),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.location.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'New Location',
          address: null,
          notes: null,
          tripId: 2,
          visitDatetime: new Date('2024-06-01'),
          updatedAt: new Date(),
          trip: { title: 'Recent Trip' },
        },
      ]);

      const result = await searchService.globalSearch(1, {
        q: 'test',
        type: 'all',
        limit: '20',
      });

      if (result.results.length === 2) {
        const firstDate = result.results[0].date
          ? new Date(result.results[0].date).getTime()
          : 0;
        const secondDate = result.results[1].date
          ? new Date(result.results[1].date).getTime()
          : 0;
        expect(firstDate).toBeGreaterThanOrEqual(secondDate);
      }
    });
  });
});
