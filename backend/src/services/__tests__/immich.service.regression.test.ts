/**
 * Immich Service Regression Tests
 *
 * These tests lock in the specific fixes made during the July 2026 Immich
 * debugging saga (commits 0397a4b, e04be1a, 697e1a0, 316e9c9 — "trying to
 * fix immich issues" / "think I fixed immich issue"). Each describe block
 * names the behavior that was broken and then fixed, so a future refactor
 * that reintroduces the bug fails with a clear message.
 *
 * What those commits fixed:
 * - 0397a4b: getAssetsByDateRange sent bare "YYYY-MM-DD" strings as
 *   takenAfter/takenBefore; Immich's metadata search rejects those with a
 *   400. Fixed by expanding to full ISO 8601 timestamps covering the whole
 *   day (end date inclusive).
 * - 697e1a0: the pagination `page` parameter was sent as a string (the raw
 *   `nextPage` cursor Immich returns); Immich validates `page` as a number
 *   and rejects string values. Fixed with Number(nextPage). Also added
 *   content-type fallbacks for the thumbnail/original stream proxies.
 * - 316e9c9: a malformed search response (missing `assets.items`) was
 *   silently treated as "no assets / no more pages", masking a broken or
 *   misconfigured Immich API. Fixed to fail fast with an AppError instead.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import axios from 'axios';

// Mock axios (same scaffolding as immich.service.test.ts)
jest.mock('axios');
const mockAxios = jest.mocked(axios);

// We only stub the methods immich.service.ts actually calls (get/post).
const mockClient = {
  get: jest.fn(),
  post: jest.fn(),
};

function resetMockAxiosCreate(): void {
  mockAxios.create.mockReturnValue(mockClient as unknown as ReturnType<typeof axios.create>);
}
resetMockAxiosCreate();

// Import the service (and AppError) after mocks
import immichService from '../immich.service';
import { AppError } from '../../errors/errors';

const TEST_API_URL = 'http://localhost:2283';
const TEST_API_KEY = 'test-immich-api-key';

class MockAxiosError extends Error {
  isAxiosError: true = true;
  code: string;
  response?: { status: number; data?: unknown };

  constructor(message: string, code: string, response?: { status: number; data?: unknown }) {
    super(message);
    this.code = code;
    this.response = response;
  }
}

/** A well-formed single page of search results. */
function assetsPage(
  items: Array<{ id: string }>,
  nextPage: string | null = null
): { data: { assets: { items: Array<{ id: string }>; nextPage: string | null } } } {
  return { data: { assets: { items, nextPage } } };
}

/** Await a rejection and assert it is an AppError with the expected status code. */
async function expectAppError(
  promise: Promise<unknown>,
  statusCode: number,
  messagePart: string
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  const appError = caught as AppError;
  expect(appError.statusCode).toBe(statusCode);
  expect(appError.message).toContain(messagePart);
}

describe('ImmichService regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockAxiosCreate();
  });

  // -------------------------------------------------------------------------
  // Commit 0397a4b: bare dates were rejected by Immich with a 400
  // -------------------------------------------------------------------------
  describe('date range expansion (regression: 0397a4b)', () => {
    it('expands bare YYYY-MM-DD dates to full ISO timestamps instead of sending them as-is', async () => {
      mockClient.post.mockResolvedValue(assetsPage([{ id: 'a1' }]));

      await immichService.getAssetsByDateRange(
        TEST_API_URL,
        TEST_API_KEY,
        '2024-07-01',
        '2024-07-10',
        { skip: 0, take: 50 }
      );

      const body = mockClient.post.mock.calls[0][1] as {
        takenAfter: string;
        takenBefore: string;
      };
      // Bare "2024-07-01" gets a 400 from Immich's metadata search.
      expect(body.takenAfter).toBe('2024-07-01T00:00:00.000Z');
      expect(body.takenBefore).toBe('2024-07-10T23:59:59.999Z');
    });

    it('makes the end date inclusive (takenBefore covers the entire final day)', async () => {
      mockClient.post.mockResolvedValue(assetsPage([]));

      await immichService.getAssetsByDateRange(
        TEST_API_URL,
        TEST_API_KEY,
        '2024-07-01',
        '2024-07-01',
        { skip: 0, take: 10 }
      );

      const body = mockClient.post.mock.calls[0][1] as {
        takenAfter: string;
        takenBefore: string;
      };
      // A single-day range must span the whole day, not a zero-length instant.
      expect(new Date(body.takenBefore).getTime()).toBeGreaterThan(
        new Date(body.takenAfter).getTime()
      );
      expect(body.takenBefore.startsWith('2024-07-01T23:59:59')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Commit 697e1a0: page cursor was sent as a string; Immich validates it
  // as a number and rejects string values
  // -------------------------------------------------------------------------
  describe('numeric page cursor (regression: 697e1a0)', () => {
    it('getAssets sends the page cursor as a number, not the raw string Immich returned', async () => {
      // Page 1: 100 assets consumed entirely by skip; cursor "2" (a string).
      mockClient.post
        .mockResolvedValueOnce(
          assetsPage(
            Array.from({ length: 100 }, (_, i) => ({ id: `skip-${i}` })),
            '2'
          )
        )
        .mockResolvedValueOnce(
          assetsPage([{ id: 'target-1' }, { id: 'target-2' }], null)
        );

      const result = await immichService.getAssets(TEST_API_URL, TEST_API_KEY, {
        skip: 100,
        take: 10,
      });

      expect(result.assets.map(a => a.id)).toEqual(['target-1', 'target-2']);
      expect(mockClient.post).toHaveBeenCalledTimes(2);
      const secondBody = mockClient.post.mock.calls[1][1] as { page?: unknown };
      expect(secondBody.page).toBe(2);
      expect(typeof secondBody.page).toBe('number');
    });

    it('getAssetsByDateRange (fetch-all) follows nextPage cursors with numeric page values', async () => {
      mockClient.post
        .mockResolvedValueOnce(assetsPage([{ id: 'p1-a' }], '2'))
        .mockResolvedValueOnce(assetsPage([{ id: 'p2-a' }], null));

      // No options => fetch-all mode (used by "Select All")
      const result = await immichService.getAssetsByDateRange(
        TEST_API_URL,
        TEST_API_KEY,
        '2024-07-01',
        '2024-07-10'
      );

      expect(result.assets.map(a => a.id)).toEqual(['p1-a', 'p2-a']);
      expect(result.hasMore).toBe(false);
      const secondBody = mockClient.post.mock.calls[1][1] as { page?: unknown };
      expect(secondBody.page).toBe(2);
      expect(typeof secondBody.page).toBe('number');
    });

    it('getAssets fill loop (take spanning multiple pages) also sends a numeric page', async () => {
      // skip=10 lands mid-page-1; the fill request for page 2 must use a number.
      mockClient.post
        .mockResolvedValueOnce(
          assetsPage(
            Array.from({ length: 12 }, (_, i) => ({ id: `p1-${i}` })),
            '2'
          )
        )
        .mockResolvedValueOnce(
          assetsPage(
            Array.from({ length: 12 }, (_, i) => ({ id: `p2-${i}` })),
            null
          )
        );

      const result = await immichService.getAssets(TEST_API_URL, TEST_API_KEY, {
        skip: 10,
        take: 8,
      });

      expect(result.assets).toHaveLength(8);
      const secondBody = mockClient.post.mock.calls[1][1] as { page?: unknown };
      expect(typeof secondBody.page).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // Commit 316e9c9: malformed responses were silently treated as empty
  // -------------------------------------------------------------------------
  describe('malformed response fail-fast (regression: 316e9c9)', () => {
    it('getAssets throws AppError 500 when the response is missing assets.items instead of returning []', async () => {
      // e.g. Immich returned an error object / HTML / unexpected shape
      mockClient.post.mockResolvedValue({ data: {} });

      await expectAppError(
        immichService.getAssets(TEST_API_URL, TEST_API_KEY),
        500,
        'Failed to fetch assets from Immich'
      );
    });

    it('searchAssets throws AppError 500 when the response is missing assets.items', async () => {
      mockClient.post.mockResolvedValue({ data: { assets: {} } });

      await expectAppError(
        immichService.searchAssets(TEST_API_URL, TEST_API_KEY, { city: 'Rome' }),
        500,
        'Failed to search assets in Immich'
      );
    });

    it('getAssetsByDateRange throws AppError 500 when the response is missing assets.items', async () => {
      mockClient.post.mockResolvedValue({ data: {} });

      await expectAppError(
        immichService.getAssetsByDateRange(
          TEST_API_URL,
          TEST_API_KEY,
          '2024-07-01',
          '2024-07-10',
          { skip: 0, take: 10 }
        ),
        500,
        'Failed to fetch assets by date range'
      );
    });

    it('an empty items array is NOT malformed: getAssets returns an empty result', async () => {
      mockClient.post.mockResolvedValue(assetsPage([], null));

      const result = await immichService.getAssets(TEST_API_URL, TEST_API_KEY);

      expect(result.assets).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('an empty items array is NOT malformed: searchAssets returns []', async () => {
      mockClient.post.mockResolvedValue(assetsPage([], null));

      const result = await immichService.searchAssets(TEST_API_URL, TEST_API_KEY, {
        city: 'Nowhere',
      });

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Commit 697e1a0: content-type fallbacks for the stream proxies
  // -------------------------------------------------------------------------
  describe('stream proxy content-type handling (regression: 697e1a0)', () => {
    it('thumbnail stream falls back to image/jpeg when Immich omits the content-type header', async () => {
      const mockStream = { pipe: jest.fn() };
      mockClient.get.mockResolvedValue({ data: mockStream, headers: {} });

      const result = await immichService.getAssetThumbnailStream(
        TEST_API_URL,
        TEST_API_KEY,
        'asset-1'
      );

      expect(result.stream).toBe(mockStream);
      expect(result.contentType).toBe('image/jpeg');
    });

    it('original stream falls back to application/octet-stream when the header is missing', async () => {
      const mockStream = { pipe: jest.fn() };
      mockClient.get.mockResolvedValue({ data: mockStream, headers: {} });

      const result = await immichService.getAssetOriginalStream(
        TEST_API_URL,
        TEST_API_KEY,
        'asset-1'
      );

      expect(result.stream).toBe(mockStream);
      expect(result.contentType).toBe('application/octet-stream');
    });

    it('original stream passes through the real content-type when present (e.g. video)', async () => {
      const mockStream = { pipe: jest.fn() };
      mockClient.get.mockResolvedValue({
        data: mockStream,
        headers: { 'content-type': 'video/mp4' },
      });

      const result = await immichService.getAssetOriginalStream(
        TEST_API_URL,
        TEST_API_KEY,
        'asset-1'
      );

      expect(result.contentType).toBe('video/mp4');
    });

    it('thumbnail stream requests size=preview (required Immich query parameter)', async () => {
      const mockStream = { pipe: jest.fn() };
      mockClient.get.mockResolvedValue({
        data: mockStream,
        headers: { 'content-type': 'image/webp' },
      });

      await immichService.getAssetThumbnailStream(TEST_API_URL, TEST_API_KEY, 'asset-1');

      expect(mockClient.get).toHaveBeenCalledWith(
        '/api/assets/asset-1/thumbnail',
        expect.objectContaining({
          params: { size: 'preview' },
          responseType: 'stream',
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Auth header / API key handling
  // -------------------------------------------------------------------------
  describe('auth header and URL construction', () => {
    it('sends the API key via the x-api-key header with JSON content type and a timeout', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { res: 'pong' } });

      await immichService.testConnection(TEST_API_URL, TEST_API_KEY);

      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: TEST_API_URL,
        headers: {
          'x-api-key': TEST_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
        maxRedirects: 0,
      });
    });

    it('trims whitespace from the configured API URL', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { res: 'pong' } });

      await immichService.testConnection(`  ${TEST_API_URL}  `, TEST_API_KEY);

      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: TEST_API_URL })
      );
    });

    it('uses the base server URL as-is; endpoint paths carry the /api prefix (no double /api)', async () => {
      mockClient.get.mockResolvedValue({ status: 200, data: { res: 'pong' } });

      await immichService.testConnection(TEST_API_URL, TEST_API_KEY);

      const createConfig = mockAxios.create.mock.calls[0][0] as { baseURL: string };
      expect(createConfig.baseURL.endsWith('/api')).toBe(false);
      expect(mockClient.get).toHaveBeenCalledWith('/api/server/ping');
    });

    it('generated proxy URLs never leak the API key or the Immich host to the frontend', () => {
      const thumbnailUrl = immichService.getAssetThumbnailUrl(
        TEST_API_URL,
        'asset-1',
        TEST_API_KEY
      );
      const fileUrl = immichService.getAssetFileUrl(TEST_API_URL, 'asset-1', TEST_API_KEY);

      for (const url of [thumbnailUrl, fileUrl]) {
        expect(url).not.toContain(TEST_API_KEY);
        expect(url).not.toContain('localhost:2283');
        expect(url.startsWith('/api/immich/assets/')).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Error paths: AppError status codes (messages are covered by the base
  // suite; these lock in the HTTP status codes the controller relies on)
  // -------------------------------------------------------------------------
  describe('error status codes', () => {
    it('testConnection: ECONNREFUSED maps to AppError 400', async () => {
      mockClient.get.mockRejectedValue(new MockAxiosError('refused', 'ECONNREFUSED'));

      await expectAppError(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY),
        400,
        'Cannot connect to Immich server'
      );
    });

    it('testConnection: ETIMEDOUT maps to AppError 408', async () => {
      mockClient.get.mockRejectedValue(new MockAxiosError('timeout', 'ETIMEDOUT'));

      await expectAppError(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY),
        408,
        'timed out'
      );
    });

    it('testConnection: upstream 401 maps to AppError 401 (invalid API key)', async () => {
      mockClient.get.mockRejectedValue(
        new MockAxiosError('unauthorized', 'ERR_BAD_REQUEST', { status: 401 })
      );

      await expectAppError(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY),
        401,
        'Invalid Immich API key'
      );
    });

    it('testConnection: upstream 403 also maps to AppError 401 (invalid API key)', async () => {
      mockClient.get.mockRejectedValue(
        new MockAxiosError('forbidden', 'ERR_BAD_REQUEST', { status: 403 })
      );

      await expectAppError(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY),
        401,
        'Invalid Immich API key'
      );
    });

    it('testConnection: upstream 404 maps to AppError 404 (wrong endpoint/URL)', async () => {
      mockClient.get.mockRejectedValue(
        new MockAxiosError('not found', 'ERR_BAD_REQUEST', { status: 404 })
      );

      await expectAppError(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY),
        404,
        'endpoint not found'
      );
    });

    it('testConnection: unknown errors map to AppError 400, not an unhandled crash', async () => {
      mockClient.get.mockRejectedValue(new Error('something exploded'));

      await expectAppError(
        immichService.testConnection(TEST_API_URL, TEST_API_KEY),
        400,
        'Failed to connect to Immich server'
      );
    });

    it('getAssetById failure maps to AppError 404', async () => {
      mockClient.get.mockRejectedValue(
        new MockAxiosError('not found', 'ERR_BAD_REQUEST', { status: 404 })
      );

      await expectAppError(
        immichService.getAssetById(TEST_API_URL, TEST_API_KEY, 'missing-asset'),
        404,
        'Failed to fetch asset from Immich'
      );
    });

    it('getAlbumById failure maps to AppError 404', async () => {
      mockClient.get.mockRejectedValue(new Error('boom'));

      await expectAppError(
        immichService.getAlbumById(TEST_API_URL, TEST_API_KEY, 'missing-album'),
        404,
        'Failed to fetch album from Immich'
      );
    });

    it('thumbnail stream failure maps to AppError 500', async () => {
      mockClient.get.mockRejectedValue(new MockAxiosError('boom', 'ERR_STREAM'));

      await expectAppError(
        immichService.getAssetThumbnailStream(TEST_API_URL, TEST_API_KEY, 'asset-1'),
        500,
        'Failed to fetch thumbnail from Immich'
      );
    });

    it('original stream failure maps to AppError 500', async () => {
      mockClient.get.mockRejectedValue(new MockAxiosError('boom', 'ERR_STREAM'));

      await expectAppError(
        immichService.getAssetOriginalStream(TEST_API_URL, TEST_API_KEY, 'asset-1'),
        500,
        'Failed to fetch original file from Immich'
      );
    });

    it('getAssets failure maps to AppError 500', async () => {
      mockClient.post.mockRejectedValue(new MockAxiosError('boom', 'ERR_INTERNAL'));

      await expectAppError(
        immichService.getAssets(TEST_API_URL, TEST_API_KEY),
        500,
        'Failed to fetch assets from Immich'
      );
    });

    it('getAssetsByDateRange failure maps to AppError 500', async () => {
      mockClient.post.mockRejectedValue(
        new MockAxiosError('bad request', 'ERR_BAD_REQUEST', {
          status: 400,
          data: { message: 'takenAfter must be a valid ISO 8601 date string' },
        })
      );

      await expectAppError(
        immichService.getAssetsByDateRange(
          TEST_API_URL,
          TEST_API_KEY,
          '2024-07-01',
          '2024-07-10'
        ),
        500,
        'Failed to fetch assets by date range'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Search / pagination parameter mapping
  // -------------------------------------------------------------------------
  describe('search and pagination parameter mapping', () => {
    it('maps take to the size request parameter', async () => {
      mockClient.post.mockResolvedValue(assetsPage([{ id: 'a1' }]));

      await immichService.getAssets(TEST_API_URL, TEST_API_KEY, { skip: 0, take: 25 });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/search/metadata',
        expect.objectContaining({ size: 25 })
      );
    });

    it('includes isFavorite/isArchived filters only when provided', async () => {
      mockClient.post.mockResolvedValue(assetsPage([{ id: 'a1' }]));

      await immichService.getAssets(TEST_API_URL, TEST_API_KEY, {
        skip: 0,
        take: 10,
        isFavorite: true,
        isArchived: false,
      });

      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/search/metadata',
        expect.objectContaining({ isFavorite: true, isArchived: false, size: 10 })
      );

      mockClient.post.mockClear();
      mockClient.post.mockResolvedValue(assetsPage([{ id: 'a1' }]));

      await immichService.getAssets(TEST_API_URL, TEST_API_KEY, { skip: 0, take: 10 });

      const body = mockClient.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body).not.toHaveProperty('isFavorite');
      expect(body).not.toHaveProperty('isArchived');
    });

    it('searchAssets forwards the metadata query verbatim', async () => {
      mockClient.post.mockResolvedValue(assetsPage([]));

      await immichService.searchAssets(TEST_API_URL, TEST_API_KEY, {
        city: 'Rome',
        country: 'Italy',
        state: 'Lazio',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/search/metadata', {
        city: 'Rome',
        country: 'Italy',
        state: 'Lazio',
      });
    });

    it('pagination safety limit caps skip traversal at 100 pages (no infinite loop)', async () => {
      // Every page reports one asset and always has a next page; an
      // unbounded loop here would spin forever against a huge skip value.
      mockClient.post.mockResolvedValue(assetsPage([{ id: 'x' }], '2'));

      const result = await immichService.getAssets(TEST_API_URL, TEST_API_KEY, {
        skip: 1_000_000,
        take: 10,
      });

      expect(mockClient.post).toHaveBeenCalledTimes(100);
      expect(result.assets).toEqual([]);
    });

    it('date range fetch-all mode uses a 1000-item page size', async () => {
      mockClient.post.mockResolvedValue(assetsPage([{ id: 'a1' }], null));

      await immichService.getAssetsByDateRange(
        TEST_API_URL,
        TEST_API_KEY,
        '2024-07-01',
        '2024-07-10'
      );

      expect(mockClient.post).toHaveBeenCalledWith(
        '/api/search/metadata',
        expect.objectContaining({ size: 1000 })
      );
    });
  });
});
