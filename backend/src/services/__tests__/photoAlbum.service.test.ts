/**
 * Photo Album Service Tests
 *
 * Test cases:
 * - ALB-001: Create album
 * - ALB-002: Add photos to album
 * - ALB-003: Remove photo from album
 * - ALB-004: Prevent duplicate photo in album
 * - ALB-005: Set cover photo
 * - ALB-006: Get albums by trip
 * - ALB-007: Get album photos with pagination
 * - ALB-008: Update album
 * - ALB-009: Delete album
 */

// Mock @prisma/client BEFORE any imports
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
      PHOTO_ALBUM: 'PHOTO_ALBUM',
    },
  };
});

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
  },
  photoAlbum: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  photoAlbumAssignment: {
    createMany: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  photo: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  entityLink: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// The delete path runs its writes inside a transaction. Hand the callback the
// same mock client so the inner calls stay observable on mockPrisma.
mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
  cb(mockPrisma)
);

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock trip access verification
jest.mock('../../services/_shared/tripAccess', () => {
  const originalModule = jest.requireActual('../../services/_shared/tripAccess');
  return {
    ...originalModule,
    verifyTripAccessWithPermission: jest.fn(),
    verifyEntityAccessWithPermission: jest.fn(),
  };
});

// Mock entity link cleanup
jest.mock('../../services/_shared/entityLinkCleanup', () => ({
  cleanupEntityLinks: jest.fn(),
}));

import photoAlbumService from '../photoAlbum.service';
import { verifyTripAccessWithPermission, verifyEntityAccessWithPermission } from '../../services/_shared/tripAccess';
import { cleanupEntityLinks } from '../../services/_shared/entityLinkCleanup';
import { AppError } from '../../errors/errors';

describe('PhotoAlbumService', () => {
  const mockUserId = 1;
  const mockTripId = 1;
  const mockAlbumId = 1;

  const mockTrip = {
    id: mockTripId,
    userId: mockUserId,
    title: 'Summer Vacation',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-15'),
    privacyLevel: 'Private',
  };

  const mockTripAccessResult = {
    trip: mockTrip,
    isOwner: true,
    permissionLevel: 'admin',
  };

  const mockPhoto = {
    id: 1,
    tripId: mockTripId,
    source: 'local',
    mediaType: 'image',
    localPath: '/uploads/photo1.jpg',
    thumbnailPath: '/uploads/thumb_photo1.jpg',
    caption: 'Beach sunset',
    latitude: 40.7128,
    longitude: -74.0060,
    takenAt: new Date('2025-06-10'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAlbum = {
    id: mockAlbumId,
    tripId: mockTripId,
    name: 'Beach Photos',
    description: 'All our beautiful beach photos from the trip',
    coverPhotoId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    trip: mockTrip,
    _count: {
      photoAssignments: 5,
    },
  };

  const mockAlbumWithCover = {
    ...mockAlbum,
    coverPhotoId: 1,
    coverPhoto: mockPhoto,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (verifyTripAccessWithPermission as jest.Mock).mockResolvedValue(mockTripAccessResult);
    (verifyEntityAccessWithPermission as jest.Mock).mockResolvedValue({
      entity: { ...mockAlbum, tripId: mockTripId },
      tripAccess: mockTripAccessResult,
    });
    (cleanupEntityLinks as jest.Mock).mockResolvedValue(undefined);
  });

  describe('ALB-001: Create album', () => {
    it('should create album with name and description', async () => {
      const createInput = {
        tripId: mockTripId,
        name: 'Beach Photos',
        description: 'All our beautiful beach photos from the trip',
      };

      mockPrisma.photoAlbum.create.mockResolvedValue({
        ...mockAlbum,
        _count: { photoAssignments: 0 },
      });

      const result = await photoAlbumService.createAlbum(mockUserId, createInput);

      expect(verifyTripAccessWithPermission).toHaveBeenCalledWith(mockUserId, mockTripId, 'edit');
      expect(mockPrisma.photoAlbum.create).toHaveBeenCalledWith({
        data: {
          tripId: mockTripId,
          name: 'Beach Photos',
          description: 'All our beautiful beach photos from the trip',
        },
        include: {
          _count: {
            select: { photoAssignments: true },
          },
        },
      });
      expect(result.name).toBe('Beach Photos');
      expect(result.description).toBe('All our beautiful beach photos from the trip');
    });

    it('should create album with only name (no description)', async () => {
      const createInput = {
        tripId: mockTripId,
        name: 'Quick Album',
      };

      mockPrisma.photoAlbum.create.mockResolvedValue({
        ...mockAlbum,
        name: 'Quick Album',
        description: null,
        _count: { photoAssignments: 0 },
      });

      const result = await photoAlbumService.createAlbum(mockUserId, createInput);

      expect(mockPrisma.photoAlbum.create).toHaveBeenCalledWith({
        data: {
          tripId: mockTripId,
          name: 'Quick Album',
          description: null,
        },
        include: {
          _count: {
            select: { photoAssignments: true },
          },
        },
      });
      expect(result.description).toBeNull();
    });

    it('should throw error if user does not own the trip', async () => {
      (verifyTripAccessWithPermission as jest.Mock).mockRejectedValue(
        new AppError("We couldn't find that trip, or you don't have access to it.", 404)
      );

      const createInput = {
        tripId: mockTripId,
        name: 'Unauthorized Album',
      };

      await expect(
        photoAlbumService.createAlbum(mockUserId, createInput)
      ).rejects.toThrow("We couldn't find that trip, or you don't have access to it.");
    });
  });

  describe('ALB-002: Add photos to album', () => {
    beforeEach(() => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(mockAlbum);
    });

    it('should add multiple photos to album', async () => {
      const photoIds = [1, 2, 3];
      const photos = photoIds.map((id) => ({ ...mockPhoto, id }));

      mockPrisma.photo.findMany.mockResolvedValue(photos);
      mockPrisma.photoAlbumAssignment.createMany.mockResolvedValue({ count: 3 });

      const result = await photoAlbumService.addPhotosToAlbum(
        mockUserId,
        mockAlbumId,
        { photoIds }
      );

      expect(verifyEntityAccessWithPermission).toHaveBeenCalled();
      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: photoIds },
          tripId: mockTripId,
        },
      });
      expect(mockPrisma.photoAlbumAssignment.createMany).toHaveBeenCalledWith({
        data: photoIds.map((photoId) => ({
          albumId: mockAlbumId,
          photoId,
        })),
        skipDuplicates: true,
      });
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(3);
    });

    it('should add single photo to album', async () => {
      const photoIds = [1];

      mockPrisma.photo.findMany.mockResolvedValue([mockPhoto]);
      mockPrisma.photoAlbumAssignment.createMany.mockResolvedValue({ count: 1 });

      const result = await photoAlbumService.addPhotosToAlbum(
        mockUserId,
        mockAlbumId,
        { photoIds }
      );

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(1);
    });

    it('should throw error if photo does not belong to trip', async () => {
      const photoIds = [1, 2, 999]; // 999 doesn't exist or is from different trip

      // Only return 2 photos (id 999 not found in trip)
      mockPrisma.photo.findMany.mockResolvedValue([
        { ...mockPhoto, id: 1 },
        { ...mockPhoto, id: 2 },
      ]);

      await expect(
        photoAlbumService.addPhotosToAlbum(mockUserId, mockAlbumId, { photoIds })
      ).rejects.toThrow('One or more photos not found or do not belong to trip');
    });
  });

  describe('ALB-003: Remove photo from album', () => {
    beforeEach(() => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(mockAlbum);
      mockPrisma.photoAlbumAssignment.findFirst.mockResolvedValue({ id: 1, albumId: mockAlbumId, photoId: 1 });
      mockPrisma.photoAlbumAssignment.delete.mockResolvedValue({ id: 1 });
    });

    it('should remove photo from album', async () => {
      const photoId = 1;

      const result = await photoAlbumService.removePhotoFromAlbum(
        mockUserId,
        mockAlbumId,
        photoId
      );

      expect(verifyEntityAccessWithPermission).toHaveBeenCalled();
      expect(mockPrisma.photoAlbumAssignment.findFirst).toHaveBeenCalledWith({
        where: { albumId: mockAlbumId, photoId },
      });
      expect(mockPrisma.photoAlbumAssignment.delete).toHaveBeenCalledWith({
        where: {
          albumId_photoId: {
            albumId: mockAlbumId,
            photoId,
          },
        },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw 404 if the photo is not in the album', async () => {
      mockPrisma.photoAlbumAssignment.findFirst.mockResolvedValue(null);

      await expect(
        photoAlbumService.removePhotoFromAlbum(mockUserId, mockAlbumId, 1)
      ).rejects.toThrow("That photo isn't in this album.");

      expect(mockPrisma.photoAlbumAssignment.delete).not.toHaveBeenCalled();
    });

    it('should throw error if album not found', async () => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(null);
      (verifyEntityAccessWithPermission as jest.Mock).mockRejectedValue(
        new AppError("We couldn't find that album.", 404)
      );

      await expect(
        photoAlbumService.removePhotoFromAlbum(mockUserId, 999, 1)
      ).rejects.toThrow("We couldn't find that album.");
    });
  });

  describe('ALB-004: Prevent duplicate photo in album', () => {
    beforeEach(() => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(mockAlbum);
    });

    it('should use skipDuplicates to prevent duplicate photos', async () => {
      const photoIds = [1, 1, 2]; // Contains duplicate

      mockPrisma.photo.findMany.mockResolvedValue([
        { ...mockPhoto, id: 1 },
        { ...mockPhoto, id: 1 },
        { ...mockPhoto, id: 2 },
      ]);
      mockPrisma.photoAlbumAssignment.createMany.mockResolvedValue({ count: 2 });

      await photoAlbumService.addPhotosToAlbum(
        mockUserId,
        mockAlbumId,
        { photoIds }
      );

      expect(mockPrisma.photoAlbumAssignment.createMany).toHaveBeenCalledWith({
        data: expect.any(Array),
        skipDuplicates: true, // This is the key assertion
      });
    });

    it('should not error when adding photo that already exists in album', async () => {
      const photoIds = [1]; // Photo 1 already in album

      mockPrisma.photo.findMany.mockResolvedValue([mockPhoto]);
      mockPrisma.photoAlbumAssignment.createMany.mockResolvedValue({ count: 0 }); // 0 because duplicate skipped

      const result = await photoAlbumService.addPhotosToAlbum(
        mockUserId,
        mockAlbumId,
        { photoIds }
      );

      // Should succeed even if photo was already in album
      expect(result.success).toBe(true);
    });
  });

  describe('ALB-005: Set cover photo', () => {
    beforeEach(() => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(mockAlbum);
    });

    it('should set cover photo for album', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.photoAlbum.update.mockResolvedValue({
        ...mockAlbumWithCover,
        _count: { photoAssignments: 5 },
      });

      const result = await photoAlbumService.updateAlbum(mockUserId, mockAlbumId, {
        coverPhotoId: 1,
      });

      expect(mockPrisma.photo.findFirst).toHaveBeenCalledWith({
        where: {
          id: 1,
          tripId: mockTripId,
        },
      });
      expect(mockPrisma.photoAlbum.update).toHaveBeenCalledWith({
        where: { id: mockAlbumId },
        data: expect.objectContaining({
          coverPhotoId: 1,
        }),
        include: expect.any(Object),
      });
      expect(result.coverPhotoId).toBe(1);
    });

    it('should throw error if cover photo does not belong to trip', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue(null); // Photo not found in trip

      await expect(
        photoAlbumService.updateAlbum(mockUserId, mockAlbumId, {
          coverPhotoId: 999,
        })
      ).rejects.toThrow("We couldn't find that cover photo on this trip.");
    });

    it('should allow clearing cover photo by setting to null', async () => {
      mockPrisma.photoAlbum.update.mockResolvedValue({
        ...mockAlbum,
        coverPhotoId: null,
        coverPhoto: null,
        _count: { photoAssignments: 5 },
      });

      const result = await photoAlbumService.updateAlbum(mockUserId, mockAlbumId, {
        coverPhotoId: null,
      });

      expect(mockPrisma.photoAlbum.update).toHaveBeenCalledWith({
        where: { id: mockAlbumId },
        data: expect.objectContaining({
          coverPhotoId: null,
        }),
        include: expect.any(Object),
      });
      expect(result.coverPhotoId).toBeNull();
    });
  });

  describe('ALB-006: Get albums by trip', () => {
    it('should return albums for a trip with pagination', async () => {
      const albums = [
        { ...mockAlbum, id: 1, name: 'Album 1', photoAssignments: [{ photo: mockPhoto }] },
        { ...mockAlbum, id: 2, name: 'Album 2', photoAssignments: [] },
      ];

      mockPrisma.photoAlbum.findMany.mockResolvedValue(albums);
      mockPrisma.photoAlbum.count.mockResolvedValue(2);
      mockPrisma.photo.count.mockResolvedValue(10);
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue([
        { photoId: 1 },
        { photoId: 2 },
        { photoId: 3 },
      ]);

      const result = await photoAlbumService.getAlbumsByTrip(mockUserId, mockTripId);

      expect(verifyTripAccessWithPermission).toHaveBeenCalledWith(mockUserId, mockTripId, 'view');
      expect(mockPrisma.photoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripId: mockTripId },
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result.albums).toHaveLength(2);
      expect(result.totalAlbums).toBe(2);
      expect(result.unsortedCount).toBe(7); // 10 total - 3 in albums
    });

    it('should return albums with pagination options', async () => {
      const albumWithPhotoAssignments = {
        ...mockAlbum,
        photoAssignments: [],
      };
      mockPrisma.photoAlbum.findMany.mockResolvedValue([albumWithPhotoAssignments]);
      mockPrisma.photoAlbum.count.mockResolvedValue(5);
      mockPrisma.photo.count.mockResolvedValue(20);
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue([]);

      const result = await photoAlbumService.getAlbumsByTrip(mockUserId, mockTripId, {
        skip: 0,
        take: 10,
      });

      expect(mockPrisma.photoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        })
      );
      expect(result.totalAlbums).toBe(5);
      expect(result.hasMore).toBe(true); // 5 total, loaded 1, more remain
    });

    it('should use first photo as cover if no cover photo set', async () => {
      const albumWithFirstPhoto = {
        ...mockAlbum,
        coverPhoto: null,
        photoAssignments: [{ photo: mockPhoto }],
      };

      mockPrisma.photoAlbum.findMany.mockResolvedValue([albumWithFirstPhoto]);
      mockPrisma.photoAlbum.count.mockResolvedValue(1);
      mockPrisma.photo.count.mockResolvedValue(5);
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue([{ photoId: 1 }]);

      const result = await photoAlbumService.getAlbumsByTrip(mockUserId, mockTripId);

      // First photo should be used as cover
      expect(result.albums[0].coverPhoto).toEqual(mockPhoto);
    });
  });

  describe('ALB-007: Get album photos with pagination', () => {
    it('should return album photos with pagination', async () => {
      const photoAssignments = [
        { photo: { ...mockPhoto, id: 1 } },
        { photo: { ...mockPhoto, id: 2 } },
        { photo: { ...mockPhoto, id: 3 } },
      ];

      const albumWithPhotos = {
        ...mockAlbum,
        trip: { userId: mockUserId },
        photoAssignments,
        _count: { photoAssignments: 10 },
      };

      mockPrisma.photoAlbum.findUnique.mockResolvedValue(albumWithPhotos);

      const result = await photoAlbumService.getAlbumById(mockUserId, mockAlbumId, {
        skip: 0,
        take: 3,
      });

      expect(mockPrisma.photoAlbum.findUnique).toHaveBeenCalledWith({
        where: { id: mockAlbumId },
        include: expect.objectContaining({
          photoAssignments: expect.objectContaining({
            skip: 0,
            take: 3,
          }),
        }),
      });
      expect(result.photoAssignments).toHaveLength(3);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('scopes the page and the total to favorites when favoritesOnly is set', async () => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue({
        ...mockAlbum,
        trip: { userId: mockUserId },
        photoAssignments: [{ photo: { ...mockPhoto, id: 1, isFavorite: true } }],
        _count: { photoAssignments: 1 },
      });

      const result = await photoAlbumService.getAlbumById(mockUserId, mockAlbumId, {
        favoritesOnly: true,
      });

      const favoriteFilter = { photo: { isFavorite: true } };
      expect(mockPrisma.photoAlbum.findUnique).toHaveBeenCalledWith({
        where: { id: mockAlbumId },
        include: expect.objectContaining({
          photoAssignments: expect.objectContaining({ where: favoriteFilter }),
          _count: { select: { photoAssignments: { where: favoriteFilter } } },
        }),
      });
      expect(result.total).toBe(1);
    });

    it('should return hasMore = false when all photos loaded', async () => {
      const photoAssignments = [
        { photo: { ...mockPhoto, id: 1 } },
        { photo: { ...mockPhoto, id: 2 } },
      ];

      const albumWithPhotos = {
        ...mockAlbum,
        trip: { userId: mockUserId },
        photoAssignments,
        _count: { photoAssignments: 2 },
      };

      mockPrisma.photoAlbum.findUnique.mockResolvedValue(albumWithPhotos);

      const result = await photoAlbumService.getAlbumById(mockUserId, mockAlbumId, {
        skip: 0,
        take: 40,
      });

      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(2);
    });

    it('should support sorting by date', async () => {
      const albumWithPhotos = {
        ...mockAlbum,
        trip: { userId: mockUserId },
        photoAssignments: [],
        _count: { photoAssignments: 0 },
      };

      mockPrisma.photoAlbum.findUnique.mockResolvedValue(albumWithPhotos);

      await photoAlbumService.getAlbumById(mockUserId, mockAlbumId, {
        skip: 0,
        take: 40,
        sortBy: 'date',
        sortOrder: 'desc',
      });

      expect(mockPrisma.photoAlbum.findUnique).toHaveBeenCalledWith({
        where: { id: mockAlbumId },
        include: expect.objectContaining({
          photoAssignments: expect.objectContaining({
            orderBy: expect.arrayContaining([
              expect.objectContaining({ photo: { takenAt: 'desc' } }),
            ]),
          }),
        }),
      });
    });

    it('should default to 40 photos per page', async () => {
      const albumWithPhotos = {
        ...mockAlbum,
        trip: { userId: mockUserId },
        photoAssignments: [],
        _count: { photoAssignments: 0 },
      };

      mockPrisma.photoAlbum.findUnique.mockResolvedValue(albumWithPhotos);

      await photoAlbumService.getAlbumById(mockUserId, mockAlbumId);

      expect(mockPrisma.photoAlbum.findUnique).toHaveBeenCalledWith({
        where: { id: mockAlbumId },
        include: expect.objectContaining({
          photoAssignments: expect.objectContaining({
            take: 40,
          }),
        }),
      });
    });
  });

  describe('ALB-008: Update album', () => {
    beforeEach(() => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(mockAlbum);
    });

    it('should update album name', async () => {
      mockPrisma.photoAlbum.update.mockResolvedValue({
        ...mockAlbum,
        name: 'Renamed Album',
        _count: { photoAssignments: 5 },
      });

      const result = await photoAlbumService.updateAlbum(mockUserId, mockAlbumId, {
        name: 'Renamed Album',
      });

      expect(verifyEntityAccessWithPermission).toHaveBeenCalled();
      expect(mockPrisma.photoAlbum.update).toHaveBeenCalledWith({
        where: { id: mockAlbumId },
        data: expect.objectContaining({
          name: 'Renamed Album',
        }),
        include: expect.any(Object),
      });
      expect(result.name).toBe('Renamed Album');
    });

    it('should update album description', async () => {
      mockPrisma.photoAlbum.update.mockResolvedValue({
        ...mockAlbum,
        description: 'New description for the album',
        _count: { photoAssignments: 5 },
      });

      const result = await photoAlbumService.updateAlbum(mockUserId, mockAlbumId, {
        description: 'New description for the album',
      });

      expect(result.description).toBe('New description for the album');
    });

    it('should update multiple fields at once', async () => {
      mockPrisma.photo.findFirst.mockResolvedValue(mockPhoto);
      mockPrisma.photoAlbum.update.mockResolvedValue({
        ...mockAlbum,
        name: 'Best Photos',
        description: 'Our favorite photos from the trip',
        coverPhotoId: 1,
        _count: { photoAssignments: 5 },
      });

      const result = await photoAlbumService.updateAlbum(mockUserId, mockAlbumId, {
        name: 'Best Photos',
        description: 'Our favorite photos from the trip',
        coverPhotoId: 1,
      });

      expect(result.name).toBe('Best Photos');
      expect(result.description).toBe('Our favorite photos from the trip');
      expect(result.coverPhotoId).toBe(1);
    });

    it('should clear description when set to empty string', async () => {
      mockPrisma.photoAlbum.update.mockResolvedValue({
        ...mockAlbum,
        description: '',
        _count: { photoAssignments: 5 },
      });

      const result = await photoAlbumService.updateAlbum(mockUserId, mockAlbumId, {
        description: '',
      });

      expect(result.description).toBe('');
    });
  });

  describe('ALB-009: Delete album', () => {
    beforeEach(() => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(mockAlbum);
      mockPrisma.photoAlbum.delete.mockResolvedValue(mockAlbum);
    });

    it('should delete album and clean up entity links', async () => {
      const result = await photoAlbumService.deleteAlbum(mockUserId, mockAlbumId);

      expect(verifyEntityAccessWithPermission).toHaveBeenCalled();
      // Link cleanup and the delete share one transaction, so the cleanup
      // helper is handed the transaction client.
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(cleanupEntityLinks).toHaveBeenCalledWith(
        mockTripId,
        'PHOTO_ALBUM',
        mockAlbumId,
        mockPrisma
      );
      expect(mockPrisma.photoAlbum.delete).toHaveBeenCalledWith({
        where: { id: mockAlbumId },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw error if album not found', async () => {
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(null);
      (verifyEntityAccessWithPermission as jest.Mock).mockRejectedValue(
        new AppError("We couldn't find that album.", 404)
      );

      await expect(
        photoAlbumService.deleteAlbum(mockUserId, 999)
      ).rejects.toThrow("We couldn't find that album.");
    });

    it('should throw error if user does not own the album', async () => {
      const otherUserAlbum = {
        ...mockAlbum,
        trip: { ...mockTrip, userId: 999 },
      };
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(otherUserAlbum);
      (verifyEntityAccessWithPermission as jest.Mock).mockRejectedValue(
        new AppError("You don't have access to this trip.", 403)
      );

      await expect(
        photoAlbumService.deleteAlbum(mockUserId, mockAlbumId)
      ).rejects.toThrow("You don't have access to this trip.");
    });

    it('should delete album even if it contains photos (photos remain in trip)', async () => {
      const albumWithPhotos = {
        ...mockAlbum,
        _count: { photoAssignments: 50 },
      };
      mockPrisma.photoAlbum.findUnique.mockResolvedValue(albumWithPhotos);

      const result = await photoAlbumService.deleteAlbum(mockUserId, mockAlbumId);

      // Album deletion should succeed - photos are not deleted, only the album
      expect(result).toEqual({ success: true });
      expect(mockPrisma.photoAlbum.delete).toHaveBeenCalled();
    });
  });

  describe('getAllAlbums', () => {
    it('should return all albums for user across trips with pagination', async () => {
      const albums = [
        {
          ...mockAlbum,
          id: 1,
          trip: { ...mockTrip, tagAssignments: [] },
          photoAssignments: [{ photo: mockPhoto }],
        },
        {
          ...mockAlbum,
          id: 2,
          tripId: 2,
          trip: { ...mockTrip, id: 2, tagAssignments: [] },
          photoAssignments: [],
        },
      ];

      mockPrisma.photoAlbum.findMany.mockResolvedValue(albums);
      mockPrisma.photoAlbum.count.mockResolvedValue(2);
      mockPrisma.photoAlbumAssignment.count.mockResolvedValue(15);

      const result = await photoAlbumService.getAllAlbums(mockUserId);

      expect(mockPrisma.photoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            trip: {
              userId: mockUserId,
            },
          },
        })
      );
      expect(result.albums).toHaveLength(2);
      expect(result.totalAlbums).toBe(2);
      expect(result.totalPhotos).toBe(15);
      expect(result.tripCount).toBe(2);
    });

    it('should filter albums by tag IDs', async () => {
      const albumWithPhotoAssignments = {
        ...mockAlbum,
        trip: { ...mockTrip, tagAssignments: [] },
        photoAssignments: [],
      };
      mockPrisma.photoAlbum.findMany.mockResolvedValue([albumWithPhotoAssignments]);
      mockPrisma.photoAlbum.count.mockResolvedValue(1);
      mockPrisma.photoAlbumAssignment.count.mockResolvedValue(5);

      await photoAlbumService.getAllAlbums(mockUserId, { tagIds: [1, 2] });

      expect(mockPrisma.photoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            trip: {
              userId: mockUserId,
              tagAssignments: {
                some: {
                  tagId: {
                    in: [1, 2],
                  },
                },
              },
            },
          },
        })
      );
    });

    it('should support skip and take pagination', async () => {
      mockPrisma.photoAlbum.findMany.mockResolvedValue([]);
      mockPrisma.photoAlbum.count.mockResolvedValue(50);
      mockPrisma.photoAlbumAssignment.count.mockResolvedValue(0);

      const result = await photoAlbumService.getAllAlbums(mockUserId, {
        skip: 10,
        take: 20,
      });

      expect(mockPrisma.photoAlbum.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 20,
        })
      );
      expect(result.hasMore).toBe(true);
    });
  });
});
