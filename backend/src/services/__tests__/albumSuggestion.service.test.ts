/**
 * AlbumSuggestion Service Tests
 *
 * Test cases:
 * - AS-001: Get album suggestions - date-based grouping
 * - AS-002: Get album suggestions - location-based grouping
 * - AS-003: Get album suggestions - fewer than 3 photos returns empty
 * - AS-004: Get album suggestions - trip not found
 * - AS-005: Accept a suggestion and create an album
 * - AS-006: Accept suggestion - photo ownership validation
 * - AS-007: Suggestions sorted by confidence
 * - AS-008: Maximum 5 suggestions returned
 */

// Mock @prisma/client for Decimal
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
}));

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
  },
  photo: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  photoAlbum: {
    create: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import albumSuggestionService from '../albumSuggestion.service';

describe('AlbumSuggestionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockPhoto = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    tripId: 1,
    filename: 'photo.jpg',
    filepath: '/uploads/photo.jpg',
    takenAt: new Date('2025-06-15T10:00:00Z'),
    latitude: null,
    longitude: null,
    description: null,
    ...overrides,
  });

  const createMockTrip = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 1,
    title: 'Test Trip',
    ...overrides,
  });

  // ============================================================
  // AS-001: Date-based grouping
  // ============================================================
  describe('AS-001: Date-based grouping', () => {
    it('should suggest albums based on time-clustered photos', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());

      // 4 photos taken within 2 hours of each other
      const photos = [
        createMockPhoto({ id: 1, takenAt: new Date('2025-06-15T10:00:00Z') }),
        createMockPhoto({ id: 2, takenAt: new Date('2025-06-15T10:30:00Z') }),
        createMockPhoto({ id: 3, takenAt: new Date('2025-06-15T11:00:00Z') }),
        createMockPhoto({ id: 4, takenAt: new Date('2025-06-15T11:30:00Z') }),
      ];

      mockPrisma.photo.findMany.mockResolvedValue(photos);

      const result = await albumSuggestionService.getAlbumSuggestions(1, 1);

      const dateSuggestions = result.filter(s => s.type === 'date');
      expect(dateSuggestions.length).toBeGreaterThanOrEqual(1);
      expect(dateSuggestions[0].photoIds.length).toBeGreaterThanOrEqual(3);
    });

    it('should not suggest albums from photos spread over many hours', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());

      // 3 photos taken 3 hours apart each (outside 2-hour window)
      const photos = [
        createMockPhoto({ id: 1, takenAt: new Date('2025-06-15T06:00:00Z') }),
        createMockPhoto({ id: 2, takenAt: new Date('2025-06-15T12:00:00Z') }),
        createMockPhoto({ id: 3, takenAt: new Date('2025-06-15T18:00:00Z') }),
      ];

      mockPrisma.photo.findMany.mockResolvedValue(photos);

      const result = await albumSuggestionService.getAlbumSuggestions(1, 1);

      // These should not be grouped since they are outside the 2-hour window
      const dateSuggestions = result.filter(s => s.type === 'date');
      // Each photo is beyond 2-hour window from the previous
      expect(dateSuggestions.length).toBe(0);
    });
  });

  // ============================================================
  // AS-002: Location-based grouping
  // ============================================================
  describe('AS-002: Location-based grouping', () => {
    it('should suggest albums based on nearby photo locations', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());

      // 4 photos taken at nearly the same location (within 500m)
      const photos = [
        createMockPhoto({ id: 1, latitude: 48.8584, longitude: 2.2945, takenAt: null }), // Eiffel Tower
        createMockPhoto({ id: 2, latitude: 48.8586, longitude: 2.2946, takenAt: null }),
        createMockPhoto({ id: 3, latitude: 48.8583, longitude: 2.2944, takenAt: null }),
        createMockPhoto({ id: 4, latitude: 48.8585, longitude: 2.2947, takenAt: null }),
      ];

      mockPrisma.photo.findMany.mockResolvedValue(photos);

      const result = await albumSuggestionService.getAlbumSuggestions(1, 1);

      const locationSuggestions = result.filter(s => s.type === 'location');
      expect(locationSuggestions.length).toBeGreaterThanOrEqual(1);
      expect(locationSuggestions[0].photoIds.length).toBeGreaterThanOrEqual(3);
    });

    it('should not group photos that are far apart', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());

      // 3 photos in very different locations
      const photos = [
        createMockPhoto({ id: 1, latitude: 48.8584, longitude: 2.2945, takenAt: null }), // Paris
        createMockPhoto({ id: 2, latitude: 40.7128, longitude: -74.0060, takenAt: null }), // NYC
        createMockPhoto({ id: 3, latitude: 35.6762, longitude: 139.6503, takenAt: null }), // Tokyo
      ];

      mockPrisma.photo.findMany.mockResolvedValue(photos);

      const result = await albumSuggestionService.getAlbumSuggestions(1, 1);

      const locationSuggestions = result.filter(s => s.type === 'location');
      expect(locationSuggestions.length).toBe(0);
    });
  });

  // ============================================================
  // AS-003: Fewer than 3 photos returns empty
  // ============================================================
  describe('AS-003: Fewer than 3 photos', () => {
    it('should return empty array when fewer than 3 photos', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.photo.findMany.mockResolvedValue([
        createMockPhoto({ id: 1 }),
        createMockPhoto({ id: 2 }),
      ]);

      const result = await albumSuggestionService.getAlbumSuggestions(1, 1);

      expect(result).toEqual([]);
    });

    it('should return empty array when no photos', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.photo.findMany.mockResolvedValue([]);

      const result = await albumSuggestionService.getAlbumSuggestions(1, 1);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // AS-004: Trip not found
  // ============================================================
  describe('AS-004: Trip not found', () => {
    it('should throw error when trip not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        albumSuggestionService.getAlbumSuggestions(1, 999)
      ).rejects.toThrow('Trip not found');
    });
  });

  // ============================================================
  // AS-005: Accept suggestion and create album
  // ============================================================
  describe('AS-005: Accept suggestion', () => {
    it('should create an album from a suggestion', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.photo.count.mockResolvedValue(3);
      mockPrisma.photoAlbum.create.mockResolvedValue({ id: 10 });

      const result = await albumSuggestionService.acceptSuggestion(1, 1, {
        name: 'June 15, 2025',
        photoIds: [1, 2, 3],
      });

      expect(result.albumId).toBe(10);
      expect(mockPrisma.photoAlbum.create).toHaveBeenCalledWith({
        data: {
          name: 'June 15, 2025',
          tripId: 1,
          photoAssignments: {
            create: [
              { photoId: 1, sortOrder: 0 },
              { photoId: 2, sortOrder: 1 },
              { photoId: 3, sortOrder: 2 },
            ],
          },
        },
      });
    });
  });

  // ============================================================
  // AS-006: Photo ownership validation
  // ============================================================
  describe('AS-006: Photo ownership validation', () => {
    it('should throw error when photos do not belong to trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());
      mockPrisma.photo.count.mockResolvedValue(2); // Only 2 out of 3 match

      await expect(
        albumSuggestionService.acceptSuggestion(1, 1, {
          name: 'Test Album',
          photoIds: [1, 2, 999],
        })
      ).rejects.toThrow('Some photos do not belong to this trip');
    });

    it('should throw error when trip not found on accept', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        albumSuggestionService.acceptSuggestion(1, 999, {
          name: 'Test',
          photoIds: [1],
        })
      ).rejects.toThrow('Trip not found');
    });
  });

  // ============================================================
  // AS-007: Suggestions sorted by confidence
  // ============================================================
  describe('AS-007: Suggestions sorted by confidence', () => {
    it('should return suggestions sorted by confidence descending', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());

      // Mix of date-clustered and location-clustered photos
      const photos = [
        // Cluster 1: Date cluster (3 photos)
        createMockPhoto({ id: 1, takenAt: new Date('2025-06-15T10:00:00Z'), latitude: null }),
        createMockPhoto({ id: 2, takenAt: new Date('2025-06-15T10:30:00Z'), latitude: null }),
        createMockPhoto({ id: 3, takenAt: new Date('2025-06-15T11:00:00Z'), latitude: null }),
        // Cluster 2: Location cluster (5 photos - higher confidence)
        createMockPhoto({ id: 4, latitude: 48.8584, longitude: 2.2945, takenAt: null }),
        createMockPhoto({ id: 5, latitude: 48.8585, longitude: 2.2946, takenAt: null }),
        createMockPhoto({ id: 6, latitude: 48.8583, longitude: 2.2944, takenAt: null }),
        createMockPhoto({ id: 7, latitude: 48.8584, longitude: 2.2945, takenAt: null }),
        createMockPhoto({ id: 8, latitude: 48.8586, longitude: 2.2947, takenAt: null }),
      ];

      mockPrisma.photo.findMany.mockResolvedValue(photos);

      const result = await albumSuggestionService.getAlbumSuggestions(1, 1);

      if (result.length >= 2) {
        expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
      }
    });
  });

  // ============================================================
  // AS-008: Maximum 5 suggestions
  // ============================================================
  describe('AS-008: Maximum 5 suggestions', () => {
    it('should return at most 5 suggestions', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip());

      // Create many photo clusters to generate > 5 suggestions
      const photos: ReturnType<typeof createMockPhoto>[] = [];
      let photoId = 1;

      // 8 separate date clusters of 3+ photos each
      for (let cluster = 0; cluster < 8; cluster++) {
        const baseTime = new Date('2025-06-01T00:00:00Z');
        baseTime.setDate(baseTime.getDate() + cluster);
        for (let j = 0; j < 4; j++) {
          const time = new Date(baseTime);
          time.setMinutes(time.getMinutes() + j * 15);
          photos.push(createMockPhoto({ id: photoId++, takenAt: time, latitude: null }));
        }
      }

      mockPrisma.photo.findMany.mockResolvedValue(photos);

      const result = await albumSuggestionService.getAlbumSuggestions(1, 1);

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});
