/**
 * Restore Service Tests
 *
 * Test cases:
 * - RST-001: restoreFromBackup validates backup version
 * - RST-002: restoreFromBackup rejects unsupported backup version
 * - RST-003: restoreFromBackup clears existing data when option is set
 * - RST-004: restoreFromBackup imports tags correctly
 * - RST-005: restoreFromBackup imports companions correctly
 * - RST-006: restoreFromBackup imports trips with all related entities
 * - RST-007: restoreFromBackup maps old IDs to new IDs for entity links
 * - RST-008: restoreFromBackup handles transaction rollback on error
 * - RST-009: restoreFromBackup imports travel documents (v1.1.0)
 * - RST-010: restoreFromBackup imports trip series (v1.2.0)
 * - RST-011: restoreFromBackup skips photos when importPhotos is false
 * - RST-012: restoreFromBackup returns accurate stats
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

// Transaction mock that passes the mock prisma as tx
const mockTx = {
  user: { update: jest.fn(), findUnique: jest.fn() },
  // SavedLink.tripId is SetNull rather than Cascade, so clearUserData has to
  // remove saved links explicitly.
  savedLink: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  trip: {
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  tripTag: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  travelCompanion: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  locationCategory: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  // Items themselves go via the trip cascade; the user-level type registry does not.
  customItemType: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  customItem: {
    create: jest.fn(),
  },
  checklist: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  travelDocument: {
    create: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  },
  tripSeries: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  location: {
    create: jest.fn(),
    update: jest.fn(),
  },
  photo: {
    create: jest.fn(),
  },
  activity: {
    create: jest.fn(),
    update: jest.fn(),
  },
  transportation: {
    create: jest.fn(),
  },
  flightTracking: {
    create: jest.fn(),
  },
  lodging: {
    create: jest.fn(),
  },
  journalEntry: {
    create: jest.fn(),
  },
  photoAlbum: {
    create: jest.fn(),
  },
  photoAlbumAssignment: {
    create: jest.fn(),
  },
  weatherData: {
    create: jest.fn(),
    upsert: jest.fn(),
  },
  tripTagAssignment: {
    create: jest.fn(),
  },
  tripCompanion: {
    create: jest.fn(),
  },
  entityLink: {
    create: jest.fn(),
  },
  tripLanguage: {
    create: jest.fn(),
  },
  foodLogEntry: {
    create: jest.fn(),
  },
  tripExpense: {
    create: jest.fn(),
  },
  tripEmergencyInfo: {
    create: jest.fn(),
  },
};

const mockPrisma = {
  $transaction: jest.fn((callback: unknown) => {
    if (typeof callback === 'function') {
      return (callback as (tx: typeof mockTx) => Promise<unknown>)(mockTx);
    }
    return Promise.resolve(callback);
  }),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Import the service after all mocks
import { restoreFromBackup } from '../restore.service';
import { BackupData } from '../../types/backup.types';

describe('RestoreService', () => {
  // Minimal valid backup
  const minimalBackup: BackupData = {
    version: '1.2.0',
    exportDate: '2024-01-15T00:00:00Z',
    user: {
      username: 'testuser',
      email: 'test@example.com',
      timezone: 'America/New_York',
      activityCategories: [{ name: 'Sightseeing', emoji: 'museum' }],
      immichApiUrl: null,
      immichApiKey: null,
      weatherApiKey: null,
    },
    tags: [],
    companions: [],
    locationCategories: [],
    checklists: [],
    trips: [],
  };

  // Full backup with trips and related data
  const fullBackup: BackupData = {
    ...minimalBackup,
    tags: [
      { name: 'Beach', color: '#0000ff', textColor: '#ffffff' },
    ],
    companions: [
      { name: 'John', email: 'john@example.com', relationship: 'friend' },
    ],
    locationCategories: [
      { name: 'Restaurant', icon: 'utensils', color: '#ff9900', isDefault: false },
    ],
    checklists: [
      {
        name: 'Packing List',
        description: null,
        type: 'packing',
        items: [
          { name: 'Passport', isChecked: false },
        ],
      },
    ],
    travelDocuments: [
      {
        type: 'PASSPORT',
        issuingCountry: 'US',
        documentNumber: '****4567',
        name: 'Main Passport',
        isPrimary: true,
      },
    ],
    tripSeries: [
      { id: 1, name: 'Europe Series', description: 'Annual Europe trips' },
    ],
    trips: [
      {
        title: 'Italy Trip',
        description: 'Visit Rome',
        startDate: '2024-07-01',
        endDate: '2024-07-15',
        timezone: 'Europe/Rome',
        status: 'Planning',
        privacyLevel: 'Private',
        locations: [
          { id: 1, name: 'Colosseum', address: 'Rome', latitude: 41.89, longitude: 12.49 },
        ],
        photos: [
          { id: 1, source: 'local', localPath: '/photos/rome.jpg', caption: 'Rome view' },
        ],
        activities: [
          { id: 1, name: 'Visit Colosseum', startTime: '2024-07-02T09:00:00Z', endTime: '2024-07-02T12:00:00Z' },
        ],
        transportation: [
          {
            type: 'flight',
            startLocationText: 'JFK',
            endLocationText: 'FCO',
            scheduledStart: '2024-07-01T08:00:00Z',
            scheduledEnd: '2024-07-01T20:00:00Z',
            company: 'Alitalia',
            referenceNumber: 'AZ609',
            flightTracking: {
              flightNumber: 'AZ609',
              airlineCode: 'AZ',
              status: 'scheduled',
            },
          },
        ],
        lodging: [
          {
            type: 'hotel',
            name: 'Hotel Roma',
            checkInDate: '2024-07-01',
            checkOutDate: '2024-07-15',
          },
        ],
        journalEntries: [
          { content: 'Arrived in Rome!', entryType: 'daily' },
        ],
        photoAlbums: [
          { name: 'Rome Photos', photos: [{ photoId: 1, sortOrder: 0 }] },
        ],
        weatherData: [
          { date: '2024-07-01', temperatureHigh: 90, temperatureLow: 72, conditions: 'sunny' },
        ],
        tags: ['Beach'],
        companions: ['John'],
        checklists: [
          { name: 'Trip Packing', type: 'packing', items: [] },
        ],
        entityLinks: [
          { sourceType: 'ACTIVITY', sourceId: 1, targetType: 'LOCATION', targetId: 1, relationship: 'OCCURRED_AT' },
        ],
        tripLanguages: [
          { languageCode: 'it', language: 'Italian' },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset $transaction mock
    mockPrisma.$transaction.mockImplementation((callback: unknown) => {
      if (typeof callback === 'function') {
        return (callback as (tx: typeof mockTx) => Promise<unknown>)(mockTx);
      }
      return Promise.resolve(callback);
    });

    // Setup default mock returns for create operations
    let tagIdCounter = 100;
    mockTx.tripTag.create.mockImplementation(() =>
      Promise.resolve({ id: tagIdCounter++, name: 'tag' })
    );

    let companionIdCounter = 200;
    mockTx.travelCompanion.create.mockImplementation(() =>
      Promise.resolve({ id: companionIdCounter++, name: 'companion' })
    );

    let locationCategoryIdCounter = 300;
    mockTx.locationCategory.create.mockImplementation(() =>
      Promise.resolve({ id: locationCategoryIdCounter++, name: 'category' })
    );

    mockTx.checklist.create.mockResolvedValue({ id: 1 });

    mockTx.travelDocument.findFirst.mockResolvedValue(null); // No existing docs
    mockTx.travelDocument.create.mockResolvedValue({ id: 1 });

    let seriesIdCounter = 400;
    mockTx.tripSeries.create.mockImplementation(() =>
      Promise.resolve({ id: seriesIdCounter++ })
    );

    let tripIdCounter = 1;
    mockTx.trip.create.mockImplementation(() =>
      Promise.resolve({ id: tripIdCounter++ })
    );

    let locationIdCounter = 10;
    mockTx.location.create.mockImplementation(() =>
      Promise.resolve({ id: locationIdCounter++ })
    );

    let photoIdCounter = 50;
    mockTx.photo.create.mockImplementation(() =>
      Promise.resolve({ id: photoIdCounter++ })
    );

    let activityIdCounter = 60;
    mockTx.activity.create.mockImplementation(() =>
      Promise.resolve({ id: activityIdCounter++ })
    );

    let transportationIdCounter = 70;
    mockTx.transportation.create.mockImplementation(() =>
      Promise.resolve({ id: transportationIdCounter++ })
    );

    mockTx.flightTracking.create.mockResolvedValue({ id: 1 });

    let lodgingIdCounter = 80;
    mockTx.lodging.create.mockImplementation(() =>
      Promise.resolve({ id: lodgingIdCounter++ })
    );

    mockTx.journalEntry.create.mockResolvedValue({ id: 1 });
    mockTx.photoAlbum.create.mockResolvedValue({ id: 1 });
    mockTx.photoAlbumAssignment.create.mockResolvedValue({ id: 1 });
    mockTx.weatherData.create.mockResolvedValue({ id: 1 });
    mockTx.tripTagAssignment.create.mockResolvedValue({ id: 1 });
    mockTx.tripCompanion.create.mockResolvedValue({ id: 1 });
    mockTx.entityLink.create.mockResolvedValue({ id: 1 });
    mockTx.tripLanguage.create.mockResolvedValue({ id: 1 });
    mockTx.foodLogEntry.create.mockResolvedValue({ id: 1 });
    mockTx.tripExpense.create.mockResolvedValue({ id: 1 });
    mockTx.tripEmergencyInfo.create.mockResolvedValue({ id: 1 });
    mockTx.savedLink.create.mockResolvedValue({ id: 1 });
    mockTx.customItem.create.mockResolvedValue({ id: 1 });
    mockTx.customItemType.create.mockResolvedValue({ id: 1 });
    mockTx.user.update.mockResolvedValue({});
    mockTx.trip.update.mockResolvedValue({});
    mockTx.location.update.mockResolvedValue({});
    mockTx.activity.update.mockResolvedValue({});

    // deleteMany returns
    mockTx.trip.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.tripTag.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.travelCompanion.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.locationCategory.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.customItemType.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.checklist.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.travelDocument.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.tripSeries.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.savedLink.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe('restoreFromBackup', () => {
    it('RST-001: validates and accepts supported backup version', async () => {
      const result = await restoreFromBackup(1, minimalBackup);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Data restored successfully');
    });

    it('RST-002: rejects unsupported backup version', async () => {
      // The version value is deliberately unsupported -- that is the point of the
      // test. It is still a structurally valid BackupData, so it needs no cast.
      const invalidBackup: BackupData = { ...minimalBackup, version: '99.0.0' };

      await expect(
        restoreFromBackup(1, invalidBackup)
      ).rejects.toThrow('Incompatible backup version');
    });

    it('RST-003: clears existing data when option is set', async () => {
      await restoreFromBackup(1, minimalBackup, {
        clearExistingData: true,
        importPhotos: true,
      });

      expect(mockTx.trip.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(mockTx.tripTag.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(mockTx.travelCompanion.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(mockTx.locationCategory.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
    });

    it('RST-004: does not clear data when clearExistingData is false', async () => {
      await restoreFromBackup(1, minimalBackup, {
        clearExistingData: false,
        importPhotos: true,
      });

      expect(mockTx.trip.deleteMany).not.toHaveBeenCalled();
    });

    it('RST-005: imports tags correctly', async () => {
      const backup: BackupData = {
        ...minimalBackup,
        tags: [
          { name: 'Beach', color: '#0000ff', textColor: '#ffffff' },
          { name: 'Mountain', color: '#00ff00' },
        ],
      };

      const result = await restoreFromBackup(1, backup);

      expect(mockTx.tripTag.create).toHaveBeenCalledTimes(2);
      expect(result.stats.tagsImported).toBe(2);
    });

    it('RST-006: imports companions correctly', async () => {
      const backup: BackupData = {
        ...minimalBackup,
        companions: [
          { name: 'John', email: 'john@example.com', relationship: 'friend' },
        ],
      };

      const result = await restoreFromBackup(1, backup);

      expect(mockTx.travelCompanion.create).toHaveBeenCalledTimes(1);
      expect(result.stats.companionsImported).toBe(1);
    });

    it('RST-015: restores a backed-up default category as an editable user category', async () => {
      // Regression: restore used to copy `isDefault` straight out of the backup while
      // also stamping the row with `userId`. location.service updateCategory and
      // deleteCategory both look the row up with `{ id, userId, isDefault: false }`, so a
      // restored `isDefault: true` row could never be edited or deleted by its owner --
      // one backup round-trip froze the user's categories for good.
      const backup: BackupData = {
        ...minimalBackup,
        locationCategories: [
          { name: 'Restaurant', icon: 'utensils', color: '#ff9900', isDefault: true },
        ],
      };

      await restoreFromBackup(1, backup);

      expect(mockTx.locationCategory.create).toHaveBeenCalledTimes(1);
      const created = (mockTx.locationCategory.create.mock.calls[0] as [
        { data: { userId: number; name: string; isDefault: boolean } },
      ])[0].data;

      // The row is user-owned, so it must not claim to be a system default.
      expect(created).toMatchObject({ userId: 1, name: 'Restaurant', isDefault: false });

      // And it must satisfy the exact predicate updateCategory/deleteCategory filter on,
      // which is what "the user can still edit this" actually means.
      expect(created.userId === 1 && created.isDefault === false).toBe(true);
    });

    it('RST-007: imports trips with all related entities', async () => {
      const result = await restoreFromBackup(1, fullBackup);

      expect(result.success).toBe(true);
      expect(result.stats.tripsImported).toBe(1);
      expect(result.stats.locationsImported).toBe(1);
      expect(result.stats.photosImported).toBe(1);
      expect(result.stats.activitiesImported).toBe(1);
      expect(result.stats.transportationImported).toBe(1);
      expect(result.stats.lodgingImported).toBe(1);
      expect(result.stats.journalEntriesImported).toBe(1);
      expect(result.stats.tripLanguagesImported).toBe(1);
    });

    it('RST-016: restores food log entries, remapping activity/location links', async () => {
      const trip = fullBackup.trips[0];
      const backup: BackupData = {
        ...fullBackup,
        trips: [
          {
            ...trip,
            foodLogEntries: [
              { restaurantName: 'Trattoria', dish: 'Carbonara', rating: 5, notes: 'Perfect', orderAgain: true, activityId: 1, locationId: 1 },
              { restaurantName: 'Cafe', dish: 'Espresso', rating: 3, activityId: 999, locationId: null },
            ],
          },
        ],
      };

      await restoreFromBackup(1, backup);

      expect(mockTx.foodLogEntry.create).toHaveBeenCalledTimes(2);
      const first = mockTx.foodLogEntry.create.mock.calls[0][0] as { data: Record<string, unknown> };
      // old activity id 1 / location id 1 map to the freshly created ids
      expect(first.data).toMatchObject({
        restaurantName: 'Trattoria',
        dish: 'Carbonara',
        rating: 5,
        orderAgain: true,
        activityId: 60,
        locationId: 10,
      });
      const second = mockTx.foodLogEntry.create.mock.calls[1][0] as { data: Record<string, unknown> };
      // an unresolvable link is dropped but the entry survives
      expect(second.data).toMatchObject({ activityId: null, locationId: null, orderAgain: false, notes: null });
    });

    it('RST-008: imports entity links with mapped IDs', async () => {
      await restoreFromBackup(1, fullBackup);

      // Entity link should be created with new IDs (not original IDs)
      expect(mockTx.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceType: 'ACTIVITY',
            targetType: 'LOCATION',
            relationship: 'OCCURRED_AT',
          }),
        })
      );
    });

    it('RST-009: imports flight tracking data', async () => {
      await restoreFromBackup(1, fullBackup);

      expect(mockTx.flightTracking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            flightNumber: 'AZ609',
            airlineCode: 'AZ',
            status: 'scheduled',
          }),
        })
      );
    });

    it('RST-010: imports travel documents (v1.1.0)', async () => {
      const result = await restoreFromBackup(1, fullBackup);

      expect(mockTx.travelDocument.create).toHaveBeenCalled();
      expect(result.stats.travelDocumentsImported).toBe(1);
    });

    it('RST-011: imports trip series (v1.2.0)', async () => {
      await restoreFromBackup(1, fullBackup);

      expect(mockTx.tripSeries.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            name: 'Europe Series',
          }),
        })
      );
    });

    it('RST-012: skips photos when importPhotos is false', async () => {
      const result = await restoreFromBackup(1, fullBackup, {
        clearExistingData: true,
        importPhotos: false,
      });

      expect(mockTx.photo.create).not.toHaveBeenCalled();
      expect(result.stats.photosImported).toBe(0);
    });

    it('RST-013: handles transaction error with specific error message', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(
        restoreFromBackup(1, minimalBackup)
      ).rejects.toThrow('Failed to restore from backup: Transaction failed');
    });

    it('RST-014: accepts v1.0.0 and v1.1.0 backup versions', async () => {
      const v100Backup: BackupData = { ...minimalBackup, version: '1.0.0' };
      const result100 = await restoreFromBackup(1, v100Backup);
      expect(result100.success).toBe(true);

      jest.clearAllMocks();
      // Reset mocks for second call
      mockPrisma.$transaction.mockImplementation((callback: unknown) => {
        if (typeof callback === 'function') {
          return (callback as (tx: typeof mockTx) => Promise<unknown>)(mockTx);
        }
        return Promise.resolve(callback);
      });
      mockTx.user.update.mockResolvedValue({});
      mockTx.trip.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.tripTag.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.travelCompanion.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.locationCategory.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.checklist.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.travelDocument.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.tripSeries.deleteMany.mockResolvedValue({ count: 0 });

      const v110Backup: BackupData = { ...minimalBackup, version: '1.1.0' };
      const result110 = await restoreFromBackup(1, v110Backup);
      expect(result110.success).toBe(true);
    });

    it('RST-016: restores v1.6.0 fields (expenses, emergencyInfo, unfiledSavedLinks, FX snapshots, user/companion/trip fields)', async () => {
      const v160Backup: BackupData = {
        ...minimalBackup,
        version: '1.6.0',
        user: {
          ...minimalBackup.user,
          dietaryPreferences: ['vegan'],
          useCustomMapStyle: false,
          baseCurrency: 'EUR',
          preferredMapsApp: 'apple',
        },
        companions: [
          {
            name: 'Alice',
            medicalNotes: 'Penicillin allergy',
            allergies: ['penicillin', 'shellfish'],
          },
        ],
        unfiledSavedLinks: [
          {
            url: 'https://example.com/inbox',
            title: 'Inbox Link',
            source: 'EMAIL',
            metadataStatus: 'FETCHED',
          },
        ],
        trips: [
          {
            title: 'Japan 2026',
            status: 'Planned',
            privacyLevel: 'Private',
            archived: true,
            excludeFromAutoShare: true,
            budget: 4500,
            budgetCurrency: 'EUR',
            countryCode: 'JP',
            activities: [
              {
                id: 1,
                name: 'Sushi Lunch',
                cost: 3000,
                currency: 'JPY',
                exchangeRate: 0.0062,
                baseAmount: 18.6,
                baseCurrency: 'EUR',
                dietaryTags: ['fish'],
              },
            ],
            transportation: [
              {
                type: 'train',
                cost: 12000,
                currency: 'JPY',
                exchangeRate: 0.0062,
                baseAmount: 74.4,
                baseCurrency: 'EUR',
              },
            ],
            lodging: [
              {
                type: 'hotel',
                name: 'Tokyo Hotel',
                checkInDate: '2026-05-01',
                checkOutDate: '2026-05-05',
                cost: 40000,
                currency: 'JPY',
                exchangeRate: 0.0062,
                baseAmount: 248,
                baseCurrency: 'EUR',
              },
            ],
            customItems: [
              {
                name: 'SIM Card',
                cost: 3500,
                currency: 'JPY',
                exchangeRate: 0.0062,
                baseAmount: 21.7,
                baseCurrency: 'EUR',
              },
            ],
            expenses: [
              {
                description: 'Matcha Latte',
                category: 'food',
                amount: 600,
                currency: 'JPY',
                exchangeRate: 0.0062,
                baseAmount: 3.72,
                baseCurrency: 'EUR',
                date: '2026-05-02',
                notes: 'Uji cafe',
              },
            ],
            emergencyInfo: {
              insuranceProvider: 'Allianz',
              insurancePolicyNumber: 'ALZ-999',
              insuranceAssistancePhone: '+1-800-555-0100',
              embassyName: 'Embassy in Tokyo',
              embassyPhone: '+81-3-0000-0000',
              embassyAddress: 'Minato-ku, Tokyo',
              notes: 'Emergency contact on file',
            },
          },
        ],
      };

      const result = await restoreFromBackup(1, v160Backup);
      expect(result.success).toBe(true);
      expect(result.stats.savedLinksImported).toBe(1);

      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dietaryPreferences: ['vegan'],
            useCustomMapStyle: false,
            baseCurrency: 'EUR',
            preferredMapsApp: 'apple',
          }),
        })
      );

      expect(mockTx.travelCompanion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Alice',
            medicalNotes: 'Penicillin allergy',
            allergies: ['penicillin', 'shellfish'],
          }),
        })
      );

      expect(mockTx.savedLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            tripId: null,
            url: 'https://example.com/inbox',
          }),
        })
      );

      expect(mockTx.trip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Japan 2026',
            archived: true,
            excludeFromAutoShare: true,
            budgetCurrency: 'EUR',
            countryCode: 'JP',
          }),
        })
      );

      expect(mockTx.activity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Sushi Lunch',
            baseCurrency: 'EUR',
            dietaryTags: ['fish'],
          }),
        })
      );

      expect(mockTx.tripExpense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Matcha Latte',
            category: 'food',
            currency: 'JPY',
            baseCurrency: 'EUR',
            notes: 'Uji cafe',
          }),
        })
      );

      expect(mockTx.tripEmergencyInfo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            insuranceProvider: 'Allianz',
            insurancePolicyNumber: 'ALZ-999',
            embassyName: 'Embassy in Tokyo',
          }),
        })
      );
    });
  });
});
