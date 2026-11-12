/**
 * Food Log Service Tests
 *
 * Test cases:
 * - FL-001: Create stores the entry with defaults and verifies linked activity/location belong to the trip
 * - FL-002: Create rejects a linked activity that is not in the trip and writes nothing
 * - FL-003: Update changes only supplied fields and can clear links
 * - FL-004: Update/delete of an entry from another trip is a 404
 * - FL-005: Search scopes to the user's trips and applies rating/order-again/text filters
 * - FL-006: Search without filters adds no filter clauses
 * - FL-007: Attach photos verifies they belong to the trip, de-duplicates and appends sort order
 * - FL-008: Attach rejects a photo from another trip and writes nothing
 * - FL-009: Attach enforces the per-entry photo cap
 * - FL-010: Remove detaches only the link (never deletes the photo)
 * - FL-011: Entries are returned with photos flattened to Photo[] in display order
 * - FL-012: Immich attach reuses already-linked photos and links only the missing assets
 * - FL-013: Immich attach rejects videos and writes/links nothing
 * - FL-014: Immich attach checks the per-entry cap BEFORE linking anything to the trip
 * - FL-015: Immich attach surfaces a link failure instead of attaching a partial set
 * - FL-016: Only still images can be attached by photo id
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  foodLogEntry: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  photo: { count: jest.fn(), findMany: jest.fn() },
  foodLogEntryPhoto: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
const mockVerifyEntity = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
  verifyEntityInTrip: (...args: unknown[]) => mockVerifyEntity(...args),
}));

const mockLinkBatch = jest.fn();
jest.mock('../photo.service', () => ({
  __esModule: true,
  default: { linkImmichPhotosBatch: (...args: unknown[]) => mockLinkBatch(...args) },
}));

import foodLogService from '../foodLog.service';

describe('FoodLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTrip.mockResolvedValue({ trip: { id: 10, userId: 1 } });
    mockVerifyEntity.mockResolvedValue(undefined);
  });

  describe('FL-001/002: create', () => {
    it('stores defaults and verifies links', async () => {
      mockPrisma.foodLogEntry.create.mockResolvedValue({ id: 1, photos: [] });

      await foodLogService.createEntry(1, 10, {
        restaurantName: 'Trattoria',
        dish: 'Carbonara',
        rating: 5,
        activityId: 4,
        locationId: 8,
      });

      expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'edit');
      expect(mockVerifyEntity).toHaveBeenCalledWith('activity', 4, 10);
      expect(mockVerifyEntity).toHaveBeenCalledWith('location', 8, 10);
      expect(mockPrisma.foodLogEntry.create).toHaveBeenCalledWith({
        include: expect.anything(),
        data: {
          tripId: 10,
          restaurantName: 'Trattoria',
          dish: 'Carbonara',
          rating: 5,
          notes: null,
          orderAgain: false,
          activityId: 4,
          locationId: 8,
        },
      });
    });

    it('rejects a link outside the trip without writing', async () => {
      mockVerifyEntity.mockRejectedValue(new Error('Activity not found or does not belong to trip'));
      await expect(
        foodLogService.createEntry(1, 10, { restaurantName: 'X', dish: 'Y', rating: 3, activityId: 99 })
      ).rejects.toThrow('does not belong to trip');
      expect(mockPrisma.foodLogEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('FL-003: update', () => {
    it('updates only supplied fields and allows clearing links', async () => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue({ id: 3, tripId: 10 });
      mockPrisma.foodLogEntry.update.mockResolvedValue({ id: 3, photos: [] });

      await foodLogService.updateEntry(1, 10, 3, { rating: 2, orderAgain: true, activityId: null });

      expect(mockVerifyEntity).not.toHaveBeenCalled();
      expect(mockPrisma.foodLogEntry.update).toHaveBeenCalledWith({
        where: { id: 3 },
        include: expect.anything(),
        data: { rating: 2, orderAgain: true, activityId: null },
      });
    });
  });

  describe('FL-004: wrong trip', () => {
    it('404s on update and delete', async () => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue(null);
      await expect(foodLogService.updateEntry(1, 10, 3, { rating: 2 })).rejects.toMatchObject({ statusCode: 404 });
      await expect(foodLogService.deleteEntry(1, 10, 3)).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.foodLogEntry.delete).not.toHaveBeenCalled();
    });

    it('deletes an entry in the trip', async () => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue({ id: 3, tripId: 10 });
      await expect(foodLogService.deleteEntry(1, 10, 3)).resolves.toEqual({ id: 3 });
      expect(mockPrisma.foodLogEntry.findFirst).toHaveBeenCalledWith({ where: { id: 3, tripId: 10 } });
    });
  });

  describe('FL-005/006: search', () => {
    it('applies filters and scopes to the user', async () => {
      mockPrisma.foodLogEntry.findMany.mockResolvedValue([]);

      await foodLogService.searchEntries(7, { minRating: 4, orderAgain: true, q: '  pasta ' });

      const arg = mockPrisma.foodLogEntry.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
      };
      expect(arg.where).toMatchObject({
        trip: { OR: [{ userId: 7 }, { collaborators: { some: { userId: 7 } } }] },
        rating: { gte: 4 },
        orderAgain: true,
        OR: [
          { dish: { contains: 'pasta', mode: 'insensitive' } },
          { restaurantName: { contains: 'pasta', mode: 'insensitive' } },
          { notes: { contains: 'pasta', mode: 'insensitive' } },
        ],
      });
      expect(arg.orderBy).toEqual([{ rating: 'desc' }, { createdAt: 'desc' }]);
    });

    it('adds no optional clauses when no filters are given', async () => {
      mockPrisma.foodLogEntry.findMany.mockResolvedValue([]);
      await foodLogService.searchEntries(7, {});
      const arg = mockPrisma.foodLogEntry.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(Object.keys(arg.where)).toEqual(['trip']);
    });
  });

  describe('FL-007..011: photos', () => {
    const photo = (id: number) => ({ id, thumbnailPath: `/t/${id}.jpg` });

    beforeEach(() => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue({ id: 3, tripId: 10 });
    });

    it('FL-007: attaches only new photos, appending after the highest sort order', async () => {
      mockPrisma.photo.count.mockResolvedValue(2);
      mockPrisma.foodLogEntryPhoto.findMany.mockResolvedValue([{ photoId: 5, sortOrder: 4 }]);
      mockPrisma.foodLogEntry.findUniqueOrThrow.mockResolvedValue({
        id: 3,
        photos: [{ photo: photo(5) }, { photo: photo(6) }],
      });

      // 5 is already attached, 6 is new; the duplicate 6 in the request is collapsed.
      const result = await foodLogService.attachPhotos(1, 10, 3, [5, 6, 6]);

      expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'edit');
      expect(mockPrisma.photo.count).toHaveBeenCalledWith({
        where: { id: { in: [5, 6] }, tripId: 10, mediaType: 'image' },
      });
      expect(mockPrisma.foodLogEntryPhoto.createMany).toHaveBeenCalledWith({
        data: [{ entryId: 3, photoId: 6, sortOrder: 5 }],
        skipDuplicates: true,
      });
      expect(result.photos).toEqual([photo(5), photo(6)]);
    });

    it('FL-008: rejects a photo that is not in the trip and writes nothing', async () => {
      mockPrisma.photo.count.mockResolvedValue(1); // asked for 2, only 1 is in trip 10
      await expect(foodLogService.attachPhotos(1, 10, 3, [5, 99])).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.foodLogEntryPhoto.createMany).not.toHaveBeenCalled();
    });

    it('FL-008: 404s for an entry outside the trip before touching photos', async () => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue(null);
      await expect(foodLogService.attachPhotos(1, 10, 3, [5])).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.photo.count).not.toHaveBeenCalled();
    });

    it('FL-009: refuses to exceed 12 photos per entry', async () => {
      mockPrisma.photo.count.mockResolvedValue(2);
      mockPrisma.foodLogEntryPhoto.findMany.mockResolvedValue(
        Array.from({ length: 11 }, (_, i) => ({ photoId: 100 + i, sortOrder: i }))
      );
      await expect(foodLogService.attachPhotos(1, 10, 3, [5, 6])).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.foodLogEntryPhoto.createMany).not.toHaveBeenCalled();
    });

    it('FL-010: remove deletes only the link row', async () => {
      mockPrisma.foodLogEntryPhoto.deleteMany.mockResolvedValue({ count: 1 });
      await expect(foodLogService.removePhoto(1, 10, 3, 5)).resolves.toEqual({ entryId: 3, photoId: 5 });
      expect(mockPrisma.foodLogEntryPhoto.deleteMany).toHaveBeenCalledWith({ where: { entryId: 3, photoId: 5 } });
    });

    it('FL-011: lists entries with photos flattened and ordered by sortOrder', async () => {
      mockPrisma.foodLogEntry.findMany.mockResolvedValue([{ id: 3, photos: [{ photo: photo(5) }] }]);
      const result = await foodLogService.getEntriesByTrip(1, 10);
      expect(result[0].photos).toEqual([photo(5)]);
      const arg = mockPrisma.foodLogEntry.findMany.mock.calls[0][0] as {
        include: { photos: { orderBy: unknown } };
      };
      expect(arg.include.photos.orderBy).toEqual([{ sortOrder: 'asc' }, { id: 'asc' }]);
    });
  });

  describe('FL-012..016: Immich assets', () => {
    const asset = (immichAssetId: string) => ({ immichAssetId, mediaType: 'image' as const });
    const entryAfter = (ids: number[]) => ({ id: 3, photos: ids.map((id) => ({ photo: { id } })) });

    beforeEach(() => {
      mockPrisma.foodLogEntry.findFirst.mockResolvedValue({ id: 3, tripId: 10 });
      mockPrisma.foodLogEntryPhoto.findMany.mockResolvedValue([]);
      mockPrisma.photo.count.mockImplementation(async (arg: unknown) => {
        // Every id asked for exists as an image in the trip.
        return ((arg as { where: { id: { in: number[] } } }).where.id.in).length;
      });
    });

    it('FL-012: reuses a photo already linked to the trip and links only the new asset', async () => {
      // asset "a" is already a trip photo (id 21); asset "b" is not.
      mockPrisma.photo.findMany
        .mockResolvedValueOnce([{ id: 21, immichAssetId: 'a', mediaType: 'image' }]) // existing lookup
        .mockResolvedValueOnce([{ id: 21 }, { id: 22 }]); // resolved after linking
      mockLinkBatch.mockResolvedValue({ successful: 1, failed: 0, photoIds: [22] });
      mockPrisma.foodLogEntry.findUniqueOrThrow.mockResolvedValue(entryAfter([21, 22]));

      const result = await foodLogService.attachImmichAssets(1, 10, 3, {
        assets: [asset('a'), asset('b')],
      });

      expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'edit');
      // Only the missing asset is linked; the already-linked one is not re-linked (would 409/skip).
      expect(mockLinkBatch).toHaveBeenCalledTimes(1);
      const linked = mockLinkBatch.mock.calls[0][1] as { tripId: number; assets: Array<{ immichAssetId: string; mediaType: string }> };
      expect(linked.tripId).toBe(10);
      expect(linked.assets.map((a) => a.immichAssetId)).toEqual(['b']);
      expect(linked.assets[0].mediaType).toBe('image');
      // Both resolved photo rows end up attached.
      expect(mockPrisma.foodLogEntryPhoto.createMany).toHaveBeenCalledWith({
        data: [
          { entryId: 3, photoId: 21, sortOrder: 0 },
          { entryId: 3, photoId: 22, sortOrder: 1 },
        ],
        skipDuplicates: true,
      });
      expect(result.photos.map((p) => (p as { id: number }).id)).toEqual([21, 22]);
    });

    it('FL-012: links nothing when every asset is already a trip photo', async () => {
      mockPrisma.photo.findMany
        .mockResolvedValueOnce([{ id: 21, immichAssetId: 'a', mediaType: 'image' }])
        .mockResolvedValueOnce([{ id: 21 }]);
      mockPrisma.foodLogEntry.findUniqueOrThrow.mockResolvedValue(entryAfter([21]));

      await foodLogService.attachImmichAssets(1, 10, 3, { assets: [asset('a')] });

      expect(mockLinkBatch).not.toHaveBeenCalled();
      expect(mockPrisma.foodLogEntryPhoto.createMany).toHaveBeenCalledTimes(1);
    });

    it('FL-013: rejects an asset whose trip photo is a video, linking nothing', async () => {
      mockPrisma.photo.findMany.mockResolvedValueOnce([{ id: 21, immichAssetId: 'a', mediaType: 'video' }]);

      await expect(
        foodLogService.attachImmichAssets(1, 10, 3, { assets: [asset('a'), asset('b')] })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(mockLinkBatch).not.toHaveBeenCalled();
      expect(mockPrisma.foodLogEntryPhoto.createMany).not.toHaveBeenCalled();
    });

    it('FL-014: enforces the 12-photo cap before linking anything to the trip', async () => {
      mockPrisma.photo.findMany.mockResolvedValueOnce([]); // none of the assets are linked yet
      mockPrisma.foodLogEntryPhoto.findMany.mockResolvedValue(
        Array.from({ length: 11 }, (_, i) => ({ photoId: 100 + i, sortOrder: i }))
      );

      // 11 attached + 2 new assets = 13 > 12
      await expect(
        foodLogService.attachImmichAssets(1, 10, 3, { assets: [asset('a'), asset('b')] })
      ).rejects.toMatchObject({ statusCode: 400 });

      // The important part: no stray photos were created in the gallery by a rejected request.
      expect(mockLinkBatch).not.toHaveBeenCalled();
    });

    it('FL-014: re-attaching an already-attached photo does not count against the cap', async () => {
      mockPrisma.photo.findMany
        .mockResolvedValueOnce([{ id: 111, immichAssetId: 'a', mediaType: 'image' }])
        .mockResolvedValueOnce([{ id: 111 }]);
      // 12 attached, one of which (111) is the asset being "added" again.
      mockPrisma.foodLogEntryPhoto.findMany.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({ photoId: 100 + i, sortOrder: i }))
      );
      mockPrisma.foodLogEntry.findUniqueOrThrow.mockResolvedValue(entryAfter([111]));

      await expect(
        foodLogService.attachImmichAssets(1, 10, 3, { assets: [asset('a')] })
      ).resolves.toBeDefined();
      expect(mockLinkBatch).not.toHaveBeenCalled();
    });

    it('FL-015: fails loudly when linking reports a failure, attaching nothing', async () => {
      mockPrisma.photo.findMany.mockResolvedValueOnce([]);
      mockLinkBatch.mockResolvedValue({ successful: 0, failed: 1, errors: ['boom'], photoIds: [] });

      await expect(
        foodLogService.attachImmichAssets(1, 10, 3, { assets: [asset('a')] })
      ).rejects.toMatchObject({ statusCode: 500 });
      expect(mockPrisma.foodLogEntryPhoto.createMany).not.toHaveBeenCalled();
    });

    it('FL-016: attaching by photo id only counts still images', async () => {
      mockPrisma.foodLogEntryPhoto.findMany.mockResolvedValue([]);
      mockPrisma.photo.count.mockResolvedValue(0); // the id exists but is a video -> filtered out
      await expect(foodLogService.attachPhotos(1, 10, 3, [9])).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.photo.count).toHaveBeenCalledWith({
        where: { id: { in: [9] }, tripId: 10, mediaType: 'image' },
      });
    });
  });
});
