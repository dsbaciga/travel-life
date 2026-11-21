/**
 * PhotoAutoLink Service Tests
 *
 * Test cases:
 * - PAL-001: Suggestions group unlinked photos under the activity they were taken during
 * - PAL-002: Photos already linked to an activity (from either end) are left out
 * - PAL-003: The summary counts photos without a time, unmatched photos and undated activities
 * - PAL-004: Suggestions come back in itinerary order with an evenly spread preview
 * - PAL-005: Immich photos preview through the proxied thumbnail URL
 * - PAL-006: All-day activities use the trip timezone, then the user's
 * - PAL-007: Access control - suggestions need view access, applying needs edit access
 * - PAL-008: Apply creates PHOTO to ACTIVITY links and reports duplicates as skipped
 * - PAL-009: Apply rejects photos or activities from another trip
 * - PAL-010: Apply does not double a link that exists from the activity's side
 */

const mockPrisma = {
  trip: { findUnique: jest.fn() },
  activity: { findMany: jest.fn(), count: jest.fn() },
  photo: { findMany: jest.fn(), count: jest.fn() },
  entityLink: { findMany: jest.fn(), createMany: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

const mockVerifyTripAccess = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTripAccess(...args),
}));

import photoAutoLinkService from '../photoAutoLink.service';
import { AppError } from '../../errors/errors';

const USER_ID = 1;
const TRIP_ID = 7;

const activityRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Colosseum tour',
  category: 'sightseeing',
  allDay: false,
  startTime: new Date('2026-06-10T09:00:00Z'),
  endTime: new Date('2026-06-10T11:00:00Z'),
  timezone: null,
  ...over,
});

const photoRow = (id: number, takenAt: string | null, over: Record<string, unknown> = {}) => ({
  id,
  takenAt: takenAt ? new Date(takenAt) : null,
  thumbnailPath: `/uploads/thumbnails/thumb-${id}.jpg`,
  localPath: `/uploads/photos/${id}.jpg`,
  source: 'local',
  immichAssetId: null,
  mediaType: 'image',
  caption: null,
  ...over,
});

describe('PhotoAutoLinkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTripAccess.mockResolvedValue({ isOwner: true, permissionLevel: 'admin' });
    mockPrisma.trip.findUnique.mockResolvedValue({ timezone: null });
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: null });
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.photo.findMany.mockResolvedValue([]);
    mockPrisma.entityLink.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma)
    );
  });

  describe('getActivitySuggestions', () => {
    it('PAL-001: groups unlinked photos under the activity they were taken during', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([activityRow()]);
      mockPrisma.photo.findMany.mockResolvedValue([
        photoRow(10, '2026-06-10T09:30:00Z'),
        photoRow(11, '2026-06-10T10:30:00Z'),
        photoRow(12, '2026-06-10T11:00:00Z'),
        photoRow(13, '2026-06-10T11:20:00Z'),
      ]);

      const result = await photoAutoLinkService.getActivitySuggestions(USER_ID, TRIP_ID);

      expect(result.suggestions).toHaveLength(1);
      const [suggestion] = result.suggestions;
      expect(suggestion.activity).toMatchObject({ id: 1, name: 'Colosseum tour' });
      expect(suggestion.photoIds).toEqual([10, 11, 12]);
      expect(suggestion.matchCounts).toEqual({ during: 3, same_day: 0 });
      expect(suggestion.firstTakenAt).toEqual(new Date('2026-06-10T09:30:00Z'));
      expect(suggestion.lastTakenAt).toEqual(new Date('2026-06-10T11:00:00Z'));
      expect(result.summary.matchedPhotos).toBe(3);
    });

    it('PAL-002: leaves out photos already linked to an activity from either end', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([activityRow()]);
      mockPrisma.photo.findMany.mockResolvedValue([
        photoRow(10, '2026-06-10T09:30:00Z'),
        photoRow(11, '2026-06-10T09:40:00Z'),
        photoRow(12, '2026-06-10T09:50:00Z'),
      ]);
      mockPrisma.entityLink.findMany.mockResolvedValue([
        { sourceType: 'PHOTO', sourceId: 10, targetId: 99 },
        { sourceType: 'ACTIVITY', sourceId: 1, targetId: 11 },
      ]);

      const result = await photoAutoLinkService.getActivitySuggestions(USER_ID, TRIP_ID);

      expect(result.suggestions[0].photoIds).toEqual([12]);
      expect(result.summary.alreadyLinkedPhotos).toBe(2);
    });

    it('PAL-003: counts what could not be matched', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([
        activityRow(),
        activityRow({ id: 2, name: 'Someday', startTime: null, endTime: null }),
      ]);
      mockPrisma.photo.findMany.mockResolvedValue([
        photoRow(10, null),
        photoRow(11, '2026-06-10T10:00:00Z'),
        photoRow(12, '2026-06-12T10:00:00Z'),
      ]);

      const result = await photoAutoLinkService.getActivitySuggestions(USER_ID, TRIP_ID);

      expect(result.summary).toEqual({
        totalPhotos: 3,
        matchedPhotos: 1,
        alreadyLinkedPhotos: 0,
        photosWithoutTime: 1,
        unmatchedPhotos: 1,
        activitiesWithoutTime: 1,
      });
    });

    it('PAL-004: orders suggestions by start time and spreads the preview', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([
        activityRow({
          id: 2,
          name: 'Dinner',
          startTime: new Date('2026-06-10T18:00:00Z'),
          endTime: new Date('2026-06-10T20:00:00Z'),
        }),
        activityRow(),
      ]);
      // 20 photos one minute apart during the tour, one at dinner
      const tourPhotos = Array.from({ length: 20 }, (_, i) =>
        photoRow(100 + i, `2026-06-10T09:${String(i).padStart(2, '0')}:00Z`)
      );
      mockPrisma.photo.findMany.mockResolvedValue([
        ...tourPhotos,
        photoRow(200, '2026-06-10T19:00:00Z'),
      ]);

      const result = await photoAutoLinkService.getActivitySuggestions(USER_ID, TRIP_ID);

      expect(result.suggestions.map((s) => s.activity.id)).toEqual([1, 2]);
      const preview = result.suggestions[0].previewPhotos;
      expect(preview).toHaveLength(8);
      expect(preview[0].id).toBe(100);
      expect(preview[7].id).toBe(119);
      expect(result.suggestions[0].photoIds).toHaveLength(20);
    });

    it('PAL-005: previews Immich photos through the proxied thumbnail', async () => {
      mockPrisma.activity.findMany.mockResolvedValue([activityRow()]);
      mockPrisma.photo.findMany.mockResolvedValue([
        photoRow(10, '2026-06-10T10:00:00Z', {
          source: 'immich',
          immichAssetId: 'asset-abc',
          thumbnailPath: null,
          localPath: null,
        }),
      ]);

      const result = await photoAutoLinkService.getActivitySuggestions(USER_ID, TRIP_ID);

      expect(result.suggestions[0].previewPhotos[0]).toMatchObject({
        id: 10,
        source: 'immich',
        thumbnailPath: '/api/immich/assets/asset-abc/thumbnail',
      });
    });

    it('PAL-006: buckets all-day activities on the trip zone, then the user zone', async () => {
      // An all-day activity on June 10 in Tokyo, with no zone of its own
      mockPrisma.activity.findMany.mockResolvedValue([
        activityRow({
          allDay: true,
          startTime: new Date('2026-06-09T15:00:00Z'),
          endTime: null,
        }),
      ]);
      // 08:00 on June 10 in Tokyo, but still June 9 in UTC
      mockPrisma.photo.findMany.mockResolvedValue([photoRow(10, '2026-06-09T23:00:00Z')]);

      mockPrisma.trip.findUnique.mockResolvedValue({ timezone: 'Asia/Tokyo' });
      const viaTrip = await photoAutoLinkService.getActivitySuggestions(USER_ID, TRIP_ID);
      expect(viaTrip.suggestions[0]?.matchCounts.same_day).toBe(1);

      mockPrisma.trip.findUnique.mockResolvedValue({ timezone: null });
      mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'Asia/Tokyo' });
      const viaUser = await photoAutoLinkService.getActivitySuggestions(USER_ID, TRIP_ID);
      expect(viaUser.suggestions[0]?.matchCounts.same_day).toBe(1);
    });

    it('PAL-007: needs view access to suggest and edit access to apply', async () => {
      await photoAutoLinkService.getActivitySuggestions(USER_ID, TRIP_ID);
      expect(mockVerifyTripAccess).toHaveBeenLastCalledWith(USER_ID, TRIP_ID, 'view');

      mockVerifyTripAccess.mockRejectedValue(new AppError('Trip not found or access denied', 404));
      await expect(
        photoAutoLinkService.applyActivityLinks(USER_ID, TRIP_ID, {
          links: [{ activityId: 1, photoIds: [10] }],
        })
      ).rejects.toThrow('Trip not found or access denied');
      expect(mockVerifyTripAccess).toHaveBeenLastCalledWith(USER_ID, TRIP_ID, 'edit');
      expect(mockPrisma.entityLink.createMany).not.toHaveBeenCalled();
    });
  });

  describe('applyActivityLinks', () => {
    it('PAL-008: creates PHOTO to ACTIVITY links and reports duplicates as skipped', async () => {
      mockPrisma.activity.count.mockResolvedValue(2);
      mockPrisma.photo.count.mockResolvedValue(3);
      // One of the three pairs already existed
      mockPrisma.entityLink.createMany.mockResolvedValue({ count: 2 });

      const result = await photoAutoLinkService.applyActivityLinks(USER_ID, TRIP_ID, {
        links: [
          { activityId: 1, photoIds: [10, 11, 11] },
          { activityId: 2, photoIds: [12] },
        ],
      });

      expect(result).toEqual({ created: 2, skipped: 1 });
      expect(mockPrisma.entityLink.createMany).toHaveBeenCalledWith({
        data: [
          { tripId: TRIP_ID, sourceType: 'PHOTO', sourceId: 10, targetType: 'ACTIVITY', targetId: 1, relationship: 'RELATED' },
          { tripId: TRIP_ID, sourceType: 'PHOTO', sourceId: 11, targetType: 'ACTIVITY', targetId: 1, relationship: 'RELATED' },
          { tripId: TRIP_ID, sourceType: 'PHOTO', sourceId: 12, targetType: 'ACTIVITY', targetId: 2, relationship: 'RELATED' },
        ],
        skipDuplicates: true,
      });
    });

    it('PAL-009: rejects ids from another trip', async () => {
      mockPrisma.activity.count.mockResolvedValue(1);
      mockPrisma.photo.count.mockResolvedValue(1);

      await expect(
        photoAutoLinkService.applyActivityLinks(USER_ID, TRIP_ID, {
          links: [{ activityId: 1, photoIds: [10, 11] }],
        })
      ).rejects.toThrow('Some photos do not belong to this trip');

      mockPrisma.activity.count.mockResolvedValue(0);
      await expect(
        photoAutoLinkService.applyActivityLinks(USER_ID, TRIP_ID, {
          links: [{ activityId: 1, photoIds: [10] }],
        })
      ).rejects.toThrow('Some activities do not belong to this trip');

      expect(mockPrisma.activity.count).toHaveBeenCalledWith({
        where: { id: { in: [1] }, tripId: TRIP_ID },
      });
      expect(mockPrisma.entityLink.createMany).not.toHaveBeenCalled();
    });

    it('PAL-010: does not double a link made from the activity side', async () => {
      mockPrisma.activity.count.mockResolvedValue(1);
      mockPrisma.photo.count.mockResolvedValue(2);
      mockPrisma.entityLink.findMany.mockResolvedValue([{ sourceId: 1, targetId: 10 }]);
      mockPrisma.entityLink.createMany.mockResolvedValue({ count: 1 });

      const result = await photoAutoLinkService.applyActivityLinks(USER_ID, TRIP_ID, {
        links: [{ activityId: 1, photoIds: [10, 11] }],
      });

      expect(result).toEqual({ created: 1, skipped: 1 });
      const { data } = mockPrisma.entityLink.createMany.mock.calls[0][0];
      expect(data.map((row: { sourceId: number }) => row.sourceId)).toEqual([11]);
    });
  });
});
