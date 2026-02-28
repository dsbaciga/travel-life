/**
 * Backup Service Tests
 *
 * Test cases:
 * - BKP-001: createBackup generates correct JSON structure with version and exportDate
 * - BKP-002: createBackup includes user settings (timezone, API keys)
 * - BKP-003: createBackup includes tags and companions
 * - BKP-004: createBackup includes trips with all related entities
 * - BKP-005: createBackup includes location categories
 * - BKP-006: createBackup includes global checklists
 * - BKP-007: createBackup includes travel documents with masked document numbers
 * - BKP-008: createBackup includes trip series
 * - BKP-009: createBackup throws 404 when user not found
 * - BKP-010: createBackup throws 500 on database error
 * - BKP-011: createBackup handles trips with no related data
 * - BKP-012: createBackup batches trip loading for large datasets
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock @prisma/client BEFORE any imports that depend on it
jest.mock('@prisma/client', () => {
  class MockDecimal {
    private value: string;
    constructor(value: string | number) {
      this.value = String(value);
    }
    toString(): string { return this.value; }
    toNumber(): number { return parseFloat(this.value); }
    valueOf(): number { return this.toNumber(); }
  }
  return {
    Prisma: { Decimal: MockDecimal },
  };
});

// Mock the database config
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  trip: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  tripTag: {
    findMany: jest.fn(),
  },
  travelCompanion: {
    findMany: jest.fn(),
  },
  locationCategory: {
    findMany: jest.fn(),
  },
  checklist: {
    findMany: jest.fn(),
  },
  travelDocument: {
    findMany: jest.fn(),
  },
  tripSeries: {
    findMany: jest.fn(),
  },
  photo: {
    findMany: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock the maskDocumentNumber function
jest.mock('../../types/travelDocument.types', () => ({
  maskDocumentNumber: jest.fn((num: string | null) => {
    if (!num) return null;
    return '****' + num.slice(-4);
  }),
}));

// Import the service after all mocks
import { createBackup } from '../backup.service';

describe('BackupService', () => {
  const mockUser = {
    username: 'testuser',
    email: 'test@example.com',
    timezone: 'America/New_York',
    activityCategories: [{ name: 'Sightseeing', emoji: 'museum' }],
    tripTypes: [{ name: 'Vacation', emoji: 'palm_tree' }],
    immichApiUrl: 'http://localhost:2283',
    immichApiKey: 'immich-key',
    weatherApiKey: 'weather-key',
    aviationstackApiKey: 'aviation-key',
    openrouteserviceApiKey: 'ors-key',
  };

  const mockTags = [
    { name: 'Beach', color: '#0000ff', textColor: '#ffffff' },
    { name: 'City', color: '#ff0000', textColor: '#ffffff' },
  ];

  const mockCompanions = [
    {
      name: 'John',
      email: 'john@example.com',
      phone: null,
      notes: null,
      relationship: 'friend',
      isMyself: false,
      avatarUrl: null,
      dietaryPreferences: ['vegetarian'],
    },
  ];

  const mockLocationCategories = [
    { name: 'Restaurant', icon: 'utensils', color: '#ff9900', isDefault: false },
  ];

  const mockChecklists = [
    {
      name: 'Packing List',
      description: 'Things to pack',
      type: 'packing',
      isDefault: true,
      sortOrder: 0,
      items: [
        { name: 'Passport', description: null, isChecked: false, isDefault: true, sortOrder: 0, metadata: null, checkedAt: null },
      ],
    },
  ];

  const mockTravelDocuments = [
    {
      type: 'PASSPORT',
      issuingCountry: 'US',
      documentNumber: 'AB1234567',
      issueDate: new Date('2020-01-01'),
      expiryDate: new Date('2030-01-01'),
      name: 'Main Passport',
      notes: null,
      isPrimary: true,
      alertDaysBefore: 180,
    },
  ];

  const mockTripSeries = [
    { id: 1, name: 'Europe Series', description: 'Annual trips to Europe' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock returns
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.tripTag.findMany.mockResolvedValue(mockTags);
    mockPrisma.travelCompanion.findMany.mockResolvedValue(mockCompanions);
    mockPrisma.locationCategory.findMany.mockResolvedValue(mockLocationCategories);
    mockPrisma.checklist.findMany.mockResolvedValue(mockChecklists);
    mockPrisma.travelDocument.findMany.mockResolvedValue(mockTravelDocuments);
    mockPrisma.tripSeries.findMany.mockResolvedValue(mockTripSeries);
    mockPrisma.trip.findMany.mockResolvedValue([]); // No trips by default
    mockPrisma.photo.findMany.mockResolvedValue([]); // No photos by default
  });

  describe('createBackup', () => {
    it('BKP-001: generates correct JSON structure with version and exportDate', async () => {
      const result = await createBackup(1);

      expect(result.version).toBe('1.2.0');
      expect(result.exportDate).toBeDefined();
      expect(new Date(result.exportDate).getTime()).not.toBeNaN();
    });

    it('BKP-002: includes user settings', async () => {
      const result = await createBackup(1);

      expect(result.user.username).toBe('testuser');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.timezone).toBe('America/New_York');
      expect(result.user.immichApiUrl).toBe('http://localhost:2283');
      expect(result.user.immichApiKey).toBe('immich-key');
      expect(result.user.weatherApiKey).toBe('weather-key');
    });

    it('BKP-003: includes tags and companions', async () => {
      const result = await createBackup(1);

      expect(result.tags).toHaveLength(2);
      expect(result.tags[0].name).toBe('Beach');
      expect(result.tags[1].name).toBe('City');

      expect(result.companions).toHaveLength(1);
      expect(result.companions[0].name).toBe('John');
      expect(result.companions[0].dietaryPreferences).toEqual(['vegetarian']);
    });

    it('BKP-004: includes trips with all related entities', async () => {
      // Mock trip IDs batch
      mockPrisma.trip.findMany.mockResolvedValueOnce([{ id: 1 }]);

      // Mock full trip data
      const fullTrip = {
        id: 1,
        title: 'Italy Trip',
        description: 'Visit Rome and Florence',
        startDate: '2024-07-01',
        endDate: '2024-07-15',
        timezone: 'Europe/Rome',
        status: 'Planning',
        privacyLevel: 'Private',
        coverPhotoId: null,
        bannerPhotoId: null,
        addToPlacesVisited: true,
        tripType: 'Vacation',
        tripTypeEmoji: 'palm_tree',
        seriesId: null,
        seriesOrder: null,
        locations: [
          { id: 1, name: 'Colosseum', latitude: 41.8902, longitude: 12.4922, category: { name: 'Sightseeing', icon: 'museum', color: '#ff0000', isDefault: true }, children: [] },
        ],
        photos: [],
        activities: [
          { id: 1, parentId: null, name: 'Visit Colosseum', description: null, category: 'Sightseeing', allDay: false, startTime: '2024-07-02T09:00:00Z', endTime: '2024-07-02T12:00:00Z', timezone: 'Europe/Rome', cost: 16, currency: 'EUR', bookingUrl: null, bookingReference: null, notes: null, manualOrder: null },
        ],
        transportation: [
          {
            type: 'flight',
            startLocationId: null,
            startLocationText: 'JFK',
            endLocationId: null,
            endLocationText: 'FCO',
            scheduledStart: '2024-07-01T08:00:00Z',
            scheduledEnd: '2024-07-01T20:00:00Z',
            startTimezone: 'America/New_York',
            endTimezone: 'Europe/Rome',
            actualStart: null,
            actualEnd: null,
            company: 'Alitalia',
            referenceNumber: 'AZ609',
            seatNumber: '14A',
            bookingReference: 'ABC123',
            bookingUrl: null,
            cost: 800,
            currency: 'USD',
            status: 'confirmed',
            delayMinutes: null,
            notes: null,
            connectionGroupId: null,
            isAutoGenerated: false,
            calculatedDistance: null,
            calculatedDuration: null,
            distanceSource: null,
            flightTracking: { flightNumber: 'AZ609', airlineCode: 'AZ', status: 'scheduled', gate: 'B22', terminal: '1', baggageClaim: null },
          },
        ],
        lodging: [
          { id: 1, type: 'hotel', name: 'Hotel Roma', address: 'Via Roma 1', checkInDate: '2024-07-01', checkOutDate: '2024-07-15', timezone: 'Europe/Rome', confirmationNumber: 'HTL123', bookingUrl: null, cost: 2000, currency: 'EUR', notes: null },
        ],
        journalEntries: [
          { date: '2024-07-01', title: 'Arrival Day', content: 'Arrived in Rome!', entryType: 'daily', mood: 'happy', weatherNotes: null },
        ],
        photoAlbums: [
          { name: 'Rome Photos', description: null, coverPhotoId: null, photoAssignments: [] },
        ],
        weatherData: [
          { locationId: 1, date: '2024-07-01', temperatureHigh: 90, temperatureLow: 72, conditions: 'sunny', precipitation: null, humidity: 55, windSpeed: 8 },
        ],
        tagAssignments: [{ tag: { name: 'City' } }],
        companionAssignments: [{ companion: { name: 'John' } }],
        checklists: [
          { name: 'Trip Packing', description: null, type: 'packing', isDefault: false, sortOrder: 0, items: [] },
        ],
        entityLinks: [
          { sourceType: 'ACTIVITY', sourceId: 1, targetType: 'LOCATION', targetId: 1, relationship: 'OCCURRED_AT', sortOrder: null, notes: null },
        ],
        languages: [
          { languageCode: 'it', language: 'Italian' },
        ],
      };

      mockPrisma.trip.findUnique.mockResolvedValue(fullTrip);

      const result = await createBackup(1);

      expect(result.trips).toHaveLength(1);
      const trip = result.trips[0];
      expect(trip.title).toBe('Italy Trip');
      expect(trip.locations).toHaveLength(1);
      expect(trip.activities).toHaveLength(1);
      expect(trip.transportation).toHaveLength(1);
      expect(trip.transportation![0].flightTracking).toBeDefined();
      expect(trip.lodging).toHaveLength(1);
      expect(trip.journalEntries).toHaveLength(1);
      expect(trip.tags).toEqual(['City']);
      expect(trip.companions).toEqual(['John']);
      expect(trip.entityLinks).toHaveLength(1);
      expect(trip.tripLanguages).toHaveLength(1);
    });

    it('BKP-005: includes location categories', async () => {
      const result = await createBackup(1);

      expect(result.locationCategories).toHaveLength(1);
      expect(result.locationCategories[0].name).toBe('Restaurant');
    });

    it('BKP-006: includes global checklists', async () => {
      const result = await createBackup(1);

      expect(result.checklists).toHaveLength(1);
      expect(result.checklists[0].name).toBe('Packing List');
      expect(result.checklists[0].items).toHaveLength(1);
    });

    it('BKP-007: includes travel documents with masked numbers', async () => {
      const result = await createBackup(1);

      expect(result.travelDocuments).toBeDefined();
      expect(result.travelDocuments).toHaveLength(1);
      expect(result.travelDocuments![0].type).toBe('PASSPORT');
      expect(result.travelDocuments![0].documentNumber).toBe('****4567');
    });

    it('BKP-008: includes trip series', async () => {
      const result = await createBackup(1);

      expect(result.tripSeries).toBeDefined();
      expect(result.tripSeries).toHaveLength(1);
      expect(result.tripSeries![0].name).toBe('Europe Series');
    });

    it('BKP-009: throws 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(createBackup(999)).rejects.toThrow('User not found');
    });

    it('BKP-010: throws 500 on database error with specific message', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB connection failed'));

      await expect(createBackup(1)).rejects.toThrow('Failed to create backup: DB connection failed');
    });

    it('BKP-011: handles empty data (no trips, tags, companions)', async () => {
      mockPrisma.tripTag.findMany.mockResolvedValue([]);
      mockPrisma.travelCompanion.findMany.mockResolvedValue([]);
      mockPrisma.locationCategory.findMany.mockResolvedValue([]);
      mockPrisma.checklist.findMany.mockResolvedValue([]);
      mockPrisma.travelDocument.findMany.mockResolvedValue([]);
      mockPrisma.tripSeries.findMany.mockResolvedValue([]);

      const result = await createBackup(1);

      expect(result.trips).toHaveLength(0);
      expect(result.tags).toHaveLength(0);
      expect(result.companions).toHaveLength(0);
      expect(result.locationCategories).toHaveLength(0);
      expect(result.checklists).toHaveLength(0);
    });
  });
});
