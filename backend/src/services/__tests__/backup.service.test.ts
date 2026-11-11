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
  customItemType: {
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
  savedLink: {
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
import { BACKUP_VERSION, BackupDataSchema } from '../../types/backup.types';

describe('BackupService', () => {
  const mockUser = {
    username: 'testuser',
    email: 'test@example.com',
    timezone: 'America/New_York',
    activityCategories: [{ name: 'Sightseeing', emoji: 'museum' }],
    tripTypes: [{ name: 'Vacation', emoji: 'palm_tree' }],
    dietaryPreferences: ['gluten-free'],
    useCustomMapStyle: false,
    baseCurrency: 'USD',
    preferredMapsApp: 'google',
    immichApiUrl: 'http://localhost:2283',
    immichApiKey: 'immich-key',
    weatherApiKey: 'weather-key',
    aviationstackApiKey: 'aviation-key',
    openrouteserviceApiKey: 'ors-key',
    llmApiKey: null,
    llmBaseUrl: null,
    llmModel: null,
    smtpPassword: 'smtp-secret',
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
      medicalNotes: 'Carries EpiPen',
      allergies: ['peanuts'],
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

  const mockUnfiledSavedLinks = [
    {
      url: 'https://example.com/inbox-guide',
      title: 'Inbox Guide',
      description: null,
      siteName: 'Example',
      imageUrl: null,
      notes: 'Read later',
      source: 'MANUAL',
      metadataStatus: 'FETCHED',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock returns
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.tripTag.findMany.mockResolvedValue(mockTags);
    mockPrisma.travelCompanion.findMany.mockResolvedValue(mockCompanions);
    mockPrisma.locationCategory.findMany.mockResolvedValue(mockLocationCategories);
    mockPrisma.customItemType.findMany.mockResolvedValue([]);
    mockPrisma.checklist.findMany.mockResolvedValue(mockChecklists);
    mockPrisma.travelDocument.findMany.mockResolvedValue(mockTravelDocuments);
    mockPrisma.tripSeries.findMany.mockResolvedValue(mockTripSeries);
    mockPrisma.savedLink.findMany.mockResolvedValue(mockUnfiledSavedLinks);
    mockPrisma.trip.findMany.mockResolvedValue([]); // No trips by default
    mockPrisma.photo.findMany.mockResolvedValue([]); // No photos by default
  });

  describe('createBackup', () => {
    it('BKP-001: generates correct JSON structure with version and exportDate', async () => {
      const result = await createBackup(1);

      // Asserted against the constant so a version bump does not fail this test;
      // the shape assertions below are what actually guard the format.
      expect(result.version).toBe(BACKUP_VERSION);
      expect(result.exportDate).toBeDefined();
      expect(new Date(result.exportDate).getTime()).not.toBeNaN();
    });

    it('BKP-002: includes non-secret user settings and masks all secret fields to null', async () => {
      const result = await createBackup(1);

      // Non-secret config travels with the backup
      expect(result.user.username).toBe('testuser');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.timezone).toBe('America/New_York');
      expect(result.user.immichApiUrl).toBe('http://localhost:2283');

      // SECURITY: secret fields must NEVER be exported as plaintext
      expect(result.user.immichApiKey).toBeNull();
      expect(result.user.weatherApiKey).toBeNull();
      expect(result.user.aviationstackApiKey).toBeNull();
      expect(result.user.openrouteserviceApiKey).toBeNull();
      expect(result.user.llmApiKey).toBeNull();
      expect(result.user.smtpPassword).toBeNull();
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

    it('BKP-013: includes food log entries on trips', async () => {
      mockPrisma.trip.findMany.mockResolvedValueOnce([{ id: 1 }]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        id: 1,
        title: 'Food Trip',
        locations: [],
        photos: [],
        activities: [],
        transportation: [],
        lodging: [],
        journalEntries: [],
        photoAlbums: [],
        weatherData: [],
        tagAssignments: [],
        companionAssignments: [],
        checklists: [],
        languages: [],
        foodLogEntries: [
          {
            restaurantName: 'Trattoria', dish: 'Carbonara', rating: 5, notes: null, orderAgain: true, activityId: 4, locationId: null,
            photos: [{ photoId: 12, sortOrder: 1 }],
          },
          { restaurantName: 'Cafe', dish: 'Flat white', rating: 4, notes: null, orderAgain: false, activityId: null, locationId: null },
        ],
      });

      const result = await createBackup(1);

      // Attached photos are exported by their (old) photo id so restore can remap them;
      // an entry with no photos exports an empty list rather than omitting the key.
      expect(result.trips[0].foodLogEntries).toEqual([
        {
          restaurantName: 'Trattoria', dish: 'Carbonara', rating: 5, notes: null, orderAgain: true, activityId: 4, locationId: null,
          photos: [{ photoId: 12, sortOrder: 1 }],
        },
        { restaurantName: 'Cafe', dish: 'Flat white', rating: 4, notes: null, orderAgain: false, activityId: null, locationId: null, photos: [] },
      ]);
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
      mockPrisma.savedLink.findMany.mockResolvedValue([]);

      const result = await createBackup(1);

      expect(result.trips).toHaveLength(0);
      expect(result.tags).toHaveLength(0);
      expect(result.companions).toHaveLength(0);
      expect(result.locationCategories).toHaveLength(0);
      expect(result.checklists).toHaveLength(0);
    });

    it('BKP-012: exports v1.6.0 fields (expenses, emergencyInfo, unfiledSavedLinks, FX snapshots, user/companion/trip fields)', async () => {
      mockPrisma.trip.findMany.mockResolvedValueOnce([{ id: 1 }]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        id: 1,
        title: 'Japan Trip',
        description: null,
        startDate: '2026-04-01',
        endDate: '2026-04-14',
        timezone: 'Asia/Tokyo',
        status: 'Planned',
        privacyLevel: 'Private',
        archived: true,
        excludeFromAutoShare: true,
        coverPhotoId: null,
        bannerPhotoId: null,
        addToPlacesVisited: true,
        tripType: 'Leisure',
        tripTypeEmoji: null,
        seriesId: null,
        seriesOrder: null,
        budget: 5000,
        budgetCurrency: 'USD',
        countryCode: 'JP',
        locations: [],
        photos: [],
        activities: [
          {
            id: 1,
            parentId: null,
            name: 'Ramen Dinner',
            description: null,
            category: 'Dining',
            allDay: false,
            startTime: null,
            endTime: null,
            timezone: 'Asia/Tokyo',
            cost: 1500,
            currency: 'JPY',
            exchangeRate: 0.0067,
            baseAmount: 10.05,
            baseCurrency: 'USD',
            bookingUrl: null,
            bookingReference: null,
            notes: null,
            manualOrder: null,
            dietaryTags: ['pork'],
          },
        ],
        transportation: [
          {
            type: 'train',
            startLocationId: null,
            startLocationText: 'Tokyo',
            endLocationId: null,
            endLocationText: 'Kyoto',
            scheduledStart: null,
            scheduledEnd: null,
            startTimezone: null,
            endTimezone: null,
            actualStart: null,
            actualEnd: null,
            company: 'JR',
            referenceNumber: null,
            seatNumber: null,
            bookingReference: null,
            bookingUrl: null,
            cost: 14000,
            currency: 'JPY',
            exchangeRate: 0.0067,
            baseAmount: 93.8,
            baseCurrency: 'USD',
            status: 'on_time',
            delayMinutes: null,
            notes: null,
            connectionGroupId: null,
            isAutoGenerated: false,
            calculatedDistance: null,
            calculatedDuration: null,
            distanceSource: null,
            flightTracking: null,
          },
        ],
        lodging: [
          {
            id: 1,
            type: 'hotel',
            name: 'Ryokan',
            address: null,
            checkInDate: '2026-04-01',
            checkOutDate: '2026-04-05',
            timezone: 'Asia/Tokyo',
            confirmationNumber: null,
            bookingUrl: null,
            cost: 50000,
            currency: 'JPY',
            exchangeRate: 0.0067,
            baseAmount: 335,
            baseCurrency: 'USD',
            notes: null,
          },
        ],
        journalEntries: [],
        photoAlbums: [],
        weatherData: [],
        tagAssignments: [],
        companionAssignments: [],
        checklists: [],
        entityLinks: [],
        languages: [],
        savedLinks: [],
        customItems: [
          {
            id: 1,
            name: 'Pocket WiFi',
            notes: null,
            allDay: false,
            startTime: null,
            endTime: null,
            timezone: null,
            locationId: null,
            cost: 8000,
            currency: 'JPY',
            exchangeRate: 0.0067,
            baseAmount: 53.6,
            baseCurrency: 'USD',
            url: null,
            confirmationNumber: null,
            type: { name: 'Gear' },
          },
        ],
        expenses: [
          {
            id: 10,
            description: 'Suica top-up',
            category: 'transportation',
            amount: 3000,
            currency: 'JPY',
            exchangeRate: 0.0067,
            baseAmount: 20.1,
            baseCurrency: 'USD',
            date: '2026-04-02',
            notes: 'At station',
          },
        ],
        emergencyInfo: {
          insuranceProvider: 'WorldNomads',
          insurancePolicyNumber: 'WN-12345',
          insuranceAssistancePhone: '+1-800-555-0199',
          embassyName: 'U.S. Embassy Tokyo',
          embassyPhone: '+81-3-3224-5000',
          embassyAddress: '1-10-5 Akasaka, Minato-ku',
          notes: 'Keep copy in daypack',
        },
      });

      const result = await createBackup(1);

      expect(result.version).toBe('1.6.0');
      expect(result.user.dietaryPreferences).toEqual(['gluten-free']);
      expect(result.user.useCustomMapStyle).toBe(false);
      expect(result.user.baseCurrency).toBe('USD');
      expect(result.user.preferredMapsApp).toBe('google');
      expect(result.companions[0].medicalNotes).toBe('Carries EpiPen');
      expect(result.companions[0].allergies).toEqual(['peanuts']);
      expect(result.unfiledSavedLinks).toHaveLength(1);
      expect(result.unfiledSavedLinks![0].url).toBe('https://example.com/inbox-guide');

      const trip = result.trips[0];
      expect(trip.archived).toBe(true);
      expect(trip.excludeFromAutoShare).toBe(true);
      expect(trip.budget).toBe(5000);
      expect(trip.budgetCurrency).toBe('USD');
      expect(trip.countryCode).toBe('JP');
      expect(trip.activities![0].dietaryTags).toEqual(['pork']);
      expect(trip.activities![0].exchangeRate).toBe(0.0067);
      expect(trip.transportation![0].baseAmount).toBe(93.8);
      expect(trip.lodging![0].baseCurrency).toBe('USD');
      expect(trip.customItems![0].exchangeRate).toBe(0.0067);
      expect(trip.expenses).toHaveLength(1);
      expect(trip.expenses![0].description).toBe('Suica top-up');
      expect(trip.emergencyInfo?.insuranceProvider).toBe('WorldNomads');

      // Validate that BackupDataSchema accepts the full v1.6.0 output
      expect(() => BackupDataSchema.parse(result)).not.toThrow();
    });
  });
});
