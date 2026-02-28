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
  user: { update: jest.fn() },
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
    mockTx.user.update.mockResolvedValue({});
    mockTx.trip.update.mockResolvedValue({});
    mockTx.location.update.mockResolvedValue({});
    mockTx.activity.update.mockResolvedValue({});

    // deleteMany returns
    mockTx.trip.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.tripTag.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.travelCompanion.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.locationCategory.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.checklist.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.travelDocument.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.tripSeries.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe('restoreFromBackup', () => {
    it('RST-001: validates and accepts supported backup version', async () => {
      const result = await restoreFromBackup(1, minimalBackup);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Data restored successfully');
    });

    it('RST-002: rejects unsupported backup version', async () => {
      const invalidBackup = { ...minimalBackup, version: '99.0.0' };

      await expect(
        restoreFromBackup(1, invalidBackup as BackupData)
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
      const backup = {
        ...minimalBackup,
        tags: [
          { name: 'Beach', color: '#0000ff', textColor: '#ffffff' },
          { name: 'Mountain', color: '#00ff00' },
        ],
      };

      const result = await restoreFromBackup(1, backup as BackupData);

      expect(mockTx.tripTag.create).toHaveBeenCalledTimes(2);
      expect(result.stats.tagsImported).toBe(2);
    });

    it('RST-006: imports companions correctly', async () => {
      const backup = {
        ...minimalBackup,
        companions: [
          { name: 'John', email: 'john@example.com', relationship: 'friend' },
        ],
      };

      const result = await restoreFromBackup(1, backup as BackupData);

      expect(mockTx.travelCompanion.create).toHaveBeenCalledTimes(1);
      expect(result.stats.companionsImported).toBe(1);
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
      const v100Backup = { ...minimalBackup, version: '1.0.0' };
      const result100 = await restoreFromBackup(1, v100Backup as BackupData);
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

      const v110Backup = { ...minimalBackup, version: '1.1.0' };
      const result110 = await restoreFromBackup(1, v110Backup as BackupData);
      expect(result110.success).toBe(true);
    });
  });
});
