/**
 * Entity Link Service Tests
 *
 * Comprehensive test suite for the EntityLink service covering:
 * - Link creation (single and bulk)
 * - Relationship auto-detection
 * - Duplicate and self-link prevention
 * - Bidirectional queries
 * - Link deletion
 * - Trip link summary
 * - Link enrichment
 * - Ownership verification
 * - All entity and relationship types
 *
 * Test IDs: LINK-001 through LINK-018
 */

// Mock logger BEFORE any imports to prevent config/index.ts from loading
// entityLink.service imports logger which imports config/index.ts (throws without DATABASE_URL)
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Prisma client BEFORE any imports
jest.mock('../../config/database', () => {
  const mockPrisma = {
    trip: {
      findFirst: jest.fn(),
    },
    entityLink: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn(),
    },
    photo: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    location: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    activity: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    lodging: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    transportation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    journalEntry: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    photoAlbum: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrisma)),
  };

  return {
    __esModule: true,
    default: mockPrisma,
  };
});

// Mock serviceHelpers - mock verifyTripAccessWithPermission (the function the service actually uses)
jest.mock('../../utils/serviceHelpers', () => ({
  verifyTripAccessWithPermission: jest.fn(),
}));

import { entityLinkService } from '../entityLink.service';
import prisma from '../../config/database';
import { verifyTripAccessWithPermission } from '../../utils/serviceHelpers';
import { AppError } from '../../utils/errors';

// Type the mocks
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockVerifyTripAccessWithPermission = verifyTripAccessWithPermission as jest.Mock;

// Test fixtures
const TEST_USER_ID = 1;
const TEST_TRIP_ID = 100;

const mockTrip = {
  id: TEST_TRIP_ID,
  userId: TEST_USER_ID,
  title: 'Test Trip',
  privacyLevel: 'Private',
  collaborators: [],
};

// Default TripAccessResult returned by verifyTripAccessWithPermission
const mockTripAccessResult = {
  trip: {
    id: TEST_TRIP_ID,
    userId: TEST_USER_ID,
    title: 'Test Trip',
    privacyLevel: 'Private',
  },
  isOwner: true,
  permissionLevel: 'admin',
};

const mockPhoto = {
  id: 1,
  tripId: TEST_TRIP_ID,
  caption: 'Test Photo',
  thumbnailPath: '/uploads/thumb_test.jpg',
};

const mockLocation = {
  id: 2,
  tripId: TEST_TRIP_ID,
  name: 'Test Location',
};

const mockActivity = {
  id: 3,
  tripId: TEST_TRIP_ID,
  name: 'Test Activity',
};

const mockLodging = {
  id: 4,
  tripId: TEST_TRIP_ID,
  name: 'Test Hotel',
};

const mockTransportation = {
  id: 5,
  tripId: TEST_TRIP_ID,
  type: 'Flight',
  company: 'Test Airlines',
};

const mockJournalEntry = {
  id: 6,
  tripId: TEST_TRIP_ID,
  title: 'Day 1',
  date: new Date('2025-01-15'),
};

const mockPhotoAlbum = {
  id: 7,
  tripId: TEST_TRIP_ID,
  name: 'Test Album',
};

const createMockEntityLink = (overrides = {}) => ({
  id: 1,
  tripId: TEST_TRIP_ID,
  sourceType: 'PHOTO',
  sourceId: 1,
  targetType: 'LOCATION',
  targetId: 2,
  relationship: 'TAKEN_AT',
  sortOrder: null,
  notes: null,
  createdAt: new Date(),
  ...overrides,
});

describe('EntityLinkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock: trip access is granted (returns TripAccessResult)
    mockVerifyTripAccessWithPermission.mockResolvedValue(mockTripAccessResult);
  });

  // ==========================================================================
  // LINK-001: Create link between photo and location
  // ==========================================================================
  describe('LINK-001: Create link between photo and location', () => {
    it('should create a link between a photo and a location', async () => {
      // Arrange
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null); // No existing link
      mockPrisma.entityLink.create.mockResolvedValue(
        createMockEntityLink({ relationship: 'TAKEN_AT' })
      );

      // Act
      const result = await entityLinkService.createLink(TEST_USER_ID, input);

      // Assert
      expect(mockVerifyTripAccessWithPermission).toHaveBeenCalledWith(
        TEST_USER_ID, TEST_TRIP_ID, 'edit'
      );
      expect(mockPrisma.photo.findFirst).toHaveBeenCalledWith({
        where: { id: 1, tripId: TEST_TRIP_ID },
      });
      expect(mockPrisma.location.findFirst).toHaveBeenCalledWith({
        where: { id: 2, tripId: TEST_TRIP_ID },
      });
      expect(mockPrisma.entityLink.create).toHaveBeenCalled();
      expect(result.sourceType).toBe('PHOTO');
      expect(result.targetType).toBe('LOCATION');
    });

    it('should include notes when provided', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 2,
        notes: 'This is a test note',
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockResolvedValue(
        createMockEntityLink({ notes: 'This is a test note' })
      );

      const result = await entityLinkService.createLink(TEST_USER_ID, input);

      expect(result.notes).toBe('This is a test note');
    });
  });

  // ==========================================================================
  // LINK-002: Auto-detect TAKEN_AT relationship for photo->location
  // ==========================================================================
  describe('LINK-002: Auto-detect TAKEN_AT relationship for photo->location', () => {
    it('should auto-detect TAKEN_AT when photo links to location', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 2,
        // relationship not specified
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockImplementation(async (args) => {
        return createMockEntityLink({ relationship: args.data.relationship });
      });

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationship: 'TAKEN_AT',
          }),
        })
      );
    });

    it('should use explicit relationship when provided', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 2,
        relationship: 'RELATED' as const,
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockImplementation(async (args) => {
        return createMockEntityLink({ relationship: args.data.relationship });
      });

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationship: 'RELATED',
          }),
        })
      );
    });
  });

  // ==========================================================================
  // LINK-003: Auto-detect OCCURRED_AT for activity->location
  // ==========================================================================
  describe('LINK-003: Auto-detect OCCURRED_AT for activity->location', () => {
    it('should auto-detect OCCURRED_AT when activity links to location', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'ACTIVITY' as const,
        sourceId: 3,
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.activity.findFirst.mockResolvedValue(mockActivity);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockImplementation(async (args) => {
        return createMockEntityLink({
          sourceType: 'ACTIVITY',
          sourceId: 3,
          relationship: args.data.relationship,
        });
      });

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationship: 'OCCURRED_AT',
          }),
        })
      );
    });

    it('should auto-detect OCCURRED_AT when lodging links to location', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'LODGING' as const,
        sourceId: 4,
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.lodging.findFirst.mockResolvedValue(mockLodging);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockImplementation(async (args) => {
        return createMockEntityLink({
          sourceType: 'LODGING',
          sourceId: 4,
          relationship: args.data.relationship,
        });
      });

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationship: 'OCCURRED_AT',
          }),
        })
      );
    });
  });

  // ==========================================================================
  // LINK-004: Reject duplicate links
  // ==========================================================================
  describe('LINK-004: Reject duplicate links', () => {
    it('should throw error when link already exists', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.entityLink.findFirst.mockResolvedValue(createMockEntityLink()); // Existing link

      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        AppError
      );
      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        'Link already exists between these entities'
      );
    });
  });

  // ==========================================================================
  // LINK-005: Reject self-linking (same entity to itself)
  // ==========================================================================
  describe('LINK-005: Reject self-linking (same entity to itself)', () => {
    it('should throw error when trying to link entity to itself', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'PHOTO' as const,
        targetId: 1, // Same as source
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);

      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        AppError
      );
      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        'Cannot link an entity to itself'
      );
    });

    it('should allow linking same entity type with different IDs', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'PHOTO' as const,
        targetId: 10, // Different ID
      };

      const secondPhoto = { ...mockPhoto, id: 10 };
      mockPrisma.photo.findFirst
        .mockResolvedValueOnce(mockPhoto) // Source
        .mockResolvedValueOnce(secondPhoto); // Target
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockResolvedValue(
        createMockEntityLink({
          targetType: 'PHOTO',
          targetId: 10,
          relationship: 'RELATED',
        })
      );

      const result = await entityLinkService.createLink(TEST_USER_ID, input);

      expect(result.sourceId).toBe(1);
      expect(result.targetId).toBe(10);
    });
  });

  // ==========================================================================
  // LINK-006: Bulk create links (one source to many targets)
  // ==========================================================================
  describe('LINK-006: Bulk create links (one source to many targets)', () => {
    it('should create multiple links from one source to many targets', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO_ALBUM' as const,
        sourceId: 7,
        targets: [
          { targetType: 'LOCATION' as const, targetId: 2 },
          { targetType: 'LOCATION' as const, targetId: 20 },
          { targetType: 'ACTIVITY' as const, targetId: 3 },
        ],
      };

      mockPrisma.photoAlbum.findFirst.mockResolvedValue(mockPhotoAlbum);
      mockPrisma.location.count.mockResolvedValue(2);
      mockPrisma.activity.count.mockResolvedValue(1);
      mockPrisma.entityLink.findMany.mockResolvedValue([]); // No existing links
      mockPrisma.entityLink.createMany.mockResolvedValue({ count: 3 });

      const result = await entityLinkService.bulkCreateLinks(TEST_USER_ID, input);

      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
    });

    it('should skip existing links in bulk operation', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO_ALBUM' as const,
        sourceId: 7,
        targets: [
          { targetType: 'LOCATION' as const, targetId: 2 },
          { targetType: 'LOCATION' as const, targetId: 20 },
        ],
      };

      mockPrisma.photoAlbum.findFirst.mockResolvedValue(mockPhotoAlbum);
      mockPrisma.location.count.mockResolvedValue(2);
      // Return one existing link matching targetId: 2
      mockPrisma.entityLink.findMany.mockResolvedValue([
        { targetType: 'LOCATION', targetId: 2 },
      ]);
      mockPrisma.entityLink.createMany.mockResolvedValue({ count: 1 });

      const result = await entityLinkService.bulkCreateLinks(TEST_USER_ID, input);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should skip self-links in bulk operation', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO_ALBUM' as const,
        sourceId: 7,
        targets: [
          { targetType: 'PHOTO_ALBUM' as const, targetId: 7 }, // Self-link
          { targetType: 'LOCATION' as const, targetId: 2 },
        ],
      };

      mockPrisma.photoAlbum.findFirst.mockResolvedValue(mockPhotoAlbum);
      mockPrisma.photoAlbum.count.mockResolvedValue(1);
      mockPrisma.location.count.mockResolvedValue(1);
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.entityLink.createMany.mockResolvedValue({ count: 1 });

      const result = await entityLinkService.bulkCreateLinks(TEST_USER_ID, input);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // ==========================================================================
  // LINK-007: Bulk link photos to location
  // ==========================================================================
  describe('LINK-007: Bulk link photos to location', () => {
    it('should link multiple photos to a single location', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        photoIds: [1, 10, 11],
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.photo.count.mockResolvedValue(3);
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.entityLink.createMany.mockResolvedValue({ count: 3 });

      const result = await entityLinkService.bulkLinkPhotos(TEST_USER_ID, input);

      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
    });

    it('should use TAKEN_AT relationship for photos to location', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        photoIds: [1],
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.photo.count.mockResolvedValue(1);
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.entityLink.createMany.mockImplementation(async (args) => {
        return { count: args.data.length };
      });

      await entityLinkService.bulkLinkPhotos(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              relationship: 'TAKEN_AT',
            }),
          ]),
        })
      );
    });

    it('should use FEATURED_IN relationship for photos to album', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        photoIds: [1],
        targetType: 'PHOTO_ALBUM' as const,
        targetId: 7,
      };

      mockPrisma.photoAlbum.findFirst.mockResolvedValue(mockPhotoAlbum);
      mockPrisma.photo.count.mockResolvedValue(1);
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.entityLink.createMany.mockImplementation(async (args) => {
        return { count: args.data.length };
      });

      await entityLinkService.bulkLinkPhotos(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              relationship: 'FEATURED_IN',
            }),
          ]),
        })
      );
    });
  });

  // ==========================================================================
  // LINK-008: Get links FROM entity (outgoing)
  // ==========================================================================
  describe('LINK-008: Get links FROM entity (outgoing)', () => {
    it('should get all outgoing links from an entity', async () => {
      const links = [
        createMockEntityLink({ id: 1, targetType: 'LOCATION', targetId: 2 }),
        createMockEntityLink({ id: 2, targetType: 'ACTIVITY', targetId: 3 }),
      ];

      mockPrisma.entityLink.findMany.mockResolvedValue(links);
      mockPrisma.location.findMany.mockResolvedValue([mockLocation]);
      mockPrisma.activity.findMany.mockResolvedValue([mockActivity]);

      const result = await entityLinkService.getLinksFrom(TEST_USER_ID, {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO',
        sourceId: 1,
      });

      expect(result).toHaveLength(2);
      expect(mockPrisma.entityLink.findMany).toHaveBeenCalledWith({
        where: {
          tripId: TEST_TRIP_ID,
          sourceType: 'PHOTO',
          sourceId: 1,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('should filter by target type when specified', async () => {
      mockPrisma.entityLink.findMany.mockResolvedValue([]);

      await entityLinkService.getLinksFrom(TEST_USER_ID, {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO',
        sourceId: 1,
        targetType: 'LOCATION',
      });

      expect(mockPrisma.entityLink.findMany).toHaveBeenCalledWith({
        where: {
          tripId: TEST_TRIP_ID,
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  // ==========================================================================
  // LINK-009: Get links TO entity (incoming)
  // ==========================================================================
  describe('LINK-009: Get links TO entity (incoming)', () => {
    it('should get all incoming links to an entity', async () => {
      const links = [
        createMockEntityLink({ id: 1, sourceType: 'PHOTO', sourceId: 1 }),
        createMockEntityLink({ id: 2, sourceType: 'PHOTO', sourceId: 10 }),
      ];

      mockPrisma.entityLink.findMany.mockResolvedValue(links);
      mockPrisma.photo.findMany.mockResolvedValue([mockPhoto, { ...mockPhoto, id: 10 }]);

      const result = await entityLinkService.getLinksTo(TEST_USER_ID, {
        tripId: TEST_TRIP_ID,
        targetType: 'LOCATION',
        targetId: 2,
      });

      expect(result).toHaveLength(2);
      expect(mockPrisma.entityLink.findMany).toHaveBeenCalledWith({
        where: {
          tripId: TEST_TRIP_ID,
          targetType: 'LOCATION',
          targetId: 2,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('should filter by source type when specified', async () => {
      mockPrisma.entityLink.findMany.mockResolvedValue([]);

      await entityLinkService.getLinksTo(TEST_USER_ID, {
        tripId: TEST_TRIP_ID,
        targetType: 'LOCATION',
        targetId: 2,
        sourceType: 'PHOTO',
      });

      expect(mockPrisma.entityLink.findMany).toHaveBeenCalledWith({
        where: {
          tripId: TEST_TRIP_ID,
          targetType: 'LOCATION',
          targetId: 2,
          sourceType: 'PHOTO',
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  // ==========================================================================
  // LINK-010: Get all links for entity (bidirectional)
  // ==========================================================================
  describe('LINK-010: Get all links for entity (bidirectional)', () => {
    it('should get both incoming and outgoing links for an entity', async () => {
      const outgoingLinks = [
        createMockEntityLink({ id: 1, sourceType: 'PHOTO', targetType: 'LOCATION' }),
      ];
      const incomingLinks = [
        createMockEntityLink({
          id: 2,
          sourceType: 'JOURNAL_ENTRY',
          sourceId: 6,
          targetType: 'PHOTO',
          targetId: 1,
        }),
      ];

      mockPrisma.entityLink.findMany
        .mockResolvedValueOnce(outgoingLinks) // getLinksFrom
        .mockResolvedValueOnce(incomingLinks); // getLinksTo
      mockPrisma.location.findMany.mockResolvedValue([mockLocation]);
      mockPrisma.journalEntry.findMany.mockResolvedValue([mockJournalEntry]);

      const result = await entityLinkService.getAllLinksForEntity(
        TEST_USER_ID,
        TEST_TRIP_ID,
        'PHOTO',
        1
      );

      expect(result.linksFrom).toHaveLength(1);
      expect(result.linksTo).toHaveLength(1);
      expect(result.summary.totalLinks).toBe(2);
      expect(result.summary.entityType).toBe('PHOTO');
      expect(result.summary.entityId).toBe(1);
    });

    it('should calculate correct link counts by entity type', async () => {
      const outgoingLinks = [
        createMockEntityLink({ id: 1, targetType: 'LOCATION', targetId: 2 }),
        createMockEntityLink({ id: 2, targetType: 'LOCATION', targetId: 20 }),
        createMockEntityLink({ id: 3, targetType: 'ACTIVITY', targetId: 3 }),
      ];
      const incomingLinks = [
        createMockEntityLink({
          id: 4,
          sourceType: 'JOURNAL_ENTRY',
          sourceId: 6,
          targetType: 'PHOTO',
          targetId: 1,
        }),
      ];

      mockPrisma.entityLink.findMany
        .mockResolvedValueOnce(outgoingLinks)
        .mockResolvedValueOnce(incomingLinks);
      mockPrisma.location.findMany.mockResolvedValue([
        mockLocation,
        { ...mockLocation, id: 20 },
      ]);
      mockPrisma.activity.findMany.mockResolvedValue([mockActivity]);
      mockPrisma.journalEntry.findMany.mockResolvedValue([mockJournalEntry]);

      const result = await entityLinkService.getAllLinksForEntity(
        TEST_USER_ID,
        TEST_TRIP_ID,
        'PHOTO',
        1
      );

      expect(result.summary.linkCounts.LOCATION).toBe(2);
      expect(result.summary.linkCounts.ACTIVITY).toBe(1);
      expect(result.summary.linkCounts.JOURNAL_ENTRY).toBe(1);
      expect(result.summary.totalLinks).toBe(4);
    });
  });

  // ==========================================================================
  // LINK-011: Delete link by ID
  // ==========================================================================
  describe('LINK-011: Delete link by ID', () => {
    it('should delete a link by its ID', async () => {
      mockPrisma.entityLink.findFirst.mockResolvedValue(createMockEntityLink());
      mockPrisma.entityLink.delete.mockResolvedValue(createMockEntityLink());

      await entityLinkService.deleteLinkById(TEST_USER_ID, TEST_TRIP_ID, 1);

      expect(mockPrisma.entityLink.findFirst).toHaveBeenCalledWith({
        where: { id: 1, tripId: TEST_TRIP_ID },
      });
      expect(mockPrisma.entityLink.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw error if link not found', async () => {
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);

      await expect(
        entityLinkService.deleteLinkById(TEST_USER_ID, TEST_TRIP_ID, 999)
      ).rejects.toThrow(AppError);
      await expect(
        entityLinkService.deleteLinkById(TEST_USER_ID, TEST_TRIP_ID, 999)
      ).rejects.toThrow('Link not found');
    });
  });

  // ==========================================================================
  // LINK-012: Delete all links for entity
  // ==========================================================================
  describe('LINK-012: Delete all links for entity', () => {
    it('should delete all links where entity is source or target', async () => {
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 5 });

      const result = await entityLinkService.deleteAllLinksForEntity(
        TEST_USER_ID,
        TEST_TRIP_ID,
        'PHOTO',
        1
      );

      expect(mockPrisma.entityLink.deleteMany).toHaveBeenCalledWith({
        where: {
          tripId: TEST_TRIP_ID,
          OR: [
            { sourceType: 'PHOTO', sourceId: 1 },
            { targetType: 'PHOTO', targetId: 1 },
          ],
        },
      });
      expect(result.deleted).toBe(5);
    });

    it('should return zero when no links exist', async () => {
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 0 });

      const result = await entityLinkService.deleteAllLinksForEntity(
        TEST_USER_ID,
        TEST_TRIP_ID,
        'PHOTO',
        999
      );

      expect(result.deleted).toBe(0);
    });
  });

  // ==========================================================================
  // LINK-013: Trip link summary counts
  // ==========================================================================
  describe('LINK-013: Trip link summary counts', () => {
    it('should return link summary for all entities in trip', async () => {
      const links = [
        createMockEntityLink({
          id: 1,
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
          targetId: 2,
        }),
        createMockEntityLink({
          id: 2,
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'ACTIVITY',
          targetId: 3,
        }),
        createMockEntityLink({
          id: 3,
          sourceType: 'ACTIVITY',
          sourceId: 3,
          targetType: 'LOCATION',
          targetId: 2,
        }),
      ];

      mockPrisma.entityLink.findMany.mockResolvedValue(links);

      const result = await entityLinkService.getTripLinkSummary(
        TEST_USER_ID,
        TEST_TRIP_ID
      );

      // Photo:1 has 2 outgoing links
      const photoSummary = result.get('PHOTO:1');
      expect(photoSummary?.totalLinks).toBe(2);
      expect(photoSummary?.linkCounts.LOCATION).toBe(1);
      expect(photoSummary?.linkCounts.ACTIVITY).toBe(1);

      // Location:2 receives links from Photo:1 and Activity:3
      const locationSummary = result.get('LOCATION:2');
      expect(locationSummary?.totalLinks).toBe(2);
      expect(locationSummary?.linkCounts.PHOTO).toBe(1);
      expect(locationSummary?.linkCounts.ACTIVITY).toBe(1);

      // Activity:3 has 1 incoming (from Photo) and 1 outgoing (to Location)
      const activitySummary = result.get('ACTIVITY:3');
      expect(activitySummary?.totalLinks).toBe(2);
    });

    it('should return empty map when no links exist', async () => {
      mockPrisma.entityLink.findMany.mockResolvedValue([]);

      const result = await entityLinkService.getTripLinkSummary(
        TEST_USER_ID,
        TEST_TRIP_ID
      );

      expect(result.size).toBe(0);
    });
  });

  // ==========================================================================
  // LINK-014: Link enrichment includes entity details
  // ==========================================================================
  describe('LINK-014: Link enrichment includes entity details', () => {
    it('should enrich outgoing links with target entity details', async () => {
      const links = [
        createMockEntityLink({ targetType: 'LOCATION', targetId: 2 }),
      ];

      mockPrisma.entityLink.findMany.mockResolvedValue(links);
      mockPrisma.location.findMany.mockResolvedValue([mockLocation]);

      const result = await entityLinkService.getLinksFrom(TEST_USER_ID, {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO',
        sourceId: 1,
      });

      expect(result[0].targetEntity).toBeDefined();
      expect(result[0].targetEntity?.id).toBe(2);
      expect(result[0].targetEntity?.name).toBe('Test Location');
    });

    it('should enrich incoming links with source entity details', async () => {
      const links = [
        createMockEntityLink({
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
          targetId: 2,
        }),
      ];

      mockPrisma.entityLink.findMany.mockResolvedValue(links);
      mockPrisma.photo.findMany.mockResolvedValue([mockPhoto]);

      const result = await entityLinkService.getLinksTo(TEST_USER_ID, {
        tripId: TEST_TRIP_ID,
        targetType: 'LOCATION',
        targetId: 2,
      });

      expect(result[0].sourceEntity).toBeDefined();
      expect(result[0].sourceEntity?.id).toBe(1);
      expect(result[0].sourceEntity?.caption).toBe('Test Photo');
      expect(result[0].sourceEntity?.thumbnailPath).toBe('/uploads/thumb_test.jpg');
    });

    it('should handle transportation details correctly', async () => {
      const links = [
        createMockEntityLink({
          sourceType: 'TRANSPORTATION',
          sourceId: 5,
          targetType: 'LOCATION',
          targetId: 2,
        }),
      ];

      mockPrisma.entityLink.findMany.mockResolvedValue(links);
      mockPrisma.transportation.findMany.mockResolvedValue([mockTransportation]);

      const result = await entityLinkService.getLinksTo(TEST_USER_ID, {
        tripId: TEST_TRIP_ID,
        targetType: 'LOCATION',
        targetId: 2,
      });

      expect(result[0].sourceEntity?.name).toBe('Flight - Test Airlines');
    });
  });

  // ==========================================================================
  // LINK-015: Verify ownership on link creation
  // ==========================================================================
  describe('LINK-015: Verify ownership on link creation', () => {
    it('should verify trip access before creating link', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockResolvedValue(createMockEntityLink());

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockVerifyTripAccessWithPermission).toHaveBeenCalledWith(
        TEST_USER_ID, TEST_TRIP_ID, 'edit'
      );
    });

    it('should throw error if user does not own trip', async () => {
      mockVerifyTripAccessWithPermission.mockRejectedValue(
        new AppError('Trip not found or access denied', 404)
      );

      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });
  });

  // ==========================================================================
  // LINK-016: Verify trip context on link creation
  // ==========================================================================
  describe('LINK-016: Verify trip context on link creation', () => {
    it('should verify source entity belongs to trip', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 999, // Photo doesn't exist in trip
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.photo.findFirst.mockResolvedValue(null); // Photo not found

      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        AppError
      );
      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        /PHOTO with ID 999 not found in trip/
      );
    });

    it('should verify target entity belongs to trip', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 999, // Location doesn't exist in trip
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.location.findFirst.mockResolvedValue(null); // Location not found

      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        AppError
      );
      await expect(entityLinkService.createLink(TEST_USER_ID, input)).rejects.toThrow(
        /LOCATION with ID 999 not found in trip/
      );
    });
  });

  // ==========================================================================
  // LINK-017: All 7 entity types supported
  // ==========================================================================
  describe('LINK-017: All 7 entity types supported', () => {
    const entityTypes = [
      { type: 'PHOTO', mock: mockPhoto, model: 'photo' },
      { type: 'LOCATION', mock: mockLocation, model: 'location' },
      { type: 'ACTIVITY', mock: mockActivity, model: 'activity' },
      { type: 'LODGING', mock: mockLodging, model: 'lodging' },
      { type: 'TRANSPORTATION', mock: mockTransportation, model: 'transportation' },
      { type: 'JOURNAL_ENTRY', mock: mockJournalEntry, model: 'journalEntry' },
      { type: 'PHOTO_ALBUM', mock: mockPhotoAlbum, model: 'photoAlbum' },
    ] as const;

    it.each(entityTypes)(
      'should support $type as source entity',
      async ({ type, mock, model }) => {
        const input = {
          tripId: TEST_TRIP_ID,
          sourceType: type,
          sourceId: mock.id,
          targetType: 'LOCATION' as const,
          targetId: type === 'LOCATION' ? 20 : 2, // Avoid self-link for LOCATION
        };

        // Mock source entity lookup
        (mockPrisma[model].findFirst as jest.Mock).mockResolvedValue(mock);
        // Mock target entity lookup
        if (type !== 'LOCATION') {
          mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
        } else {
          mockPrisma.location.findFirst.mockResolvedValue({ ...mockLocation, id: 20 });
        }
        mockPrisma.entityLink.findFirst.mockResolvedValue(null);
        mockPrisma.entityLink.create.mockResolvedValue(
          createMockEntityLink({ sourceType: type, sourceId: mock.id })
        );

        const result = await entityLinkService.createLink(TEST_USER_ID, input);

        expect(result.sourceType).toBe(type);
      }
    );

    it.each(entityTypes)(
      'should support $type as target entity',
      async ({ type, mock, model }) => {
        const input = {
          tripId: TEST_TRIP_ID,
          sourceType: 'PHOTO' as const,
          sourceId: type === 'PHOTO' ? 10 : 1, // Avoid self-link for PHOTO
          targetType: type,
          targetId: mock.id,
        };

        // Mock source entity lookup
        if (type !== 'PHOTO') {
          mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
        } else {
          mockPrisma.photo.findFirst.mockResolvedValue({ ...mockPhoto, id: 10 });
        }
        // Mock target entity lookup
        (mockPrisma[model].findFirst as jest.Mock).mockResolvedValue(mock);
        mockPrisma.entityLink.findFirst.mockResolvedValue(null);
        mockPrisma.entityLink.create.mockResolvedValue(
          createMockEntityLink({ targetType: type, targetId: mock.id })
        );

        const result = await entityLinkService.createLink(TEST_USER_ID, input);

        expect(result.targetType).toBe(type);
      }
    );
  });

  // ==========================================================================
  // LINK-018: All 6 relationship types supported
  // ==========================================================================
  describe('LINK-018: All 6 relationship types supported', () => {
    const relationships = [
      'RELATED',
      'TAKEN_AT',
      'OCCURRED_AT',
      'PART_OF',
      'DOCUMENTS',
      'FEATURED_IN',
    ] as const;

    it.each(relationships)(
      'should create link with %s relationship',
      async (relationship) => {
        const input = {
          tripId: TEST_TRIP_ID,
          sourceType: 'PHOTO' as const,
          sourceId: 1,
          targetType: 'LOCATION' as const,
          targetId: 2,
          relationship,
        };

        mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
        mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
        mockPrisma.entityLink.findFirst.mockResolvedValue(null);
        mockPrisma.entityLink.create.mockImplementation(async (args) => {
          return createMockEntityLink({ relationship: args.data.relationship });
        });

        const result = await entityLinkService.createLink(TEST_USER_ID, input);

        expect(result.relationship).toBe(relationship);
      }
    );

    it('should auto-detect DOCUMENTS for journal_entry source', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'JOURNAL_ENTRY' as const,
        sourceId: 6,
        targetType: 'ACTIVITY' as const,
        targetId: 3,
      };

      mockPrisma.journalEntry.findFirst.mockResolvedValue(mockJournalEntry);
      mockPrisma.activity.findFirst.mockResolvedValue(mockActivity);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockImplementation(async (args) => {
        return createMockEntityLink({
          sourceType: 'JOURNAL_ENTRY',
          relationship: args.data.relationship,
        });
      });

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationship: 'DOCUMENTS',
          }),
        })
      );
    });

    it('should auto-detect FEATURED_IN for photo to album', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'PHOTO_ALBUM' as const,
        targetId: 7,
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.photoAlbum.findFirst.mockResolvedValue(mockPhotoAlbum);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockImplementation(async (args) => {
        return createMockEntityLink({
          targetType: 'PHOTO_ALBUM',
          relationship: args.data.relationship,
        });
      });

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationship: 'FEATURED_IN',
          }),
        })
      );
    });

    it('should auto-detect FEATURED_IN for photo to journal', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'JOURNAL_ENTRY' as const,
        targetId: 6,
      };

      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.journalEntry.findFirst.mockResolvedValue(mockJournalEntry);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockImplementation(async (args) => {
        return createMockEntityLink({
          targetType: 'JOURNAL_ENTRY',
          relationship: args.data.relationship,
        });
      });

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationship: 'FEATURED_IN',
          }),
        })
      );
    });

    it('should default to RELATED for unspecified generic links', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'LOCATION' as const,
        sourceId: 2,
        targetType: 'ACTIVITY' as const,
        targetId: 3,
      };

      mockPrisma.location.findFirst.mockResolvedValue(mockLocation);
      mockPrisma.activity.findFirst.mockResolvedValue(mockActivity);
      mockPrisma.entityLink.findFirst.mockResolvedValue(null);
      mockPrisma.entityLink.create.mockImplementation(async (args) => {
        return createMockEntityLink({
          sourceType: 'LOCATION',
          targetType: 'ACTIVITY',
          relationship: args.data.relationship,
        });
      });

      await entityLinkService.createLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            relationship: 'RELATED',
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Additional Edge Cases
  // ==========================================================================
  describe('Additional edge cases', () => {
    it('should delete link by entity details', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 1,
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.entityLink.findFirst.mockResolvedValue(createMockEntityLink());
      mockPrisma.entityLink.delete.mockResolvedValue(createMockEntityLink());

      await entityLinkService.deleteLink(TEST_USER_ID, input);

      expect(mockPrisma.entityLink.findFirst).toHaveBeenCalledWith({
        where: {
          tripId: TEST_TRIP_ID,
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
          targetId: 2,
        },
      });
      expect(mockPrisma.entityLink.delete).toHaveBeenCalled();
    });

    it('should throw error when deleting non-existent link by entity details', async () => {
      const input = {
        tripId: TEST_TRIP_ID,
        sourceType: 'PHOTO' as const,
        sourceId: 999,
        targetType: 'LOCATION' as const,
        targetId: 2,
      };

      mockPrisma.entityLink.findFirst.mockResolvedValue(null);

      await expect(entityLinkService.deleteLink(TEST_USER_ID, input)).rejects.toThrow(
        'Link not found'
      );
    });

    it('should update link relationship and notes', async () => {
      mockPrisma.entityLink.findFirst.mockResolvedValue(createMockEntityLink());
      mockPrisma.entityLink.update.mockResolvedValue(
        createMockEntityLink({
          relationship: 'OCCURRED_AT',
          notes: 'Updated note',
        })
      );

      const result = await entityLinkService.updateLink(
        TEST_USER_ID,
        TEST_TRIP_ID,
        1,
        {
          relationship: 'OCCURRED_AT',
          notes: 'Updated note',
        }
      );

      expect(mockPrisma.entityLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          relationship: 'OCCURRED_AT',
          notes: 'Updated note',
        },
      });
      expect(result.relationship).toBe('OCCURRED_AT');
      expect(result.notes).toBe('Updated note');
    });

    it('should get photos linked to an entity', async () => {
      const links = [
        createMockEntityLink({ sourceId: 1 }),
        createMockEntityLink({ sourceId: 10 }),
      ];

      mockPrisma.entityLink.findMany.mockResolvedValue(links);
      mockPrisma.photo.findMany.mockResolvedValue([
        mockPhoto,
        { ...mockPhoto, id: 10 },
      ]);

      const result = await entityLinkService.getPhotosForEntity(
        TEST_USER_ID,
        TEST_TRIP_ID,
        'LOCATION',
        2
      );

      expect(result).toHaveLength(2);
      expect(mockPrisma.entityLink.findMany).toHaveBeenCalledWith({
        where: {
          tripId: TEST_TRIP_ID,
          sourceType: 'PHOTO',
          targetType: 'LOCATION',
          targetId: 2,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('should return empty array when no photos linked', async () => {
      mockPrisma.entityLink.findMany.mockResolvedValue([]);

      const result = await entityLinkService.getPhotosForEntity(
        TEST_USER_ID,
        TEST_TRIP_ID,
        'LOCATION',
        2
      );

      expect(result).toHaveLength(0);
    });

    it('should get links by target type', async () => {
      const links = [
        { sourceType: 'PHOTO', sourceId: 1, targetId: 2 },
        { sourceType: 'ACTIVITY', sourceId: 3, targetId: 2 },
      ];

      mockPrisma.entityLink.findMany.mockResolvedValue(links);

      const result = await entityLinkService.getLinksByTargetType(
        TEST_USER_ID,
        TEST_TRIP_ID,
        'LOCATION'
      );

      expect(result).toHaveLength(2);
      expect(result[0].sourceType).toBe('PHOTO');
      expect(result[1].sourceType).toBe('ACTIVITY');
    });
  });
});
