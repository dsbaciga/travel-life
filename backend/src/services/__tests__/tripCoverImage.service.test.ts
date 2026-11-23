/**
 * Trip Cover Image Service Tests
 *
 * Covers the standalone cover image upload used on the trip edit page:
 * - COVER-001: Uploads store the image outside the photos table
 * - COVER-002: Uploading clears a gallery-photo cover
 * - COVER-003: Rejects files whose magic bytes aren't an allowed image
 * - COVER-004: Rejects trips the user doesn't own
 * - COVER-005: Replacing a cover deletes the previous files
 * - COVER-006: Removing a cover clears the row and deletes files
 * - COVER-007: Failed DB writes don't leave orphaned files
 * - COVER-008: The dominant colour of the new cover is stored; greys store nothing
 */

// Mock @prisma/client BEFORE any imports
jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      constructor(private value: string | number) {}
      toNumber(): number {
        return parseFloat(String(this.value));
      }
    },
  },
}));

const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

const mockFs = {
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
};

jest.mock('fs/promises', () => mockFs);

const mockSharpInstance = {
  rotate: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toFile: jest.fn().mockResolvedValue(undefined),
  removeAlpha: jest.fn().mockReturnThis(),
  stats: jest.fn(),
};

const mockSharp = jest.fn().mockReturnValue(mockSharpInstance);
jest.mock('sharp', () => mockSharp);

const mockFileTypeFromFile = jest.fn();
jest.mock('file-type', () => ({
  __esModule: true,
  fileTypeFromFile: mockFileTypeFromFile,
}), { virtual: true });

import tripCoverImageService from '../tripCoverImage.service';
import { AppError } from '../../errors/errors';

const mockUserId = 1;
const mockTripId = 10;

const mockFile = {
  path: '/tmp/temp-cover-123.jpg',
  originalname: 'beach.jpg',
} as Express.Multer.File;

const baseTrip = {
  id: mockTripId,
  coverImagePath: null as string | null,
  coverImageThumbnailPath: null as string | null,
};

describe('TripCoverImageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockSharpInstance.toFile.mockResolvedValue(undefined);
    mockSharpInstance.stats.mockResolvedValue({ dominant: { r: 42, g: 127, b: 191 } });
    mockFileTypeFromFile.mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' });
  });

  describe('uploadCoverImage', () => {
    it('COVER-001: stores the image on the trip row without creating a photo', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(baseTrip);
      mockPrisma.trip.update.mockResolvedValue({ ...baseTrip, coverImagePath: '/uploads/covers/x.jpg' });

      await tripCoverImageService.uploadCoverImage(mockUserId, mockTripId, mockFile);

      // The service has no access to prisma.photo at all — the cover never enters the
      // photo library, so it can't surface in photos, memories, albums or search
      expect(mockPrisma).not.toHaveProperty('photo');

      const updateArgs = mockPrisma.trip.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: mockTripId });
      expect(updateArgs.data.coverImagePath).toMatch(/^\/uploads\/covers\/cover-10-.*\.jpg$/);
      expect(updateArgs.data.coverImageThumbnailPath).toMatch(/^\/uploads\/covers\/thumb-cover-10-.*\.jpg$/);
    });

    it('COVER-002: clears the gallery-photo cover so the two stay mutually exclusive', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(baseTrip);
      mockPrisma.trip.update.mockResolvedValue(baseTrip);

      await tripCoverImageService.uploadCoverImage(mockUserId, mockTripId, mockFile);

      expect(mockPrisma.trip.update.mock.calls[0][0].data.coverPhotoId).toBeNull();
    });

    it('COVER-008: stores the dominant colour of the new cover, and nothing for a grey one', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(baseTrip);
      mockPrisma.trip.update.mockResolvedValue(baseTrip);

      await tripCoverImageService.uploadCoverImage(mockUserId, mockTripId, mockFile);
      expect(mockPrisma.trip.update.mock.calls[0][0].data.coverColor).toBe('#2a7fbf');

      mockSharpInstance.stats.mockResolvedValue({ dominant: { r: 128, g: 128, b: 128 } });
      await tripCoverImageService.uploadCoverImage(mockUserId, mockTripId, mockFile);
      expect(mockPrisma.trip.update.mock.calls[1][0].data.coverColor).toBeNull();
    });

    it('COVER-003: rejects files whose content is not an allowed image', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(baseTrip);
      mockFileTypeFromFile.mockResolvedValue({ mime: 'application/pdf', ext: 'pdf' });

      await expect(
        tripCoverImageService.uploadCoverImage(mockUserId, mockTripId, mockFile)
      ).rejects.toThrow(AppError);

      expect(mockPrisma.trip.update).not.toHaveBeenCalled();
      // Temp file is always cleaned up, even on rejection
      expect(mockFs.unlink).toHaveBeenCalledWith(mockFile.path);
    });

    it('COVER-004: rejects a trip the user does not own', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        tripCoverImageService.uploadCoverImage(mockUserId, mockTripId, mockFile)
      ).rejects.toThrow('Trip not found or you do not have permission to edit it');

      expect(mockPrisma.trip.update).not.toHaveBeenCalled();
    });

    it('COVER-005: deletes the previous cover files after the new one is committed', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...baseTrip,
        coverImagePath: '/uploads/covers/old.jpg',
        coverImageThumbnailPath: '/uploads/covers/thumb-old.jpg',
      });
      mockPrisma.trip.update.mockResolvedValue(baseTrip);

      await tripCoverImageService.uploadCoverImage(mockUserId, mockTripId, mockFile);

      const unlinked = mockFs.unlink.mock.calls.map((call) => String(call[0]));
      expect(unlinked.some((p) => p.includes('old.jpg'))).toBe(true);
      expect(unlinked.some((p) => p.includes('thumb-old.jpg'))).toBe(true);
    });

    it('COVER-007: removes newly written files when the database update fails', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(baseTrip);
      mockPrisma.trip.update.mockRejectedValue(new Error('db down'));

      await expect(
        tripCoverImageService.uploadCoverImage(mockUserId, mockTripId, mockFile)
      ).rejects.toThrow('db down');

      const unlinked = mockFs.unlink.mock.calls.map((call) => String(call[0]));
      expect(unlinked.some((p) => p.includes('covers') && p.includes('cover-10-'))).toBe(true);
    });
  });

  describe('deleteCoverImage', () => {
    it('COVER-006: clears the paths and deletes the files from disk', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...baseTrip,
        coverImagePath: '/uploads/covers/cur.jpg',
        coverImageThumbnailPath: '/uploads/covers/thumb-cur.jpg',
      });
      mockPrisma.trip.update.mockResolvedValue({ ...baseTrip });

      await tripCoverImageService.deleteCoverImage(mockUserId, mockTripId);

      expect(mockPrisma.trip.update).toHaveBeenCalledWith({
        where: { id: mockTripId },
        data: { coverImagePath: null, coverImageThumbnailPath: null, coverColor: null },
        include: { coverPhoto: true },
      });

      const unlinked = mockFs.unlink.mock.calls.map((call) => String(call[0]));
      expect(unlinked.some((p) => p.includes('cur.jpg'))).toBe(true);
      expect(unlinked.some((p) => p.includes('thumb-cur.jpg'))).toBe(true);
    });

    it('ignores missing files so a partially cleaned upload still clears the row', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue({
        ...baseTrip,
        coverImagePath: '/uploads/covers/gone.jpg',
        coverImageThumbnailPath: null,
      });
      mockPrisma.trip.update.mockResolvedValue({ ...baseTrip });
      mockFs.unlink.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

      await expect(
        tripCoverImageService.deleteCoverImage(mockUserId, mockTripId)
      ).resolves.toBeDefined();
    });
  });
});
