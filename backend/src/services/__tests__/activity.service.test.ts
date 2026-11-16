/**
 * Activity Service Tests
 *
 * Test cases:
 * - ACT-001: Create timed activity
 * - ACT-002: Create all-day activity
 * - ACT-003: Assign custom category
 * - ACT-004: Track cost and currency
 * - ACT-005: Link to location (via EntityLink system)
 * - ACT-006: Get activities by trip
 * - ACT-007: Update activity
 * - ACT-008: Delete activity
 */

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
  };
});

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
  },
  activity: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  entityLink: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// jest.mock() calls are hoisted above imports, so this picks up the mock.
import { Prisma } from '@prisma/client';

import activityService from '../activity.service';
import { AppError } from '../../errors/errors';

describe('ActivityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: trip access succeeds for owner (includes collaborators for permission checks)
    mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip(100, 1));
  });

  // Helper to create a mock trip (includes collaborators for permission checks)
  const createMockTrip = (id: number, userId: number) => ({
    id,
    userId,
    title: 'Test Trip',
    privacyLevel: 'Private',
    collaborators: [],
  });

  // Helper to create a base mock activity
  const createMockActivity = (overrides: Partial<{
    id: number;
    tripId: number;
    parentId: number | null;
    name: string;
    description: string | null;
    category: string | null;
    allDay: boolean;
    startTime: Date | null;
    endTime: Date | null;
    timezone: string | null;
    cost: Prisma.Decimal | number | null;
    currency: string | null;
    bookingUrl: string | null;
    bookingReference: string | null;
    notes: string | null;
    manualOrder: number | null;
    createdAt: Date;
    updatedAt: Date;
    parent: { id: number; name: string } | null;
    children: unknown[];
    trip: { id: number; userId: number };
  }> = {}) => ({
    id: 1,
    tripId: 100,
    parentId: null,
    name: 'Test Activity',
    description: null,
    category: null,
    allDay: false,
    startTime: null,
    endTime: null,
    timezone: null,
    cost: null,
    currency: null,
    bookingUrl: null,
    bookingReference: null,
    notes: null,
    manualOrder: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    parent: null,
    children: [],
    trip: { id: 100, userId: 1 },
    ...overrides,
  });

  // ============================================================
  // ACT-001: Create timed activity
  // ============================================================
  describe('ACT-001: Create timed activity', () => {
    it('should create an activity with specific start and end times', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Museum Visit',
        description: 'Visit the Louvre Museum',
        startTime: '2025-06-15T10:00:00Z',
        endTime: '2025-06-15T14:00:00Z',
        timezone: 'Europe/Paris',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 1,
        ...input,
        tripId: input.tripId,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(mockPrisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: input.tripId }),
        })
      );
      expect(mockPrisma.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: input.tripId,
          name: input.name,
          description: input.description,
          startTime: expect.any(Date),
          endTime: expect.any(Date),
        }),
        include: expect.any(Object),
      });
      expect(result.name).toBe('Museum Visit');
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
    });

    it('should throw error if user does not own the trip', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Test Activity',
      };

      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(activityService.createActivity(userId, input)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });

    it('should create activity with only start time (no end time)', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Open-ended Activity',
        startTime: '2025-06-15T10:00:00Z',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 2,
        name: input.name,
        startTime: new Date(input.startTime),
        endTime: null,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeNull();
    });
  });

  // ============================================================
  // ACT-002: Create all-day activity
  // ============================================================
  describe('ACT-001b: Create persists timezone and allDay', () => {
    it('writes the timezone and allDay the request carried', async () => {
      const userId = 1;
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip(100, userId));
      mockPrisma.activity.create.mockResolvedValue(createMockActivity({ id: 1, tripId: 100 }));

      await activityService.createActivity(userId, {
        tripId: 100,
        name: 'Temple',
        timezone: 'Asia/Tokyo',
        allDay: true,
        startTime: '2025-06-15T00:00:00Z',
      });

      expect(mockPrisma.activity.create.mock.calls[0][0].data).toMatchObject({
        timezone: 'Asia/Tokyo',
        allDay: true,
      });
    });

    it('defaults to no timezone and not all-day', async () => {
      const userId = 1;
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip(100, userId));
      mockPrisma.activity.create.mockResolvedValue(createMockActivity({ id: 1, tripId: 100 }));

      await activityService.createActivity(userId, { tripId: 100, name: 'Walk' });

      expect(mockPrisma.activity.create.mock.calls[0][0].data).toMatchObject({
        timezone: null,
        allDay: false,
      });
    });
  });

  describe('ACT-002: Create all-day activity', () => {
    it('should create an all-day activity without specific times', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Day Trip to Versailles',
        description: 'Full day exploring the Palace of Versailles',
        allDay: true,
        // Note: allDay activities typically just have a date association,
        // startTime/endTime may be null or just have date part
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 3,
        name: input.name,
        description: input.description,
        allDay: true,
        startTime: null,
        endTime: null,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(mockPrisma.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: input.name,
          // allDay is not in the create schema but could be handled
        }),
        include: expect.any(Object),
      });
      expect(result.name).toBe('Day Trip to Versailles');
    });

    it('should handle all-day activity with date-only times', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Beach Day',
        startTime: '2025-07-20T00:00:00Z', // Start of day
        endTime: '2025-07-20T23:59:59Z', // End of day
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 4,
        name: input.name,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        allDay: false, // Could be true depending on implementation
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(result.name).toBe('Beach Day');
    });
  });

  // ============================================================
  // ACT-003: Assign custom category
  // ============================================================
  describe('ACT-003: Assign custom category', () => {
    it('should create activity with a category from user settings', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Fine Dining Experience',
        category: 'Dining',
        description: 'Michelin star restaurant',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 5,
        name: input.name,
        category: input.category,
        description: input.description,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(mockPrisma.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: 'Dining',
        }),
        include: expect.any(Object),
      });
      expect(result.category).toBe('Dining');
    });

    it('should create activity with predefined category', async () => {
      const userId = 1;
      const categories = ['Sightseeing', 'Adventure', 'Entertainment', 'Shopping', 'Wellness'];

      for (const category of categories) {
        const input = {
          tripId: 100,
          name: `${category} Activity`,
          category,
        };

        const mockTrip = createMockTrip(100, userId);
        const mockCreatedActivity = createMockActivity({
          id: Math.random() * 1000,
          name: input.name,
          category,
        });

        mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
        mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

        const result = await activityService.createActivity(userId, input);
        expect(result.category).toBe(category);
      }
    });

    it('should allow activity without category', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Uncategorized Activity',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 6,
        name: input.name,
        category: null,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(result.category).toBeNull();
    });
  });

  // ============================================================
  // ACT-004: Track cost and currency
  // ============================================================
  describe('ACT-004: Track cost and currency', () => {
    it('should create activity with cost and currency', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Concert Tickets',
        cost: 250.0,
        currency: 'EUR',
        notes: 'VIP seats',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 7,
        name: input.name,
        cost: new Prisma.Decimal(input.cost),
        currency: input.currency,
        notes: input.notes,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(mockPrisma.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cost: input.cost,
          currency: 'EUR',
        }),
        include: expect.any(Object),
      });
      expect(result.cost).toBe(250);
      expect(result.currency).toBe('EUR');
    });

    it('should handle different currency codes', async () => {
      const userId = 1;
      const currencies = ['USD', 'GBP', 'JPY', 'CAD', 'AUD'];

      for (const currency of currencies) {
        const input = {
          tripId: 100,
          name: `Activity in ${currency}`,
          cost: 100,
          currency,
        };

        const mockTrip = createMockTrip(100, userId);
        const mockCreatedActivity = createMockActivity({
          id: Math.random() * 1000,
          name: input.name,
          cost: new Prisma.Decimal(100),
          currency,
        });

        mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
        mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

        const result = await activityService.createActivity(userId, input);
        expect(result.currency).toBe(currency);
      }
    });

    it('should allow zero cost activities', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Free Walking Tour',
        cost: 0,
        currency: 'USD',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 8,
        name: input.name,
        cost: new Prisma.Decimal(0),
        currency: input.currency,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(result.cost).toBe(0);
    });

    it('should allow activity without cost tracking', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Spontaneous Activity',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 9,
        name: input.name,
        cost: null,
        currency: null,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(result.cost).toBeNull();
      expect(result.currency).toBeNull();
    });
  });

  // ============================================================
  // ACT-005: Link to location (via EntityLink system)
  // ============================================================
  describe('ACT-005: Link to location', () => {
    // Note: Location linking is handled via the EntityLink system, not direct FK
    // The activity service doesn't directly handle location linking
    // This test verifies the activity is created properly and can be linked later

    it('should create activity that can be linked to location via EntityLink', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Activity at Specific Location',
        description: 'This activity occurs at a specific location',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 10,
        name: input.name,
        description: input.description,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      // Activity is created without direct location FK
      // EntityLink system would be used to link activity to location
      expect(result.id).toBeDefined();
      expect(result.tripId).toBe(100);
      // No locationId field in the activity model
    });

    it('should include parent activity relationship', async () => {
      const userId = 1;
      const parentActivityId = 20;
      const input = {
        tripId: 100,
        name: 'Sub-activity',
        parentId: parentActivityId,
      };

      const mockTrip = createMockTrip(100, userId);
      const mockParentActivity = createMockActivity({
        id: parentActivityId,
        name: 'Parent Activity',
      });
      const mockCreatedActivity = createMockActivity({
        id: 11,
        name: input.name,
        parentId: parentActivityId,
        parent: { id: parentActivityId, name: 'Parent Activity' },
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.findFirst.mockResolvedValue(mockParentActivity);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(result.parentId).toBe(parentActivityId);
      expect(result.parent?.name).toBe('Parent Activity');
    });
  });

  // ============================================================
  // ACT-006: Get activities by trip
  // ============================================================
  describe('ACT-006: Get activities by trip', () => {
    it('should return all activities for a trip', async () => {
      const userId = 1;
      const tripId = 100;

      const mockTrip = createMockTrip(tripId, userId);
      const mockActivities = [
        createMockActivity({
          id: 1,
          name: 'Activity 1',
          startTime: new Date('2025-06-15T10:00:00Z'),
          category: 'Sightseeing',
        }),
        createMockActivity({
          id: 2,
          name: 'Activity 2',
          startTime: new Date('2025-06-15T14:00:00Z'),
          category: 'Dining',
        }),
        createMockActivity({
          id: 3,
          name: 'Activity 3',
          startTime: new Date('2025-06-16T09:00:00Z'),
          category: 'Adventure',
        }),
      ];

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.findMany.mockResolvedValue(mockActivities);

      const result = await activityService.getActivitiesByTrip(userId, tripId);

      expect(mockPrisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: tripId }),
        })
      );
      expect(mockPrisma.activity.findMany).toHaveBeenCalledWith({
        where: { tripId },
        include: expect.objectContaining({
          parent: expect.any(Object),
          children: expect.any(Object),
        }),
        orderBy: expect.any(Array),
      });
      expect(result.length).toBe(3);
    });

    it('should throw error if user does not have access to trip', async () => {
      const userId = 1;
      const tripId = 999;

      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(activityService.getActivitiesByTrip(userId, tripId)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });

    it('should return empty array for trip with no activities', async () => {
      const userId = 1;
      const tripId = 100;

      const mockTrip = createMockTrip(tripId, userId);
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.findMany.mockResolvedValue([]);

      const result = await activityService.getActivitiesByTrip(userId, tripId);

      expect(result).toEqual([]);
    });

    it('should include parent and children relationships', async () => {
      const userId = 1;
      const tripId = 100;

      const mockTrip = createMockTrip(tripId, userId);
      const mockActivities = [
        createMockActivity({
          id: 1,
          name: 'Parent Activity',
          parentId: null,
          parent: null,
          children: [
            {
              id: 2,
              name: 'Child Activity 1',
              description: null,
              startTime: null,
              endTime: null,
              timezone: null,
              category: null,
              cost: null,
              currency: null,
              bookingReference: null,
              notes: null,
            },
            {
              id: 3,
              name: 'Child Activity 2',
              description: null,
              startTime: null,
              endTime: null,
              timezone: null,
              category: null,
              cost: null,
              currency: null,
              bookingReference: null,
              notes: null,
            },
          ],
        }),
      ];

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.findMany.mockResolvedValue(mockActivities);

      const result = await activityService.getActivitiesByTrip(userId, tripId);

      expect(result[0].children).toBeDefined();
      expect(result[0].children.length).toBe(2);
    });

    it('should order activities by manual order, then start time, then creation date', async () => {
      const userId = 1;
      const tripId = 100;

      const mockTrip = createMockTrip(tripId, userId);
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.findMany.mockResolvedValue([]);

      await activityService.getActivitiesByTrip(userId, tripId);

      expect(mockPrisma.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { manualOrder: { sort: 'asc', nulls: 'last' } },
            { startTime: { sort: 'asc', nulls: 'last' } },
            { createdAt: 'asc' },
          ],
        })
      );
    });
  });

  // ============================================================
  // ACT-007: Update activity
  // ============================================================
  describe('ACT-007: Update activity', () => {
    it('should update activity name and description', async () => {
      const userId = 1;
      const activityId = 1;
      const updateData = {
        name: 'Updated Activity Name',
        description: 'Updated description',
      };

      const mockExistingActivity = createMockActivity({
        id: activityId,
        name: 'Original Name',
        description: 'Original description',
        trip: { id: 100, userId: 1 },
      });

      const mockUpdatedActivity = createMockActivity({
        ...mockExistingActivity,
        name: updateData.name,
        description: updateData.description,
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockExistingActivity);
      mockPrisma.activity.update.mockResolvedValue(mockUpdatedActivity);

      const result = await activityService.updateActivity(userId, activityId, updateData);

      expect(mockPrisma.activity.update).toHaveBeenCalledWith({
        where: { id: activityId },
        data: expect.objectContaining({
          name: updateData.name,
          description: updateData.description,
        }),
        include: expect.any(Object),
      });
      expect(result.name).toBe('Updated Activity Name');
      expect(result.description).toBe('Updated description');
    });

    it('should update activity times', async () => {
      const userId = 1;
      const activityId = 1;
      const updateData = {
        startTime: '2025-07-01T10:00:00Z',
        endTime: '2025-07-01T14:00:00Z',
      };

      const mockExistingActivity = createMockActivity({
        id: activityId,
        trip: { id: 100, userId: 1 },
      });

      const mockUpdatedActivity = createMockActivity({
        ...mockExistingActivity,
        startTime: new Date(updateData.startTime),
        endTime: new Date(updateData.endTime),
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockExistingActivity);
      mockPrisma.activity.update.mockResolvedValue(mockUpdatedActivity);

      const result = await activityService.updateActivity(userId, activityId, updateData);

      expect(mockPrisma.activity.update).toHaveBeenCalledWith({
        where: { id: activityId },
        data: expect.objectContaining({
          startTime: expect.any(Date),
          endTime: expect.any(Date),
        }),
        include: expect.any(Object),
      });
      expect(result.startTime).toBeInstanceOf(Date);
    });

    it('should update activity cost and currency', async () => {
      const userId = 1;
      const activityId = 1;
      const updateData = {
        cost: 150.0,
        currency: 'GBP',
      };

      const mockExistingActivity = createMockActivity({
        id: activityId,
        cost: new Prisma.Decimal(100),
        currency: 'USD',
        trip: { id: 100, userId: 1 },
      });

      const mockUpdatedActivity = createMockActivity({
        ...mockExistingActivity,
        cost: new Prisma.Decimal(updateData.cost),
        currency: updateData.currency,
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockExistingActivity);
      mockPrisma.activity.update.mockResolvedValue(mockUpdatedActivity);

      const result = await activityService.updateActivity(userId, activityId, updateData);

      expect(result.cost).toBe(150);
      expect(result.currency).toBe('GBP');
    });

    it('should throw error if activity not found', async () => {
      const userId = 1;
      const activityId = 999;

      mockPrisma.activity.findUnique.mockResolvedValue(null);

      await expect(
        activityService.updateActivity(userId, activityId, { name: 'Test' })
      ).rejects.toThrow('Activity not found');
    });

    it('should throw error if user does not own the activity', async () => {
      const userId = 1;
      const activityId = 1;

      const mockActivity = createMockActivity({
        id: activityId,
        trip: { id: 100, userId: 999 }, // Different user
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);
      // verifyEntityAccessWithPermission calls trip.findFirst — return null for non-owner
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        activityService.updateActivity(userId, activityId, { name: 'Test' })
      ).rejects.toThrow('Trip not found or access denied');
    });

    it('should prevent activity from being its own parent', async () => {
      const userId = 1;
      const activityId = 1;

      const mockActivity = createMockActivity({
        id: activityId,
        trip: { id: 100, userId: 1 },
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);

      await expect(
        activityService.updateActivity(userId, activityId, { parentId: activityId })
      ).rejects.toThrow('Activity cannot be its own parent');
    });

    it('should clear optional fields when set to null', async () => {
      const userId = 1;
      const activityId = 1;
      const updateData = {
        description: null,
        notes: null,
        cost: null,
      };

      const mockExistingActivity = createMockActivity({
        id: activityId,
        description: 'Some description',
        notes: 'Some notes',
        cost: new Prisma.Decimal(100),
        trip: { id: 100, userId: 1 },
      });

      const mockUpdatedActivity = createMockActivity({
        ...mockExistingActivity,
        description: null,
        notes: null,
        cost: null,
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockExistingActivity);
      mockPrisma.activity.update.mockResolvedValue(mockUpdatedActivity);

      const result = await activityService.updateActivity(userId, activityId, updateData);

      expect(result.description).toBeNull();
      expect(result.notes).toBeNull();
      expect(result.cost).toBeNull();
    });

    it('should update parent assignment', async () => {
      const userId = 1;
      const activityId = 2;
      const newParentId = 1;
      const updateData = {
        parentId: newParentId,
      };

      const mockExistingActivity = createMockActivity({
        id: activityId,
        parentId: null,
        trip: { id: 100, userId: 1 },
      });

      const mockParentActivity = createMockActivity({
        id: newParentId,
        name: 'Parent Activity',
      });

      const mockUpdatedActivity = createMockActivity({
        ...mockExistingActivity,
        parentId: newParentId,
        parent: { id: newParentId, name: 'Parent Activity' },
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockExistingActivity);
      mockPrisma.activity.findFirst.mockResolvedValue(mockParentActivity);
      mockPrisma.activity.update.mockResolvedValue(mockUpdatedActivity);

      const result = await activityService.updateActivity(userId, activityId, updateData);

      expect(result.parentId).toBe(newParentId);
      expect(result.parent?.name).toBe('Parent Activity');
    });
  });

  // ============================================================
  // ACT-008: Delete activity
  // ============================================================
  describe('ACT-008: Delete activity', () => {
    it('should delete activity and clean up entity links', async () => {
      const userId = 1;
      const activityId = 1;

      const mockActivity = createMockActivity({
        id: activityId,
        name: 'Activity to Delete',
        trip: { id: 100, userId: 1 },
      });

      const mockTxEntityLinkDeleteMany = jest.fn().mockResolvedValue({ count: 3 });
      const mockTxActivityDelete = jest.fn().mockResolvedValue(mockActivity);

      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip(100, userId));
      // Deleting an activity first walks its child activities so their links
      // can be cleaned up as well -- the DB cascade-deletes the children, so
      // nothing else would. This activity has none.
      const mockTxActivityFindMany = jest.fn().mockResolvedValue([]);

      mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        return callback({
          entityLink: { deleteMany: mockTxEntityLinkDeleteMany },
          activity: { delete: mockTxActivityDelete, findMany: mockTxActivityFindMany },
        });
      });

      const result = await activityService.deleteActivity(userId, activityId);

      expect(mockTxEntityLinkDeleteMany).toHaveBeenCalledWith({
        where: {
          tripId: 100,
          OR: [
            { sourceType: 'ACTIVITY', sourceId: { in: [activityId] } },
            { targetType: 'ACTIVITY', targetId: { in: [activityId] } },
          ],
        },
      });
      expect(mockTxActivityDelete).toHaveBeenCalledWith({
        where: { id: activityId },
      });
      expect(result.success).toBe(true);
    });

    it('should throw error if activity not found', async () => {
      const userId = 1;
      const activityId = 999;

      mockPrisma.activity.findUnique.mockResolvedValue(null);

      await expect(activityService.deleteActivity(userId, activityId)).rejects.toThrow(
        'Activity not found'
      );
    });

    it('should throw error if user does not own the activity', async () => {
      const userId = 1;
      const activityId = 1;

      const mockActivity = createMockActivity({
        id: activityId,
        trip: { id: 100, userId: 999 },
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(activityService.deleteActivity(userId, activityId)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });

    it('should cascade delete to child activities via database', async () => {
      // Note: The database schema has onDelete: Cascade for parent-child relationship
      // This test verifies the delete is called - cascade happens at DB level
      const userId = 1;
      const activityId = 1;

      const mockActivity = createMockActivity({
        id: activityId,
        name: 'Parent Activity',
        trip: { id: 100, userId: 1 },
      });

      const mockTxActivityDelete = jest.fn().mockResolvedValue(mockActivity);
      const mockTxEntityLinkDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

      // Children are cascade-deleted by the database, so their entity links have
      // to be collected and removed here or they are orphaned. Two levels deep:
      // activityId -> [201, 202] -> [203].
      const mockTxActivityFindMany = jest
        .fn()
        .mockResolvedValueOnce([{ id: 201 }, { id: 202 }])
        .mockResolvedValueOnce([{ id: 203 }])
        .mockResolvedValueOnce([]);

      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);
      mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip(100, userId));
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
        return callback({
          entityLink: { deleteMany: mockTxEntityLinkDeleteMany },
          activity: { delete: mockTxActivityDelete, findMany: mockTxActivityFindMany },
        });
      });

      const result = await activityService.deleteActivity(userId, activityId);

      // Only the root row is deleted explicitly; the DB cascade removes the rest.
      expect(mockTxActivityDelete).toHaveBeenCalledWith({
        where: { id: activityId },
      });

      // ...but link cleanup must span the whole subtree.
      expect(mockTxEntityLinkDeleteMany).toHaveBeenCalledWith({
        where: {
          tripId: 100,
          OR: [
            { sourceType: 'ACTIVITY', sourceId: { in: [activityId, 201, 202, 203] } },
            { targetType: 'ACTIVITY', targetId: { in: [activityId, 201, 202, 203] } },
          ],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // Additional tests
  // ============================================================
  describe('Additional functionality', () => {
    it('should get activity by ID', async () => {
      const userId = 1;
      const activityId = 1;

      const mockActivity = createMockActivity({
        id: activityId,
        name: 'Specific Activity',
        trip: { id: 100, userId: 1 },
      });

      mockPrisma.activity.findUnique.mockResolvedValue(mockActivity);

      const result = await activityService.getActivityById(userId, activityId);

      expect(mockPrisma.activity.findUnique).toHaveBeenCalledWith({
        where: { id: activityId },
        include: expect.objectContaining({
          trip: true,
          parent: expect.any(Object),
          children: expect.any(Object),
        }),
      });
      expect(result.id).toBe(activityId);
      expect(result.name).toBe('Specific Activity');
    });

    it('should handle booking URL and reference', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Booked Activity',
        bookingUrl: 'https://example.com/booking/123',
        bookingReference: 'BOOK-123-XYZ',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 20,
        name: input.name,
        bookingUrl: input.bookingUrl,
        bookingReference: input.bookingReference,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      expect(result.bookingUrl).toBe('https://example.com/booking/123');
      expect(result.bookingReference).toBe('BOOK-123-XYZ');
    });

    it('should handle timezone field', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Activity with Timezone',
        startTime: '2025-08-01T10:00:00Z',
        timezone: 'Asia/Tokyo',
      };

      const mockTrip = createMockTrip(100, userId);
      const mockCreatedActivity = createMockActivity({
        id: 21,
        name: input.name,
        startTime: new Date(input.startTime),
        timezone: input.timezone,
      });

      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.activity.create.mockResolvedValue(mockCreatedActivity);

      const result = await activityService.createActivity(userId, input);

      // Note: timezone is in updateActivitySchema but not in createActivitySchema
      // This test verifies the field is handled if present
      expect(result.name).toBe('Activity with Timezone');
    });
  });
});
