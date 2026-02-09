/**
 * Companion Service Tests
 *
 * Test cases:
 * - CMP-001: Create "Myself" companion
 * - CMP-002: Create "Myself" companion - already exists
 * - CMP-003: Get "Myself" companion
 * - CMP-004: Update "Myself" companion name
 * - CMP-005: Create a companion
 * - CMP-006: Get all companions for a user
 * - CMP-007: Get companion by ID
 * - CMP-008: Get companion by ID - not found
 * - CMP-009: Update a companion
 * - CMP-010: Update a companion - not found
 * - CMP-011: Delete a companion
 * - CMP-012: Delete a companion - not found
 * - CMP-013: Link companion to trip
 * - CMP-014: Link companion to trip - already linked
 * - CMP-015: Link companion to trip - companion not found
 * - CMP-016: Unlink companion from trip
 * - CMP-017: Get companions by trip
 */

// Mock @prisma/client BEFORE any imports that depend on it
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
  EntityType: {
    PHOTO: 'PHOTO',
    LOCATION: 'LOCATION',
    ACTIVITY: 'ACTIVITY',
    LODGING: 'LODGING',
    TRANSPORTATION: 'TRANSPORTATION',
    JOURNAL_ENTRY: 'JOURNAL_ENTRY',
    PHOTO_ALBUM: 'PHOTO_ALBUM',
  },
}));

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
  },
  travelCompanion: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  tripCompanion: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock sharp (used for avatar processing)
jest.mock('sharp', () => {
  return jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toFile: jest.fn().mockResolvedValue({}),
  }));
});

// Mock fs/promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { companionService } from '../companion.service';

describe('CompanionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockCompanion = {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    notes: 'Travel buddy',
    relationship: 'Friend',
    isMyself: false,
    avatarUrl: null,
    dietaryPreferences: [],
    userId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMyselfCompanion = {
    ...mockCompanion,
    id: 10,
    name: 'Myself (testuser)',
    isMyself: true,
    email: null,
    phone: null,
    notes: null,
    relationship: null,
  };

  const mockTrip = {
    id: 100,
    userId: 1,
    title: 'Test Trip',
  };

  // ============================================================
  // CMP-001: Create "Myself" companion
  // ============================================================
  describe('CMP-001: Create "Myself" companion', () => {
    it('should create a "Myself" companion for a user', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);
      mockPrisma.travelCompanion.create.mockResolvedValue(mockMyselfCompanion);

      const result = await companionService.createMyselfCompanion(1, 'testuser');

      expect(mockPrisma.travelCompanion.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, isMyself: true },
      });
      expect(mockPrisma.travelCompanion.create).toHaveBeenCalledWith({
        data: {
          name: 'Myself (testuser)',
          isMyself: true,
          user: {
            connect: { id: 1 },
          },
        },
      });
      expect(result.name).toBe('Myself (testuser)');
      expect(result.isMyself).toBe(true);
    });
  });

  // ============================================================
  // CMP-002: Create "Myself" companion - already exists
  // ============================================================
  describe('CMP-002: Create "Myself" companion - already exists', () => {
    it('should return existing "Myself" companion without creating', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(mockMyselfCompanion);

      const result = await companionService.createMyselfCompanion(1, 'testuser');

      expect(mockPrisma.travelCompanion.create).not.toHaveBeenCalled();
      expect(result.name).toBe('Myself (testuser)');
    });
  });

  // ============================================================
  // CMP-003: Get "Myself" companion
  // ============================================================
  describe('CMP-003: Get "Myself" companion', () => {
    it('should return the "Myself" companion', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(mockMyselfCompanion);

      const result = await companionService.getMyselfCompanion(1);

      expect(mockPrisma.travelCompanion.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, isMyself: true },
      });
      expect(result!.isMyself).toBe(true);
    });

    it('should return null when no "Myself" companion exists', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);

      const result = await companionService.getMyselfCompanion(1);

      expect(result).toBeNull();
    });
  });

  // ============================================================
  // CMP-004: Update "Myself" companion name
  // ============================================================
  describe('CMP-004: Update "Myself" companion name', () => {
    it('should update the "Myself" companion name', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(mockMyselfCompanion);
      const updated = { ...mockMyselfCompanion, name: 'Myself (newname)' };
      mockPrisma.travelCompanion.update.mockResolvedValue(updated);

      const result = await companionService.updateMyselfCompanionName(1, 'newname');

      expect(mockPrisma.travelCompanion.update).toHaveBeenCalledWith({
        where: { id: mockMyselfCompanion.id },
        data: { name: 'Myself (newname)' },
      });
      expect(result!.name).toBe('Myself (newname)');
    });

    it('should return null when no "Myself" companion exists', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);

      const result = await companionService.updateMyselfCompanionName(1, 'newname');

      expect(result).toBeNull();
      expect(mockPrisma.travelCompanion.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // CMP-005: Create a companion
  // ============================================================
  describe('CMP-005: Create a companion', () => {
    it('should create a new companion for a user', async () => {
      mockPrisma.travelCompanion.create.mockResolvedValue(mockCompanion);

      const result = await companionService.createCompanion(1, {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        notes: 'Travel buddy',
        relationship: 'Friend',
      });

      expect(mockPrisma.travelCompanion.create).toHaveBeenCalledWith({
        data: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          notes: 'Travel buddy',
          relationship: 'Friend',
          dietaryPreferences: [],
          user: {
            connect: { id: 1 },
          },
        },
      });
      expect(result.name).toBe('John Doe');
    });

    it('should create companion with dietary preferences', async () => {
      const companionWithDiet = {
        ...mockCompanion,
        dietaryPreferences: ['Vegetarian', 'Gluten-free'],
      };
      mockPrisma.travelCompanion.create.mockResolvedValue(companionWithDiet);

      const result = await companionService.createCompanion(1, {
        name: 'John Doe',
        dietaryPreferences: ['Vegetarian', 'Gluten-free'],
      } as any);

      expect(result.dietaryPreferences).toEqual(['Vegetarian', 'Gluten-free']);
    });
  });

  // ============================================================
  // CMP-006: Get all companions for a user
  // ============================================================
  describe('CMP-006: Get all companions for a user', () => {
    it('should return all companions with trip assignment count', async () => {
      const companions = [
        { ...mockMyselfCompanion, _count: { tripAssignments: 5 } },
        { ...mockCompanion, _count: { tripAssignments: 2 } },
      ];
      mockPrisma.travelCompanion.findMany.mockResolvedValue(companions);

      const result = await companionService.getCompanionsByUser(1);

      expect(mockPrisma.travelCompanion.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        include: {
          _count: {
            select: { tripAssignments: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no companions exist', async () => {
      mockPrisma.travelCompanion.findMany.mockResolvedValue([]);

      const result = await companionService.getCompanionsByUser(1);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // CMP-007: Get companion by ID
  // ============================================================
  describe('CMP-007: Get companion by ID', () => {
    it('should return companion with trip assignments', async () => {
      const companionWithTrips = {
        ...mockCompanion,
        tripAssignments: [
          {
            trip: {
              id: 100,
              title: 'Beach Trip',
              status: 'Completed',
              startDate: new Date('2024-07-01'),
              endDate: new Date('2024-07-15'),
            },
          },
        ],
      };
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(companionWithTrips);

      const result = await companionService.getCompanionById(1, 1);

      expect(mockPrisma.travelCompanion.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
        include: {
          tripAssignments: {
            include: {
              trip: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
          },
        },
      });
      expect(result.name).toBe('John Doe');
      expect(result.tripAssignments).toHaveLength(1);
    });
  });

  // ============================================================
  // CMP-008: Get companion by ID - not found
  // ============================================================
  describe('CMP-008: Get companion by ID - not found', () => {
    it('should throw 404 when companion not found', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);

      await expect(companionService.getCompanionById(1, 999)).rejects.toThrow(
        'Companion not found'
      );
    });
  });

  // ============================================================
  // CMP-009: Update a companion
  // ============================================================
  describe('CMP-009: Update a companion', () => {
    it('should update companion details', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(mockCompanion);
      const updated = { ...mockCompanion, name: 'Jane Doe', relationship: 'Family' };
      mockPrisma.travelCompanion.update.mockResolvedValue(updated);

      const result = await companionService.updateCompanion(1, 1, {
        name: 'Jane Doe',
        relationship: 'Family',
      });

      expect(mockPrisma.travelCompanion.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'Jane Doe', relationship: 'Family' },
      });
      expect(result.name).toBe('Jane Doe');
      expect(result.relationship).toBe('Family');
    });
  });

  // ============================================================
  // CMP-010: Update a companion - not found
  // ============================================================
  describe('CMP-010: Update a companion - not found', () => {
    it('should throw 404 when companion not found', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);

      await expect(
        companionService.updateCompanion(1, 999, { name: 'Test' })
      ).rejects.toThrow('Companion not found');
    });
  });

  // ============================================================
  // CMP-011: Delete a companion
  // ============================================================
  describe('CMP-011: Delete a companion', () => {
    it('should delete a companion', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(mockCompanion);
      mockPrisma.travelCompanion.delete.mockResolvedValue(mockCompanion);

      await companionService.deleteCompanion(1, 1);

      expect(mockPrisma.travelCompanion.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  // ============================================================
  // CMP-012: Delete a companion - not found
  // ============================================================
  describe('CMP-012: Delete a companion - not found', () => {
    it('should throw 404 when companion not found', async () => {
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);

      await expect(companionService.deleteCompanion(1, 999)).rejects.toThrow(
        'Companion not found'
      );
    });
  });

  // ============================================================
  // CMP-013: Link companion to trip
  // ============================================================
  describe('CMP-013: Link companion to trip', () => {
    it('should link a companion to a trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(mockCompanion);
      mockPrisma.tripCompanion.findFirst.mockResolvedValue(null);
      const assignment = { id: 1, tripId: 100, companionId: 1 };
      mockPrisma.tripCompanion.create.mockResolvedValue(assignment);

      const result = await companionService.linkCompanionToTrip(1, {
        tripId: 100,
        companionId: 1,
      });

      expect(mockPrisma.tripCompanion.create).toHaveBeenCalledWith({
        data: { tripId: 100, companionId: 1 },
      });
      expect(result.tripId).toBe(100);
      expect(result.companionId).toBe(1);
    });
  });

  // ============================================================
  // CMP-014: Link companion to trip - already linked
  // ============================================================
  describe('CMP-014: Link companion to trip - already linked', () => {
    it('should throw error when companion already linked to trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(mockCompanion);
      mockPrisma.tripCompanion.findFirst.mockResolvedValue({
        id: 1,
        tripId: 100,
        companionId: 1,
      });

      await expect(
        companionService.linkCompanionToTrip(1, { tripId: 100, companionId: 1 })
      ).rejects.toThrow('Companion already linked to this trip');
    });
  });

  // ============================================================
  // CMP-015: Link companion to trip - companion not found
  // ============================================================
  describe('CMP-015: Link companion to trip - companion not found', () => {
    it('should throw error when companion not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.travelCompanion.findFirst.mockResolvedValue(null);

      await expect(
        companionService.linkCompanionToTrip(1, { tripId: 100, companionId: 999 })
      ).rejects.toThrow('Companion not found');
    });

    it('should throw error when trip not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        companionService.linkCompanionToTrip(1, { tripId: 999, companionId: 1 })
      ).rejects.toThrow('Trip not found or access denied');
    });
  });

  // ============================================================
  // CMP-016: Unlink companion from trip
  // ============================================================
  describe('CMP-016: Unlink companion from trip', () => {
    it('should unlink a companion from a trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripCompanion.findFirst.mockResolvedValue({
        id: 1,
        tripId: 100,
        companionId: 1,
      });
      mockPrisma.tripCompanion.delete.mockResolvedValue({});

      await companionService.unlinkCompanionFromTrip(1, 100, 1);

      expect(mockPrisma.tripCompanion.delete).toHaveBeenCalledWith({
        where: {
          tripId_companionId: { tripId: 100, companionId: 1 },
        },
      });
    });

    it('should throw error when companion not linked to trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripCompanion.findFirst.mockResolvedValue(null);

      await expect(
        companionService.unlinkCompanionFromTrip(1, 100, 1)
      ).rejects.toThrow('Companion not linked to this trip');
    });
  });

  // ============================================================
  // CMP-017: Get companions by trip
  // ============================================================
  describe('CMP-017: Get companions by trip', () => {
    it('should return all companions for a trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripCompanion.findMany.mockResolvedValue([
        { companion: { id: 1, name: 'John Doe', userId: 1 } },
        { companion: { id: 2, name: 'Jane Smith', userId: 1 } },
      ]);

      const result = await companionService.getCompanionsByTrip(1, 100);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('John Doe');
      expect(result[1].name).toBe('Jane Smith');
    });

    it('should return empty array when trip has no companions', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripCompanion.findMany.mockResolvedValue([]);

      const result = await companionService.getCompanionsByTrip(1, 100);

      expect(result).toEqual([]);
    });

    it('should throw error when trip not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(companionService.getCompanionsByTrip(1, 999)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });
  });
});
