/**
 * Immich Service Tests
 *
 * Test cases:
 * - IMM-001: testConnection returns true on successful ping
 * - IMM-002: testConnection throws on ECONNREFUSED
 * - IMM-003: testConnection throws on ENOTFOUND
 * - IMM-004: testConnection throws on ETIMEDOUT
 * - IMM-005: testConnection throws on SSL certificate error
 * - IMM-006: testConnection throws on 401/403 (invalid API key)
 * - IMM-007: testConnection throws on 404 (wrong endpoint)
 * - IMM-008: getAssets returns paginated assets
 * - IMM-009: getAssets handles skip/take pagination
 * - IMM-010: getAssets throws on error
 * - IMM-011: getAssetById returns a single asset
 * - IMM-012: getAssetById throws 404 on missing asset
 * - IMM-013: getAssetThumbnailUrl returns proxy URL
 * - IMM-014: getAssetFileUrl returns proxy URL
 * - IMM-015: searchAssets posts search query and returns results
 * - IMM-016: getAlbums returns album list
 * - IMM-017: getAlbums passes shared parameter
 * - IMM-018: getAlbumById returns album with assets
 * - IMM-019: getAssetsByDateRange returns paginated results
 * - IMM-020: getAssetThumbnailStream returns stream and content type
 * - IMM-021: getAssetOriginalStream returns stream and content type
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// We need to mock axios.create to return our mock client
const mockClient = {
  get: jest.fn(),
  post: jest.fn(),
};

mockAxios.create.mockReturnValue(mockClient as unknown as ReturnType<typeof axios.create>);

// Import the service after mocks
import immichService from '../immich.service';

const TEST_API_URL = 'http://localhost:2283';
const TEST_API_KEY = 'test-immich-api-key';

describe('ImmichService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup the mock client
    mockAxios.create.mockReturnValue(mockClient as unknown as ReturnType<typeof axios.create>);
  });

  describe('testConnection', () => {
    it('IMM-001: returns true on successful ping', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { res: 'pong' } });

      const result = await immichService.testConnection(TEST_API_URL, TEST_API_KEY);

      expect(result).toBe(true);
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: TEST_API_URL,
          headers: expect.objectContaining({
            'x-api-key': TEST_API_KEY,
          }),
        })
      );
      expect(mockClient.get).toHaveBeenCalledWith('/api/server/ping');
    });

    it('IMM-002: throws on ECONNREFUSED', async () => {
      const error = new Error('Connection refused') as Error & {
        isAxiosError: boolean;
        code: string;
        response?: { status: number };
      };
      error.isAxiosError = true;
      error.code = 'ECONNREFUSED';
      mockClient.get.mockRejectedValue(error);

      await expect(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY)
      ).rejects.toThrow('Cannot connect to Immich server');
    });

    it('IMM-003: throws on ENOTFOUND', async () => {
      const error = new Error('DNS lookup failed') as Error & {
        isAxiosError: boolean;
        code: string;
        response?: { status: number };
      };
      error.isAxiosError = true;
      error.code = 'ENOTFOUND';
      mockClient.get.mockRejectedValue(error);

      await expect(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY)
      ).rejects.toThrow('Cannot connect to Immich server');
    });

    it('IMM-004: throws on ETIMEDOUT', async () => {
      const error = new Error('Connection timed out') as Error & {
        isAxiosError: boolean;
        code: string;
        response?: { status: number };
      };
      error.isAxiosError = true;
      error.code = 'ETIMEDOUT';
      mockClient.get.mockRejectedValue(error);

      await expect(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY)
      ).rejects.toThrow('Connection to Immich server timed out');
    });

    it('IMM-005: throws on SSL certificate error', async () => {
      const error = new Error('Self signed certificate') as Error & {
        isAxiosError: boolean;
        code: string;
        response?: { status: number };
      };
      error.isAxiosError = true;
      error.code = 'DEPTH_ZERO_SELF_SIGNED_CERT';
      mockClient.get.mockRejectedValue(error);

      await expect(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY)
      ).rejects.toThrow('SSL certificate error');
    });

    it('IMM-006: throws on 401/403 (invalid API key)', async () => {
      const error = new Error('Unauthorized') as Error & {
        isAxiosError: boolean;
        code: string;
        response: { status: number };
      };
      error.isAxiosError = true;
      error.code = 'ERR_BAD_REQUEST';
      error.response = { status: 401 };
      mockClient.get.mockRejectedValue(error);

      await expect(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY)
      ).rejects.toThrow('Invalid Immich API key');
    });

    it('IMM-007: throws on 404 (wrong endpoint)', async () => {
      const error = new Error('Not found') as Error & {
        isAxiosError: boolean;
        code: string;
        response: { status: number };
      };
      error.isAxiosError = true;
      error.code = 'ERR_BAD_REQUEST';
      error.response = { status: 404 };
      mockClient.get.mockRejectedValue(error);

      await expect(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY)
      ).rejects.toThrow('Immich API endpoint not found');
    });
  });

  describe('getAssets', () => {
    it('IMM-008: returns paginated assets with default options', async () => {
      const mockAssets = [
        { id: 'asset-1', type: 'IMAGE', originalPath: '/photo1.jpg' },
        { id: 'asset-2', type: 'IMAGE', originalPath: '/photo2.jpg' },
      ];

      mockClient.post.mockResolvedValue({
        data: {
          assets: {
            items: mockAssets,
            nextPage: 'page-token-2',
          },
        },
      });

      const result = await immichService.getAssets(TEST_API_URL, TEST_API_KEY);

      expect(result.assets).toEqual(mockAssets);
      expect(result.hasMore).toBe(true);
      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/search/metadata',
        expect.objectContaining({ size: 100 })
      );
    });

    it('IMM-009: handles skip/take pagination', async () => {
      // First page - to skip
      mockClient.post
        .mockResolvedValueOnce({
          data: {
            assets: {
              items: Array(50).fill({ id: 'skip-asset' }),
              nextPage: 'page-2',
            },
          },
        })
        // Second page - actual data
        .mockResolvedValueOnce({
          data: {
            assets: {
              items: [{ id: 'target-asset-1' }, { id: 'target-asset-2' }],
              nextPage: null,
            },
          },
        });

      const result = await immichService.getAssets(TEST_API_URL, TEST_API_KEY, {
        skip: 50,
        take: 10,
      });

      expect(result.assets).toBeDefined();
      expect(mockClient.post).toHaveBeenCalledTimes(2);
    });

    it('IMM-010: throws on error fetching assets', async () => {
      const error = new Error('Server error') as Error & {
        isAxiosError: boolean;
        code: string;
      };
      error.isAxiosError = true;
      error.code = 'ERR_INTERNAL';
      mockClient.post.mockRejectedValue(error);

      await expect(
        immichService.getAssets(TEST_API_URL, TEST_API_KEY)
      ).rejects.toThrow('Failed to fetch assets from Immich');
    });

    it('IMM-011: returns empty when no assets available during skip', async () => {
      mockClient.post.mockResolvedValue({
        data: {
          assets: {
            items: [],
            nextPage: null,
          },
        },
      });

      const result = await immichService.getAssets(TEST_API_URL, TEST_API_KEY, {
        skip: 100,
        take: 20,
      });

      expect(result.assets).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getAssetById', () => {
    it('IMM-012: returns a single asset by ID', async () => {
      const mockAsset = {
        id: 'asset-uuid-123',
        type: 'IMAGE',
        originalPath: '/photo.jpg',
        exifInfo: { latitude: 40.7580, longitude: -73.9855 },
      };

      mockClient.get.mockResolvedValue({ data: mockAsset });

      const result = await immichService.getAssetById(
        TEST_API_URL,
        TEST_API_KEY,
        'asset-uuid-123'
      );

      expect(result).toEqual(mockAsset);
      expect(mockClient.get).toHaveBeenCalledWith('/api/assets/asset-uuid-123');
    });

    it('IMM-013: throws 404 when asset not found', async () => {
      mockClient.get.mockRejectedValue(new Error('Not found'));

      await expect(
        immichService.getAssetById(TEST_API_URL, TEST_API_KEY, 'nonexistent')
      ).rejects.toThrow('Failed to fetch asset from Immich');
    });
  });

  describe('URL generation', () => {
    it('IMM-014: getAssetThumbnailUrl returns proxy URL', () => {
      const url = immichService.getAssetThumbnailUrl(
        TEST_API_URL,
        'asset-uuid-123',
        TEST_API_KEY
      );

      expect(url).toBe('/api/immich/assets/asset-uuid-123/thumbnail');
    });

    it('IMM-015: getAssetFileUrl returns proxy URL', () => {
      const url = immichService.getAssetFileUrl(
        TEST_API_URL,
        'asset-uuid-123',
        TEST_API_KEY
      );

      expect(url).toBe('/api/immich/assets/asset-uuid-123/original');
    });
  });

  describe('searchAssets', () => {
    it('IMM-016: posts search query and returns results', async () => {
      const mockAssets = [
        { id: 'asset-1', type: 'IMAGE', originalPath: '/photo1.jpg' },
      ];

      mockClient.post.mockResolvedValue({
        data: {
          assets: {
            items: mockAssets,
          },
        },
      });

      const result = await immichService.searchAssets(
        TEST_API_URL,
        TEST_API_KEY,
        { city: 'Rome', country: 'Italy' }
      );

      expect(result).toEqual(mockAssets);
      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/search/metadata',
        expect.objectContaining({ city: 'Rome', country: 'Italy' })
      );
    });

    it('IMM-017: throws on search error', async () => {
      mockClient.post.mockRejectedValue(new Error('Search failed'));

      await expect(
        immichService.searchAssets(TEST_API_URL, TEST_API_KEY, { city: 'Rome' })
      ).rejects.toThrow('Failed to search assets in Immich');
    });
  });

  describe('getAlbums', () => {
    it('IMM-018: returns album list', async () => {
      const mockAlbums = [
        { id: 'album-1', albumName: 'Vacation', assetCount: 5 },
        { id: 'album-2', albumName: 'Work Trip', assetCount: 3 },
      ];

      mockClient.get.mockResolvedValue({ data: mockAlbums });

      const result = await immichService.getAlbums(TEST_API_URL, TEST_API_KEY);

      expect(result).toEqual(mockAlbums);
      expect(mockClient.get).toHaveBeenCalledWith('/api/albums', { params: {} });
    });

    it('IMM-019: passes shared parameter', async () => {
      mockClient.get.mockResolvedValue({ data: [] });

      await immichService.getAlbums(TEST_API_URL, TEST_API_KEY, true);

      expect(mockClient.get).toHaveBeenCalledWith('/api/albums', {
        params: { shared: true },
      });
    });

    it('IMM-020: throws on error fetching albums', async () => {
      mockClient.get.mockRejectedValue(new Error('Albums fetch failed'));

      await expect(
        immichService.getAlbums(TEST_API_URL, TEST_API_KEY)
      ).rejects.toThrow('Failed to fetch albums from Immich');
    });
  });

  describe('getAlbumById', () => {
    it('IMM-021: returns album with assets', async () => {
      const mockAlbum = {
        id: 'album-1',
        albumName: 'Italy Trip',
        assets: [{ id: 'asset-1' }],
        assetCount: 1,
      };

      mockClient.get.mockResolvedValue({ data: mockAlbum });

      const result = await immichService.getAlbumById(
        TEST_API_URL,
        TEST_API_KEY,
        'album-1'
      );

      expect(result).toEqual(mockAlbum);
      expect(mockClient.get).toHaveBeenCalledWith('/api/albums/album-1');
    });

    it('IMM-022: throws 404 when album not found', async () => {
      mockClient.get.mockRejectedValue(new Error('Album not found'));

      await expect(
        immichService.getAlbumById(TEST_API_URL, TEST_API_KEY, 'nonexistent')
      ).rejects.toThrow('Failed to fetch album from Immich');
    });
  });

  describe('getAssetsByDateRange', () => {
    it('IMM-023: returns paginated assets within date range', async () => {
      const mockAssets = [
        { id: 'asset-1', fileCreatedAt: '2024-07-05T10:30:00.000Z' },
      ];

      mockClient.post.mockResolvedValue({
        data: {
          assets: {
            items: mockAssets,
            nextPage: null,
          },
        },
      });

      const result = await immichService.getAssetsByDateRange(
        TEST_API_URL,
        TEST_API_KEY,
        '2024-07-01',
        '2024-07-10'
      );

      expect(result.assets).toEqual(mockAssets);
      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/search/metadata',
        expect.objectContaining({
          takenAfter: '2024-07-01',
          takenBefore: '2024-07-10',
          size: 100,
        })
      );
    });

    it('IMM-024: throws on error fetching assets by date range', async () => {
      const error = new Error('Server error') as Error & {
        isAxiosError: boolean;
        code: string;
      };
      error.isAxiosError = true;
      error.code = 'ERR_INTERNAL';
      mockClient.post.mockRejectedValue(error);

      await expect(
        immichService.getAssetsByDateRange(
          TEST_API_URL,
          TEST_API_KEY,
          '2024-07-01',
          '2024-07-10'
        )
      ).rejects.toThrow('Failed to fetch assets by date range');
    });
  });

  describe('stream methods', () => {
    it('IMM-025: getAssetThumbnailStream returns stream and content type', async () => {
      const mockStream = { pipe: jest.fn() };
      mockClient.get.mockResolvedValue({
        data: mockStream,
        headers: { 'content-type': 'image/webp' },
      });

      const result = await immichService.getAssetThumbnailStream(
        TEST_API_URL,
        TEST_API_KEY,
        'asset-uuid-123'
      );

      expect(result.stream).toBe(mockStream);
      expect(result.contentType).toBe('image/webp');
      expect(mockClient.get).toHaveBeenCalledWith(
        '/api/assets/asset-uuid-123/thumbnail',
        expect.objectContaining({
          params: { size: 'preview' },
          responseType: 'stream',
        })
      );
    });

    it('IMM-026: getAssetOriginalStream returns stream and content type', async () => {
      const mockStream = { pipe: jest.fn() };
      mockClient.get.mockResolvedValue({
        data: mockStream,
        headers: { 'content-type': 'image/jpeg' },
      });

      const result = await immichService.getAssetOriginalStream(
        TEST_API_URL,
        TEST_API_KEY,
        'asset-uuid-123'
      );

      expect(result.stream).toBe(mockStream);
      expect(result.contentType).toBe('image/jpeg');
      expect(mockClient.get).toHaveBeenCalledWith(
        '/api/assets/asset-uuid-123/original',
        expect.objectContaining({
          responseType: 'stream',
        })
      );
    });

    it('IMM-027: getAssetThumbnailStream throws on error', async () => {
      const error = new Error('Stream error') as Error & {
        isAxiosError: boolean;
        code: string;
      };
      error.isAxiosError = true;
      error.code = 'ERR_STREAM';
      mockClient.get.mockRejectedValue(error);

      await expect(
        immichService.getAssetThumbnailStream(TEST_API_URL, TEST_API_KEY, 'asset-1')
      ).rejects.toThrow('Failed to fetch thumbnail from Immich');
    });
  });
});
