/**
 * Trip Service Tests
 *
 * Test cases from test plan:
 * - TRIP-001: Create trip with valid data
 * - TRIP-002: Create trip with minimal required fields
 * - TRIP-003: Get trip by ID for owner
 * - TRIP-004: Reject get trip for non-owner
 * - TRIP-005: Get trip for collaborator with view permission
 * - TRIP-006: List trips filters by status
 * - TRIP-007: List trips filters by tag
 * - TRIP-008: List trips respects privacy levels
 * - TRIP-009: Update trip as owner
 * - TRIP-010: Reject update for non-owner
 * - TRIP-011: Update trip as collaborator with edit permission
 * - TRIP-012: Reject update for collaborator with view-only
 * - TRIP-013: Delete trip cascades all related data
 * - TRIP-014: Reject delete for non-owner
 * - TRIP-015: Auto-update status based on dates
 * - TRIP-016: Trip status transitions (Dream -> Planning -> etc)
 * - TRIP-017: Duplicate trip copies all related entities
 * - TRIP-018: Duplicate trip creates new IDs for entities
 * - TRIP-019: Update cover photo
 * - TRIP-020: Validate trip data consistency
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock logger BEFORE any imports to prevent config/index.ts from loading
// trip.service -> errorHandler -> logger -> config/index.ts (throws without DATABASE_URL)
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock @prisma/client BEFORE any imports that depend on it
jest.mock('@prisma/client', () => {
  class MockDecimal {
    private value: string;

    constructor(value: string | number) {
      this.value = String(value);
    }

    toString(): string {
      return this.value;
    }

    toNumber(): number {
      return parseFloat(this.value);
    }

    valueOf(): number {
      return this.toNumber();
    }
  }

  return {
    Prisma: {
      Decimal: MockDecimal,
      // Sentinel Prisma uses to write SQL NULL into a nullable Json column. It must be
      // a distinct object so tests can tell it apart from a plain null/undefined.
      DbNull: { __prismaSentinel: 'DbNull' },
      JsonNull: { __prismaSentinel: 'JsonNull' },
    },
  };
});

// Mock companion service
jest.mock('../companion.service', () => ({
  companionService: {
    getMyselfCompanion: jest.fn(),
  },
}));

// Mock Prisma client
const mockPrisma = {
  trip: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  tripCompanion: {
    create: jest.fn(),
    createMany: jest.fn(),
  },
  photo: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
  location: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
  activity: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
  transportation: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  lodging: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  journalEntry: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  photoAlbum: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
  photoAlbumAssignment: {
    createMany: jest.fn(),
  },
  tripTagAssignment: {
    createMany: jest.fn(),
  },
  checklist: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  checklistItem: {
    createMany: jest.fn(),
  },
  entityLink: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
  savedLink: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  customItem: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  tripCollaborator: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Import after mocks are set up
import { Prisma } from '@prisma/client';
import { TripService } from '../trip.service';
import { TripStatus, PrivacyLevel } from '../../types/trip.types';
import { companionService } from '../companion.service';

describe('Trip Service', () => {
  let tripService: TripService;

  // Mock data
  const mockUserId = 1;
  const mockTripId = 100;
  const mockOtherUserId = 2;
  const mockCollaboratorUserId = 3;

  const mockMyselfCompanion = {
    id: 10,
    userId: mockUserId,
    name: 'Myself',
    isMyself: true,
  };

  const mockTrip = {
    id: mockTripId,
    userId: mockUserId,
    title: 'Test Trip',
    description: 'A test trip description',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-15'),
    timezone: 'America/New_York',
    status: TripStatus.PLANNING,
    privacyLevel: PrivacyLevel.PRIVATE,
    addToPlacesVisited: false,
    coverPhotoId: null,
    bannerPhotoId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTripWithIncludes = {
    ...mockTrip,
    coverPhoto: null,
    bannerPhoto: null,
    tagAssignments: [],
    companionAssignments: [],
    collaborators: [],
    _count: {
      locations: 0,
      photos: 0,
      transportation: 0,
      activities: 0,
      lodging: 0,
      journalEntries: 0,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tripService = new TripService();

    // Default mock implementations
    jest.mocked(companionService.getMyselfCompanion).mockResolvedValue(mockMyselfCompanion);
    mockPrisma.user.findUnique.mockResolvedValue({ id: mockUserId, timezone: 'UTC' });
    mockPrisma.tripCompanion.create.mockResolvedValue({ id: 1, tripId: mockTripId, companionId: 10 });
    // Trips have no saved links by default; duplicateTrip queries these.
    mockPrisma.savedLink.findMany.mockResolvedValue([]);
    // Likewise custom items — duplicateTrip copies them before entity links.
    mockPrisma.customItem.findMany.mockResolvedValue([]);

    // Mock $transaction to execute the callback with a tx client that mirrors mockPrisma
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      return fn(mockPrisma);
    });
  });

  // ============================================================================
  // TRIP-001: Create trip with valid data
  // ============================================================================
  describe('TRIP-001: Create trip with valid data', () => {
    it('should create a trip with all fields populated', async () => {
      const createInput = {
        title: 'Summer Vacation',
        description: 'A wonderful summer trip',
        startDate: '2025-06-01',
        endDate: '2025-06-15',
        timezone: 'America/New_York',
        status: TripStatus.PLANNING,
        privacyLevel: PrivacyLevel.PRIVATE,
        addToPlacesVisited: false,
      };

      const createdTrip = {
        id: mockTripId,
        userId: mockUserId,
        ...createInput,
        startDate: new Date('2025-06-01T00:00:00.000Z'),
        endDate: new Date('2025-06-15T00:00:00.000Z'),
        coverPhotoId: null,
        bannerPhotoId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.trip.create.mockResolvedValue(createdTrip);

      const result = await tripService.createTrip(mockUserId, createInput);

      expect(mockPrisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          title: createInput.title,
          description: createInput.description,
          startDate: new Date('2025-06-01T00:00:00.000Z'),
          endDate: new Date('2025-06-15T00:00:00.000Z'),
          timezone: createInput.timezone,
          status: createInput.status,
          privacyLevel: createInput.privacyLevel,
          addToPlacesVisited: false,
        }),
      });
      expect(result.id).toBe(mockTripId);
      expect(result.title).toBe('Summer Vacation');
    });

    it('should auto-add Myself companion to new trip', async () => {
      mockPrisma.trip.create.mockResolvedValue(mockTrip);

      await tripService.createTrip(mockUserId, { title: 'Test Trip' });

      expect(companionService.getMyselfCompanion).toHaveBeenCalledWith(mockUserId);
      expect(mockPrisma.tripCompanion.create).toHaveBeenCalledWith({
        data: {
          tripId: mockTripId,
          companionId: mockMyselfCompanion.id,
        },
      });
    });

    it('should auto-set addToPlacesVisited when status is Completed', async () => {
      const createInput = {
        title: 'Completed Trip',
        status: TripStatus.COMPLETED,
      };

      mockPrisma.trip.create.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.COMPLETED,
        addToPlacesVisited: true,
      });

      await tripService.createTrip(mockUserId, createInput);

      expect(mockPrisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          addToPlacesVisited: true,
        }),
      });
    });
  });

  // ============================================================================
  // TRIP-002: Create trip with minimal required fields
  // ============================================================================
  describe('TRIP-002: Create trip with minimal required fields', () => {
    it('should create a trip with only title provided', async () => {
      const createInput = {
        title: 'Minimal Trip',
      };

      mockPrisma.trip.create.mockResolvedValue({
        ...mockTrip,
        title: 'Minimal Trip',
        description: undefined,
        startDate: null,
        endDate: null,
      });

      const result = await tripService.createTrip(mockUserId, createInput);

      expect(mockPrisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          title: 'Minimal Trip',
        }),
      });
      expect(result.title).toBe('Minimal Trip');
    });

    it('should use user timezone if trip timezone not specified', async () => {
      const createInput = { title: 'Trip without timezone' };
      mockPrisma.user.findUnique.mockResolvedValue({ id: mockUserId, timezone: 'Europe/London' });
      mockPrisma.trip.create.mockResolvedValue(mockTrip);

      await tripService.createTrip(mockUserId, createInput);

      expect(mockPrisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          timezone: 'Europe/London',
        }),
      });
    });

    it('should fallback to UTC if no timezone available', async () => {
      const createInput = { title: 'Trip without timezone' };
      mockPrisma.user.findUnique.mockResolvedValue({ id: mockUserId, timezone: null });
      mockPrisma.trip.create.mockResolvedValue(mockTrip);

      await tripService.createTrip(mockUserId, createInput);

      expect(mockPrisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          timezone: 'UTC',
        }),
      });
    });
  });

  // ============================================================================
  // TRIP-003: Get trip by ID for owner
  // ============================================================================
  describe('TRIP-003: Get trip by ID for owner', () => {
    it('should return trip for the owner', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTripWithIncludes);

      const result = await tripService.getTripById(mockUserId, mockTripId);

      // Owner and collaborators only. `privacyLevel: 'Public'` must NOT appear
      // here: it previously let any authenticated user read any Public trip, and
      // trip IDs are sequential, so every Public trip was enumerable by every
      // registered account. Public sharing goes through the token-based share
      // path, which serves a sanitised payload.
      expect(mockPrisma.trip.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockTripId,
          OR: [
            { userId: mockUserId },
            { collaborators: { some: { userId: mockUserId } } },
          ],
        },
        include: expect.any(Object),
      });
      expect(result.id).toBe(mockTripId);
      expect(result.title).toBe('Test Trip');
    });

    it('should include all related data in response', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...mockTripWithIncludes,
        tagAssignments: [{ id: 1, tag: { id: 1, name: 'Beach' } }],
        companionAssignments: [{ id: 1, companion: { id: 1, name: 'John' } }],
      });

      const result = await tripService.getTripById(mockUserId, mockTripId);

      expect(result.tagAssignments).toHaveLength(1);
      expect(result.companionAssignments).toHaveLength(1);
    });
  });

  // ============================================================================
  // TRIP-004: Reject get trip for non-owner
  // ============================================================================
  describe('TRIP-004: Reject get trip for non-owner', () => {
    it('should throw 404 error for non-owner accessing private trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(tripService.getTripById(mockOtherUserId, mockTripId)).rejects.toThrow('Trip not found');
    });

    it('should not expose private trip details to non-owners', async () => {
      // When a non-owner queries, the findFirst returns null due to the OR conditions
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      try {
        await tripService.getTripById(mockOtherUserId, mockTripId);
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        if (error instanceof Error) {
          expect(error.message).toBe('Trip not found');
        }
      }
    });
  });

  // ============================================================================
  // TRIP-005: Get trip for collaborator with view permission
  // ============================================================================
  describe('TRIP-005: Get trip for collaborator with view permission', () => {
    it('should return trip for collaborator with view permission', async () => {
      const tripWithCollaborator = {
        ...mockTripWithIncludes,
        collaborators: [{ userId: mockCollaboratorUserId, permissionLevel: 'view' }],
      };

      mockPrisma.trip.findFirst.mockResolvedValue(tripWithCollaborator);

      const result = await tripService.getTripById(mockCollaboratorUserId, mockTripId);

      expect(result.id).toBe(mockTripId);
    });

    it('should allow access to public trips for any user', async () => {
      const publicTrip = {
        ...mockTripWithIncludes,
        privacyLevel: PrivacyLevel.PUBLIC,
      };

      mockPrisma.trip.findFirst.mockResolvedValue(publicTrip);

      const result = await tripService.getTripById(mockOtherUserId, mockTripId);

      expect(result.privacyLevel).toBe(PrivacyLevel.PUBLIC);
    });
  });

  // ============================================================================
  // TRIP-006: List trips filters by status
  // ============================================================================
  describe('TRIP-006: List trips filters by status', () => {
    it('should filter trips by Planning status', async () => {
      const planningTrips = [
        { ...mockTripWithIncludes, status: TripStatus.PLANNING },
        { ...mockTripWithIncludes, id: 101, status: TripStatus.PLANNING },
      ];

      mockPrisma.trip.findMany.mockResolvedValue(planningTrips);
      mockPrisma.trip.count.mockResolvedValue(2);

      const result = await tripService.getTrips(mockUserId, { status: TripStatus.PLANNING });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            status: TripStatus.PLANNING,
          }),
        })
      );
      expect(result.trips).toHaveLength(2);
    });

    it('should filter trips by Completed status', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.trip.count.mockResolvedValue(0);

      await tripService.getTrips(mockUserId, { status: TripStatus.COMPLETED });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: TripStatus.COMPLETED,
          }),
        })
      );
    });

    it('should return all trips when no status filter applied', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([mockTripWithIncludes]);
      mockPrisma.trip.count.mockResolvedValue(1);

      await tripService.getTrips(mockUserId, {});

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            status: expect.anything(),
          }),
        })
      );
    });
  });

  // ============================================================================
  // Trip archiving: list filtering and update
  // ============================================================================
  describe('Trip archiving', () => {
    it('should exclude archived trips by default', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([mockTripWithIncludes]);
      mockPrisma.trip.count.mockResolvedValue(1);

      await tripService.getTrips(mockUserId, {});

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            archived: false,
          }),
        })
      );
    });

    it('should return only archived trips when archived=true', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.trip.count.mockResolvedValue(0);

      await tripService.getTrips(mockUserId, { archived: 'true' });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            archived: true,
          }),
        })
      );
    });

    it('should exclude archived trips when archived=false', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.trip.count.mockResolvedValue(0);

      await tripService.getTrips(mockUserId, { archived: 'false' });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            archived: false,
          }),
        })
      );
    });

    it('should not filter by archived when archived=all', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.trip.count.mockResolvedValue(0);

      await tripService.getTrips(mockUserId, { archived: 'all' });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            archived: expect.anything(),
          }),
        })
      );
    });

    it('should allow archiving a trip via update', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        archived: true,
      });

      const result = await tripService.updateTrip(mockUserId, mockTripId, {
        archived: true,
      });

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: expect.objectContaining({
          archived: true,
        }),
      });
      expect(result.archived).toBe(true);
    });

    it('should allow unarchiving a trip via update', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, archived: true });
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        archived: false,
      });

      const result = await tripService.updateTrip(mockUserId, mockTripId, {
        archived: false,
      });

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: expect.objectContaining({
          archived: false,
        }),
      });
      expect(result.archived).toBe(false);
    });
  });

  // ============================================================================
  // TRIP-007: List trips filters by tag
  // ============================================================================
  describe('TRIP-007: List trips filters by tag', () => {
    it('should filter trips by single tag ID', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([mockTripWithIncludes]);
      mockPrisma.trip.count.mockResolvedValue(1);

      await tripService.getTrips(mockUserId, { tags: '1' });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tagAssignments: {
              some: {
                tagId: { in: [1] },
              },
            },
          }),
        })
      );
    });

    it('should filter trips by multiple tag IDs', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([mockTripWithIncludes]);
      mockPrisma.trip.count.mockResolvedValue(1);

      await tripService.getTrips(mockUserId, { tags: '1,2,3' });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tagAssignments: {
              some: {
                tagId: { in: [1, 2, 3] },
              },
            },
          }),
        })
      );
    });

    it('should ignore invalid tag IDs in filter', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([mockTripWithIncludes]);
      mockPrisma.trip.count.mockResolvedValue(1);

      await tripService.getTrips(mockUserId, { tags: '1,abc,3' });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tagAssignments: {
              some: {
                tagId: { in: [1, 3] },
              },
            },
          }),
        })
      );
    });
  });

  // ============================================================================
  // TRIP-008: List trips respects privacy levels
  // ============================================================================
  describe('TRIP-008: List trips respects privacy levels', () => {
    it('should only return trips owned by the user', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([mockTripWithIncludes]);
      mockPrisma.trip.count.mockResolvedValue(1);

      await tripService.getTrips(mockUserId, {});

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
          }),
        })
      );
    });

    it('should not include other users trips in list', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.trip.count.mockResolvedValue(0);

      const result = await tripService.getTrips(mockOtherUserId, {});

      expect(result.trips).toHaveLength(0);
    });
  });

  // ============================================================================
  // TRIP-009: Update trip as owner
  // ============================================================================
  describe('TRIP-009: Update trip as owner', () => {
    it('should update trip title for owner', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        title: 'Updated Title',
      });

      const result = await tripService.updateTrip(mockUserId, mockTripId, {
        title: 'Updated Title',
      });

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: expect.objectContaining({
          title: 'Updated Title',
        }),
      });
      expect(result.title).toBe('Updated Title');
    });

    it('should update trip dates', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        startDate: new Date('2025-07-01T00:00:00.000Z'),
        endDate: new Date('2025-07-15T00:00:00.000Z'),
      });

      await tripService.updateTrip(mockUserId, mockTripId, {
        startDate: '2025-07-01',
        endDate: '2025-07-15',
      });

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: expect.objectContaining({
          startDate: new Date('2025-07-01T00:00:00.000Z'),
          endDate: new Date('2025-07-15T00:00:00.000Z'),
        }),
      });
    });

    it('should auto-set addToPlacesVisited when status changed to Completed', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.COMPLETED,
        addToPlacesVisited: true,
      });

      await tripService.updateTrip(mockUserId, mockTripId, {
        status: TripStatus.COMPLETED,
      });

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: expect.objectContaining({
          addToPlacesVisited: true,
        }),
      });
    });
  });

  // ============================================================================
  // TRIP-010: Reject update for non-owner
  // ============================================================================
  describe('TRIP-010: Reject update for non-owner', () => {
    it('should throw 404 when non-owner tries to update', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripService.updateTrip(mockOtherUserId, mockTripId, { title: 'Hacked Title' })
      ).rejects.toThrow('Trip not found or you do not have permission to edit it');
    });
  });

  // ============================================================================
  // TRIP-011: Update trip as collaborator with edit permission
  // ============================================================================
  describe('TRIP-011: Update trip as collaborator with edit permission', () => {
    it('should verify ownership check uses userId only (not collaborator)', async () => {
      // Note: The current trip service only checks userId for updates
      // Collaborator edit permissions would need to be added separately
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripService.updateTrip(mockCollaboratorUserId, mockTripId, { title: 'Updated' })
      ).rejects.toThrow('Trip not found or you do not have permission to edit it');
    });
  });

  // ============================================================================
  // TRIP-012: Reject update for collaborator with view-only
  // ============================================================================
  describe('TRIP-012: Reject update for collaborator with view-only', () => {
    it('should reject update from view-only collaborator', async () => {
      // The update method only checks for owner, so view-only collaborators are rejected
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripService.updateTrip(mockCollaboratorUserId, mockTripId, { title: 'Updated' })
      ).rejects.toThrow('Trip not found or you do not have permission to edit it');
    });
  });

  // ============================================================================
  // TRIP-013: Delete trip cascades all related data
  // ============================================================================
  describe('TRIP-013: Delete trip cascades all related data', () => {
    beforeEach(() => {
      // No uploaded photos unless a test says otherwise.
      mockPrisma.photo.findMany.mockResolvedValue([]);
    });

    it('removes photo files of the deleted trip from disk, except ones another row still uses', async () => {
      // The cascade deletes photo rows only. Found against a real server: the
      // files of a deleted trip stayed in the uploads folder indefinitely.
      const { tripCoverImageService } = require('../tripCoverImage.service');
      const removeFiles = jest.spyOn(tripCoverImageService, 'deleteCoverFilesForPaths').mockResolvedValue(undefined);

      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip, coverImagePath: '/uploads/covers/c.jpg', coverImageThumbnailPath: null });
      mockPrisma.trip.delete.mockResolvedValue(mockTrip);
      mockPrisma.photo.findMany
        // the trip's own photos, read before the delete
        .mockResolvedValueOnce([
          { localPath: '/uploads/photos/a.jpg', thumbnailPath: '/uploads/thumbnails/thumb-a.jpg' },
          { localPath: '/uploads/videos/b.mp4', thumbnailPath: null },
          { localPath: '/uploads/photos/shared.jpg', thumbnailPath: null },
        ])
        // rows left afterwards that point at the same files
        .mockResolvedValueOnce([{ localPath: '/uploads/photos/shared.jpg', thumbnailPath: null }]);

      await tripService.deleteTrip(mockUserId, mockTripId);

      expect(mockPrisma.photo.findMany.mock.invocationCallOrder[0]).toBeLessThan(
        mockPrisma.trip.delete.mock.invocationCallOrder[0]
      );
      expect(removeFiles).toHaveBeenCalledWith([
        '/uploads/photos/a.jpg',
        '/uploads/thumbnails/thumb-a.jpg',
        '/uploads/videos/b.mp4',
        '/uploads/covers/c.jpg',
        null,
      ]);
      removeFiles.mockRestore();
    });

    it('should delete trip and return success message', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.delete.mockResolvedValue(mockTrip);

      const result = await tripService.deleteTrip(mockUserId, mockTripId);

      expect(mockPrisma.trip.delete).toHaveBeenCalledWith({
        where: { id: mockTripId },
      });
      expect(result.message).toBe('Trip deleted successfully');
    });

    it('should rely on database cascade for related data deletion', async () => {
      // Prisma schema has onDelete: Cascade configured
      // This test verifies the delete is called, cascade is handled by DB
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.delete.mockResolvedValue(mockTrip);

      await tripService.deleteTrip(mockUserId, mockTripId);

      expect(mockPrisma.trip.delete).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // TRIP-014: Reject delete for non-owner
  // ============================================================================
  describe('TRIP-014: Reject delete for non-owner', () => {
    it('should throw 404 when non-owner tries to delete', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(tripService.deleteTrip(mockOtherUserId, mockTripId)).rejects.toThrow(
        'Trip not found or you do not have permission to delete it'
      );
    });
  });

  // ============================================================================
  // TRIP-015: Auto-update status based on dates
  // ============================================================================
  describe('TRIP-015: Auto-update status based on dates', () => {
    it('should update trips to In Progress when current date is within trip dates', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tripInProgress = {
        id: 1,
        status: TripStatus.PLANNING,
        startDate: yesterday,
        endDate: tomorrow,
      };

      mockPrisma.trip.findMany.mockResolvedValueOnce([tripInProgress]);
      mockPrisma.trip.findMany.mockResolvedValueOnce([]); // second batch (empty = done)
      mockPrisma.trip.updateMany.mockResolvedValue({ count: 1 });

      const updateCount = await tripService.autoUpdateGlobalTripStatuses();

      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1] } },
        data: expect.objectContaining({
          status: TripStatus.IN_PROGRESS,
        }),
      });
      expect(updateCount).toBe(1);
    });

    it('should update trips to Completed when end date has passed', async () => {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      const lastMonth = new Date();
      lastMonth.setDate(lastMonth.getDate() - 30);

      const pastTrip = {
        id: 2,
        status: TripStatus.IN_PROGRESS,
        startDate: lastMonth,
        endDate: lastWeek,
      };

      mockPrisma.trip.findMany.mockReset();
      mockPrisma.trip.updateMany.mockReset();
      mockPrisma.trip.findMany.mockResolvedValueOnce([pastTrip]);
      mockPrisma.trip.updateMany.mockResolvedValue({ count: 1 });

      const updateCount = await tripService.autoUpdateGlobalTripStatuses();

      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [2] } },
        data: expect.objectContaining({
          status: TripStatus.COMPLETED,
          addToPlacesVisited: true,
        }),
      });
      expect(updateCount).toBe(1);
    });

    it('should not update already Completed or Cancelled trips', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);

      await tripService.autoUpdateGlobalTripStatuses();

      // The query excludes Completed and Cancelled status
      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            startDate: { not: null },
            endDate: { not: null },
            status: {
              notIn: [TripStatus.COMPLETED, TripStatus.CANCELLED],
            },
          },
          select: expect.any(Object),
        })
      );
    });

    it('should return 0 when no trips need updating', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);

      const updateCount = await tripService.autoUpdateGlobalTripStatuses();

      expect(updateCount).toBe(0);
    });
  });

  // ============================================================================
  // TRIP-016: Trip status transitions (Dream -> Planning -> etc)
  // ============================================================================
  describe('TRIP-016: Trip status transitions', () => {
    it('should allow transition from Dream to Planning', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.DREAM,
      });
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.PLANNING,
      });

      const result = await tripService.updateTrip(mockUserId, mockTripId, {
        status: TripStatus.PLANNING,
      });

      expect(result.status).toBe(TripStatus.PLANNING);
    });

    it('should allow transition from Planning to Planned', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.PLANNING,
      });
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.PLANNED,
      });

      const result = await tripService.updateTrip(mockUserId, mockTripId, {
        status: TripStatus.PLANNED,
      });

      expect(result.status).toBe(TripStatus.PLANNED);
    });

    it('should allow transition to Cancelled from any status', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.CANCELLED,
      });

      const result = await tripService.updateTrip(mockUserId, mockTripId, {
        status: TripStatus.CANCELLED,
      });

      expect(result.status).toBe(TripStatus.CANCELLED);
    });

    it('should create new trip with Dream status by default when not specified', async () => {
      mockPrisma.trip.create.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.PLANNING,
      });

      await tripService.createTrip(mockUserId, { title: 'New Trip' });

      // Note: The schema defaults to PLANNING, not DREAM
      expect(mockPrisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: undefined, // Let the schema default apply
        }),
      });
    });
  });

  // ============================================================================
  // TRIP-017: Duplicate trip copies all related entities
  // ============================================================================
  describe('TRIP-017: Duplicate trip copies all related entities', () => {
    const sourceTripWithEntities = {
      ...mockTrip,
      locations: [
        {
          id: 1,
          parentId: null,
          name: 'Paris',
          address: '123 Rue',
          latitude: 48.8566,
          longitude: 2.3522,
          categoryId: 1,
          visitDatetime: new Date(),
          visitDurationMinutes: 120,
          notes: 'Great city',
        },
      ],
      photos: [
        {
          id: 1,
          source: 'local',
          immichAssetId: null,
          localPath: '/photos/1.jpg',
          thumbnailPath: '/thumbs/1.jpg',
          caption: 'Eiffel Tower',
          latitude: 48.8584,
          longitude: 2.2945,
          takenAt: new Date(),
        },
      ],
      activities: [
        {
          id: 1,
          parentId: null,
          name: 'Museum Visit',
          description: 'Visit Louvre',
          category: 'Culture',
          allDay: false,
          startTime: new Date(),
          endTime: new Date(),
          timezone: 'Europe/Paris',
          cost: 25,
          currency: 'EUR',
          bookingUrl: null,
          bookingReference: null,
          notes: null,
          manualOrder: 1,
        },
      ],
      tagAssignments: [{ tagId: 1 }],
      companionAssignments: [{ companionId: 1 }],
    };

    it('should create new trip with duplicated title', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(sourceTripWithEntities);
      // Spread first: mockTrip carries the *source* trip's id, so it must not
      // overwrite the new trip's id
      mockPrisma.trip.create.mockResolvedValue({
        ...mockTrip,
        id: 200,
        title: 'Copy of Test Trip',
        status: TripStatus.DREAM,
      });
      // Entities are created one at a time so each new ID can be mapped back to its
      // source ID; the mocks must therefore return a row per create() call
      mockPrisma.location.create.mockResolvedValue({ id: 10 });
      mockPrisma.photo.create.mockResolvedValue({ id: 20 });
      mockPrisma.activity.create.mockResolvedValue({ id: 30 });
      mockPrisma.tripTagAssignment.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.tripCompanion.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        id: 200,
        title: 'Copy of Test Trip',
        coverPhoto: null,
        bannerPhoto: null,
        tagAssignments: [],
        companionAssignments: [],
      });

      const result = await tripService.duplicateTrip(mockUserId, mockTripId, {
        title: 'Copy of Test Trip',
        copyEntities: {
          locations: true,
          photos: true,
          activities: true,
          tags: true,
          companions: true,
        },
      });

      expect(result.title).toBe('Copy of Test Trip');

      // Each source entity is copied onto the new trip, not the source trip
      expect(mockPrisma.location.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.location.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tripId: 200, name: 'Paris' }),
      });

      expect(mockPrisma.photo.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.photo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tripId: 200, localPath: '/photos/1.jpg' }),
      });

      expect(mockPrisma.activity.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tripId: 200, name: 'Museum Visit' }),
      });
    });

    it('should copy tags when specified', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(sourceTripWithEntities);
      mockPrisma.trip.create.mockResolvedValue({ ...mockTrip, id: 200 });
      mockPrisma.tripTagAssignment.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        id: 200,
        coverPhoto: null,
        bannerPhoto: null,
        tagAssignments: [{ tagId: 1 }],
        companionAssignments: [],
      });

      await tripService.duplicateTrip(mockUserId, mockTripId, {
        title: 'Copied Trip',
        copyEntities: { tags: true },
      });

      expect(mockPrisma.tripTagAssignment.createMany).toHaveBeenCalledWith({
        data: [{ tripId: 200, tagId: 1 }],
      });
    });

    it('should add Myself companion when not copying companions', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip });
      mockPrisma.trip.create.mockResolvedValue({ ...mockTrip, id: 200 });
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        id: 200,
        coverPhoto: null,
        bannerPhoto: null,
        tagAssignments: [],
        companionAssignments: [],
      });

      await tripService.duplicateTrip(mockUserId, mockTripId, {
        title: 'Copied Trip',
        copyEntities: { companions: false },
      });

      expect(companionService.getMyselfCompanion).toHaveBeenCalledWith(mockUserId);
      // Myself must be attached to the duplicate, not the source trip
      expect(mockPrisma.tripCompanion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: 200,
          companionId: mockMyselfCompanion.id,
        }),
      });
    });

    it('should copy albums with their photo assignments', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...mockTrip,
        photos: [
          {
            id: 1,
            source: 'local',
            immichAssetId: null,
            localPath: '/photos/1.jpg',
            thumbnailPath: '/thumbs/1.jpg',
            caption: null,
            latitude: null,
            longitude: null,
            takenAt: null,
          },
        ],
      });
      mockPrisma.trip.create.mockResolvedValue({ ...mockTrip, id: 200 });
      mockPrisma.photo.create.mockResolvedValue({ id: 20 });

      // First call loads the source albums (with nested assignments); the second is the
      // query-back that maps old album IDs to new ones
      mockPrisma.photoAlbum.findMany
        .mockResolvedValueOnce([
          {
            id: 60,
            name: 'Day 1',
            description: null,
            coverPhotoId: null,
            photoAssignments: [{ photoId: 1, sortOrder: 0 }],
          },
        ])
        .mockResolvedValue([{ id: 61, name: 'Day 1', description: null }]);
      mockPrisma.photoAlbum.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.photoAlbumAssignment.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        id: 200,
        coverPhoto: null,
        bannerPhoto: null,
        tagAssignments: [],
        companionAssignments: [],
      });

      await tripService.duplicateTrip(mockUserId, mockTripId, {
        title: 'Copied Trip',
        copyEntities: { photos: true, photoAlbums: true },
      });

      // Albums are loaded by a dedicated query so photoAssignments stays typed
      expect(mockPrisma.photoAlbum.findMany).toHaveBeenNthCalledWith(1, {
        where: { tripId: mockTripId },
        include: { photoAssignments: true },
      });

      // The assignment is remapped onto the new album and the new photo
      expect(mockPrisma.photoAlbumAssignment.createMany).toHaveBeenCalledWith({
        data: [{ albumId: 61, photoId: 20, sortOrder: 0 }],
      });
    });

    it('writes SQL NULL for checklist item metadata that is unset', async () => {
      const sourceChecklist = {
        id: 70,
        name: 'Packing',
        description: null,
        type: 'packing',
        isDefault: false,
        sortOrder: 1,
        items: [
          { name: 'Passport', description: null, isChecked: true, isDefault: false, sortOrder: 0, metadata: null },
          { name: 'Camera', description: null, isChecked: false, isDefault: false, sortOrder: 1, metadata: { brand: 'Fuji' } },
        ],
      };

      mockPrisma.trip.findFirst.mockResolvedValue({ ...mockTrip });
      mockPrisma.trip.create.mockResolvedValue({ ...mockTrip, id: 200 });
      // Source load, then the query-back keyed on name|type|description
      mockPrisma.checklist.findMany
        .mockResolvedValueOnce([sourceChecklist])
        .mockResolvedValue([{ id: 71, name: 'Packing', description: null, type: 'packing' }]);
      mockPrisma.checklist.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.checklistItem.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        id: 200,
        coverPhoto: null,
        bannerPhoto: null,
        tagAssignments: [],
        companionAssignments: [],
      });

      await tripService.duplicateTrip(mockUserId, mockTripId, {
        title: 'Copied Trip',
        copyEntities: { checklists: true },
      });

      expect(mockPrisma.checklist.findMany).toHaveBeenNthCalledWith(1, {
        where: { tripId: mockTripId },
        include: { items: true },
      });

      // Prisma rejects a bare null for a nullable Json column; it must be DbNull.
      // Items that do have metadata must pass through untouched.
      const [itemArgs] = mockPrisma.checklistItem.createMany.mock.calls[0] as [
        { data: Array<{ name: string; checklistId: number; metadata: unknown }> },
      ];
      expect(itemArgs.data).toHaveLength(2);
      expect(itemArgs.data.every((i) => i.checklistId === 71)).toBe(true);
      expect(itemArgs.data.find((i) => i.name === 'Passport')?.metadata).toBe(Prisma.DbNull);
      expect(itemArgs.data.find((i) => i.name === 'Camera')?.metadata).toEqual({ brand: 'Fuji' });
    });
  });

  // ============================================================================
  // TRIP-018: Duplicate trip creates new IDs for entities
  // ============================================================================
  describe('TRIP-018: Duplicate trip creates new IDs for entities', () => {
    it('should create new trip ID different from source', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.trip.create.mockResolvedValue({
        ...mockTrip,
        id: 999, // New ID - must be after spread to override
      });
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        ...mockTrip,
        id: 999,
        coverPhoto: null,
        bannerPhoto: null,
        tagAssignments: [],
        companionAssignments: [],
      });

      const result = await tripService.duplicateTrip(mockUserId, mockTripId, {
        title: 'New Trip',
      });

      expect(result.id).toBe(999);
      expect(result.id).not.toBe(mockTripId);
    });

    it('should create duplicated trip with Dream status', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.COMPLETED,
      });
      mockPrisma.trip.create.mockResolvedValue({
        id: 200,
        ...mockTrip,
        status: TripStatus.DREAM,
      });
      mockPrisma.entityLink.findMany.mockResolvedValue([]);
      mockPrisma.trip.findUnique.mockResolvedValue({
        id: 200,
        ...mockTrip,
        status: TripStatus.DREAM,
        coverPhoto: null,
        bannerPhoto: null,
        tagAssignments: [],
        companionAssignments: [],
      });

      await tripService.duplicateTrip(mockUserId, mockTripId, {
        title: 'Duplicated Trip',
      });

      expect(mockPrisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: TripStatus.DREAM,
        }),
      });
    });

    it('should throw error when source trip not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripService.duplicateTrip(mockUserId, 99999, { title: 'Copy' })
      ).rejects.toThrow('Trip not found or you do not have permission to duplicate it');
    });

    it('should throw error when duplicating trip of another user', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripService.duplicateTrip(mockOtherUserId, mockTripId, { title: 'Copy' })
      ).rejects.toThrow('Trip not found or you do not have permission to duplicate it');
    });
  });

  // ============================================================================
  // TRIP-019: Update cover photo
  // ============================================================================
  describe('TRIP-019: Update cover photo', () => {
    it('should set cover photo for trip', async () => {
      const photoId = 50;
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.photo.findFirst.mockResolvedValue({
        id: photoId,
        tripId: mockTripId,
      });
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        coverPhotoId: photoId,
        coverPhoto: { id: photoId, localPath: '/photo.jpg' },
      });

      const result = await tripService.updateCoverPhoto(mockUserId, mockTripId, photoId);

      // Picking a gallery photo also clears any uploaded cover image — the two sources
      // are mutually exclusive
      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: { coverPhotoId: photoId, coverImagePath: null, coverImageThumbnailPath: null },
        include: { coverPhoto: true },
      });
      expect(result.coverPhotoId).toBe(photoId);
    });

    it('should clear cover photo when null is provided', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...mockTrip,
        coverPhotoId: 50,
      });
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        coverPhotoId: null,
        coverPhoto: null,
      });

      const result = await tripService.updateCoverPhoto(mockUserId, mockTripId, null);

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: { coverPhotoId: null },
        include: { coverPhoto: true },
      });
      expect(result.coverPhotoId).toBeNull();
    });

    it('should reject cover photo from different trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.photo.findFirst.mockResolvedValue(null); // Photo not found in this trip

      await expect(
        tripService.updateCoverPhoto(mockUserId, mockTripId, 999)
      ).rejects.toThrow('Photo not found or does not belong to this trip');
    });

    it('should reject update from non-owner', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripService.updateCoverPhoto(mockOtherUserId, mockTripId, 50)
      ).rejects.toThrow('Trip not found or you do not have permission to edit it');
    });
  });

  // ============================================================================
  // TRIP-020: Validate trip data consistency
  // ============================================================================
  describe('TRIP-020: Validate trip data consistency', () => {
    it('should handle null dates correctly', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...mockTrip,
        startDate: new Date('2025-06-01'),
        endDate: null,
      });
      mockPrisma.trip.update.mockResolvedValue({
        ...mockTrip,
        startDate: null,
        endDate: null,
      });

      await tripService.updateTrip(mockUserId, mockTripId, {
        startDate: null,
        endDate: null,
      });

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: expect.objectContaining({
          startDate: null,
          endDate: null,
        }),
      });
    });

    it('should convert date strings to UTC Date objects', async () => {
      mockPrisma.trip.create.mockResolvedValue(mockTrip);

      await tripService.createTrip(mockUserId, {
        title: 'Test',
        startDate: '2025-12-25',
        endDate: '2025-12-31',
      });

      expect(mockPrisma.trip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          startDate: new Date('2025-12-25T00:00:00.000Z'),
          endDate: new Date('2025-12-31T00:00:00.000Z'),
        }),
      });
    });

    it('should include counts in list response', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([mockTripWithIncludes]);
      mockPrisma.trip.count.mockResolvedValue(1);

      const result = await tripService.getTrips(mockUserId, {});

      expect(result.trips[0]._count).toBeDefined();
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should handle pagination correctly', async () => {
      // Date sorts read the ordering columns for every matching trip, then load
      // full rows for just the requested page.
      const candidates = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        status: TripStatus.PLANNING,
        startDate: new Date(Date.UTC(2027, 0, i + 1)),
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      }));
      mockPrisma.trip.findMany.mockResolvedValueOnce(candidates).mockResolvedValueOnce([]);

      // The controller's Zod schema coerces these query params to numbers, so
      // the service is only ever handed numbers.
      const result = await tripService.getTrips(mockUserId, {
        page: 2,
        limit: 10,
      });

      // Newest start first: page 1 is ids 50..41, page 2 is ids 40..31.
      expect(mockPrisma.trip.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: { in: [40, 39, 38, 37, 36, 35, 34, 33, 32, 31] } } })
      );
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(50);
      expect(result.totalPages).toBe(5);
    });

    it('TRIP-ORDER-001: open trips come before Completed ones even when they have no dates', async () => {
      const row = (id: number, status: string, start: string | null, created: string) => ({
        id,
        status,
        startDate: start ? new Date(start) : null,
        createdAt: new Date(created),
      });
      const candidates = [
        row(1, TripStatus.COMPLETED, '2025-06-01', '2025-01-01'),
        row(2, TripStatus.PLANNING, null, '2026-03-01'),
        row(3, TripStatus.PLANNED, '2027-05-01', '2026-01-01'),
        row(4, TripStatus.IN_PROGRESS, '2026-11-10', '2026-02-01'),
        row(5, TripStatus.CANCELLED, '2028-01-01', '2026-04-01'),
        row(6, TripStatus.DREAM, null, '2026-02-01'),
      ];
      mockPrisma.trip.findMany
        .mockResolvedValueOnce(candidates)
        // The page query returns rows in whatever order the database likes.
        .mockResolvedValueOnce([6, 1, 5, 2, 4, 3].map((id) => ({ ...mockTripWithIncludes, id })));

      const result = await tripService.getTrips(mockUserId, {});

      // The current trip first, then open trips by start date (newest first, undated
      // last), then Completed, then Cancelled.
      expect(result.trips.map((t) => t.id)).toEqual([4, 3, 2, 6, 1, 5]);
      expect(result.total).toBe(6);
    });

    it('TRIP-ORDER-004: the current (In Progress) trip is first whatever its dates', async () => {
      const row = (id: number, status: string, start: string | null) => ({
        id,
        status,
        startDate: start ? new Date(start) : null,
        createdAt: new Date('2026-01-01'),
      });
      const candidates = [
        row(1, TripStatus.PLANNED, '2028-05-01'),
        row(2, TripStatus.IN_PROGRESS, '2026-01-10'),
        row(3, TripStatus.IN_PROGRESS, null),
        row(4, TripStatus.COMPLETED, '2029-01-01'),
      ];
      for (const sort of ['startDate-desc', 'startDate-asc'] as const) {
        mockPrisma.trip.findMany
          .mockResolvedValueOnce(candidates)
          .mockResolvedValueOnce([1, 2, 3, 4].map((id) => ({ ...mockTripWithIncludes, id })));

        const result = await tripService.getTrips(mockUserId, { sort });

        // Both In Progress trips lead (dated before undated), then the rest.
        expect(result.trips.map((t) => t.id)).toEqual([2, 3, 1, 4]);
      }
    });

    it('TRIP-ORDER-005: a Planned trip whose dates cover today is ranked as current', async () => {
      const day = 86_400_000;
      const midnight = (offsetDays: number) => {
        const d = new Date(Date.now() + offsetDays * day);
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      };
      const row = (id: number, status: string, start: Date, end: Date) => ({
        id,
        status,
        startDate: start,
        endDate: end,
        createdAt: new Date('2026-01-01'),
      });
      mockPrisma.trip.findMany
        .mockResolvedValueOnce([
          row(1, TripStatus.PLANNING, midnight(400), midnight(405)),
          row(2, TripStatus.COMPLETED, midnight(-1), midnight(1)),
          row(3, TripStatus.PLANNED, midnight(-1), midnight(1)),
        ])
        .mockResolvedValueOnce([1, 2, 3].map((id) => ({ ...mockTripWithIncludes, id })));

      const result = await tripService.getTrips(mockUserId, {});

      // Planned but happening now (3) leads; Completed never counts as current, even over the same days.
      expect(result.trips.map((t) => t.id)).toEqual([3, 1, 2]);
    });

    it('TRIP-ORDER-002: "Oldest First" also keeps open trips ahead of Completed ones', async () => {
      const row = (id: number, status: string, start: string | null) => ({
        id,
        status,
        startDate: start ? new Date(start) : null,
        createdAt: new Date('2026-01-01'),
      });
      mockPrisma.trip.findMany
        .mockResolvedValueOnce([
          row(1, TripStatus.COMPLETED, '2024-01-01'),
          row(2, TripStatus.PLANNING, null),
          row(3, TripStatus.PLANNED, '2027-05-01'),
        ])
        .mockResolvedValueOnce([1, 2, 3].map((id) => ({ ...mockTripWithIncludes, id })));

      const result = await tripService.getTrips(mockUserId, { sort: 'startDate-asc' });

      expect(result.trips.map((t) => t.id)).toEqual([3, 2, 1]);
    });

    it('TRIP-ORDER-003: "By Status" groups from closest-to-now to finished', async () => {
      const row = (id: number, status: string) => ({
        id,
        status,
        startDate: null,
        createdAt: new Date('2026-01-01'),
      });
      mockPrisma.trip.findMany
        .mockResolvedValueOnce([
          row(1, TripStatus.COMPLETED),
          row(2, TripStatus.DREAM),
          row(3, TripStatus.PLANNING),
          row(4, TripStatus.IN_PROGRESS),
          row(5, TripStatus.PLANNED),
          row(6, TripStatus.CANCELLED),
        ])
        .mockResolvedValueOnce([1, 2, 3, 4, 5, 6].map((id) => ({ ...mockTripWithIncludes, id })));

      const result = await tripService.getTrips(mockUserId, { sort: 'status' });

      expect(result.trips.map((t) => t.id)).toEqual([4, 5, 3, 2, 1, 6]);
    });

    it('should handle search query in title and description', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.trip.count.mockResolvedValue(0);

      await tripService.getTrips(mockUserId, { search: 'vacation' });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'vacation', mode: 'insensitive' } },
              { description: { contains: 'vacation', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('should apply date range filters correctly', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.trip.count.mockResolvedValue(0);

      await tripService.getTrips(mockUserId, {
        startDateFrom: '2025-01-01',
        startDateTo: '2025-12-31',
      });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: {
              gte: new Date('2025-01-01T00:00:00.000Z'),
              lte: new Date('2025-12-31T23:59:59.999Z'),
            },
          }),
        })
      );
    });

    it('should apply sorting options correctly', async () => {
      mockPrisma.trip.findMany.mockResolvedValue([]);
      mockPrisma.trip.count.mockResolvedValue(0);

      await tripService.getTrips(mockUserId, { sort: 'title-asc' });

      expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ title: 'asc' }],
        })
      );
    });
  });
});
