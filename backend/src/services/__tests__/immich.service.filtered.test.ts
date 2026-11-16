/**
 * Immich Service: filtered search, album detail, album write calls
 *
 * The HTTP layer is mocked (same scaffolding as immich.service.test.ts); nothing
 * here was run against a live Immich instance.
 *
 * Test cases:
 * - IMF-001: searchAssetsPage sends the filters Immich understands and the page number
 * - IMF-002: favourites-off is never sent as isFavorite=false
 * - IMF-003: searchAssetsPage validates the response shape
 * - IMF-004: nextPage is read as a number, and a non-advancing cursor ends paging
 * - IMF-005: collectAssets pages until done and reports the cap
 * - IMF-006: getAlbumDetail validates, tolerates a missing assets array, and reports a 404
 * - IMF-007: createAlbum posts the album and validates the reply
 * - IMF-008: addAssetsToAlbum chunks, counts duplicates separately, and reports per-asset failures
 * - IMF-009: Immich 401/403 become a 403 (never a 401) with Immich's message; timeouts become 504
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import axios from 'axios';

jest.mock('axios');
const mockAxios = jest.mocked(axios);

const mockClient = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
};
mockAxios.create.mockReturnValue(mockClient as unknown as ReturnType<typeof axios.create>);

import immichService from '../immich.service';

const URL = 'http://localhost:2283';
const KEY = 'test-key';

class MockAxiosError extends Error {
  isAxiosError: true = true;
  code?: string;
  response?: { status: number; data?: unknown };
  constructor(message: string, options: { code?: string; status?: number; data?: unknown } = {}) {
    super(message);
    this.code = options.code;
    if (options.status !== undefined) this.response = { status: options.status, data: options.data };
  }
}

const item = (id: string) => ({ id, type: 'IMAGE', exifInfo: { latitude: null, longitude: null } });
const page = (ids: string[], nextPage: string | null) => ({ data: { assets: { items: ids.map(item), nextPage } } });

describe('ImmichService filtered calls', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockAxios.create.mockReturnValue(mockClient as unknown as ReturnType<typeof axios.create>);
  });

  it('IMF-001: sends filters and the page number to /api/search/metadata', async () => {
    mockClient.post.mockResolvedValue(page(['a'], null));

    const result = await immichService.searchAssetsPage(
      URL,
      KEY,
      {
        takenAfter: '2026-01-05T05:00:00.000Z',
        takenBefore: '2026-01-11T04:59:59.999Z',
        isFavorite: true,
        type: 'VIDEO',
        albumId: 'album-1',
        text: '  IMG_12  ',
      },
      3,
      50
    );

    expect(mockClient.post).toHaveBeenCalledWith('/api/search/metadata', {
      page: 3,
      size: 50,
      withExif: true,
      order: 'desc',
      takenAfter: '2026-01-05T05:00:00.000Z',
      takenBefore: '2026-01-11T04:59:59.999Z',
      isFavorite: true,
      type: 'VIDEO',
      albumIds: ['album-1'],
      originalFileName: 'IMG_12',
    });
    expect(result.assets.map((a) => a.id)).toEqual(['a']);
  });

  it('IMF-010: smart mode calls /api/search/smart with the query and filters, and no date order', async () => {
    mockClient.post.mockResolvedValue(page(['a'], '2'));
    const result = await immichService.searchAssetsPage(
      URL,
      KEY,
      { smart: true, text: ' beach sunset ', takenAfter: 'x', isFavorite: true, type: 'IMAGE', albumId: 'alb' },
      1,
      50
    );
    expect(mockClient.post).toHaveBeenCalledWith(
      '/api/search/smart',
      {
        page: 1,
        size: 50,
        withExif: true,
        query: 'beach sunset',
        takenAfter: 'x',
        isFavorite: true,
        type: 'IMAGE',
        albumIds: ['alb'],
      },
      { timeout: 60000 }
    );
    expect(mockClient.post.mock.calls[0][1]).not.toHaveProperty('order');
    expect(mockClient.post.mock.calls[0][1]).not.toHaveProperty('originalFileName');
    expect(result.nextPage).toBe(2);
  });

  it('IMF-011: smart mode with an empty query falls back to the metadata search', async () => {
    mockClient.post.mockResolvedValue(page([], null));
    await immichService.searchAssetsPage(URL, KEY, { smart: true, text: '   ' }, 1, 10);
    expect(mockClient.post.mock.calls[0][0]).toBe('/api/search/metadata');
    expect(mockClient.post.mock.calls[0][1]).toMatchObject({ order: 'desc' });
  });

  it('IMF-012: smart search failures read as unavailable; 401/403 stay permission errors; shape is validated', async () => {
    for (const status of [400, 404, 500, 503]) {
      mockClient.post.mockRejectedValueOnce(new MockAxiosError('x', { status }));
      await expect(
        immichService.searchAssetsPage(URL, KEY, { smart: true, text: 'beach' }, 1, 10)
      ).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining("Smart search isn't available") });
    }
    mockClient.post.mockRejectedValueOnce(new MockAxiosError('x', { status: 401 }));
    await expect(
      immichService.searchAssetsPage(URL, KEY, { smart: true, text: 'beach' }, 1, 10)
    ).rejects.toMatchObject({ statusCode: 403 });

    mockClient.post.mockResolvedValueOnce({ data: { assets: 'nope' } });
    await expect(
      immichService.searchAssetsPage(URL, KEY, { smart: true, text: 'beach' }, 1, 10)
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('IMF-002: never sends isFavorite=false', async () => {
    mockClient.post.mockResolvedValue(page([], null));
    await immichService.searchAssetsPage(URL, KEY, { isFavorite: false }, 1, 10);
    expect(mockClient.post.mock.calls[0][1]).not.toHaveProperty('isFavorite');
  });

  it('IMF-003: rejects an unexpected response instead of treating it as empty', async () => {
    mockClient.post.mockResolvedValue({ data: { message: 'oops' } });
    await expect(immichService.searchAssetsPage(URL, KEY, {}, 1, 10)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('unexpected response'),
    });
  });

  it('IMF-004: nextPage is numeric, and a cursor that does not advance ends paging', async () => {
    mockClient.post.mockResolvedValueOnce(page(['a'], '2')).mockResolvedValueOnce(page(['b'], '2'));
    const first = await immichService.searchAssetsPage(URL, KEY, {}, 1, 10);
    expect(first.nextPage).toBe(2);
    const second = await immichService.searchAssetsPage(URL, KEY, {}, 2, 10);
    expect(second.nextPage).toBeNull();
  });

  it('IMF-005: collectAssets pages through and reports the cap', async () => {
    mockClient.post.mockResolvedValueOnce(page(['a', 'b'], '2')).mockResolvedValueOnce(page(['c'], null));
    const all = await immichService.collectAssets(URL, KEY, {}, 10);
    expect(all.assets.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(all.capped).toBe(false);
    expect(mockClient.post.mock.calls[1][1]).toMatchObject({ page: 2 });

    mockClient.post.mockReset();
    mockClient.post.mockResolvedValueOnce(page(['a', 'b'], '2')).mockResolvedValueOnce(page(['c', 'd'], '3'));
    const capped = await immichService.collectAssets(URL, KEY, {}, 3);
    expect(capped.assets.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(capped.capped).toBe(true);
    expect(mockClient.post).toHaveBeenCalledTimes(2);
  });

  it('IMF-006: getAlbumDetail validates the album', async () => {
    mockClient.get.mockResolvedValueOnce({ data: { id: 'x', albumName: 'Trip', assets: [item('a')] } });
    const album = await immichService.getAlbumDetail(URL, KEY, 'x');
    expect(album.assets).toHaveLength(1);
    expect(mockClient.get).toHaveBeenCalledWith('/api/albums/x', { params: undefined });

    mockClient.get.mockResolvedValueOnce({ data: { id: 'x', albumName: 'Trip' } });
    const light = await immichService.getAlbumDetail(URL, KEY, 'x', { withoutAssets: true });
    expect(light.assets).toEqual([]);
    expect(mockClient.get).toHaveBeenLastCalledWith('/api/albums/x', { params: { withoutAssets: true } });

    mockClient.get.mockResolvedValueOnce({ data: { nope: true } });
    await expect(immichService.getAlbumDetail(URL, KEY, 'x')).rejects.toMatchObject({ statusCode: 502 });

    mockClient.get.mockRejectedValueOnce(new MockAxiosError('nf', { status: 404, data: { message: 'Not found or no album.read access' } }));
    await expect(immichService.getAlbumDetail(URL, KEY, 'x')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('IMF-007: createAlbum posts the name and returns the new id', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'new-1', albumName: 'Beach', assets: [] } });
    const created = await immichService.createAlbum(URL, KEY, 'Beach', 'Sand');
    expect(mockClient.post).toHaveBeenCalledWith('/api/albums', { albumName: 'Beach', description: 'Sand' });
    expect(created).toEqual({ id: 'new-1', albumName: 'Beach' });

    mockClient.post.mockResolvedValue({ data: {} });
    await expect(immichService.createAlbum(URL, KEY, 'Beach')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('IMF-008: addAssetsToAlbum chunks and tallies per-asset results', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `a${i}`);
    mockClient.put
      .mockResolvedValueOnce({ data: ids.slice(0, 500).map((id, i) => ({ id, success: i !== 0, error: i === 0 ? 'duplicate' : null })) })
      .mockResolvedValueOnce({ data: [{ id: 'a500', success: false, error: 'no_permission' }] });

    const result = await immichService.addAssetsToAlbum(URL, KEY, 'alb', ids);

    expect(mockClient.put).toHaveBeenCalledTimes(2);
    expect(mockClient.put.mock.calls[0][0]).toBe('/api/albums/alb/assets');
    expect((mockClient.put.mock.calls[1][1] as { ids: string[] }).ids).toEqual(['a500']);
    expect(result).toEqual({ added: 499, alreadyInAlbum: 1, failed: [{ id: 'a500', error: 'no_permission' }] });
  });

  it('IMF-009: maps Immich errors to our own without ever producing a 401', async () => {
    mockClient.post.mockRejectedValueOnce(
      new MockAxiosError('forbidden', { status: 403, data: { message: 'Missing required permission: album.create' } })
    );
    await expect(immichService.createAlbum(URL, KEY, 'Beach')).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('album.create'),
    });

    mockClient.post.mockRejectedValueOnce(new MockAxiosError('unauthorized', { status: 401 }));
    await expect(immichService.createAlbum(URL, KEY, 'Beach')).rejects.toMatchObject({ statusCode: 403 });

    mockClient.post.mockRejectedValueOnce(new MockAxiosError('timeout', { code: 'ECONNABORTED' }));
    await expect(immichService.createAlbum(URL, KEY, 'Beach')).rejects.toMatchObject({ statusCode: 504 });

    mockClient.post.mockRejectedValueOnce(new MockAxiosError('refused', { code: 'ECONNREFUSED' }));
    await expect(immichService.createAlbum(URL, KEY, 'Beach')).rejects.toMatchObject({ statusCode: 502 });
  });
});
