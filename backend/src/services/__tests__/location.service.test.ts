/**
 * Location Service Tests
 *
 * Test cases:
 * - LOC-001: Create location with coordinates
 * - LOC-002: Create location with geocoding (address only)
 * - LOC-003: Validate latitude range (-90 to 90)
 * - LOC-004: Validate longitude range (-180 to 180)
 * - LOC-005: Assign custom category
 * - LOC-006: Use default system category
 * - LOC-007: Get locations by trip
 * - LOC-008: Update location
 * - LOC-009: Delete location cascades photos (cleans up entity links)
 * - LOC-010: Parent-child location hierarchy
 */

// Mock logger BEFORE any imports to prevent config/index.ts from loading
// location.service -> errorHandler -> logger -> config/index.ts (throws without DATABASE_URL)
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
  location: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  locationCategory: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  entityLink: {
    deleteMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Prisma } = require('@prisma/client');

import { LocationService } from '../location.service';
import { AppError } from '../../middleware/errorHandler';

// Helper to create a mock trip with collaboration-aware fields
const createMockTrip = (id: number, userId: number) => ({
  id,
  userId,
  title: 'Test Trip',
  privacyLevel: 'Private',
  collaborators: [],
});

describe('LocationService', () => {
  let locationService: LocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    locationService = new LocationService();
    // Default: trip access granted for userId=1, tripId=100
    mockPrisma.trip.findFirst.mockResolvedValue(createMockTrip(100, 1));
  });

  // ============================================================
  // LOC-001: Create location with coordinates
  // ============================================================
  describe('LOC-001: Create location with coordinates', () => {
    it('should create a location with valid coordinates', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Eiffel Tower',
        address: 'Champ de Mars, Paris, France',
        latitude: 48.8584,
        longitude: 2.2945,
      };

      const mockLocation = {
        id: 1,
        ...input,
        parentId: null,
        categoryId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latitude: new Prisma.Decimal(input.latitude),
        longitude: new Prisma.Decimal(input.longitude),
        category: null,
        parent: null,
      };

      mockPrisma.location.create.mockResolvedValue(mockLocation);

      const result = await locationService.createLocation(userId, input);

      expect(mockPrisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: input.tripId }),
        })
      );
      expect(mockPrisma.location.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: input.tripId,
          name: input.name,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
        }),
        include: expect.any(Object),
      });
      expect(result.name).toBe('Eiffel Tower');
      // Decimals should be converted to numbers
      expect(typeof result.latitude).toBe('number');
      expect(typeof result.longitude).toBe('number');
    });

    it('should throw error if user does not own the trip', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Test Location',
        latitude: 40.7128,
        longitude: -74.006,
      };

      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(locationService.createLocation(userId, input)).rejects.toThrow(
        AppError
      );
    });
  });

  // ============================================================
  // LOC-002: Create location with geocoding (address only)
  // ============================================================
  describe('LOC-002: Create location with geocoding (address only)', () => {
    it('should create a location with address but without coordinates', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Central Park',
        address: 'Central Park, New York, NY, USA',
        // No latitude/longitude - would rely on frontend geocoding
      };

      const mockLocation = {
        id: 2,
        ...input,
        latitude: null,
        longitude: null,
        parentId: null,
        categoryId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
        parent: null,
      };

      mockPrisma.location.create.mockResolvedValue(mockLocation);

      const result = await locationService.createLocation(userId, input);

      expect(mockPrisma.location.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tripId: input.tripId,
          name: input.name,
          address: input.address,
          latitude: undefined,
          longitude: undefined,
        }),
        include: expect.any(Object),
      });
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
    });
  });

  // ============================================================
  // LOC-003: Validate latitude range (-90 to 90)
  // ============================================================
  describe('LOC-003: Validate latitude range (-90 to 90)', () => {
    it('should accept latitude at minimum boundary (-90)', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'South Pole',
        latitude: -90,
        longitude: 0,
      };

      const mockLocation = {
        id: 3,
        ...input,
        address: null,
        parentId: null,
        categoryId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latitude: new Prisma.Decimal(-90),
        longitude: new Prisma.Decimal(0),
        category: null,
        parent: null,
      };

      mockPrisma.location.create.mockResolvedValue(mockLocation);

      const result = await locationService.createLocation(userId, input);
      expect(result.latitude).toBe(-90);
    });

    it('should accept latitude at maximum boundary (90)', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'North Pole',
        latitude: 90,
        longitude: 0,
      };

      const mockLocation = {
        id: 4,
        ...input,
        address: null,
        parentId: null,
        categoryId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latitude: new Prisma.Decimal(90),
        longitude: new Prisma.Decimal(0),
        category: null,
        parent: null,
      };

      mockPrisma.location.create.mockResolvedValue(mockLocation);

      const result = await locationService.createLocation(userId, input);
      expect(result.latitude).toBe(90);
    });

    // Note: The Zod schema validates lat/lng ranges before reaching the service.
    // Service-level tests assume validation has passed.
  });

  // ============================================================
  // LOC-004: Validate longitude range (-180 to 180)
  // ============================================================
  describe('LOC-004: Validate longitude range (-180 to 180)', () => {
    it('should accept longitude at minimum boundary (-180)', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'International Date Line West',
        latitude: 0,
        longitude: -180,
      };

      const mockLocation = {
        id: 5,
        ...input,
        address: null,
        parentId: null,
        categoryId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latitude: new Prisma.Decimal(0),
        longitude: new Prisma.Decimal(-180),
        category: null,
        parent: null,
      };

      mockPrisma.location.create.mockResolvedValue(mockLocation);

      const result = await locationService.createLocation(userId, input);
      expect(result.longitude).toBe(-180);
    });

    it('should accept longitude at maximum boundary (180)', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'International Date Line East',
        latitude: 0,
        longitude: 180,
      };

      const mockLocation = {
        id: 6,
        ...input,
        address: null,
        parentId: null,
        categoryId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latitude: new Prisma.Decimal(0),
        longitude: new Prisma.Decimal(180),
        category: null,
        parent: null,
      };

      mockPrisma.location.create.mockResolvedValue(mockLocation);

      const result = await locationService.createLocation(userId, input);
      expect(result.longitude).toBe(180);
    });
  });

  // ============================================================
  // LOC-005: Assign custom category
  // ============================================================
  describe('LOC-005: Assign custom category', () => {
    it('should create location with a custom category', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'My Favorite Restaurant',
        latitude: 40.7128,
        longitude: -74.006,
        categoryId: 10, // Custom category ID
      };

      const mockCategory = {
        id: 10,
        userId: 1,
        name: 'Food & Dining',
        icon: 'restaurant',
        color: '#FF5733',
        isDefault: false,
      };
      const mockLocation = {
        id: 7,
        ...input,
        address: null,
        parentId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latitude: new Prisma.Decimal(input.latitude),
        longitude: new Prisma.Decimal(input.longitude),
        category: mockCategory,
        parent: null,
      };

      mockPrisma.location.create.mockResolvedValue(mockLocation);

      const result = await locationService.createLocation(userId, input);

      expect(mockPrisma.location.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          categoryId: 10,
        }),
        include: expect.any(Object),
      });
      expect(result.category).toBeDefined();
      expect(result.category?.name).toBe('Food & Dining');
      expect(result.category?.isDefault).toBe(false);
    });
  });

  // ============================================================
  // LOC-006: Use default system category
  // ============================================================
  describe('LOC-006: Use default system category', () => {
    it('should retrieve default and custom categories', async () => {
      const userId = 1;

      const mockCategories = [
        {
          id: 1,
          userId: null,
          name: 'Attraction',
          icon: 'star',
          color: '#FFD700',
          isDefault: true,
        },
        {
          id: 2,
          userId: null,
          name: 'Restaurant',
          icon: 'restaurant',
          color: '#FF5733',
          isDefault: true,
        },
        {
          id: 10,
          userId: 1,
          name: 'Custom Category',
          icon: 'custom',
          color: '#123456',
          isDefault: false,
        },
      ];

      mockPrisma.locationCategory.findMany.mockResolvedValue(mockCategories);

      const result = await locationService.getCategories(userId);

      expect(mockPrisma.locationCategory.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ userId }, { isDefault: true }],
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });
      expect(result.length).toBe(3);
      expect(result.filter((c: { isDefault: boolean }) => c.isDefault).length).toBe(2);
      expect(result.filter((c: { isDefault: boolean }) => !c.isDefault).length).toBe(1);
    });

    it('should create a location using a default category', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Famous Museum',
        latitude: 48.8606,
        longitude: 2.3376,
        categoryId: 1, // Default "Attraction" category
      };

      const mockCategory = {
        id: 1,
        userId: null,
        name: 'Attraction',
        icon: 'star',
        color: '#FFD700',
        isDefault: true,
      };
      const mockLocation = {
        id: 8,
        ...input,
        address: null,
        parentId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latitude: new Prisma.Decimal(input.latitude),
        longitude: new Prisma.Decimal(input.longitude),
        category: mockCategory,
        parent: null,
      };

      mockPrisma.location.create.mockResolvedValue(mockLocation);

      const result = await locationService.createLocation(userId, input);

      expect(result.category?.isDefault).toBe(true);
      expect(result.category?.name).toBe('Attraction');
    });
  });

  // ============================================================
  // LOC-007: Get locations by trip
  // ============================================================
  describe('LOC-007: Get locations by trip', () => {
    it('should return all locations for a trip owned by user', async () => {
      const userId = 1;
      const tripId = 100;

      const mockLocations = [
        {
          id: 1,
          tripId,
          name: 'Location 1',
          latitude: new Prisma.Decimal(40.7128),
          longitude: new Prisma.Decimal(-74.006),
          address: 'NYC',
          parentId: null,
          categoryId: null,
          visitDatetime: null,
          visitDurationMinutes: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: null,
          parent: null,
          children: [],
        },
        {
          id: 2,
          tripId,
          name: 'Location 2',
          latitude: new Prisma.Decimal(34.0522),
          longitude: new Prisma.Decimal(-118.2437),
          address: 'LA',
          parentId: null,
          categoryId: null,
          visitDatetime: null,
          visitDurationMinutes: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: null,
          parent: null,
          children: [],
        },
      ];

      mockPrisma.location.findMany.mockResolvedValue(mockLocations);

      const result = await locationService.getLocationsByTrip(userId, tripId);

      expect(mockPrisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: tripId }),
        })
      );
      expect(result.length).toBe(2);
      expect(typeof result[0].latitude).toBe('number');
    });

    it('should throw error if user has no access to trip', async () => {
      const userId = 1;
      const tripId = 999;

      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(locationService.getLocationsByTrip(userId, tripId)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });

    it('should allow access to public trip locations', async () => {
      const userId = 1;
      const tripId = 200;

      const mockTrip = { id: 200, userId: 999, title: 'Public Trip', privacyLevel: 'Public', collaborators: [] };
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.location.findMany.mockResolvedValue([]);

      const result = await locationService.getLocationsByTrip(userId, tripId);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // LOC-008: Update location
  // ============================================================
  describe('LOC-008: Update location', () => {
    it('should update location name and coordinates', async () => {
      const userId = 1;
      const locationId = 1;
      const updateData = {
        name: 'Updated Location Name',
        latitude: 51.5074,
        longitude: -0.1278,
      };

      const mockExistingLocation = {
        id: locationId,
        tripId: 100,
        name: 'Old Name',
        latitude: new Prisma.Decimal(40.7128),
        longitude: new Prisma.Decimal(-74.006),
        address: null,
        parentId: null,
        categoryId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedLocation = {
        ...mockExistingLocation,
        name: updateData.name,
        latitude: new Prisma.Decimal(updateData.latitude),
        longitude: new Prisma.Decimal(updateData.longitude),
        category: null,
        parent: null,
      };

      // verifyEntityAccessWithPermission calls findUnique then trip.findFirst
      mockPrisma.location.findUnique.mockResolvedValue(mockExistingLocation);
      // trip.findFirst is already mocked in beforeEach
      mockPrisma.location.count.mockResolvedValue(0); // No children
      mockPrisma.location.update.mockResolvedValue(mockUpdatedLocation);

      const result = await locationService.updateLocation(userId, locationId, updateData);

      expect(mockPrisma.location.update).toHaveBeenCalledWith({
        where: { id: locationId },
        data: expect.objectContaining({
          name: updateData.name,
          latitude: updateData.latitude,
          longitude: updateData.longitude,
        }),
        include: expect.any(Object),
      });
      expect(result.name).toBe('Updated Location Name');
    });

    it('should throw error if location not found', async () => {
      const userId = 1;
      const locationId = 999;

      mockPrisma.location.findUnique.mockResolvedValue(null);

      await expect(
        locationService.updateLocation(userId, locationId, { name: 'Test' })
      ).rejects.toThrow('Location not found');
    });

    it('should throw error if user does not have access to the trip', async () => {
      const userId = 1;
      const locationId = 1;

      const mockLocation = {
        id: locationId,
        tripId: 100,
        name: 'Test',
      };

      // Entity exists
      mockPrisma.location.findUnique.mockResolvedValue(mockLocation);
      // But user has no access to the trip
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        locationService.updateLocation(userId, locationId, { name: 'Updated' })
      ).rejects.toThrow('Trip not found or access denied');
    });

    it('should clear optional fields when set to null', async () => {
      const userId = 1;
      const locationId = 1;
      const updateData = {
        notes: null,
        visitDatetime: null,
      };

      const mockExistingLocation = {
        id: locationId,
        tripId: 100,
        name: 'Test',
        notes: 'Some notes',
        visitDatetime: new Date(),
      };

      const mockUpdatedLocation = {
        ...mockExistingLocation,
        notes: null,
        visitDatetime: null,
        category: null,
        parent: null,
      };

      mockPrisma.location.findUnique.mockResolvedValue(mockExistingLocation);
      mockPrisma.location.count.mockResolvedValue(0);
      mockPrisma.location.update.mockResolvedValue(mockUpdatedLocation);

      const result = await locationService.updateLocation(userId, locationId, updateData);

      expect(result.notes).toBeNull();
      expect(result.visitDatetime).toBeNull();
    });
  });

  // ============================================================
  // LOC-009: Delete location cascades (cleans up entity links)
  // ============================================================
  describe('LOC-009: Delete location cascades photos', () => {
    it('should delete location and clean up entity links', async () => {
      const userId = 1;
      const locationId = 1;

      const mockLocation = {
        id: locationId,
        tripId: 100,
        name: 'Test Location',
      };

      // verifyEntityAccessWithPermission calls findUnique then trip.findFirst
      mockPrisma.location.findUnique.mockResolvedValue(mockLocation);
      // trip.findFirst is already mocked in beforeEach
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.location.delete.mockResolvedValue(mockLocation);

      const result = await locationService.deleteLocation(userId, locationId);

      expect(mockPrisma.entityLink.deleteMany).toHaveBeenCalledWith({
        where: {
          tripId: 100,
          OR: [
            { sourceType: 'LOCATION', sourceId: locationId },
            { targetType: 'LOCATION', targetId: locationId },
          ],
        },
      });
      expect(mockPrisma.location.delete).toHaveBeenCalledWith({
        where: { id: locationId },
      });
      expect(result.message).toBe('Location deleted successfully');
    });

    it('should throw error if location not found', async () => {
      const userId = 1;
      const locationId = 999;

      mockPrisma.location.findUnique.mockResolvedValue(null);

      await expect(locationService.deleteLocation(userId, locationId)).rejects.toThrow(
        'Location not found'
      );
    });

    it('should throw error if user does not have access to the trip', async () => {
      const userId = 1;
      const locationId = 1;

      const mockLocation = {
        id: locationId,
        tripId: 100,
        name: 'Test',
      };

      // Entity exists
      mockPrisma.location.findUnique.mockResolvedValue(mockLocation);
      // But user has no access to the trip
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(locationService.deleteLocation(userId, locationId)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });
  });

  // ============================================================
  // LOC-010: Parent-child location hierarchy
  // ============================================================
  describe('LOC-010: Parent-child location hierarchy', () => {
    it('should create a child location under a parent', async () => {
      const userId = 1;
      const parentId = 1;
      const input = {
        tripId: 100,
        name: 'Hotel Room 101',
        parentId,
        latitude: 40.7128,
        longitude: -74.006,
      };

      const mockParentLocation = {
        id: parentId,
        tripId: 100,
        name: 'Grand Hotel',
        parentId: null, // Parent is a root location
      };
      const mockChildLocation = {
        id: 2,
        ...input,
        address: null,
        categoryId: null,
        visitDatetime: null,
        visitDurationMinutes: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        latitude: new Prisma.Decimal(input.latitude),
        longitude: new Prisma.Decimal(input.longitude),
        category: null,
        parent: { id: parentId, name: 'Grand Hotel' },
      };

      mockPrisma.location.findFirst.mockResolvedValue(mockParentLocation);
      mockPrisma.location.create.mockResolvedValue(mockChildLocation);

      const result = await locationService.createLocation(userId, input);

      expect(mockPrisma.location.findFirst).toHaveBeenCalledWith({
        where: { id: parentId, tripId: input.tripId },
      });
      expect(result.parent?.id).toBe(parentId);
      expect(result.parent?.name).toBe('Grand Hotel');
    });

    it('should throw error if parent location not found', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Child Location',
        parentId: 999,
      };

      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(locationService.createLocation(userId, input)).rejects.toThrow(
        'Parent location not found or does not belong to the same trip'
      );
    });

    it('should prevent more than single-level nesting', async () => {
      const userId = 1;
      const input = {
        tripId: 100,
        name: 'Deep Child',
        parentId: 2, // This parent is already a child
      };

      const mockParentLocation = {
        id: 2,
        tripId: 100,
        name: 'Already A Child',
        parentId: 1, // This location already has a parent
      };

      mockPrisma.location.findFirst.mockResolvedValue(mockParentLocation);

      await expect(locationService.createLocation(userId, input)).rejects.toThrow(
        'Cannot nest locations more than one level deep'
      );
    });

    it('should prevent location from being its own parent on update', async () => {
      const userId = 1;
      const locationId = 1;

      const mockLocation = {
        id: locationId,
        tripId: 100,
        name: 'Test',
        parentId: null,
      };

      mockPrisma.location.findUnique.mockResolvedValue(mockLocation);
      mockPrisma.location.count.mockResolvedValue(0);

      await expect(
        locationService.updateLocation(userId, locationId, { parentId: locationId })
      ).rejects.toThrow('A location cannot be its own parent');
    });

    it('should prevent setting parent if location has children', async () => {
      const userId = 1;
      const locationId = 1;

      const mockLocation = {
        id: locationId,
        tripId: 100,
        name: 'Parent Location',
        parentId: null,
      };

      mockPrisma.location.findUnique.mockResolvedValue(mockLocation);
      mockPrisma.location.count.mockResolvedValue(2); // Has 2 children

      await expect(
        locationService.updateLocation(userId, locationId, { parentId: 5 })
      ).rejects.toThrow(
        'Cannot set a parent for a location that has children'
      );
    });

    it('should return locations with children included', async () => {
      const userId = 1;
      const tripId = 100;

      const mockLocations = [
        {
          id: 1,
          tripId,
          name: 'Parent Hotel',
          latitude: new Prisma.Decimal(40.7128),
          longitude: new Prisma.Decimal(-74.006),
          address: null,
          parentId: null,
          categoryId: null,
          visitDatetime: null,
          visitDurationMinutes: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: null,
          parent: null,
          children: [
            {
              id: 2,
              name: 'Room 101',
              latitude: new Prisma.Decimal(40.7128),
              longitude: new Prisma.Decimal(-74.006),
              visitDatetime: null,
              category: null,
            },
            {
              id: 3,
              name: 'Room 102',
              latitude: new Prisma.Decimal(40.7128),
              longitude: new Prisma.Decimal(-74.006),
              visitDatetime: null,
              category: null,
            },
          ],
        },
      ];

      mockPrisma.location.findMany.mockResolvedValue(mockLocations);

      const result = await locationService.getLocationsByTrip(userId, tripId);

      expect(result[0].children).toBeDefined();
      expect(result[0].children.length).toBe(2);
    });
  });

  // ============================================================
  // Additional category tests
  // ============================================================
  describe('Category Management', () => {
    it('should create a custom category', async () => {
      const userId = 1;
      const input = {
        name: 'My Custom Category',
        icon: 'star',
        color: '#FF0000',
      };

      const mockCategory = {
        id: 20,
        userId,
        ...input,
        isDefault: false,
        createdAt: new Date(),
      };

      mockPrisma.locationCategory.create.mockResolvedValue(mockCategory);

      const result = await locationService.createCategory(userId, input);

      expect(mockPrisma.locationCategory.create).toHaveBeenCalledWith({
        data: {
          userId,
          name: input.name,
          icon: input.icon,
          color: input.color,
          isDefault: false,
        },
      });
      expect(result.isDefault).toBe(false);
    });

    it('should update a custom category', async () => {
      const userId = 1;
      const categoryId = 20;
      const updateData = { name: 'Updated Category Name' };

      const mockCategory = {
        id: categoryId,
        userId,
        name: 'Old Name',
        isDefault: false,
      };

      const mockUpdatedCategory = {
        ...mockCategory,
        name: updateData.name,
      };

      mockPrisma.locationCategory.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.locationCategory.update.mockResolvedValue(mockUpdatedCategory);

      const result = await locationService.updateCategory(userId, categoryId, updateData);

      expect(result.name).toBe('Updated Category Name');
    });

    it('should not allow editing default categories', async () => {
      const userId = 1;
      const categoryId = 1; // Default category

      mockPrisma.locationCategory.findFirst.mockResolvedValue(null); // Query excludes default categories

      await expect(
        locationService.updateCategory(userId, categoryId, { name: 'Hacked' })
      ).rejects.toThrow('Category not found or cannot be edited');
    });

    it('should delete a custom category', async () => {
      const userId = 1;
      const categoryId = 20;

      const mockCategory = {
        id: categoryId,
        userId,
        name: 'To Delete',
        isDefault: false,
      };

      mockPrisma.locationCategory.findFirst.mockResolvedValue(mockCategory);
      mockPrisma.locationCategory.delete.mockResolvedValue(mockCategory);

      const result = await locationService.deleteCategory(userId, categoryId);

      expect(result.message).toBe('Category deleted successfully');
    });

    it('should not allow deleting default categories', async () => {
      const userId = 1;
      const categoryId = 1;

      mockPrisma.locationCategory.findFirst.mockResolvedValue(null);

      await expect(locationService.deleteCategory(userId, categoryId)).rejects.toThrow(
        'Category not found or cannot be deleted'
      );
    });
  });
});
