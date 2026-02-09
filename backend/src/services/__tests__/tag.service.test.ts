/**
 * Tag Service Tests
 *
 * Test cases:
 * - TAG-001: Create a tag
 * - TAG-002: Get all tags for a user
 * - TAG-003: Get tag by ID
 * - TAG-004: Get tag by ID - not found
 * - TAG-005: Update a tag
 * - TAG-006: Update a tag - not found
 * - TAG-007: Delete a tag
 * - TAG-008: Delete a tag - not found
 * - TAG-009: Link tag to trip
 * - TAG-010: Link tag to trip - already linked
 * - TAG-011: Link tag to trip - tag not found
 * - TAG-012: Unlink tag from trip
 * - TAG-013: Unlink tag from trip - not linked
 * - TAG-014: Get tags by trip
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
  tripTag: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  tripTagAssignment: {
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

import { tagService } from '../tag.service';

describe('TagService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockTag = {
    id: 1,
    name: 'Beach',
    color: '#3B82F6',
    textColor: '#FFFFFF',
    userId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTrip = {
    id: 100,
    userId: 1,
    title: 'Test Trip',
  };

  // ============================================================
  // TAG-001: Create a tag
  // ============================================================
  describe('TAG-001: Create a tag', () => {
    it('should create a new tag for a user', async () => {
      mockPrisma.tripTag.create.mockResolvedValue(mockTag);

      const result = await tagService.createTag(1, {
        name: 'Beach',
        color: '#3B82F6',
        textColor: '#FFFFFF',
      });

      expect(mockPrisma.tripTag.create).toHaveBeenCalledWith({
        data: {
          name: 'Beach',
          color: '#3B82F6',
          textColor: '#FFFFFF',
          user: {
            connect: { id: 1 },
          },
        },
      });
      expect(result.name).toBe('Beach');
      expect(result.color).toBe('#3B82F6');
    });

    it('should create a tag without optional color fields', async () => {
      const tagWithoutColor = { ...mockTag, color: undefined, textColor: undefined };
      mockPrisma.tripTag.create.mockResolvedValue(tagWithoutColor);

      const result = await tagService.createTag(1, { name: 'Adventure' } as any);

      expect(result.name).toBe('Beach');
    });
  });

  // ============================================================
  // TAG-002: Get all tags for a user
  // ============================================================
  describe('TAG-002: Get all tags for a user', () => {
    it('should return all tags for a user with assignment count', async () => {
      const tags = [
        { ...mockTag, _count: { assignments: 3 } },
        { ...mockTag, id: 2, name: 'Mountain', _count: { assignments: 1 } },
      ];
      mockPrisma.tripTag.findMany.mockResolvedValue(tags);

      const result = await tagService.getTagsByUser(1);

      expect(mockPrisma.tripTag.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        include: {
          _count: {
            select: { assignments: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array when user has no tags', async () => {
      mockPrisma.tripTag.findMany.mockResolvedValue([]);

      const result = await tagService.getTagsByUser(1);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // TAG-003: Get tag by ID
  // ============================================================
  describe('TAG-003: Get tag by ID', () => {
    it('should return tag with assignments', async () => {
      const tagWithAssignments = {
        ...mockTag,
        assignments: [
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
      mockPrisma.tripTag.findFirst.mockResolvedValue(tagWithAssignments);

      const result = await tagService.getTagById(1, 1);

      expect(mockPrisma.tripTag.findFirst).toHaveBeenCalledWith({
        where: { id: 1, userId: 1 },
        include: {
          assignments: {
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
      expect(result.name).toBe('Beach');
      expect(result.assignments).toHaveLength(1);
    });
  });

  // ============================================================
  // TAG-004: Get tag by ID - not found
  // ============================================================
  describe('TAG-004: Get tag by ID - not found', () => {
    it('should throw 404 when tag not found', async () => {
      mockPrisma.tripTag.findFirst.mockResolvedValue(null);

      await expect(tagService.getTagById(1, 999)).rejects.toThrow('Tag not found');
    });

    it('should throw 404 when tag belongs to another user', async () => {
      mockPrisma.tripTag.findFirst.mockResolvedValue(null);

      await expect(tagService.getTagById(2, 1)).rejects.toThrow('Tag not found');
    });
  });

  // ============================================================
  // TAG-005: Update a tag
  // ============================================================
  describe('TAG-005: Update a tag', () => {
    it('should update tag name and color', async () => {
      mockPrisma.tripTag.findFirst.mockResolvedValue(mockTag);
      const updatedTag = { ...mockTag, name: 'Ocean', color: '#0EA5E9' };
      mockPrisma.tripTag.update.mockResolvedValue(updatedTag);

      const result = await tagService.updateTag(1, 1, {
        name: 'Ocean',
        color: '#0EA5E9',
      });

      expect(mockPrisma.tripTag.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'Ocean', color: '#0EA5E9' },
      });
      expect(result.name).toBe('Ocean');
      expect(result.color).toBe('#0EA5E9');
    });
  });

  // ============================================================
  // TAG-006: Update a tag - not found
  // ============================================================
  describe('TAG-006: Update a tag - not found', () => {
    it('should throw 404 when tag not found', async () => {
      mockPrisma.tripTag.findFirst.mockResolvedValue(null);

      await expect(tagService.updateTag(1, 999, { name: 'Test' })).rejects.toThrow(
        'Tag not found'
      );
    });
  });

  // ============================================================
  // TAG-007: Delete a tag
  // ============================================================
  describe('TAG-007: Delete a tag', () => {
    it('should delete a tag', async () => {
      mockPrisma.tripTag.findFirst.mockResolvedValue(mockTag);
      mockPrisma.tripTag.delete.mockResolvedValue(mockTag);

      await tagService.deleteTag(1, 1);

      expect(mockPrisma.tripTag.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  // ============================================================
  // TAG-008: Delete a tag - not found
  // ============================================================
  describe('TAG-008: Delete a tag - not found', () => {
    it('should throw 404 when tag not found', async () => {
      mockPrisma.tripTag.findFirst.mockResolvedValue(null);

      await expect(tagService.deleteTag(1, 999)).rejects.toThrow('Tag not found');
    });
  });

  // ============================================================
  // TAG-009: Link tag to trip
  // ============================================================
  describe('TAG-009: Link tag to trip', () => {
    it('should link a tag to a trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripTag.findFirst.mockResolvedValue(mockTag);
      mockPrisma.tripTagAssignment.findFirst.mockResolvedValue(null);
      const assignment = { id: 1, tripId: 100, tagId: 1 };
      mockPrisma.tripTagAssignment.create.mockResolvedValue(assignment);

      const result = await tagService.linkTagToTrip(1, { tripId: 100, tagId: 1 });

      expect(mockPrisma.tripTagAssignment.create).toHaveBeenCalledWith({
        data: { tripId: 100, tagId: 1 },
      });
      expect(result.tripId).toBe(100);
      expect(result.tagId).toBe(1);
    });
  });

  // ============================================================
  // TAG-010: Link tag to trip - already linked
  // ============================================================
  describe('TAG-010: Link tag to trip - already linked', () => {
    it('should throw error when tag already linked to trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripTag.findFirst.mockResolvedValue(mockTag);
      mockPrisma.tripTagAssignment.findFirst.mockResolvedValue({
        id: 1,
        tripId: 100,
        tagId: 1,
      });

      await expect(
        tagService.linkTagToTrip(1, { tripId: 100, tagId: 1 })
      ).rejects.toThrow('Tag already linked to this trip');
    });
  });

  // ============================================================
  // TAG-011: Link tag to trip - tag not found
  // ============================================================
  describe('TAG-011: Link tag to trip - tag not found', () => {
    it('should throw error when tag not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripTag.findFirst.mockResolvedValue(null);

      await expect(
        tagService.linkTagToTrip(1, { tripId: 100, tagId: 999 })
      ).rejects.toThrow('Tag not found');
    });

    it('should throw error when trip not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tagService.linkTagToTrip(1, { tripId: 999, tagId: 1 })
      ).rejects.toThrow('Trip not found or access denied');
    });
  });

  // ============================================================
  // TAG-012: Unlink tag from trip
  // ============================================================
  describe('TAG-012: Unlink tag from trip', () => {
    it('should unlink a tag from a trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripTagAssignment.findFirst.mockResolvedValue({
        id: 1,
        tripId: 100,
        tagId: 1,
      });
      mockPrisma.tripTagAssignment.delete.mockResolvedValue({});

      await tagService.unlinkTagFromTrip(1, 100, 1);

      expect(mockPrisma.tripTagAssignment.delete).toHaveBeenCalledWith({
        where: {
          tripId_tagId: { tripId: 100, tagId: 1 },
        },
      });
    });
  });

  // ============================================================
  // TAG-013: Unlink tag from trip - not linked
  // ============================================================
  describe('TAG-013: Unlink tag from trip - not linked', () => {
    it('should throw error when tag not linked to trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripTagAssignment.findFirst.mockResolvedValue(null);

      await expect(tagService.unlinkTagFromTrip(1, 100, 1)).rejects.toThrow(
        'Tag not linked to this trip'
      );
    });
  });

  // ============================================================
  // TAG-014: Get tags by trip
  // ============================================================
  describe('TAG-014: Get tags by trip', () => {
    it('should return all tags for a trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripTagAssignment.findMany.mockResolvedValue([
        { tag: { id: 1, name: 'Beach', userId: 1, color: '#3B82F6', textColor: '#FFFFFF' } },
        { tag: { id: 2, name: 'Summer', userId: 1, color: '#EAB308', textColor: '#000000' } },
      ]);

      const result = await tagService.getTagsByTrip(1, 100);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Beach');
      expect(result[1].name).toBe('Summer');
    });

    it('should return empty array when trip has no tags', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);
      mockPrisma.tripTagAssignment.findMany.mockResolvedValue([]);

      const result = await tagService.getTagsByTrip(1, 100);

      expect(result).toEqual([]);
    });

    it('should throw error when trip not found', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(tagService.getTagsByTrip(1, 999)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });
  });
});
