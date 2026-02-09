/**
 * PhotoAlbum Controller Tests
 *
 * Tests that the photoAlbum controller correctly delegates to the photoAlbum service
 * and returns properly formatted responses.
 */

// Mock dependencies before imports
jest.mock('../../services/photoAlbum.service', () => ({
  __esModule: true,
  default: {
    getAllAlbums: jest.fn(),
    createAlbum: jest.fn(),
    getAlbumsByTrip: jest.fn(),
    getAlbumById: jest.fn(),
    updateAlbum: jest.fn(),
    deleteAlbum: jest.fn(),
    addPhotosToAlbum: jest.fn(),
    removePhotoFromAlbum: jest.fn(),
  },
}));

import photoAlbumService from '../../services/photoAlbum.service';
import { photoAlbumController } from '../photoAlbum.controller';
import { createAuthenticatedControllerArgs } from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

/** Flush all pending promises for asyncHandler testing */
const flushPromises = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe('photoAlbumController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------
  // getAllAlbums
  // -------------------------------------------------------
  describe('getAllAlbums', () => {
    const mockResult = {
      albums: [
        { id: 1, tripId: 1, name: 'Vacation Photos', coverPhoto: null },
        { id: 2, tripId: 2, name: 'City Tour', coverPhoto: null },
      ],
      total: 2,
    };

    it('should return all albums for the user', async () => {
      (photoAlbumService.getAllAlbums as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      photoAlbumController.getAllAlbums(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.getAllAlbums).toHaveBeenCalledWith(
        testUsers.user1.id,
        expect.objectContaining({
          skip: undefined,
          take: undefined,
          tagIds: undefined,
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({
          albums: expect.arrayContaining([
            expect.objectContaining({ id: 1, name: 'Vacation Photos' }),
          ]),
          total: 2,
        }),
      });
    });

    it('should pass pagination and tagIds query params', async () => {
      (photoAlbumService.getAllAlbums as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { skip: '10', take: '20', tagIds: '1,2,3' },
      });

      photoAlbumController.getAllAlbums(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.getAllAlbums).toHaveBeenCalledWith(
        testUsers.user1.id,
        expect.objectContaining({
          skip: 10,
          take: 20,
          tagIds: [1, 2, 3],
        })
      );
    });

    it('should transform cover photos for Immich compatibility', async () => {
      const resultWithCover = {
        albums: [
          {
            id: 1,
            tripId: 1,
            name: 'Immich Album',
            coverPhoto: {
              id: 10,
              source: 'immich',
              immichAssetId: 'cover-asset',
            },
          },
        ],
        total: 1,
      };
      (photoAlbumService.getAllAlbums as jest.Mock).mockResolvedValue(resultWithCover);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      photoAlbumController.getAllAlbums(req as any, res as any, next);
      await flushPromises();

      const responseData = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(responseData.albums[0].coverPhoto).toEqual(
        expect.objectContaining({
          thumbnailPath: '/api/immich/assets/cover-asset/thumbnail',
          localPath: '/api/immich/assets/cover-asset/original',
        })
      );
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (photoAlbumService.getAllAlbums as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      photoAlbumController.getAllAlbums(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // createAlbum
  // -------------------------------------------------------
  describe('createAlbum', () => {
    const mockAlbum = { id: 5, tripId: 1, name: 'New Album', description: null };

    it('should create an album and return 201', async () => {
      (photoAlbumService.createAlbum as jest.Mock).mockResolvedValue(mockAlbum);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 1, name: 'New Album' },
      });

      photoAlbumController.createAlbum(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.createAlbum).toHaveBeenCalledWith(
        testUsers.user1.id,
        expect.objectContaining({ tripId: 1, name: 'New Album' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockAlbum,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Album creation failed');
      (photoAlbumService.createAlbum as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 1, name: 'New Album' },
      });

      photoAlbumController.createAlbum(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getAlbumsByTrip
  // -------------------------------------------------------
  describe('getAlbumsByTrip', () => {
    const mockResult = {
      albums: [
        { id: 1, tripId: 1, name: 'Day 1', coverPhoto: null },
      ],
      total: 1,
    };

    it('should return albums for a trip', async () => {
      (photoAlbumService.getAlbumsByTrip as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoAlbumController.getAlbumsByTrip(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.getAlbumsByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ skip: undefined, take: undefined })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({
          albums: expect.arrayContaining([
            expect.objectContaining({ id: 1, name: 'Day 1' }),
          ]),
          total: 1,
        }),
      });
    });

    it('should pass pagination query params', async () => {
      (photoAlbumService.getAlbumsByTrip as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
        query: { skip: '0', take: '10' },
      });

      photoAlbumController.getAlbumsByTrip(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.getAlbumsByTrip).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ skip: 0, take: 10 })
      );
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Service error');
      (photoAlbumService.getAlbumsByTrip as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '1' },
      });

      photoAlbumController.getAlbumsByTrip(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // getAlbumById
  // -------------------------------------------------------
  describe('getAlbumById', () => {
    it('should return an album by id with transformed photos', async () => {
      const mockAlbum = {
        id: 1,
        tripId: 1,
        name: 'Test Album',
        photoAssignments: [
          {
            photo: { id: 10, source: 'local', caption: 'Photo A' },
            createdAt: new Date('2024-01-15T10:00:00Z'),
          },
          {
            photo: { id: 11, source: 'local', caption: 'Photo B' },
            createdAt: new Date('2024-01-15T11:00:00Z'),
          },
        ],
        total: 2,
        hasMore: false,
      };
      (photoAlbumService.getAlbumById as jest.Mock).mockResolvedValue(mockAlbum);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      photoAlbumController.getAlbumById(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.getAlbumById).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({
          skip: undefined,
          take: undefined,
          sortBy: undefined,
          sortOrder: undefined,
        })
      );

      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.status).toBe('success');
      // photoAssignments should be transformed to photos array
      expect(responseData.data.photos).toHaveLength(2);
      expect(responseData.data.photos[0]).toEqual(
        expect.objectContaining({
          photo: expect.objectContaining({ id: 10 }),
          addedAt: new Date('2024-01-15T10:00:00Z'),
        })
      );
      // photoAssignments should be removed from the response
      expect(responseData.data.photoAssignments).toBeUndefined();
    });

    it('should pass sorting and pagination query params', async () => {
      const mockAlbum = {
        id: 1,
        tripId: 1,
        name: 'Test Album',
        photoAssignments: [],
        total: 0,
        hasMore: false,
      };
      (photoAlbumService.getAlbumById as jest.Mock).mockResolvedValue(mockAlbum);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        query: { skip: '10', take: '20', sortBy: 'date', sortOrder: 'desc' },
      });

      photoAlbumController.getAlbumById(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.getAlbumById).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({
          skip: 10,
          take: 20,
          sortBy: 'date',
          sortOrder: 'desc',
        })
      );
    });

    it('should handle album with no photoAssignments', async () => {
      const mockAlbum = {
        id: 1,
        tripId: 1,
        name: 'Empty Album',
        photoAssignments: undefined,
      };
      (photoAlbumService.getAlbumById as jest.Mock).mockResolvedValue(mockAlbum);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      photoAlbumController.getAlbumById(req as any, res as any, next);
      await flushPromises();

      const responseData = (res.json as jest.Mock).mock.calls[0][0];
      expect(responseData.data.photos).toEqual([]);
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Album not found');
      (photoAlbumService.getAlbumById as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '999' },
      });

      photoAlbumController.getAlbumById(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // updateAlbum
  // -------------------------------------------------------
  describe('updateAlbum', () => {
    const mockUpdated = { id: 1, tripId: 1, name: 'Renamed Album' };

    it('should update an album and return it', async () => {
      (photoAlbumService.updateAlbum as jest.Mock).mockResolvedValue(mockUpdated);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { name: 'Renamed Album' },
      });

      photoAlbumController.updateAlbum(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.updateAlbum).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ name: 'Renamed Album' })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockUpdated,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      (photoAlbumService.updateAlbum as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { name: 'Test' },
      });

      photoAlbumController.updateAlbum(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // deleteAlbum
  // -------------------------------------------------------
  describe('deleteAlbum', () => {
    it('should delete an album and return 204', async () => {
      (photoAlbumService.deleteAlbum as jest.Mock).mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      photoAlbumController.deleteAlbum(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.deleteAlbum).toHaveBeenCalledWith(testUsers.user1.id, 1);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      (photoAlbumService.deleteAlbum as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });

      photoAlbumController.deleteAlbum(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // addPhotosToAlbum
  // -------------------------------------------------------
  describe('addPhotosToAlbum', () => {
    const mockResult = { addedCount: 3 };

    it('should add photos to an album and return result', async () => {
      (photoAlbumService.addPhotosToAlbum as jest.Mock).mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { photoIds: [10, 11, 12] },
      });

      photoAlbumController.addPhotosToAlbum(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.addPhotosToAlbum).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        expect.objectContaining({ photoIds: [10, 11, 12] })
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Add photos failed');
      (photoAlbumService.addPhotosToAlbum as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { photoIds: [10] },
      });

      photoAlbumController.addPhotosToAlbum(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // -------------------------------------------------------
  // removePhotoFromAlbum
  // -------------------------------------------------------
  describe('removePhotoFromAlbum', () => {
    it('should remove a photo from an album and return 204', async () => {
      (photoAlbumService.removePhotoFromAlbum as jest.Mock).mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1', photoId: '10' },
      });

      photoAlbumController.removePhotoFromAlbum(req as any, res as any, next);
      await flushPromises();

      expect(photoAlbumService.removePhotoFromAlbum).toHaveBeenCalledWith(
        testUsers.user1.id,
        1,
        10
      );
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Remove photo failed');
      (photoAlbumService.removePhotoFromAlbum as jest.Mock).mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1', photoId: '10' },
      });

      photoAlbumController.removePhotoFromAlbum(req as any, res as any, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
