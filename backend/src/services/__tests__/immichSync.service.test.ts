/**
 * Immich Sync Service Tests (filtered browse, bulk import, album link/sync, export)
 *
 * Nothing here talks to a real Immich server: the Immich HTTP layer is mocked.
 *
 * Test cases:
 * - IMS-001: dayRangeToInstants reads the dates as whole local days in the timezone
 * - IMS-002: parseImmichDuration handles "HH:MM:SS.fff", seconds, and junk
 * - IMS-003: toLinkerAsset validates coordinates/dates and only keeps duration for videos
 * - IMS-004: browse resolves the timezone (explicit, then the user's) and flags already-linked assets
 * - IMS-005: previewBulkLink counts matching / already linked / to link and reports the cap
 * - IMS-006: linkBulkPage links through the batch linker and reports already-linked
 * - IMS-007: linkBulkPage never goes past the cap and ends the run
 * - IMS-008: syncAlbum requires a link
 * - IMS-009: syncAlbum links only missing assets, never deletes, and reports assets gone from Immich
 * - IMS-010: syncAlbum does not compute "gone from Immich" when the album exceeded the cap
 * - IMS-011: previewExport counts Immich assets and skipped uploads without calling Immich
 * - IMS-012: exportAlbum creates the album, stores the link first, adds assets, never uploads
 * - IMS-013: exportAlbum reuses a linked album instead of creating another
 * - IMS-014: exportAlbum with nothing to add refuses before touching Immich
 * - IMS-015: setAlbumLink verifies the Immich album exists before storing it
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  photo: { findMany: jest.fn() },
  photoAlbum: { update: jest.fn() },
  photoAlbumAssignment: { createMany: jest.fn(), count: jest.fn(), findMany: jest.fn() },
};
jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
const mockVerifyEntity = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
  verifyEntityAccessWithPermission: (...args: unknown[]) => mockVerifyEntity(...args),
}));

const mockGetUserTimezone = jest.fn();
jest.mock('../_shared/timezoneResolution', () => ({
  getUserTimezone: (...args: unknown[]) => mockGetUserTimezone(...args),
  resolveTimezone: (...candidates: Array<string | null | undefined>) =>
    candidates.find((c) => c && c.trim()) ?? 'UTC',
}));

const mockLinkBatch = jest.fn();
jest.mock('../photo.service', () => ({
  __esModule: true,
  default: { linkImmichPhotosBatch: (...args: unknown[]) => mockLinkBatch(...args) },
}));

const mockImmich = {
  getUserSettings: jest.fn(),
  searchAssetsPage: jest.fn(),
  collectAssets: jest.fn(),
  getAlbumDetail: jest.fn(),
  createAlbum: jest.fn(),
  addAssetsToAlbum: jest.fn(),
};
jest.mock('../immich.service', () => ({
  __esModule: true,
  default: mockImmich,
  isSmartSearch: (f: { smart?: boolean; text?: string }) => f.smart === true && Boolean(f.text?.trim()),
}));

import immichSyncService, {
  dayRangeToInstants,
  parseImmichDuration,
  toLinkerAsset,
  BULK_LINK_CAP,
  BULK_LINK_PAGE_SIZE,
} from '../immichSync.service';
import type { ImmichAssetView } from '../immich.service';

const asset = (id: string, extra: Partial<ImmichAssetView> = {}): ImmichAssetView => ({
  id,
  type: 'IMAGE',
  ...extra,
});

const albumRow = {
  id: 7,
  tripId: 10,
  name: 'Beach',
  description: 'Sand',
  immichAlbumId: 'immich-album-1' as string | null,
  immichAlbumSyncedAt: null,
};

describe('ImmichSyncService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockVerifyTrip.mockResolvedValue({});
    mockVerifyEntity.mockResolvedValue({ entity: { ...albumRow } });
    mockGetUserTimezone.mockResolvedValue('America/New_York');
    mockImmich.getUserSettings.mockResolvedValue({ apiUrl: 'https://immich.test', apiKey: 'key' });
    mockLinkBatch.mockResolvedValue({ total: 0, successful: 0, failed: 0, errors: [], photoIds: [] });
  });

  describe('IMS-001: dayRangeToInstants', () => {
    it('covers whole local days, not a UTC window', () => {
      // New York is UTC-5 in January: local midnight on the 5th is 05:00Z, and
      // the end of the 10th is 04:59:59.999Z on the 11th.
      expect(dayRangeToInstants('2026-01-05', '2026-01-10', 'America/New_York')).toEqual({
        takenAfter: '2026-01-05T05:00:00.000Z',
        takenBefore: '2026-01-11T04:59:59.999Z',
      });
    });

    it('is correct east of UTC too', () => {
      expect(dayRangeToInstants('2026-01-05', '2026-01-05', 'Asia/Tokyo')).toEqual({
        takenAfter: '2026-01-04T15:00:00.000Z',
        takenBefore: '2026-01-05T14:59:59.999Z',
      });
    });

    it('leaves a bound off when its date is missing', () => {
      expect(dayRangeToInstants(undefined, '2026-01-05', 'UTC')).toEqual({
        takenBefore: '2026-01-05T23:59:59.999Z',
      });
    });
  });

  describe('IMS-002: parseImmichDuration', () => {
    it('parses the documented and numeric forms', () => {
      expect(parseImmichDuration('0:01:30.500000')).toBe(91);
      expect(parseImmichDuration('01:00:00.000')).toBe(3600);
      expect(parseImmichDuration(42.4)).toBe(42);
    });

    it('returns null for zero, empty and junk', () => {
      expect(parseImmichDuration('0:00:00.000000')).toBeNull();
      expect(parseImmichDuration('')).toBeNull();
      expect(parseImmichDuration(null)).toBeNull();
      expect(parseImmichDuration('abc')).toBeNull();
      expect(parseImmichDuration('1:2:3:4')).toBeNull();
    });
  });

  describe('IMS-003: toLinkerAsset', () => {
    it('maps a video with duration, EXIF date and coordinates', () => {
      const mapped = toLinkerAsset(
        asset('v1', {
          type: 'VIDEO',
          duration: '0:00:05.000000',
          fileCreatedAt: '2026-01-01T00:00:00.000Z',
          exifInfo: { dateTimeOriginal: '2026-01-02T10:00:00.000Z', latitude: 48.8, longitude: 2.3 },
        })
      );
      expect(mapped).toEqual({
        immichAssetId: 'v1',
        mediaType: 'video',
        duration: 5,
        takenAt: '2026-01-02T10:00:00.000Z',
        latitude: 48.8,
        longitude: 2.3,
      });
    });

    it('drops out-of-range coordinates, unparseable dates and image durations', () => {
      const mapped = toLinkerAsset(
        asset('i1', {
          duration: '0:00:05.000000',
          fileCreatedAt: 'not a date',
          exifInfo: { latitude: 123, longitude: -999 },
        })
      );
      expect(mapped.mediaType).toBe('image');
      expect(mapped.duration).toBeNull();
      expect(mapped.takenAt).toBeUndefined();
      expect(mapped.latitude).toBeUndefined();
      expect(mapped.longitude).toBeUndefined();
    });
  });

  describe('IMS-004: browse', () => {
    it('reads dates in the explicit timezone, falls back to the user zone, and flags linked assets', async () => {
      mockImmich.searchAssetsPage.mockResolvedValue({ assets: [asset('a'), asset('b')], nextPage: 2 });
      mockPrisma.photo.findMany.mockResolvedValue([{ immichAssetId: 'b' }]);

      const withZone = await immichSyncService.browse(
        1,
        { dateFrom: '2026-01-05', dateTo: '2026-01-05', timezone: 'Asia/Tokyo', isFavorite: true },
        3,
        50,
        10
      );

      expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'view');
      expect(mockImmich.searchAssetsPage).toHaveBeenCalledWith(
        'https://immich.test',
        'key',
        expect.objectContaining({ takenAfter: '2026-01-04T15:00:00.000Z', isFavorite: true }),
        3,
        50
      );
      expect(withZone.assets.map((a) => [a.id, a.alreadyLinked])).toEqual([
        ['a', false],
        ['b', true],
      ]);
      expect(withZone.hasMore).toBe(true);

      await immichSyncService.browse(1, { dateFrom: '2026-01-05' }, 1, 50);
      expect(mockImmich.searchAssetsPage).toHaveBeenLastCalledWith(
        'https://immich.test',
        'key',
        expect.objectContaining({ takenAfter: '2026-01-05T05:00:00.000Z' }),
        1,
        50
      );
    });

    it('does not touch the database when no trip is given', async () => {
      mockImmich.searchAssetsPage.mockResolvedValue({ assets: [asset('a')], nextPage: null });
      const result = await immichSyncService.browse(1, {}, 1, 50);
      expect(mockPrisma.photo.findMany).not.toHaveBeenCalled();
      expect(result.assets[0]).not.toHaveProperty('alreadyLinked');
      expect(result.hasMore).toBe(false);
    });
  });

  describe('IMS-016: smart search mode', () => {
    it('passes smart + query through browse, with the other filters', async () => {
      mockImmich.searchAssetsPage.mockResolvedValue({ assets: [asset('a')], nextPage: null });
      await immichSyncService.browse(1, { searchMode: 'smart', text: 'beach sunset', isFavorite: true }, 1, 50);
      expect(mockImmich.searchAssetsPage).toHaveBeenCalledWith(
        'https://immich.test',
        'key',
        expect.objectContaining({ smart: true, text: 'beach sunset', isFavorite: true }),
        1,
        50
      );
    });

    it('refuses a smart query for bulk preview and bulk page, before touching Immich', async () => {
      const filters = { searchMode: 'smart' as const, text: 'beach' };
      await expect(immichSyncService.previewBulkLink(1, 10, filters)).rejects.toMatchObject({ statusCode: 400 });
      await expect(immichSyncService.linkBulkPage(1, 10, filters, 1)).rejects.toMatchObject({ statusCode: 400 });
      expect(mockImmich.collectAssets).not.toHaveBeenCalled();
      expect(mockImmich.searchAssetsPage).not.toHaveBeenCalled();
      expect(mockLinkBatch).not.toHaveBeenCalled();
    });

    it('allows bulk when smart mode has an empty query (it is a plain metadata query)', async () => {
      mockImmich.collectAssets.mockResolvedValue({ assets: [], capped: false });
      mockPrisma.photo.findMany.mockResolvedValue([]);
      await expect(
        immichSyncService.previewBulkLink(1, 10, { searchMode: 'smart' })
      ).resolves.toMatchObject({ matching: 0 });
    });
  });

  describe('IMS-005: previewBulkLink', () => {
    it('counts matching, already linked and to link', async () => {
      mockImmich.collectAssets.mockResolvedValue({ assets: [asset('a'), asset('b'), asset('c')], capped: false });
      mockPrisma.photo.findMany.mockResolvedValue([{ immichAssetId: 'a' }]);

      const preview = await immichSyncService.previewBulkLink(1, 10, {});

      expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'edit');
      expect(preview).toMatchObject({ matching: 3, alreadyLinked: 1, toLink: 2, capped: false, pages: 1 });
      expect(mockImmich.collectAssets).toHaveBeenCalledWith('https://immich.test', 'key', expect.anything(), BULK_LINK_CAP);
    });

    it('reports the cap and the number of pages', async () => {
      const many = Array.from({ length: BULK_LINK_CAP }, (_, i) => asset(`id-${i}`));
      mockImmich.collectAssets.mockResolvedValue({ assets: many, capped: true });
      mockPrisma.photo.findMany.mockResolvedValue([]);

      const preview = await immichSyncService.previewBulkLink(1, 10, {});

      expect(preview.capped).toBe(true);
      expect(preview.cap).toBe(BULK_LINK_CAP);
      expect(preview.pages).toBe(Math.ceil(BULK_LINK_CAP / BULK_LINK_PAGE_SIZE));
    });
  });

  describe('IMS-006/007: linkBulkPage', () => {
    it('links through the batch linker and reports already-linked', async () => {
      mockImmich.searchAssetsPage.mockResolvedValue({ assets: [asset('a'), asset('b'), asset('c')], nextPage: 2 });
      // The linker skipped 'a' (already on the trip) and tried 2.
      mockLinkBatch.mockResolvedValue({ total: 2, successful: 1, failed: 1, errors: ['Batch 1: boom'], photoIds: [5] });

      const result = await immichSyncService.linkBulkPage(1, 10, {}, 1);

      expect(mockLinkBatch).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          tripId: 10,
          assets: [
            expect.objectContaining({ immichAssetId: 'a' }),
            expect.objectContaining({ immichAssetId: 'b' }),
            expect.objectContaining({ immichAssetId: 'c' }),
          ],
        })
      );
      expect(result).toEqual({ linked: 1, alreadyLinked: 1, failed: 1, errors: ['Batch 1: boom'], nextPage: 2 });
    });

    it('stops at the cap', async () => {
      const lastPage = BULK_LINK_CAP / BULK_LINK_PAGE_SIZE;
      mockImmich.searchAssetsPage.mockResolvedValue({
        assets: Array.from({ length: BULK_LINK_PAGE_SIZE }, (_, i) => asset(`id-${i}`)),
        nextPage: lastPage + 1,
      });
      mockLinkBatch.mockResolvedValue({ total: BULK_LINK_PAGE_SIZE, successful: BULK_LINK_PAGE_SIZE, failed: 0, errors: [], photoIds: [] });

      const result = await immichSyncService.linkBulkPage(1, 10, {}, lastPage);
      expect(result.nextPage).toBeNull();

      const beyond = await immichSyncService.linkBulkPage(1, 10, {}, lastPage + 1);
      expect(beyond).toEqual({ linked: 0, alreadyLinked: 0, failed: 0, errors: [], nextPage: null });
      expect(mockImmich.searchAssetsPage).toHaveBeenCalledTimes(1);
    });
  });

  describe('IMS-008/009/010: syncAlbum', () => {
    it('requires a link', async () => {
      mockVerifyEntity.mockResolvedValue({ entity: { ...albumRow, immichAlbumId: null } });
      await expect(immichSyncService.syncAlbum(1, 7)).rejects.toThrow('not linked');
      expect(mockImmich.getAlbumDetail).not.toHaveBeenCalled();
    });

    it('links only missing assets, never deletes, and reports assets gone from Immich', async () => {
      mockImmich.getAlbumDetail.mockResolvedValue({
        id: 'immich-album-1',
        albumName: 'Beach (Immich)',
        assets: [asset('a'), asset('b'), asset('c')],
      });
      // 'a' is already on the trip; 'b' and 'c' are new.
      mockPrisma.photo.findMany
        .mockResolvedValueOnce([{ immichAssetId: 'a' }])
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
      mockLinkBatch.mockResolvedValue({ total: 2, successful: 2, failed: 0, errors: [], photoIds: [2, 3] });
      // 'a' was already in the trip album, 'b' and 'c' are new assignments.
      mockPrisma.photoAlbumAssignment.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.photoAlbumAssignment.count.mockResolvedValue(4);
      mockPrisma.photoAlbum.update.mockResolvedValue({});

      const result = await immichSyncService.syncAlbum(1, 7);

      expect(mockLinkBatch).toHaveBeenCalledWith(1, {
        tripId: 10,
        assets: [expect.objectContaining({ immichAssetId: 'b' }), expect.objectContaining({ immichAssetId: 'c' })],
      });
      expect(result).toMatchObject({
        immichAlbumName: 'Beach (Immich)',
        immichAssetCount: 3,
        newlyLinked: 2,
        addedToAlbum: 2,
        alreadyInAlbum: 1,
        failed: 0,
        notInImmichAlbum: 4,
        capped: false,
      });
      // The "gone from Immich" query only counts; nothing is removed.
      expect(mockPrisma.photoAlbumAssignment.count).toHaveBeenCalledWith({
        where: {
          albumId: 7,
          photo: { source: 'immich', immichAssetId: { not: null, notIn: ['a', 'b', 'c'] } },
        },
      });
      expect(mockPrisma.photoAlbum.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { immichAlbumSyncedAt: expect.any(Date) },
      });
    });

    it('skips the linker entirely when there is nothing new, so re-syncing is a no-op', async () => {
      mockImmich.getAlbumDetail.mockResolvedValue({ id: 'x', albumName: 'A', assets: [asset('a')] });
      mockPrisma.photo.findMany.mockResolvedValueOnce([{ immichAssetId: 'a' }]).mockResolvedValueOnce([{ id: 1 }]);
      mockPrisma.photoAlbumAssignment.createMany.mockResolvedValue({ count: 0 });
      mockPrisma.photoAlbumAssignment.count.mockResolvedValue(0);

      const result = await immichSyncService.syncAlbum(1, 7);

      expect(mockLinkBatch).not.toHaveBeenCalled();
      expect(result).toMatchObject({ newlyLinked: 0, addedToAlbum: 0, alreadyInAlbum: 1 });
    });

    it('does not report assets gone from Immich when the album was larger than the cap', async () => {
      const many = Array.from({ length: 5001 }, (_, i) => asset(`id-${i}`));
      mockImmich.getAlbumDetail.mockResolvedValue({ id: 'x', albumName: 'Big', assets: many });
      mockPrisma.photo.findMany.mockResolvedValue([]);
      mockLinkBatch.mockResolvedValue({ total: 5000, successful: 5000, failed: 0, errors: [], photoIds: [] });
      mockPrisma.photoAlbumAssignment.createMany.mockResolvedValue({ count: 0 });

      const result = await immichSyncService.syncAlbum(1, 7);

      expect(result.capped).toBe(true);
      expect(result.notInImmichAlbum).toBeNull();
      expect(mockPrisma.photoAlbumAssignment.count).not.toHaveBeenCalled();
    });
  });

  describe('IMS-011: previewExport', () => {
    it('counts Immich assets and skipped uploads without calling Immich', async () => {
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue([
        { photo: { source: 'immich', immichAssetId: 'a' } },
        { photo: { source: 'immich', immichAssetId: 'a' } },
        { photo: { source: 'immich', immichAssetId: 'b' } },
        { photo: { source: 'local', immichAssetId: null } },
        { photo: { source: 'local', immichAssetId: null } },
      ]);

      const preview = await immichSyncService.previewExport(1, 7);

      expect(preview).toEqual({
        albumName: 'Beach',
        immichAssetCount: 2,
        skippedUploaded: 2,
        linkedImmichAlbumId: 'immich-album-1',
        willCreate: false,
      });
      expect(mockImmich.createAlbum).not.toHaveBeenCalled();
      expect(mockImmich.addAssetsToAlbum).not.toHaveBeenCalled();
    });
  });

  describe('IMS-012/013/014: exportAlbum', () => {
    const assignments = [
      { photo: { source: 'immich', immichAssetId: 'a' } },
      { photo: { source: 'immich', immichAssetId: 'b' } },
      { photo: { source: 'local', immichAssetId: null } },
    ];

    it('creates the album, stores the link before adding assets, and skips uploads', async () => {
      mockVerifyEntity.mockResolvedValue({ entity: { ...albumRow, immichAlbumId: null } });
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue(assignments);
      mockImmich.createAlbum.mockResolvedValue({ id: 'new-immich-album', albumName: 'Beach' });
      mockImmich.addAssetsToAlbum.mockResolvedValue({ added: 2, alreadyInAlbum: 0, failed: [] });
      const order: string[] = [];
      mockPrisma.photoAlbum.update.mockImplementation(async () => {
        order.push('store-link');
        return {};
      });
      mockImmich.addAssetsToAlbum.mockImplementation(async () => {
        order.push('add-assets');
        return { added: 2, alreadyInAlbum: 0, failed: [] };
      });

      const result = await immichSyncService.exportAlbum(1, 7);

      expect(mockImmich.createAlbum).toHaveBeenCalledWith('https://immich.test', 'key', 'Beach', 'Sand');
      expect(mockImmich.addAssetsToAlbum).toHaveBeenCalledWith('https://immich.test', 'key', 'new-immich-album', ['a', 'b']);
      expect(order).toEqual(['store-link', 'add-assets']);
      expect(result).toEqual({
        immichAlbumId: 'new-immich-album',
        created: true,
        added: 2,
        alreadyInAlbum: 0,
        failed: [],
        skippedUploaded: 1,
      });
    });

    it('reuses the linked album instead of creating another', async () => {
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue(assignments);
      mockImmich.addAssetsToAlbum.mockResolvedValue({ added: 1, alreadyInAlbum: 1, failed: [] });

      const result = await immichSyncService.exportAlbum(1, 7);

      expect(mockImmich.createAlbum).not.toHaveBeenCalled();
      expect(mockPrisma.photoAlbum.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ immichAlbumId: 'immich-album-1', created: false, added: 1, alreadyInAlbum: 1 });
    });

    it('refuses before touching Immich when there is nothing to add', async () => {
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue([{ photo: { source: 'local', immichAssetId: null } }]);

      await expect(immichSyncService.exportAlbum(1, 7)).rejects.toThrow('no Immich photos');
      expect(mockImmich.getUserSettings).not.toHaveBeenCalled();
      expect(mockImmich.createAlbum).not.toHaveBeenCalled();
    });

    it('surfaces Immich permission errors and does not swallow them', async () => {
      mockVerifyEntity.mockResolvedValue({ entity: { ...albumRow, immichAlbumId: null } });
      mockPrisma.photoAlbumAssignment.findMany.mockResolvedValue(assignments);
      mockImmich.createAlbum.mockRejectedValue(new Error('Immich refused to create the album (Missing permission: album.create)'));

      await expect(immichSyncService.exportAlbum(1, 7)).rejects.toThrow('album.create');
      expect(mockImmich.addAssetsToAlbum).not.toHaveBeenCalled();
    });
  });

  describe('IMS-015: setAlbumLink', () => {
    it('verifies the Immich album exists before storing it', async () => {
      mockImmich.getAlbumDetail.mockResolvedValue({ id: 'abc', albumName: 'A', assets: [] });
      mockPrisma.photoAlbum.update.mockResolvedValue({ id: 7, immichAlbumId: 'abc', immichAlbumSyncedAt: null });

      await immichSyncService.setAlbumLink(1, 7, 'abc');

      expect(mockImmich.getAlbumDetail).toHaveBeenCalledWith('https://immich.test', 'key', 'abc', { withoutAssets: true });
      expect(mockPrisma.photoAlbum.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { immichAlbumId: 'abc', immichAlbumSyncedAt: null } })
      );
    });

    it('does not store a link to an album Immich cannot find', async () => {
      mockImmich.getAlbumDetail.mockRejectedValue(new Error('not found'));
      await expect(immichSyncService.setAlbumLink(1, 7, 'abc')).rejects.toThrow('not found');
      expect(mockPrisma.photoAlbum.update).not.toHaveBeenCalled();
    });

    it('unlinks without calling Immich', async () => {
      mockPrisma.photoAlbum.update.mockResolvedValue({ id: 7, immichAlbumId: null, immichAlbumSyncedAt: null });
      await immichSyncService.setAlbumLink(1, 7, null);
      expect(mockImmich.getAlbumDetail).not.toHaveBeenCalled();
    });
  });
});
