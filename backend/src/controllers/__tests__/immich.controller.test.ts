import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service and database before importing controller
jest.mock('../../services/immich.service', () => ({
  __esModule: true,
  default: {
    testConnection: jest.fn(),
    getAssets: jest.fn(),
    getAssetById: jest.fn(),
    searchAssets: jest.fn(),
    getAlbums: jest.fn(),
    getAlbumById: jest.fn(),
    getAssetsByDateRange: jest.fn(),
    getAssetThumbnailUrl: jest.fn(),
    getAssetFileUrl: jest.fn(),
    getAssetThumbnailStream: jest.fn(),
    getAssetOriginalStream: jest.fn(),
  },
}));

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import immichService from '../../services/immich.service';
import { immichController } from '../immich.controller';
import {
  createAuthenticatedControllerArgs,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

// Helper to mock user Immich settings
function mockUserImmichSettings(apiUrl = 'http://immich:2283', apiKey = 'test-key') {
  (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
    immichApiUrl: apiUrl,
    immichApiKey: apiKey,
  } as never);
}

describe('immich.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('testConnection', () => {
    it('should test connection and return success', async () => {
      (immichService.testConnection as jest.Mock).mockResolvedValue(true as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { apiUrl: 'http://immich:2283', apiKey: 'test-key' },
      });
      await immichController.testConnection(req as any, res as any, next);

      expect(immichService.testConnection).toHaveBeenCalledWith('http://immich:2283', 'test-key');
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          connected: true,
          message: 'Successfully connected to Immich instance',
        },
      });
    });

    it('should throw error when apiUrl or apiKey missing', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { apiUrl: 'http://immich:2283' },
      });
      await immichController.testConnection(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getAssets', () => {
    it('should return assets with thumbnail and file URLs', async () => {
      mockUserImmichSettings();
      const mockAssets = { assets: [{ id: 'asset-1' }], hasMore: false };
      (immichService.getAssets as jest.Mock).mockResolvedValue(mockAssets as never);
      (immichService.getAssetThumbnailUrl as jest.Mock).mockReturnValue('http://thumb/asset-1');
      (immichService.getAssetFileUrl as jest.Mock).mockReturnValue('http://file/asset-1');

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await immichController.getAssets(req as any, res as any, next);

      expect(immichService.getAssets).toHaveBeenCalledWith(
        'http://immich:2283',
        'test-key',
        undefined
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          assets: [
            {
              id: 'asset-1',
              thumbnailUrl: 'http://thumb/asset-1',
              fileUrl: 'http://file/asset-1',
            },
          ],
          hasMore: false,
        },
      });
    });

    it('should pass pagination options from query params', async () => {
      mockUserImmichSettings();
      const mockAssets = { assets: [], hasMore: false };
      (immichService.getAssets as jest.Mock).mockResolvedValue(mockAssets as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { skip: '10', take: '20' },
      });
      await immichController.getAssets(req as any, res as any, next);

      expect(immichService.getAssets).toHaveBeenCalledWith(
        'http://immich:2283',
        'test-key',
        expect.objectContaining({ skip: 10, take: 20 })
      );
    });
  });

  describe('getAssetById', () => {
    it('should return a single asset with URLs', async () => {
      mockUserImmichSettings();
      const mockAsset = { id: 'asset-1', originalFileName: 'photo.jpg' };
      (immichService.getAssetById as jest.Mock).mockResolvedValue(mockAsset as never);
      (immichService.getAssetThumbnailUrl as jest.Mock).mockReturnValue('http://thumb/asset-1');
      (immichService.getAssetFileUrl as jest.Mock).mockReturnValue('http://file/asset-1');

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { assetId: 'asset-1' },
      });
      await immichController.getAssetById(req as any, res as any, next);

      expect(immichService.getAssetById).toHaveBeenCalledWith(
        'http://immich:2283',
        'test-key',
        'asset-1'
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({
          id: 'asset-1',
          thumbnailUrl: 'http://thumb/asset-1',
          fileUrl: 'http://file/asset-1',
        }),
      });
    });
  });

  describe('searchAssets', () => {
    it('should search assets and return results with URLs', async () => {
      mockUserImmichSettings();
      const mockAssets = [{ id: 'asset-1' }];
      (immichService.searchAssets as jest.Mock).mockResolvedValue(mockAssets as never);
      (immichService.getAssetThumbnailUrl as jest.Mock).mockReturnValue('http://thumb/asset-1');
      (immichService.getAssetFileUrl as jest.Mock).mockReturnValue('http://file/asset-1');

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { query: 'vacation' },
      });
      await immichController.searchAssets(req as any, res as any, next);

      expect(immichService.searchAssets).toHaveBeenCalledWith(
        'http://immich:2283',
        'test-key',
        { query: 'vacation' }
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          assets: [expect.objectContaining({ id: 'asset-1', thumbnailUrl: 'http://thumb/asset-1' })],
        },
      });
    });
  });

  describe('getAlbums', () => {
    it('should return albums', async () => {
      mockUserImmichSettings();
      const mockAlbums = [{ id: 'album-1', albumName: 'Vacation' }];
      (immichService.getAlbums as jest.Mock).mockResolvedValue(mockAlbums as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await immichController.getAlbums(req as any, res as any, next);

      expect(immichService.getAlbums).toHaveBeenCalledWith(
        'http://immich:2283',
        'test-key',
        false
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: { albums: mockAlbums },
      });
    });

    it('should pass shared=true query param', async () => {
      mockUserImmichSettings();
      (immichService.getAlbums as jest.Mock).mockResolvedValue([] as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { shared: 'true' },
      });
      await immichController.getAlbums(req as any, res as any, next);

      expect(immichService.getAlbums).toHaveBeenCalledWith(
        'http://immich:2283',
        'test-key',
        true
      );
    });
  });

  describe('getAlbumById', () => {
    it('should return album with asset URLs', async () => {
      mockUserImmichSettings();
      const mockAlbum = { id: 'album-1', albumName: 'Trip', assets: [{ id: 'asset-1' }] };
      (immichService.getAlbumById as jest.Mock).mockResolvedValue(mockAlbum as never);
      (immichService.getAssetThumbnailUrl as jest.Mock).mockReturnValue('http://thumb/asset-1');
      (immichService.getAssetFileUrl as jest.Mock).mockReturnValue('http://file/asset-1');

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { albumId: 'album-1' },
      });
      await immichController.getAlbumById(req as any, res as any, next);

      expect(immichService.getAlbumById).toHaveBeenCalledWith(
        'http://immich:2283',
        'test-key',
        'album-1'
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({
          id: 'album-1',
          assets: [expect.objectContaining({ id: 'asset-1', thumbnailUrl: 'http://thumb/asset-1' })],
        }),
      });
    });
  });

  describe('getAssetsByDateRange', () => {
    it('should return assets within date range', async () => {
      mockUserImmichSettings();
      const mockResult = { assets: [{ id: 'asset-1' }], hasMore: false };
      (immichService.getAssetsByDateRange as jest.Mock).mockResolvedValue(mockResult as never);
      (immichService.getAssetThumbnailUrl as jest.Mock).mockReturnValue('http://thumb/asset-1');
      (immichService.getAssetFileUrl as jest.Mock).mockReturnValue('http://file/asset-1');

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { startDate: '2024-06-01', endDate: '2024-06-10' },
      });
      await immichController.getAssetsByDateRange(req as any, res as any, next);

      expect(immichService.getAssetsByDateRange).toHaveBeenCalledWith(
        'http://immich:2283',
        'test-key',
        '2024-06-01',
        '2024-06-10',
        undefined
      );
    });

    it('should throw error when dates are missing', async () => {
      mockUserImmichSettings();

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: {},
      });
      await immichController.getAssetsByDateRange(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getAssetUrls', () => {
    it('should return thumbnail and file URLs for an asset', async () => {
      mockUserImmichSettings();
      (immichService.getAssetThumbnailUrl as jest.Mock).mockReturnValue('http://thumb/asset-1');
      (immichService.getAssetFileUrl as jest.Mock).mockReturnValue('http://file/asset-1');

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { assetId: 'asset-1' },
      });
      await immichController.getAssetUrls(req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          assetId: 'asset-1',
          thumbnailUrl: 'http://thumb/asset-1',
          fileUrl: 'http://file/asset-1',
        },
      });
    });
  });
});
