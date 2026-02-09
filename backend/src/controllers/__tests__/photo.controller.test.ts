/**
 * Photo Controller Tests
 *
 * Tests that the photo controller correctly delegates to the photo service
 * and albumSuggestion service, and returns properly formatted responses.
 */

// Mock dependencies before imports
jest.mock('../../services/photo.service', () => ({
  __esModule: true,
  default: {
    uploadPhoto: jest.fn(),
    linkImmichPhoto: jest.fn(),
    linkImmichPhotosBatch: jest.fn(),
    getPhotosByTrip: jest.fn(),
    getImmichAssetIdsByTrip: jest.fn(),
    getUnsortedPhotosByTrip: jest.fn(),
    getPhotoById: jest.fn(),
    updatePhoto: jest.fn(),
    deletePhoto: jest.fn(),
    getPhotoDateGroupings: jest.fn(),
    getPhotosByDate: jest.fn(),
  },
}));

jest.mock('../../services/albumSuggestion.service', () => ({
  __esModule: true,
  default: {
    getAlbumSuggestions: jest.fn(),
    acceptSuggestion: jest.fn(),
  },
}));

import photoService from '../../services/photo.service';
import albumSuggestionService from '../../services/albumSuggestion.service';
import { photoController } from '../photo.controller';
import {
  createAuthenticatedControllerArgs,
  createMockControllerArgs,
  createMockPhotoFile,
} from '../../__tests__/helpers/requests';
import { createAuthenticatedUser } from '../../__tests__/helpers/auth';
import { testUsers } from '../../__tests__/fixtures/users';

/** Flush all pending promises for asyncHandler testing */
const flushPromises = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe('photoController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------
  // uploadPhoto
  // -------------------------------------------------------
  describe('uploadPhoto', () => {
    const mockPhoto = {
      id: 1,
      tripId: 1,
      source: 'local',
      localPath: '/uploads/photos/test.jpg',
      thumbnailPath: '/uploads/thumbnails/test.jpg',
      caption: 'Test photo',
    };

    it('should upload a photo and return 201', async () => {
      (photoService.uploadPhoto as jest.Mock).mockResolvedValue(mockPhoto);

      const { req, res, next } = createMockControllerArgs({
        user: createAuthenticatedUser(testUsers.user1),
        file: createMockPhotoFile(),
        body: { tripId: '1', caption: 'Test photo' },
      });

      photoController.uploadPhoto(req as any, res as any, next);
      await flushPromises();

      expect(photoService.uploadPhoto).toHaveBeenCalledWith(
        testUsers.user1.id,
        expect.anything(), // the multer file
        expect.objectContaining({ tripId: 1 })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({ id: 1, source: 'local' }),
      });
    });

    it('should pass error to next when no file is provided', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: '1' },
      });

      photoController.uploadPhoto(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('No file provided');
      expect(error.statusCode).toBe(400);
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Upload failed');
      (photoService.uploadPhoto as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createMockControllerArgs({
        user: createAuthenticatedUser(testUsers.user1),
        file: createMockPhotoFile(),
        body: { tripId: '1' },
      });

      photoController.uploadPhoto(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // linkImmichPhoto
  // -------------------------------------------------------
  describe('linkImmichPhoto', () => {
    const mockPhoto = {
      id: 2,
      tripId: 1,
      source: 'immich',
      immichAssetId: 'abc-123',
    };

    it('should link an Immich photo and return 201', async () => {
      (photoService.linkImmichPhoto as jest.Mock).mockResolvedValue(mockPhoto);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 1, immichAssetId: 'abc-123' },
      });

      photoController.linkImmichPhoto(req as any, res as any, next);
      await flushPromises();

      expect(photoService.linkImmichPhoto).toHaveBeenCalledWith(
        testUsers.user1.id,
        expect.objectContaining({ tripId: 1, immichAssetId: 'abc-123' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({
          id: 2,
          source: 'immich',
          immichAssetId: 'abc-123',
          // transformPhoto adds Immich URLs
          thumbnailPath: '/api/immich/assets/abc-123/thumbnail',
          localPath: '/api/immich/assets/abc-123/original',
        }),
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Immich link failed');
      (photoService.linkImmichPhoto as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 1, immichAssetId: 'abc-123' },
      });

      photoController.linkImmichPhoto(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // linkImmichPhotosBatch
  // -------------------------------------------------------
  describe('linkImmichPhotosBatch', () => {
    const mockResult = { successful: 2, failed: 0, photos: [] };

    it('should batch link Immich photos and return 201', async () => {
      (photoService.linkImmichPhotosBatch as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: {
          tripId: 1,
          assets: [
            { immichAssetId: 'asset-1' },
            { immichAssetId: 'asset-2' },
          ],
        },
      });

      photoController.linkImmichPhotosBatch(req as any, res as any, next);
      await flushPromises();

      expect(photoService.linkImmichPhotosBatch).toHaveBeenCalledWith(
        testUsers.user1.id,
        expect.objectContaining({ tripId: 1 })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
        message: 'Successfully linked 2 photos (0 failed)',
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Batch link failed');
      (photoService.linkImmichPhotosBatch as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: {
          tripId: 1,
          assets: [{ immichAssetId: 'asset-1' }],
        },
      });

      photoController.linkImmichPhotosBatch(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getPhotosByTrip
  // -------------------------------------------------------
  describe('getPhotosByTrip', () => {
    const mockResult = {
      photos: [
        { id: 1, tripId: 1, source: 'local', caption: 'Photo 1' },
        { id: 2, tripId: 1, source: 'local', caption: 'Photo 2' },
      ],
      total: 2,
      hasMore: false,
    };

    it('should return photos for a trip with default pagination', async () => {
      (photoService.getPhotosByTrip as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getPhotosByTrip(req as any, res as any, next);
      await flushPromises();

      expect(photoService.getPhotosByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ skip: 0, take: 20 })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          photos: expect.arrayContaining([
            expect.objectContaining({ id: 1, source: 'local' }),
          ]),
          total: 2,
          hasMore: false,
        },
      });
    });

    it('should pass pagination query params to service', async () => {
      (photoService.getPhotosByTrip as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        query: { skip: '10', take: '50' },
      });

      photoController.getPhotosByTrip(req as any, res as any, next);
      await flushPromises();

      expect(photoService.getPhotosByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ skip: 10, take: 50 })
      );
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (photoService.getPhotosByTrip as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getPhotosByTrip(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getImmichAssetIdsByTrip
  // -------------------------------------------------------
  describe('getImmichAssetIdsByTrip', () => {
    it('should return Immich asset IDs for a trip', async () => {
      const mockAssetIds = ['asset-1', 'asset-2', 'asset-3'];
      (photoService.getImmichAssetIdsByTrip as jest.Mock).mockResolvedValue(mockAssetIds);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getImmichAssetIdsByTrip(req as any, res as any, next);
      await flushPromises();

      expect(photoService.getImmichAssetIdsByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        1
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: { assetIds: mockAssetIds },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (photoService.getImmichAssetIdsByTrip as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getImmichAssetIdsByTrip(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getUnsortedPhotosByTrip
  // -------------------------------------------------------
  describe('getUnsortedPhotosByTrip', () => {
    const mockResult = {
      photos: [{ id: 3, tripId: 1, source: 'local', caption: 'Unsorted' }],
      total: 1,
      hasMore: false,
    };

    it('should return unsorted photos for a trip', async () => {
      (photoService.getUnsortedPhotosByTrip as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getUnsortedPhotosByTrip(req as any, res as any, next);
      await flushPromises();

      expect(photoService.getUnsortedPhotosByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ skip: 0, take: 20 })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          photos: expect.arrayContaining([
            expect.objectContaining({ id: 3 }),
          ]),
          total: 1,
          hasMore: false,
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (photoService.getUnsortedPhotosByTrip as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getUnsortedPhotosByTrip(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getPhotoById
  // -------------------------------------------------------
  describe('getPhotoById', () => {
    const mockPhoto = {
      id: 5,
      tripId: 1,
      source: 'local',
      caption: 'A beautiful sunset',
    };

    it('should return a photo by id', async () => {
      (photoService.getPhotoById as jest.Mock).mockResolvedValue(mockPhoto);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      photoController.getPhotoById(req as any, res as any, next);
      await flushPromises();

      expect(photoService.getPhotoById).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({ id: 5, source: 'local' }),
      });
    });

    it('should pass error to next when photo is not found', async () => {
      (photoService.getPhotoById as jest.Mock).mockResolvedValue(null);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '999' },
      });

      photoController.getPhotoById(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('Photo not found');
      expect(error.statusCode).toBe(404);
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (photoService.getPhotoById as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      photoController.getPhotoById(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // updatePhoto
  // -------------------------------------------------------
  describe('updatePhoto', () => {
    const mockUpdated = {
      id: 5,
      tripId: 1,
      source: 'local',
      caption: 'Updated caption',
    };

    it('should update a photo and return it', async () => {
      (photoService.updatePhoto as jest.Mock).mockResolvedValue(mockUpdated);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { caption: 'Updated caption' },
      });

      photoController.updatePhoto(req as any, res as any, next);
      await flushPromises();

      expect(photoService.updatePhoto).toHaveBeenCalledWith(
        testUsers.user1.id,
        5,
        expect.objectContaining({ caption: 'Updated caption' })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({ id: 5, caption: 'Updated caption' }),
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      (photoService.updatePhoto as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { caption: 'New caption' },
      });

      photoController.updatePhoto(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // deletePhoto
  // -------------------------------------------------------
  describe('deletePhoto', () => {
    it('should delete a photo and return 204', async () => {
      (photoService.deletePhoto as jest.Mock).mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      photoController.deletePhoto(req as any, res as any, next);
      await flushPromises();

      expect(photoService.deletePhoto).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      (photoService.deletePhoto as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      photoController.deletePhoto(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getPhotoDateGroupings
  // -------------------------------------------------------
  describe('getPhotoDateGroupings', () => {
    const mockGroupings = [
      { date: '2024-01-15', count: 10 },
      { date: '2024-01-16', count: 5 },
    ];

    it('should return photo date groupings for a trip', async () => {
      (photoService.getPhotoDateGroupings as jest.Mock).mockResolvedValue(mockGroupings);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        query: { timezone: 'America/New_York' },
      });

      photoController.getPhotoDateGroupings(req as any, res as any, next);
      await flushPromises();

      expect(photoService.getPhotoDateGroupings).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        'America/New_York'
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockGroupings,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (photoService.getPhotoDateGroupings as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getPhotoDateGroupings(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getPhotosByDate
  // -------------------------------------------------------
  describe('getPhotosByDate', () => {
    const mockResult = {
      photos: [{ id: 1, source: 'local', caption: 'Photo' }],
      date: '2024-01-15',
      count: 1,
    };

    it('should return photos for a specific date', async () => {
      (photoService.getPhotosByDate as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1', date: '2024-01-15' },
        query: { timezone: 'UTC' },
      });

      photoController.getPhotosByDate(req as any, res as any, next);
      await flushPromises();

      expect(photoService.getPhotosByDate).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        '2024-01-15',
        'UTC'
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          photos: expect.arrayContaining([
            expect.objectContaining({ id: 1 }),
          ]),
          date: '2024-01-15',
          count: 1,
        },
      });
    });

    it('should pass error to next for invalid date format', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1', date: 'not-a-date' },
      });

      photoController.getPhotosByDate(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('Invalid date format. Use YYYY-MM-DD');
      expect(error.statusCode).toBe(400);
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (photoService.getPhotosByDate as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1', date: '2024-01-15' },
      });

      photoController.getPhotosByDate(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getAlbumSuggestions
  // -------------------------------------------------------
  describe('getAlbumSuggestions', () => {
    const mockSuggestions = [
      { name: 'Day 1 Photos', photoIds: [1, 2, 3] },
    ];

    it('should return album suggestions for a trip', async () => {
      (albumSuggestionService.getAlbumSuggestions as jest.Mock).mockResolvedValue(
        mockSuggestions
      );

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getAlbumSuggestions(req as any, res as any, next);
      await flushPromises();

      expect(albumSuggestionService.getAlbumSuggestions).toHaveBeenCalledWith(
        testUsers.user1.id,
        1
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockSuggestions,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Suggestion error');
      (albumSuggestionService.getAlbumSuggestions as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoController.getAlbumSuggestions(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // acceptAlbumSuggestion
  // -------------------------------------------------------
  describe('acceptAlbumSuggestion', () => {
    const mockResult = { id: 10, name: 'Day 1 Photos', tripId: 1 };

    it('should accept an album suggestion and return 201', async () => {
      (albumSuggestionService.acceptSuggestion as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        body: { name: 'Day 1 Photos', photoIds: [1, 2, 3] },
      });

      photoController.acceptAlbumSuggestion(req as any, res as any, next);
      await flushPromises();

      expect(albumSuggestionService.acceptSuggestion).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        { name: 'Day 1 Photos', photoIds: [1, 2, 3] }
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should pass error to next for invalid suggestion data', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        body: { name: '', photoIds: [] }, // invalid: name too short, photoIds empty
      });

      photoController.acceptAlbumSuggestion(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      const error = (next as jest.Mock).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Accept failed');
      (albumSuggestionService.acceptSuggestion as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        body: { name: 'Day 1 Photos', photoIds: [1, 2, 3] },
      });

      photoController.acceptAlbumSuggestion(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
