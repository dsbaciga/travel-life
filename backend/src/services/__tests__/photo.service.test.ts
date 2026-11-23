/**
 * Photo Service Tests
 *
 * Tests for PHOTO-001 through PHOTO-014 from the test plan:
 * - PHOTO-001: Upload photo with valid image
 * - PHOTO-002: Extract EXIF metadata on upload
 * - PHOTO-003: Generate thumbnail on upload
 * - PHOTO-004: Validate image type (JPEG, PNG, WebP, GIF)
 * - PHOTO-005: Reject invalid file types
 * - PHOTO-006: Get photos by trip with pagination
 * - PHOTO-007: Paged pagination returns correct page
 * - PHOTO-008: Update photo metadata
 * - PHOTO-009: Update photo coordinates
 * - PHOTO-010: Delete photo removes file from disk
 * - PHOTO-011: Delete photo removes from albums
 * - PHOTO-012: Import photo from Immich
 * - PHOTO-013: Handle Immich connection failure
 * - PHOTO-014: Bulk photo operations
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
      raw: (str: string) => str,
    },
    EntityType: {
      PHOTO: 'PHOTO',
      LOCATION: 'LOCATION',
      ACTIVITY: 'ACTIVITY',
      LODGING: 'LODGING',
      TRANSPORTATION: 'TRANSPORTATION',
      JOURNAL: 'JOURNAL',
      ALBUM: 'ALBUM',
    },
  };
});

// Mock database config
const mockPrisma = {
  photo: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
  },
  trip: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  userIntegrations: {
    findUnique: jest.fn(),
  },
  tripCollaborator: {
    count: jest.fn(),
  },
  photoAlbumAssignment: {
    findMany: jest.fn(),
  },
  entityLink: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock fs/promises
const mockFs = {
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
};

jest.mock('fs/promises', () => mockFs);

// Mock sharp for image processing
const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toFile: jest.fn().mockResolvedValue(undefined),
  metadata: jest.fn().mockResolvedValue({
    width: 1920,
    height: 1080,
    format: 'jpeg',
    exif: Buffer.from('mock-exif-data'),
  }),
};

const mockSharp = jest.fn().mockReturnValue(mockSharpInstance);

jest.mock('sharp', () => mockSharp);

// Mock file-type for magic bytes validation (ESM module)
// Store mock function in a variable that can be controlled in tests
const mockFileTypeFromFile = jest.fn();
jest.mock('file-type', () => ({
  __esModule: true,
  fileTypeFromFile: mockFileTypeFromFile,
}), { virtual: true });

// Mock ffmpeg for video processing
const mockFfmpegInstance = {
  on: jest.fn().mockImplementation(function(this: unknown, event: string, callback: (...args: unknown[]) => void) {
    if (event === 'end') {
      setTimeout(() => callback(), 0);
    }
    return this;
  }),
  screenshots: jest.fn().mockReturnThis(),
};

const mockFfprobe = jest.fn();

jest.mock('fluent-ffmpeg', () => {
  const ffmpeg = jest.fn().mockReturnValue(mockFfmpegInstance);
  ffmpeg.ffprobe = mockFfprobe;
  return ffmpeg;
}, { virtual: true });

// Mock axios for Immich integration
jest.mock('axios', () => ({
  get: jest.fn(),
}));

// Mock exifr for EXIF extraction
jest.mock('exifr', () => ({
  default: {
    parse: jest.fn(),
  },
}));

// Import after mocks are set up
import photoService from '../photo.service';
import { AppError } from '../../errors/errors';
import axios from 'axios';

describe('PhotoService', () => {
  // Test data fixtures
  const mockUserId = 1;
  const mockTripId = 100;
  const mockPhotoId = 500;

  const mockTrip = {
    id: mockTripId,
    userId: mockUserId,
    title: 'Test Trip',
    privacyLevel: 'Private',
    collaborators: [],
  };

  const mockPhoto = {
    id: mockPhotoId,
    tripId: mockTripId,
    source: 'local',
    mediaType: 'image',
    localPath: '/uploads/photos/test-photo.jpg',
    thumbnailPath: '/uploads/thumbnails/thumb-test-photo.jpg',
    caption: 'Test caption',
    takenAt: new Date('2025-01-15T10:00:00Z'),
    latitude: 40.7128,
    longitude: -74.006,
    createdAt: new Date(),
    updatedAt: new Date(),
    trip: mockTrip,
  };

  const mockMulterFile: Express.Multer.File = {
    fieldname: 'photo',
    originalname: 'test-photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024000,
    destination: '/tmp',
    filename: 'temp-file.jpg',
    path: '/tmp/temp-file.jpg',
    buffer: Buffer.from('mock-image-data'),
    stream: {} as NodeJS.ReadableStream,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: run the transaction body against the same mock client so writes
    // made inside it stay observable on mockPrisma. Batch tests override this
    // with a bespoke tx stub; without a default, transactional paths such as
    // deletePhoto would silently never execute their body.
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma)
    );

    // Default trip access verification
    mockPrisma.trip.findFirst.mockResolvedValue(mockTrip);

    // Default file type validation (valid JPEG)
    mockFileTypeFromFile.mockResolvedValue({
      mime: 'image/jpeg',
      ext: 'jpg',
    });
  });

  // ============================================
  // PHOTO-001: Upload photo with valid image
  // ============================================
  describe('PHOTO-001: uploadPhoto - Upload photo with valid image', () => {
    it('should successfully upload a valid JPEG image', async () => {
      const expectedPhoto = {
        id: 1,
        tripId: mockTripId,
        source: 'local',
        mediaType: 'image',
        localPath: expect.stringContaining('/uploads/photos/'),
        thumbnailPath: expect.stringContaining('/uploads/thumbnails/'),
        caption: 'Test caption',
        takenAt: null,
        latitude: 40.7128,
        longitude: -74.006,
      };

      mockPrisma.photo.create.mockResolvedValue(expectedPhoto);

      const result = await photoService.uploadPhoto(mockUserId, mockMulterFile, {
        tripId: mockTripId,
        caption: 'Test caption',
        latitude: 40.7128,
        longitude: -74.006,
      });

      expect(mockPrisma.trip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: mockTripId }),
        })
      );
      expect(mockFileTypeFromFile).toHaveBeenCalledWith('/tmp/temp-file.jpg');
      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.rename).toHaveBeenCalled();
      expect(mockSharp).toHaveBeenCalled();
      expect(mockPrisma.photo.create).toHaveBeenCalled();
      expect(result.source).toBe('local');
      expect(result.mediaType).toBe('image');
    });

    it('should reject upload for non-owner trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        photoService.uploadPhoto(mockUserId, mockMulterFile, {
          tripId: mockTripId,
        })
      ).rejects.toThrow(AppError);

      expect(mockPrisma.photo.create).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // PHOTO-002: Extract EXIF metadata on upload
  // ============================================
  describe('PHOTO-002: uploadPhoto - Extract EXIF metadata on upload', () => {
    it('should create photo record on upload (EXIF handled by sharp/exifr)', async () => {
      mockPrisma.photo.create.mockResolvedValue({
        ...mockPhoto,
        latitude: null,
        longitude: null,
      });

      const result = await photoService.uploadPhoto(mockUserId, mockMulterFile, {
        tripId: mockTripId,
      });

      // Thumbnail is generated via sharp for standard images
      expect(mockSharp).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should use provided coordinates over EXIF data', async () => {
      const providedLat = 51.5074;
      const providedLng = -0.1278;

      mockPrisma.photo.create.mockResolvedValue({
        ...mockPhoto,
        latitude: providedLat,
        longitude: providedLng,
      });

      const result = await photoService.uploadPhoto(mockUserId, mockMulterFile, {
        tripId: mockTripId,
        latitude: providedLat,
        longitude: providedLng,
      });

      const createCall = mockPrisma.photo.create.mock.calls[0][0];
      expect(createCall.data.latitude).toBe(providedLat);
      expect(createCall.data.longitude).toBe(providedLng);
    });
  });

  // ============================================
  // PHOTO-003: Generate thumbnail on upload
  // ============================================
  describe('PHOTO-003: uploadPhoto - Generate thumbnail on upload', () => {
    it('should generate a 400x400 thumbnail for images', async () => {
      mockPrisma.photo.create.mockResolvedValue({
        ...mockPhoto,
        thumbnailPath: '/uploads/thumbnails/thumb-test.jpg',
      });

      await photoService.uploadPhoto(mockUserId, mockMulterFile, {
        tripId: mockTripId,
      });

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(400, 400, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 });
      expect(mockSharpInstance.toFile).toHaveBeenCalled();
    });

    it('should store thumbnail path in database', async () => {
      mockPrisma.photo.create.mockResolvedValue(mockPhoto);

      await photoService.uploadPhoto(mockUserId, mockMulterFile, {
        tripId: mockTripId,
      });

      const createCall = mockPrisma.photo.create.mock.calls[0][0];
      expect(createCall.data.thumbnailPath).toContain('/uploads/thumbnails/');
    });
  });

  // ============================================
  // PHOTO-004: Validate image type (JPEG, PNG, WebP, GIF)
  // ============================================
  describe('PHOTO-004: uploadPhoto - Validate image type', () => {
    const validImageTypes = [
      { mime: 'image/jpeg', ext: 'jpg' },
      { mime: 'image/png', ext: 'png' },
      { mime: 'image/webp', ext: 'webp' },
      { mime: 'image/gif', ext: 'gif' },
      { mime: 'image/heic', ext: 'heic' },
      { mime: 'image/avif', ext: 'avif' },
    ];

    it.each(validImageTypes)(
      'should accept $mime files',
      async ({ mime, ext }) => {
        mockFileTypeFromFile.mockResolvedValue({ mime, ext });
        mockPrisma.photo.create.mockResolvedValue({
          ...mockPhoto,
          mediaType: 'image',
        });

        const file = {
          ...mockMulterFile,
          mimetype: mime,
          originalname: `test.${ext}`,
        };

        const result = await photoService.uploadPhoto(mockUserId, file, {
          tripId: mockTripId,
        });

        expect(result.mediaType).toBe('image');
      }
    );

    it('should accept valid video types', async () => {
      mockFileTypeFromFile.mockResolvedValue({
        mime: 'video/mp4',
        ext: 'mp4',
      });

      mockFfprobe.mockImplementation((_path: string, callback: (err: null, metadata: { format: { duration: number } }) => void) => {
        callback(null, { format: { duration: 120 } });
      });

      mockPrisma.photo.create.mockResolvedValue({
        ...mockPhoto,
        mediaType: 'video',
        duration: 120,
      });

      const videoFile = {
        ...mockMulterFile,
        mimetype: 'video/mp4',
        originalname: 'test.mp4',
      };

      const result = await photoService.uploadPhoto(mockUserId, videoFile, {
        tripId: mockTripId,
      });

      expect(result.mediaType).toBe('video');
    });
  });

  // ============================================
  // PHOTO-005: Reject invalid file types
  // ============================================
  describe('PHOTO-005: uploadPhoto - Reject invalid file types', () => {
    it('should reject PDF files', async () => {
      mockFileTypeFromFile.mockResolvedValue({
        mime: 'application/pdf',
        ext: 'pdf',
      });

      const pdfFile = {
        ...mockMulterFile,
        mimetype: 'application/pdf',
        originalname: 'document.pdf',
      };

      await expect(
        photoService.uploadPhoto(mockUserId, pdfFile, { tripId: mockTripId })
      ).rejects.toThrow('Invalid file type');

      expect(mockPrisma.photo.create).not.toHaveBeenCalled();
    });

    it('should reject executable files', async () => {
      mockFileTypeFromFile.mockResolvedValue({
        mime: 'application/x-msdownload',
        ext: 'exe',
      });

      const exeFile = {
        ...mockMulterFile,
        mimetype: 'application/x-msdownload',
        originalname: 'malware.exe',
      };

      await expect(
        photoService.uploadPhoto(mockUserId, exeFile, { tripId: mockTripId })
      ).rejects.toThrow('Invalid file type');
    });

    it('should reject files with undetectable type', async () => {
      mockFileTypeFromFile.mockResolvedValue(null);

      await expect(
        photoService.uploadPhoto(mockUserId, mockMulterFile, { tripId: mockTripId })
      ).rejects.toThrow('Invalid file type');
    });

    it('should reject files with spoofed extensions', async () => {
      // File claims to be JPEG but magic bytes reveal it's actually an executable
      mockFileTypeFromFile.mockResolvedValue({
        mime: 'application/x-msdownload',
        ext: 'exe',
      });

      const spoofedFile = {
        ...mockMulterFile,
        mimetype: 'image/jpeg',
        originalname: 'image.jpg', // Name says JPEG
      };

      await expect(
        photoService.uploadPhoto(mockUserId, spoofedFile, { tripId: mockTripId })
      ).rejects.toThrow('Invalid file type');
    });

    it('names the stored file after the detected type, never the client filename', async () => {
      // A genuine image uploaded as "x.html": the content check passes, so the
      // stored name must not carry the extension the client chose, or the file
      // would be served from the app origin as an HTML document.
      mockFileTypeFromFile.mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' });
      mockPrisma.photo.create.mockResolvedValue({ ...mockPhoto, mediaType: 'image' });

      await photoService.uploadPhoto(
        mockUserId,
        { ...mockMulterFile, mimetype: 'image/jpeg', originalname: 'holiday.html' },
        { tripId: mockTripId }
      );

      const stored = mockPrisma.photo.create.mock.calls.at(-1)?.[0].data.localPath;
      expect(stored).toMatch(/^\/uploads\/photos\/[0-9a-f-]{36}\.jpg$/);
    });
  });

  // ============================================
  // PHOTO-006: Get photos by trip with pagination
  // ============================================
  describe('PHOTO-FAV: favorites', () => {
    it('should star a photo through updatePhoto', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.photo.update.mockResolvedValue({ ...mockPhoto, isFavorite: true });

      const result = await photoService.updatePhoto(mockUserId, mockPhotoId, {
        isFavorite: true,
      });

      expect(mockPrisma.photo.update).toHaveBeenCalledWith({
        where: { id: mockPhotoId },
        data: expect.objectContaining({ isFavorite: true }),
      });
      expect(result.isFavorite).toBe(true);
    });

    it('should leave isFavorite untouched when not supplied', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.photo.update.mockResolvedValue(mockPhoto);

      await photoService.updatePhoto(mockUserId, mockPhotoId, { caption: 'x' });

      const updateCall = mockPrisma.photo.update.mock.calls[0][0];
      expect(updateCall.data.isFavorite).toBeUndefined();
    });

    it('should reject starring for users without edit access', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        photoService.updatePhoto(mockUserId, mockPhotoId, { isFavorite: true })
      ).rejects.toThrow("We couldn't find that trip, or you don't have access to it.");
      expect(mockPrisma.photo.update).not.toHaveBeenCalled();
    });

    it('should filter unsorted photos to favorites when favoritesOnly is set', async () => {
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue([{ photoId: 5 }]);
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockPrisma.photo.count.mockResolvedValue(0);

      await photoService.getUnsortedPhotosByTrip(mockUserId, mockTripId, {
        favoritesOnly: true,
      });

      const where = { tripId: mockTripId, id: { notIn: [5] }, isFavorite: true };
      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(mockPrisma.photo.count).toHaveBeenCalledWith({ where });
    });

    it('should filter to favorites when favoritesOnly is set', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([{ ...mockPhoto, isFavorite: true }]);
      mockPrisma.photo.count.mockResolvedValue(1);

      const result = await photoService.getPhotosByTrip(mockUserId, mockTripId, {
        favoritesOnly: true,
      });

      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tripId: mockTripId, isFavorite: true } })
      );
      expect(mockPrisma.photo.count).toHaveBeenCalledWith({
        where: { tripId: mockTripId, isFavorite: true },
      });
      expect(result.total).toBe(1);
    });
  });

  describe('PHOTO-006: getPhotosByTrip - Get photos with pagination', () => {
    it('should return paginated photos for a trip', async () => {
      const photos = [
        { ...mockPhoto, id: 1 },
        { ...mockPhoto, id: 2 },
        { ...mockPhoto, id: 3 },
      ];

      mockPrisma.photo.findMany.mockResolvedValue(photos);
      mockPrisma.photo.count.mockResolvedValue(10);

      const result = await photoService.getPhotosByTrip(mockUserId, mockTripId, {
        skip: 0,
        take: 3,
      });

      expect(result.photos).toHaveLength(3);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);

      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripId: mockTripId },
          skip: 0,
          take: 3,
        })
      );
    });

    it('should indicate hasMore=false on last page', async () => {
      const photos = [{ ...mockPhoto, id: 1 }];

      mockPrisma.photo.findMany.mockResolvedValue(photos);
      mockPrisma.photo.count.mockResolvedValue(1);

      const result = await photoService.getPhotosByTrip(mockUserId, mockTripId, {
        skip: 0,
        take: 40,
      });

      expect(result.hasMore).toBe(false);
    });

    it('should use default page size of 40', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockPrisma.photo.count.mockResolvedValue(0);

      await photoService.getPhotosByTrip(mockUserId, mockTripId);

      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 40,
        })
      );
    });
  });

  // ============================================
  // PHOTO-007: Paged pagination returns correct page
  // ============================================
  describe('PHOTO-007: getPhotosByTrip - Paged pagination returns correct page', () => {
    it('should return correct page with skip/take', async () => {
      const page2Photos = [
        { ...mockPhoto, id: 41 },
        { ...mockPhoto, id: 42 },
      ];

      mockPrisma.photo.findMany.mockResolvedValue(page2Photos);
      mockPrisma.photo.count.mockResolvedValue(82);

      // Request page 2 (skip 40, take 40)
      const result = await photoService.getPhotosByTrip(mockUserId, mockTripId, {
        skip: 40,
        take: 40,
      });

      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 40,
        })
      );
      expect(result.photos).toHaveLength(2);
      expect(result.total).toBe(82);
    });

    it('should sort by date descending by default', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockPrisma.photo.count.mockResolvedValue(0);

      await photoService.getPhotosByTrip(mockUserId, mockTripId);

      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
        })
      );
    });

    it('should support custom sort order', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockPrisma.photo.count.mockResolvedValue(0);

      await photoService.getPhotosByTrip(mockUserId, mockTripId, {
        sortBy: 'date',
        sortOrder: 'asc',
      });

      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ takenAt: 'asc' }, { createdAt: 'asc' }],
        })
      );
    });
  });

  // ============================================
  // PHOTO-008: Update photo metadata
  // ============================================
  describe('PHOTO-008: updatePhoto - Update photo metadata', () => {
    it('should update photo caption', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.photo.update.mockResolvedValue({
        ...mockPhoto,
        caption: 'Updated caption',
      });

      const result = await photoService.updatePhoto(mockUserId, mockPhotoId, {
        caption: 'Updated caption',
      });

      expect(mockPrisma.photo.update).toHaveBeenCalledWith({
        where: { id: mockPhotoId },
        data: expect.objectContaining({
          caption: 'Updated caption',
        }),
      });
      expect(result.caption).toBe('Updated caption');
    });

    it('should update takenAt date', async () => {
      const newDate = '2025-06-15T14:30:00Z';
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.photo.update.mockResolvedValue({
        ...mockPhoto,
        takenAt: new Date(newDate),
      });

      await photoService.updatePhoto(mockUserId, mockPhotoId, {
        takenAt: newDate,
      });

      expect(mockPrisma.photo.update).toHaveBeenCalledWith({
        where: { id: mockPhotoId },
        data: expect.objectContaining({
          takenAt: new Date(newDate),
        }),
      });
    });

    it('should allow clearing caption by setting null', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.photo.update.mockResolvedValue({
        ...mockPhoto,
        caption: null,
      });

      await photoService.updatePhoto(mockUserId, mockPhotoId, {
        caption: null,
      });

      const updateCall = mockPrisma.photo.update.mock.calls[0][0];
      expect(updateCall.data.caption).toBeNull();
    });

    it('should reject update for non-owner', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({
        ...mockPhoto,
        trip: { ...mockTrip, userId: 999 }, // Different owner
      });
      // verifyEntityAccessWithPermission calls trip.findFirst — return null for non-owner
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(
        photoService.updatePhoto(mockUserId, mockPhotoId, { caption: 'New' })
      ).rejects.toThrow("We couldn't find that trip, or you don't have access to it.");
    });
  });

  // ============================================
  // PHOTO-009: Update photo coordinates
  // ============================================
  describe('PHOTO-009: updatePhoto - Update photo coordinates', () => {
    it('should update latitude and longitude', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.photo.update.mockResolvedValue({
        ...mockPhoto,
        latitude: 48.8566,
        longitude: 2.3522,
      });

      const result = await photoService.updatePhoto(mockUserId, mockPhotoId, {
        latitude: 48.8566,
        longitude: 2.3522,
      });

      expect(mockPrisma.photo.update).toHaveBeenCalledWith({
        where: { id: mockPhotoId },
        data: expect.objectContaining({
          latitude: 48.8566,
          longitude: 2.3522,
        }),
      });
      expect(result.latitude).toBe(48.8566);
      expect(result.longitude).toBe(2.3522);
    });

    it('should allow clearing coordinates by setting null', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.photo.update.mockResolvedValue({
        ...mockPhoto,
        latitude: null,
        longitude: null,
      });

      await photoService.updatePhoto(mockUserId, mockPhotoId, {
        latitude: null,
        longitude: null,
      });

      const updateCall = mockPrisma.photo.update.mock.calls[0][0];
      expect(updateCall.data.latitude).toBeNull();
      expect(updateCall.data.longitude).toBeNull();
    });
  });

  // ============================================
  // PHOTO-010: Delete photo removes file from disk
  // ============================================
  describe('PHOTO-010: deletePhoto - Removes file from disk', () => {
    it('should delete local photo file from disk', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.photo.delete.mockResolvedValue(mockPhoto);

      await photoService.deletePhoto(mockUserId, mockPhotoId);

      // Check that unlink was called with a path containing the photo filename
      // Use regex to handle both forward and back slashes (cross-platform)
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/uploads[/\\]photos[/\\]test-photo\.jpg/)
      );
    });

    it('should delete thumbnail file from disk', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.photo.delete.mockResolvedValue(mockPhoto);

      await photoService.deletePhoto(mockUserId, mockPhotoId);

      // Check that unlink was called with a path containing the thumbnail filename
      // Use regex to handle both forward and back slashes (cross-platform)
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringMatching(/uploads[/\\]thumbnails[/\\]thumb-test-photo\.jpg/)
      );
    });

    it('should continue deleting DB record even if file deletion fails', async () => {
      mockFs.unlink.mockRejectedValueOnce(new Error('File not found'));
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.photo.delete.mockResolvedValue(mockPhoto);

      const result = await photoService.deletePhoto(mockUserId, mockPhotoId);

      expect(result.success).toBe(true);
      expect(mockPrisma.photo.delete).toHaveBeenCalled();
    });

    it('should not attempt file deletion for Immich photos', async () => {
      const immichPhoto = {
        ...mockPhoto,
        source: 'immich',
        localPath: null,
        immichAssetId: 'abc123',
      };

      mockPrisma.photo.findUnique.mockResolvedValue(immichPhoto);
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.photo.delete.mockResolvedValue(immichPhoto);

      await photoService.deletePhoto(mockUserId, mockPhotoId);

      expect(mockFs.unlink).not.toHaveBeenCalled();
      expect(mockPrisma.photo.delete).toHaveBeenCalled();
    });
  });

  // ============================================
  // PHOTO-011: Delete photo removes from albums
  // ============================================
  describe('PHOTO-011: deletePhoto - Removes from albums', () => {
    it('should clean up entity links before deletion', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.photo.delete.mockResolvedValue(mockPhoto);

      await photoService.deletePhoto(mockUserId, mockPhotoId);

      expect(mockPrisma.entityLink.deleteMany).toHaveBeenCalledWith({
        where: {
          tripId: mockTripId,
          OR: [
            { sourceType: 'PHOTO', sourceId: mockPhotoId },
            { targetType: 'PHOTO', targetId: mockPhotoId },
          ],
        },
      });
    });

    it('should delete photo from database', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.photo.delete.mockResolvedValue(mockPhoto);

      await photoService.deletePhoto(mockUserId, mockPhotoId);

      expect(mockPrisma.photo.delete).toHaveBeenCalledWith({
        where: { id: mockPhotoId },
      });
    });

    it('PHOTO-011b: clears the cover tint of any trip using the photo as its cover', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.entityLink.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.photo.delete.mockResolvedValue(mockPhoto);

      await photoService.deletePhoto(mockUserId, mockPhotoId);

      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
        where: { coverPhotoId: mockPhotoId },
        data: { coverColor: null },
      });
    });
  });

  // ============================================
  // PHOTO-012: Import photo from Immich
  // ============================================
  describe('PHOTO-012: linkImmichPhoto - Import photo from Immich', () => {
    const mockImmichAssetId = 'immich-asset-123';

    beforeEach(() => {
      mockPrisma.userIntegrations.findUnique.mockResolvedValue({
        userId: mockUserId,
        immichApiUrl: 'https://immich.example.com',
        immichApiKey: 'test-api-key',
      });
    });

    it('should create photo record with Immich asset ID', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          fileCreatedAt: '2025-01-10T12:00:00Z',
          exifInfo: {
            latitude: 40.7128,
            longitude: -74.006,
          },
          type: 'IMAGE',
        },
      });

      const expectedPhoto = {
        id: 1,
        tripId: mockTripId,
        source: 'immich',
        mediaType: 'image',
        immichAssetId: mockImmichAssetId,
        thumbnailPath: `/api/immich/assets/${mockImmichAssetId}/thumbnail`,
      };

      mockPrisma.photo.create.mockResolvedValue(expectedPhoto);

      const result = await photoService.linkImmichPhoto(mockUserId, {
        tripId: mockTripId,
        immichAssetId: mockImmichAssetId,
      });

      expect(result.source).toBe('immich');
      expect(result.immichAssetId).toBe(mockImmichAssetId);

      expect(mockPrisma.photo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'immich',
          immichAssetId: mockImmichAssetId,
        }),
      });
    });

    it('should extract metadata from Immich API response', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          fileCreatedAt: '2025-01-10T12:00:00Z',
          exifInfo: {
            latitude: 48.8566,
            longitude: 2.3522,
          },
          type: 'IMAGE',
        },
      });

      mockPrisma.photo.create.mockResolvedValue({
        ...mockPhoto,
        source: 'immich',
      });

      await photoService.linkImmichPhoto(mockUserId, {
        tripId: mockTripId,
        immichAssetId: mockImmichAssetId,
      });

      expect(axios.get).toHaveBeenCalledWith(
        `https://immich.example.com/api/assets/${mockImmichAssetId}`,
        expect.objectContaining({
          headers: { 'x-api-key': 'test-api-key' },
        })
      );
    });

    it('should detect video type from Immich response', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          type: 'VIDEO',
          duration: '00:05:30.500',
        },
      });

      mockPrisma.photo.create.mockResolvedValue({
        ...mockPhoto,
        source: 'immich',
        mediaType: 'video',
        duration: 330,
      });

      await photoService.linkImmichPhoto(mockUserId, {
        tripId: mockTripId,
        immichAssetId: mockImmichAssetId,
      });

      expect(mockPrisma.photo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          mediaType: 'video',
          duration: 330,
        }),
      });
    });
  });

  // ============================================
  // PHOTO-013: Handle Immich connection failure
  // ============================================
  describe('PHOTO-013: linkImmichPhoto - Handle Immich connection failure', () => {
    it('should proceed with linking even if Immich API fails', async () => {
      mockPrisma.userIntegrations.findUnique.mockResolvedValue({
        userId: mockUserId,
        immichApiUrl: 'https://immich.example.com',
        immichApiKey: 'test-api-key',
      });

      (axios.get as jest.Mock).mockRejectedValue(new Error('Connection timeout'));

      mockPrisma.photo.create.mockResolvedValue({
        ...mockPhoto,
        source: 'immich',
        immichAssetId: 'abc123',
      });

      // Should not throw, just log the error
      const result = await photoService.linkImmichPhoto(mockUserId, {
        tripId: mockTripId,
        immichAssetId: 'abc123',
        caption: 'Fallback caption',
      });

      expect(result.source).toBe('immich');
      expect(mockPrisma.photo.create).toHaveBeenCalled();
    });

    it('should proceed without metadata if user has no Immich configured', async () => {
      mockPrisma.userIntegrations.findUnique.mockResolvedValue({
        userId: mockUserId,
        immichApiUrl: null,
        immichApiKey: null,
      });

      mockPrisma.photo.create.mockResolvedValue({
        ...mockPhoto,
        source: 'immich',
      });

      const result = await photoService.linkImmichPhoto(mockUserId, {
        tripId: mockTripId,
        immichAssetId: 'abc123',
      });

      expect(axios.get).not.toHaveBeenCalled();
      expect(result.source).toBe('immich');
    });
  });

  // ============================================
  // PHOTO-014: Bulk photo operations
  // ============================================
  describe('PHOTO-014: linkImmichPhotosBatch - Bulk photo operations', () => {
    const mockAssets = [
      { immichAssetId: 'asset-1', caption: 'Photo 1' },
      { immichAssetId: 'asset-2', caption: 'Photo 2' },
      { immichAssetId: 'asset-3', caption: 'Photo 3' },
    ];

    beforeEach(() => {
      mockPrisma.photo.findMany.mockResolvedValue([]);
    });

    it('should batch create multiple Immich photos', async () => {
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          photo: {
            createMany: jest.fn().mockResolvedValue({ count: 3 }),
            findMany: jest.fn().mockResolvedValue([
              { id: 1 },
              { id: 2 },
              { id: 3 },
            ]),
          },
        });
      });

      const result = await photoService.linkImmichPhotosBatch(mockUserId, {
        tripId: mockTripId,
        assets: mockAssets,
      });

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.photoIds).toHaveLength(3);
    });

    it('should skip already linked photos', async () => {
      // One photo already exists
      mockPrisma.photo.findMany.mockResolvedValue([
        { immichAssetId: 'asset-1' },
      ]);

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          photo: {
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
            findMany: jest.fn().mockResolvedValue([
              { id: 2 },
              { id: 3 },
            ]),
          },
        });
      });

      const result = await photoService.linkImmichPhotosBatch(mockUserId, {
        tripId: mockTripId,
        assets: mockAssets,
      });

      expect(result.total).toBe(2); // Only 2 new photos
      expect(result.successful).toBe(2);
    });

    it('should handle partial batch failures', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Database error'));

      const result = await photoService.linkImmichPhotosBatch(mockUserId, {
        tripId: mockTripId,
        assets: mockAssets,
      });

      expect(result.failed).toBe(3);
      expect(result.successful).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should return empty result when all photos already linked', async () => {
      mockPrisma.photo.findMany.mockResolvedValue([
        { immichAssetId: 'asset-1' },
        { immichAssetId: 'asset-2' },
        { immichAssetId: 'asset-3' },
      ]);

      const result = await photoService.linkImmichPhotosBatch(mockUserId, {
        tripId: mockTripId,
        assets: mockAssets,
      });

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.photoIds).toHaveLength(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should process large batches in chunks of 50', async () => {
      const manyAssets = Array.from({ length: 120 }, (_, i) => ({
        immichAssetId: `asset-${i}`,
      }));

      let transactionCallCount = 0;
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        transactionCallCount++;
        return callback({
          photo: {
            createMany: jest.fn().mockResolvedValue({ count: 50 }),
            findMany: jest.fn().mockResolvedValue(
              Array.from({ length: 50 }, (_, i) => ({ id: i }))
            ),
          },
        });
      });

      await photoService.linkImmichPhotosBatch(mockUserId, {
        tripId: mockTripId,
        assets: manyAssets,
      });

      // 120 assets / 50 per batch = 3 batches
      expect(transactionCallCount).toBe(3);
    });
  });

  // ============================================
  // Additional test cases for edge scenarios
  // ============================================
  describe('Edge cases', () => {
    it('should handle photo not found', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(null);

      await expect(
        photoService.getPhotoById(mockUserId, 99999)
      ).rejects.toThrow('Photo not found');
    });

    it('should handle video exceeding duration limit', async () => {
      mockFileTypeFromFile.mockResolvedValue({
        mime: 'video/mp4',
        ext: 'mp4',
      });

      mockFfprobe.mockImplementation((_path: string, callback: (err: null, metadata: { format: { duration: number } }) => void) => {
        callback(null, { format: { duration: 4000 } }); // Over 1 hour
      });

      const videoFile = {
        ...mockMulterFile,
        mimetype: 'video/mp4',
        originalname: 'long-video.mp4',
      };

      await expect(
        photoService.uploadPhoto(mockUserId, videoFile, { tripId: mockTripId })
      ).rejects.toThrow('Video duration exceeds maximum');
    });

    it('should get unsorted photos not in any album', async () => {
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue([
        { photoId: 1 },
        { photoId: 2 },
      ]);

      const unsortedPhotos = [
        { ...mockPhoto, id: 3 },
        { ...mockPhoto, id: 4 },
      ];

      mockPrisma.photo.findMany.mockResolvedValue(unsortedPhotos);
      mockPrisma.photo.count.mockResolvedValue(2);

      const result = await photoService.getUnsortedPhotosByTrip(
        mockUserId,
        mockTripId
      );

      expect(result.photos).toHaveLength(2);
      expect(mockPrisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: [1, 2] },
          }),
        })
      );
    });
  });
});
