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

const mockStat = jest.fn<(p: string) => Promise<{ isFile: () => boolean }>>();
const mockCopyFile = jest.fn<(a: string, b: string) => Promise<void>>();
const mockUnlink = jest.fn<(p: string) => Promise<void>>();
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    stat: (p: string) => mockStat(p),
    copyFile: (a: string, b: string) => mockCopyFile(a, b),
    unlink: (p: string) => mockUnlink(p),
  },
}));

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
    plus(other: { toNumber(): number } | number): MockDecimal {
      return new MockDecimal(this.toNumber() + (typeof other === 'number' ? other : other.toNumber()));
    }
  }
  return {
    Prisma: { Decimal: MockDecimal },
  };
});

// Transaction mock that passes the mock prisma as tx
const mockTx = {
  user: { update: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  $executeRaw: jest.fn(),
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
    findFirst: jest.fn(),
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
  loyaltyProgram: {
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
    update: jest.fn(),
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
  foodLogEntryPhoto: {
    create: jest.fn(),
  },
  bookingDeadline: {
    create: jest.fn(),
  },
  tripStop: {
    create: jest.fn(),
  },
  tripExpense: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  tripEmergencyInfo: {
    create: jest.fn(),
  },
};

const mockPrisma = {
  tripExpense: { findMany: jest.fn(async () => [] as Array<{ receiptPath: string | null }>) },
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
import { BackupData, BackupDataSchema } from '../../types/backup.types';

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

    // The restoring user has no "myself" companion unless a test says so.
    mockTx.travelCompanion.findFirst.mockResolvedValue(null);
    mockTx.user.findUniqueOrThrow.mockResolvedValue({ username: 'testuser' });
    mockTx.$executeRaw.mockResolvedValue(1);

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
    mockTx.loyaltyProgram.findFirst.mockResolvedValue(null);
    mockTx.loyaltyProgram.create.mockResolvedValue({ id: 900 });

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
    mockTx.foodLogEntryPhoto.create.mockResolvedValue({ id: 1 });
    mockTx.bookingDeadline.create.mockResolvedValue({ id: 1 });
    mockTx.tripStop.create.mockResolvedValue({ id: 1 });
    mockTx.tripExpense.create.mockResolvedValue({ id: 1 });
    mockTx.tripEmergencyInfo.create.mockResolvedValue({ id: 1 });
    mockTx.savedLink.create.mockResolvedValue({ id: 1 });
    mockTx.customItem.create.mockResolvedValue({ id: 1 });
    mockTx.customItemType.create.mockResolvedValue({ id: 1 });
    mockTx.user.update.mockResolvedValue({});
    mockTx.trip.update.mockResolvedValue({});
    mockTx.location.update.mockResolvedValue({});
    mockTx.activity.update.mockResolvedValue({});
    mockTx.lodging.update.mockResolvedValue({});

    // deleteMany returns
    mockTx.trip.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.tripTag.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.travelCompanion.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.locationCategory.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.customItemType.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.checklist.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.travelDocument.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.loyaltyProgram.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.tripSeries.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.savedLink.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe('restoreFromBackup', () => {
    it('RST-001: validates and accepts supported backup version', async () => {
      const result = await restoreFromBackup(1, minimalBackup);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Data restored successfully');
    });

    it('RST-019: a backup with no timezone leaves the current timezone alone and never invents UTC', async () => {
      for (const timezone of [null, undefined, '', '   ']) {
        mockTx.user.update.mockClear();
        await restoreFromBackup(1, {
          ...minimalBackup,
          user: { ...minimalBackup.user, timezone: timezone as string | null },
        });
        const data = mockTx.user.update.mock.calls[0][0].data;
        expect(data).not.toHaveProperty('timezone');
      }
      expect(mockTx.user.findUnique).not.toHaveBeenCalled();
    });

    it('RST-019b: a backup with a timezone restores it', async () => {
      mockTx.user.update.mockClear();
      await restoreFromBackup(1, { ...minimalBackup, user: { ...minimalBackup.user, timezone: ' Europe/Rome ' } });
      expect(mockTx.user.update.mock.calls[0][0].data.timezone).toBe('Europe/Rome');
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

    it('RST-017: restores standalone deadlines and remaps booked ones, skipping orphans', async () => {
      const trip = fullBackup.trips[0];
      const backup: BackupData = {
        ...fullBackup,
        trips: [
          {
            ...trip,
            lodging: [{ id: 1, type: 'hotel', name: 'Hotel Roma', checkInDate: '2024-07-01', checkOutDate: '2024-07-15' }],
            bookingDeadlines: [
              // Standalone: nothing to remap, and it carries its own title.
              { entityType: null, entityId: null, title: 'Renew passport', kind: 'other', dueAt: '2026-12-01T12:00:00.000Z', note: null, dismissedAt: null },
              // Booked: the old lodging id 1 becomes the freshly created one.
              { entityType: 'lodging', entityId: 1, kind: 'cancellation', dueAt: '2026-12-02T12:00:00.000Z', note: 'Free until noon' },
              // Booked, but the hotel is not in the backup: skipped as before.
              { entityType: 'lodging', entityId: 999, kind: 'payment', dueAt: '2026-12-03T12:00:00.000Z' },
            ],
          },
        ],
      };

      await restoreFromBackup(1, backup);

      expect(mockTx.bookingDeadline.create).toHaveBeenCalledTimes(2);
      const standalone = mockTx.bookingDeadline.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(standalone.data).toMatchObject({
        title: 'Renew passport',
        lodgingId: null,
        transportationId: null,
        activityId: null,
        kind: 'other',
      });
      const booked = mockTx.bookingDeadline.create.mock.calls[1][0] as { data: Record<string, unknown> };
      expect(booked.data).toMatchObject({ lodgingId: 80, title: null, note: 'Free until noon' });
    });

    it('RST-018: restores route stops in order and remaps their location link', async () => {
      const trip = fullBackup.trips[0];
      const backup: BackupData = {
        ...fullBackup,
        trips: [
          {
            ...trip,
            // old location id 1 (Colosseum) is restored as the first new location id
            stops: [
              { name: 'Rome', latitude: 41.9, longitude: 12.5, nights: 3, locationId: 1 },
              { name: 'Florence', latitude: 43.77, longitude: 11.25, nights: null, locationId: 999 },
              { name: 'Venice', latitude: 45.44, longitude: 12.33 },
            ],
          },
        ],
      };

      await restoreFromBackup(1, backup);

      expect(mockTx.tripStop.create).toHaveBeenCalledTimes(3);
      const data = mockTx.tripStop.create.mock.calls.map(
        (c) => (c[0] as { data: Record<string, unknown> }).data
      );
      expect(data.map((d) => [d.name, d.position])).toEqual([
        ['Rome', 0],
        ['Florence', 1],
        ['Venice', 2],
      ]);
      expect(data[0]).toMatchObject({ nights: 3, locationId: 10 });
      // an unresolvable link is dropped but the stop survives
      expect(data[1]).toMatchObject({ nights: null, locationId: null });
      expect(data[2]).toMatchObject({ nights: null, locationId: null });
    });

    it('RST-016b: re-attaches food log photos through the photo id map', async () => {
      const trip = fullBackup.trips[0];
      const backup: BackupData = {
        ...fullBackup,
        trips: [
          {
            ...trip,
            foodLogEntries: [
              {
                restaurantName: 'Trattoria',
                dish: 'Carbonara',
                rating: 5,
                // old photo 1 was restored as new id 50; old photo 777 is not in the backup
                photos: [{ photoId: 1, sortOrder: 2 }, { photoId: 777, sortOrder: 3 }],
              },
            ],
          },
        ],
      };

      await restoreFromBackup(1, backup, { clearExistingData: false, importPhotos: true });

      expect(mockTx.foodLogEntryPhoto.create).toHaveBeenCalledTimes(1);
      expect(mockTx.foodLogEntryPhoto.create).toHaveBeenCalledWith({
        data: { entryId: 1, photoId: 50, sortOrder: 2 },
      });
    });

    it('RST-016c: does not attach food log photos when photos are not imported', async () => {
      const trip = fullBackup.trips[0];
      const backup: BackupData = {
        ...fullBackup,
        trips: [
          {
            ...trip,
            foodLogEntries: [
              { restaurantName: 'Trattoria', dish: 'Carbonara', rating: 5, photos: [{ photoId: 1, sortOrder: 0 }] },
            ],
          },
        ],
      };

      await restoreFromBackup(1, backup, { clearExistingData: false, importPhotos: false });

      expect(mockTx.foodLogEntry.create).toHaveBeenCalledTimes(1); // the entry itself still restores
      expect(mockTx.foodLogEntryPhoto.create).not.toHaveBeenCalled();
    });

    it('RST-008: a pre-1.7.0 OCCURRED_AT activity->location link is promoted to activity.locationId (no link row)', async () => {
      await restoreFromBackup(1, fullBackup);

      // Old ids (activity 1, location 1) are mapped to the new ids (60, 10)
      expect(mockTx.activity.update).toHaveBeenCalledWith({
        where: { id: 60 },
        data: { locationId: 10 },
      });
      expect(mockTx.entityLink.create).not.toHaveBeenCalled();
    });

    it('RST-008b: a 1.7.0 backup restores activity and lodging locationId through the location map', async () => {
      const trip = fullBackup.trips[0];
      const backup = {
        ...fullBackup,
        version: '1.7.0',
        trips: [
          {
            ...trip,
            locations: [
              { id: 1, name: 'Colosseum', address: 'Rome', latitude: 41.89, longitude: 12.49 },
              { id: 2, name: 'Hotel site', address: 'Rome', latitude: 41.9, longitude: 12.5 },
            ],
            activities: [{ id: 1, name: 'Visit Colosseum', locationId: 1 }, { id: 2, name: 'Free time', locationId: null }],
            lodging: [
              { id: 1, type: 'hotel', name: 'Hotel Roma', checkInDate: '2024-07-01', checkOutDate: '2024-07-15', locationId: 2 },
              { id: 2, type: 'hotel', name: 'Unknown', checkInDate: '2024-07-01', checkOutDate: '2024-07-15', locationId: 777 },
            ],
            entityLinks: [],
          },
        ],
      } as unknown as BackupData;

      await restoreFromBackup(1, backup);

      const activityCalls = mockTx.activity.create.mock.calls.map((c) => (c[0] as { data: { locationId: number | null } }).data.locationId);
      expect(activityCalls).toEqual([10, null]);
      const lodgingCalls = mockTx.lodging.create.mock.calls.map((c) => (c[0] as { data: { locationId: number | null } }).data.locationId);
      // location 2 -> new id 11; an id that is not in the backup is dropped rather than invented
      expect(lodgingCalls).toEqual([11, null]);
      // Nothing to promote for a 1.7.0 backup
      expect(mockTx.activity.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { locationId: expect.anything() } }));
      expect(mockTx.lodging.update).not.toHaveBeenCalled();
      expect(mockTx.entityLink.create).not.toHaveBeenCalled();
    });

    it('RST-008c: a 1.6.0 backup with two place links on one activity promotes OCCURRED_AT and restores the other as RELATED', async () => {
      const trip = fullBackup.trips[0];
      const backup = {
        ...fullBackup,
        version: '1.6.0',
        trips: [
          {
            ...trip,
            locations: [
              { id: 1, name: 'Colosseum', address: 'Rome', latitude: 41.89, longitude: 12.49 },
              { id: 2, name: 'Forum', address: 'Rome', latitude: 41.9, longitude: 12.48 },
            ],
            entityLinks: [
              { sourceType: 'ACTIVITY', sourceId: 1, targetType: 'LOCATION', targetId: 1, relationship: 'RELATED' },
              { sourceType: 'ACTIVITY', sourceId: 1, targetType: 'LOCATION', targetId: 2, relationship: 'OCCURRED_AT' },
            ],
          },
        ],
      } as unknown as BackupData;

      await restoreFromBackup(1, backup);

      // The OCCURRED_AT one (Forum, old id 2 -> new id 11) becomes the FK
      expect(mockTx.activity.update).toHaveBeenCalledWith({ where: { id: 60 }, data: { locationId: 11 } });
      // The other place link is kept as an ordinary RELATED link to Colosseum (new id 10)
      expect(mockTx.entityLink.create).toHaveBeenCalledTimes(1);
      expect(mockTx.entityLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceType: 'ACTIVITY',
          sourceId: 60,
          targetType: 'LOCATION',
          targetId: 10,
          relationship: 'RELATED',
        }),
      });
    });

    it('RST-008d: a pre-1.7.0 lodging place link is promoted to lodging.locationId; non-place links are untouched', async () => {
      const trip = fullBackup.trips[0];
      const backup = {
        ...fullBackup,
        version: '1.5.0',
        trips: [
          {
            ...trip,
            lodging: [{ id: 1, type: 'hotel', name: 'Hotel Roma', checkInDate: '2024-07-01', checkOutDate: '2024-07-15' }],
            entityLinks: [
              { sourceType: 'LODGING', sourceId: 1, targetType: 'LOCATION', targetId: 1, relationship: 'OCCURRED_AT' },
              { sourceType: 'ACTIVITY', sourceId: 1, targetType: 'LODGING', targetId: 1, relationship: 'RELATED' },
            ],
          },
        ],
      } as unknown as BackupData;

      await restoreFromBackup(1, backup);

      expect(mockTx.lodging.update).toHaveBeenCalledWith({ where: { id: 80 }, data: { locationId: 10 } });
      expect(mockTx.entityLink.create).toHaveBeenCalledTimes(1);
      expect(mockTx.entityLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sourceType: 'ACTIVITY', targetType: 'LODGING', relationship: 'RELATED' }),
      });
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

    it('RST-010c: a backup with no country codes (pre-1.8.0) gets them derived on restore', async () => {
      const trip = fullBackup.trips[0];
      const backup = {
        ...fullBackup,
        version: '1.7.0',
        travelDocuments: [
          { type: 'PASSPORT', issuingCountry: 'United States', name: 'A' },
          { type: 'PASSPORT', issuingCountry: 'Atlantis', name: 'B' },
          { type: 'PASSPORT', issuingCountry: 'Germany', issuingCountryCode: 'at', name: 'C' },
        ],
        trips: [
          {
            ...trip,
            locations: [
              { id: 1, name: 'Louvre', address: 'Rue de Rivoli, Paris, France' },
              { id: 2, name: 'Nowhere', address: '221B Baker Street' },
              { id: 3, name: 'Coded', address: 'Rome, Italy', countryCode: 'sm' },
            ],
            activities: [],
            lodging: [],
            entityLinks: [],
          },
        ],
      } as unknown as BackupData;

      await restoreFromBackup(1, backup);

      const locationCodes = mockTx.location.create.mock.calls.map((c) => (c[0] as { data: { countryCode: string | null } }).data.countryCode);
      expect(locationCodes).toEqual(['FR', null, 'SM']);
      const docCodes = mockTx.travelDocument.create.mock.calls.map((c) => (c[0] as { data: { issuingCountryCode: string | null } }).data.issuingCountryCode);
      expect(docCodes).toEqual(['US', null, 'AT']);
    });

    it('RST-010b: restores loyalty programs in full and re-links bookings to them', async () => {
      mockTx.loyaltyProgram.create.mockResolvedValue({ id: 901 });
      const backup = {
        ...fullBackup,
        loyaltyPrograms: [
          {
            id: 7,
            name: 'SkyMiles',
            type: 'AIRLINE' as const,
            providerName: 'Delta Air Lines',
            providerCode: 'DL',
            aliases: ['Delta'],
            membershipNumber: '9876543210',
            tier: 'Gold',
            pointsBalance: 12500,
          },
        ],
        trips: [
          {
            ...fullBackup.trips[0],
            transportation: [{ type: 'flight', company: 'Delta', loyaltyProgramId: 7 }],
            lodging: [
              {
                type: 'hotel',
                name: 'Hotel',
                checkInDate: '2024-07-01',
                checkOutDate: '2024-07-02',
                loyaltyProgramId: 99, // not in the backup: link is dropped, not invented
              },
            ],
          },
        ],
      };

      const result = await restoreFromBackup(1, backup);

      expect(mockTx.loyaltyProgram.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          membershipNumber: '9876543210',
          aliases: ['Delta'],
          pointsBalance: 12500,
        }),
      });
      expect(result.stats.loyaltyProgramsImported).toBe(1);
      expect(mockTx.transportation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ loyaltyProgramId: 901 }),
      });
      expect(mockTx.lodging.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ loyaltyProgramId: null }),
      });
    });

    it('RST-010c: reuses a loyalty program that already exists instead of duplicating it', async () => {
      mockTx.loyaltyProgram.findFirst.mockResolvedValue({ id: 55 });

      const result = await restoreFromBackup(1, {
        ...fullBackup,
        loyaltyPrograms: [
          {
            id: 7,
            name: 'SkyMiles',
            type: 'AIRLINE' as const,
            providerName: 'Delta Air Lines',
            membershipNumber: '9876543210',
          },
        ],
      });

      expect(mockTx.loyaltyProgram.create).not.toHaveBeenCalled();
      expect(result.stats.loyaltyProgramsImported).toBe(0);
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

    it('RST-012a: restores the photo favorite flag, defaulting to false for older backups', async () => {
      await restoreFromBackup(1, fullBackup);
      expect(mockTx.photo.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isFavorite: false }) })
      );

      mockTx.photo.create.mockClear();
      const starred = JSON.parse(JSON.stringify(fullBackup));
      starred.trips[0].photos[0].isFavorite = true;
      await restoreFromBackup(1, starred);
      expect(mockTx.photo.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isFavorite: true }) })
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
    mockTx.loyaltyProgram.deleteMany.mockResolvedValue({ count: 0 });
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
  describe('RST-017: expense payer and splits (#97)', () => {
    it('re-links the payer and each share to the restored companions by name', async () => {
      mockTx.travelCompanion.create.mockImplementation((async (args: { data: { name: string } }) => ({
        id: args.data.name === 'Alice' ? 501 : 502,
      })) as never);

      // The owner has no "myself" companion: it is created on demand (find, find, find again).
      mockTx.travelCompanion.findFirst
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce({ id: 900 } as never);
      const backup: BackupData = {
        ...minimalBackup,
        version: '1.6.0',
        companions: [{ name: 'Alice' }, { name: 'Bob' }],
        trips: [
          {
            title: 'Split Trip',
            status: 'Planned',
            privacyLevel: 'Private',
            companions: ['Alice', 'Bob'],
            expenses: [
              {
                id: 9,
                description: 'Dinner',
                category: 'food',
                amount: 90,
                currency: 'EUR',
                paidByCompanionName: 'Bob',
                splitMethod: 'equal',
                splits: [
                  { isOwner: true, amount: 30 },
                  { companionName: 'Alice', amount: 30 },
                  { companionName: 'Bob', amount: 30 },
                  { companionName: 'Ghost', amount: 10 },
                ],
              },
              {
                description: 'Taxi',
                category: 'transportation',
                amount: 20,
                paidByOwner: true,
                splitMethod: 'percentage',
                splits: [{ isOwner: true, amount: 20, percentage: 100 }],
              },
            ],
          },
        ],
      };

      const result = await restoreFromBackup(1, backup);
      expect(result.success).toBe(true);

      const calls = mockTx.tripExpense.create.mock.calls.map(
        (c) => (c[0] as { data: Record<string, unknown> }).data
      );
      const dinner = calls.find((d) => d.description === 'Dinner') as {
        paidByCompanionId: number | null;
        splitMethod: string | null;
        splits: { create: Array<{ companionId: number }> };
      };
      expect(dinner.paidByCompanionId).toBe(502);
      expect(dinner.splitMethod).toBe('equal');
      // The unknown companion drops out; owner / Alice / Bob remain, with NEW ids.
      // The owner is the restoring user's "myself" companion (900).
      expect(dinner.splits.create.map((r) => r.companionId)).toEqual([900, 501, 502]);

      const taxi = calls.find((d) => d.description === 'Taxi') as typeof dinner;
      expect(taxi.paidByCompanionId).toBe(900);
      expect(taxi.splits.create.map((r) => r.companionId)).toEqual([900]);
    });

    it('maps a backup companion flagged isMyself onto the existing one instead of duplicating it', async () => {
      mockTx.travelCompanion.findFirst.mockResolvedValue({ id: 42 } as never);
      const backup: BackupData = {
        ...minimalBackup,
        version: '1.8.0',
        companions: [{ name: 'Myself (testuser)', isMyself: true }, { name: 'Alice' }],
        trips: [
          {
            title: 'T',
            status: 'Planned',
            privacyLevel: 'Private',
            companions: ['Myself (testuser)', 'Alice'],
            expenses: [
              {
                description: 'Lunch',
                category: 'food',
                amount: 20,
                paidByOwner: true,
                splitMethod: 'equal',
                // The owner listed twice (as owner and as their own companion) folds into one share.
                splits: [
                  { isOwner: true, amount: 5 },
                  { companionName: 'Myself (testuser)', amount: 5 },
                  { companionName: 'Alice', amount: 10 },
                ],
              },
            ],
          },
        ],
      };

      await restoreFromBackup(1, backup);

      // Only Alice is created: the flagged one is the existing companion 42.
      expect(mockTx.travelCompanion.create).toHaveBeenCalledTimes(1);
      const lunch = (mockTx.tripExpense.create.mock.calls[0][0] as { data: { paidByCompanionId: number; splits: { create: Array<{ companionId: number; amount: { toString(): string } }> } } }).data;
      expect(lunch.paidByCompanionId).toBe(42);
      expect(lunch.splits.create.map((r) => [r.companionId, r.amount.toString()])).toEqual([
        [42, '10'],
        [200, '10'],
      ]);
    });

    it('restores a second isMyself companion in the same backup as an ordinary companion', async () => {
      const backup: BackupData = {
        ...minimalBackup,
        version: '1.8.0',
        companions: [
          { name: 'Me', isMyself: true },
          { name: 'Me again', isMyself: true },
        ],
        trips: [],
      };

      await restoreFromBackup(1, backup);

      const created = mockTx.travelCompanion.create.mock.calls.map(
        (c) => (c[0] as { data: { isMyself: boolean; linkedUserId: number | null } }).data
      );
      expect(created.map((d) => [d.isMyself, d.linkedUserId])).toEqual([
        [true, 1],
        [false, null],
      ]);
    });
  });

  describe('RST-RCPT: expense receipts', () => {
    const baseTrip = {
      title: 'Japan 2026',
      status: 'Planned',
      privacyLevel: 'Private',
    };
    const withExpenses = (expenses: Array<Record<string, unknown>>): BackupData =>
      ({
        ...minimalBackup,
        version: '1.6.0',
        trips: [{ ...baseTrip, expenses }],
      }) as unknown as BackupData;
    const expense = (extra: Record<string, unknown> = {}) => ({
      description: 'Ramen',
      category: 'food',
      amount: 12,
      currency: 'JPY',
      ...extra,
    });
    const createdData = (n: number) =>
      (mockTx.tripExpense.create.mock.calls[n][0] as { data: Record<string, unknown> }).data;

    beforeEach(() => {
      mockStat.mockResolvedValue({ isFile: () => true });
      mockCopyFile.mockResolvedValue(undefined);
      mockUnlink.mockResolvedValue(undefined);
      mockTx.tripExpense.findFirst.mockResolvedValue(null);
      mockPrisma.tripExpense.findMany.mockResolvedValue([]);
    });

    it('round trip: re-attaches the receipt when its file exists, and counts it', async () => {
      const result = await restoreFromBackup(
        1,
        withExpenses([
          expense({
            receiptPath: '/uploads/receipts/a.jpg',
            receiptMimeType: 'image/jpeg',
            receiptSizeBytes: 1234,
            receiptUploadedAt: '2026-05-02T10:00:00.000Z',
          }),
        ])
      );
      expect(createdData(0)).toMatchObject({
        receiptPath: '/uploads/receipts/a.jpg',
        receiptMimeType: 'image/jpeg',
        receiptSizeBytes: 1234,
      });
      expect(mockCopyFile).not.toHaveBeenCalled();
      expect(result.stats).toMatchObject({ receiptsRestored: 1, receiptsNotRestored: 0 });
    });

    it('a missing file restores the expense with no receipt and counts it', async () => {
      mockStat.mockRejectedValue(Object.assign(new Error('gone'), { code: 'ENOENT' }));
      const result = await restoreFromBackup(1, withExpenses([expense({ receiptPath: '/uploads/receipts/gone.jpg' })]));
      expect(mockTx.tripExpense.create).toHaveBeenCalledTimes(1);
      expect(createdData(0).receiptPath).toBeUndefined();
      expect(result.stats).toMatchObject({ receiptsRestored: 0, receiptsNotRestored: 1 });
    });

    it('rejects traversal, absolute and foreign-directory paths in the backup', () => {
      for (const bad of [
        '/uploads/receipts/../photos/a.jpg',
        '/uploads/receipts/../../etc/passwd',
        '/etc/passwd',
        'C:\\Windows\\win.ini',
        '/uploads/photos/a.jpg',
        '/uploads/receipts/sub/a.jpg',
        '/uploads/receipts/',
      ]) {
        const parsed = BackupDataSchema.safeParse(withExpenses([expense({ receiptPath: bad })]));
        expect(parsed.success).toBe(false);
      }
      expect(BackupDataSchema.safeParse(withExpenses([expense({ receiptPath: '/uploads/receipts/ok-1.jpg' })])).success).toBe(true);
    });

    it('second layer: a bad path that reaches restore is dropped and counted, never stat-ed', async () => {
      const result = await restoreFromBackup(1, withExpenses([expense({ receiptPath: '/uploads/receipts/../photos/a.jpg' })]));
      expect(mockStat).not.toHaveBeenCalled();
      expect(createdData(0).receiptPath).toBeUndefined();
      expect(result.stats.receiptsNotRestored).toBe(1);
    });

    it('an old backup without receipt fields restores cleanly', async () => {
      const result = await restoreFromBackup(1, withExpenses([expense()]));
      expect(result.success).toBe(true);
      expect(createdData(0).receiptPath).toBeUndefined();
      expect(result.stats).toMatchObject({ receiptsRestored: 0, receiptsNotRestored: 0 });
      expect(mockStat).not.toHaveBeenCalled();
    });

    it('merge mode: a file already used by another expense of the user is copied, not shared', async () => {
      mockTx.tripExpense.findFirst.mockResolvedValue({ trip: { userId: 1 } });
      const result = await restoreFromBackup(
        1,
        withExpenses([expense({ receiptPath: '/uploads/receipts/a.jpg' })]),
        { clearExistingData: false, importPhotos: true }
      );
      expect(mockCopyFile).toHaveBeenCalledTimes(1);
      const newPath = createdData(0).receiptPath as string;
      expect(newPath).toMatch(/^\/uploads\/receipts\/[0-9a-f-]{36}\.jpg$/);
      expect(newPath).not.toBe('/uploads/receipts/a.jpg');
      expect(result.stats.receiptsRestored).toBe(1);
    });

    it('two expenses in one backup pointing at the same file get one file each', async () => {
      await restoreFromBackup(
        1,
        withExpenses([
          expense({ receiptPath: '/uploads/receipts/a.jpg' }),
          expense({ receiptPath: '/uploads/receipts/a.jpg' }),
        ])
      );
      expect(createdData(0).receiptPath).toBe('/uploads/receipts/a.jpg');
      expect(createdData(1).receiptPath).not.toBe('/uploads/receipts/a.jpg');
      expect(mockCopyFile).toHaveBeenCalledTimes(1);
    });

    it("refuses a receipt file that belongs to another user's expense", async () => {
      mockTx.tripExpense.findFirst.mockResolvedValue({ trip: { userId: 99 } });
      const result = await restoreFromBackup(1, withExpenses([expense({ receiptPath: '/uploads/receipts/a.jpg' })]));
      expect(createdData(0).receiptPath).toBeUndefined();
      expect(result.stats.receiptsNotRestored).toBe(1);
    });

    it('replace mode deletes the receipt files of the replaced expenses, except ones re-attached', async () => {
      mockPrisma.tripExpense.findMany
        .mockResolvedValueOnce([{ receiptPath: '/uploads/receipts/old.jpg' }, { receiptPath: '/uploads/receipts/kept.jpg' }])
        .mockResolvedValueOnce([{ receiptPath: '/uploads/receipts/kept.jpg' }]);
      await restoreFromBackup(1, withExpenses([expense({ receiptPath: '/uploads/receipts/kept.jpg' })]));
      const unlinked = mockUnlink.mock.calls.map((c) => String(c[0]).replace(/\\/g, '/'));
      expect(unlinked).toHaveLength(1);
      expect(unlinked[0]).toMatch(/uploads\/receipts\/old\.jpg$/);
    });

    it('merge mode never deletes existing receipt files', async () => {
      await restoreFromBackup(1, withExpenses([expense()]), { clearExistingData: false, importPhotos: true });
      expect(mockPrisma.tripExpense.findMany).not.toHaveBeenCalled();
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('a failed restore removes the copies it made and deletes no old files', async () => {
      mockPrisma.tripExpense.findMany.mockResolvedValueOnce([{ receiptPath: '/uploads/receipts/old.jpg' }]);
      mockTx.tripExpense.findFirst.mockResolvedValue({ trip: { userId: 1 } });
      mockTx.tripExpense.create.mockRejectedValueOnce(new Error('db down'));
      await expect(
        restoreFromBackup(1, withExpenses([expense({ receiptPath: '/uploads/receipts/a.jpg' })]))
      ).rejects.toBeDefined();
      const unlinked = mockUnlink.mock.calls.map((c) => String(c[0]).replace(/\\/g, '/'));
      expect(unlinked).toHaveLength(1);
      expect(unlinked[0]).toMatch(/uploads\/receipts\/[0-9a-f-]{36}\.jpg$/);
      expect(unlinked[0]).not.toMatch(/old\.jpg/);
    });
  });
});
