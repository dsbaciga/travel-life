import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { getUserTimezone, resolveTimezone } from './_shared/timezoneResolution';
import {
  matchPhotosToActivities,
  type PhotoMatchKind,
} from './_shared/photoActivityMatch';
import type {
  ApplyPhotoActivityLinksInput,
  ApplyPhotoActivityLinksResult,
  PhotoActivitySuggestion,
  PhotoActivitySuggestionPreviewPhoto,
  PhotoActivitySuggestionsResponse,
} from '../types/photoAutoLink.types';

/** Thumbnails per suggestion in the review dialog. */
const PREVIEW_PHOTO_LIMIT = 8;

interface SuggestionPhotoRow {
  id: number;
  takenAt: Date | null;
  thumbnailPath: string | null;
  localPath: string | null;
  source: string;
  immichAssetId: string | null;
  mediaType: string;
  caption: string | null;
}

/**
 * A sample spread evenly across the matched photos, so the strip shows the
 * whole activity rather than its first few seconds.
 */
function pickPreviewPhotos(photos: SuggestionPhotoRow[]): PhotoActivitySuggestionPreviewPhoto[] {
  const sample =
    photos.length <= PREVIEW_PHOTO_LIMIT
      ? photos
      : Array.from(
          { length: PREVIEW_PHOTO_LIMIT },
          (_, i) => photos[Math.round((i * (photos.length - 1)) / (PREVIEW_PHOTO_LIMIT - 1))]
        );

  return sample.map((photo) => ({
    id: photo.id,
    // Immich assets are proxied through our API, exactly as the photo endpoints do.
    thumbnailPath:
      photo.source === 'immich' && photo.immichAssetId
        ? `/api/immich/assets/${photo.immichAssetId}/thumbnail`
        : photo.thumbnailPath ?? photo.localPath,
    source: photo.source,
    mediaType: photo.mediaType,
    caption: photo.caption,
  }));
}

/**
 * Loads a trip's photos and activities and matches the photos that are not
 * linked to an activity yet. Shared by the reviewed flow and the backfill, so
 * both link exactly the same pairs.
 *
 * No access check: callers verify permission (or are the operator script).
 *
 * @param timezoneUserId - Whose timezone ends the fallback chain for all-day
 *   activities: the requesting user for the reviewed flow, the trip owner for the backfill
 */
async function loadTripMatches(tripId: number, timezoneUserId: number) {
  const [trip, activities, photos, existingLinks] = await Promise.all([
    prisma.trip.findUnique({ where: { id: tripId }, select: { timezone: true } }),
    prisma.activity.findMany({
      where: { tripId },
      select: {
        id: true,
        name: true,
        category: true,
        allDay: true,
        startTime: true,
        endTime: true,
        timezone: true,
      },
    }),
    prisma.photo.findMany({
      where: { tripId },
      select: {
        id: true,
        takenAt: true,
        thumbnailPath: true,
        localPath: true,
        source: true,
        immichAssetId: true,
        mediaType: true,
        caption: true,
      },
      orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
    }),
    // A link may have been created from either end.
    prisma.entityLink.findMany({
      where: {
        tripId,
        OR: [
          { sourceType: 'PHOTO', targetType: 'ACTIVITY' },
          { sourceType: 'ACTIVITY', targetType: 'PHOTO' },
        ],
      },
      select: { sourceType: true, sourceId: true, targetId: true },
    }),
  ]);

  const linkedPhotoIds = new Set(
    existingLinks.map((link) => (link.sourceType === 'PHOTO' ? link.sourceId : link.targetId))
  );

  const candidates = photos.filter((photo) => !linkedPhotoIds.has(photo.id));
  const datedCandidates = candidates.filter((photo) => photo.takenAt);

  // All-day activities are calendar dates on somebody's clock: the activity's
  // own zone first, then the trip's, then the given user's.
  const fallbackTimezone = resolveTimezone(trip?.timezone, await getUserTimezone(timezoneUserId));
  const matches = matchPhotosToActivities(datedCandidates, activities, fallbackTimezone);

  return { activities, photos, candidates, datedCandidates, matches };
}

export interface PhotoActivityBackfillResult {
  totalPhotos: number;
  /** Photos that fit an activity and were (or, on a dry run, would be) linked. */
  matchedPhotos: number;
  /** Links actually written; 0 on a dry run. */
  created: number;
  alreadyLinkedPhotos: number;
  photosWithoutTime: number;
  unmatchedPhotos: number;
}

/**
 * Links every matching photo of one trip to its activity, with no review step.
 *
 * FOR THE OPERATOR SCRIPT ONLY (`src/scripts/backfillPhotoActivityLinks.ts`):
 * there is deliberately no user and no permission check, so this must never be
 * reachable from a route. Requests go through the reviewed
 * `getActivitySuggestions` / `applyActivityLinks` pair instead.
 *
 * Safe to re-run: a photo that already has an activity link (including one this
 * created earlier) is skipped, so a second run adds nothing.
 *
 * @param ownerUserId - The trip owner, whose timezone is the last fallback for
 *   all-day activities
 */
export async function backfillTripPhotoActivityLinks(
  tripId: number,
  ownerUserId: number,
  options: { dryRun?: boolean } = {}
): Promise<PhotoActivityBackfillResult> {
  const { photos, candidates, datedCandidates, matches } = await loadTripMatches(
    tripId,
    ownerUserId
  );

  let created = 0;
  if (!options.dryRun && matches.length > 0) {
    const result = await prisma.entityLink.createMany({
      data: matches.map((match) => ({
        tripId,
        sourceType: 'PHOTO' as const,
        sourceId: match.photoId,
        targetType: 'ACTIVITY' as const,
        targetId: match.activityId,
        relationship: 'RELATED' as const,
      })),
      skipDuplicates: true,
    });
    created = result.count;
  }

  return {
    totalPhotos: photos.length,
    matchedPhotos: matches.length,
    created,
    alreadyLinkedPhotos: photos.length - candidates.length,
    photosWithoutTime: candidates.length - datedCandidates.length,
    unmatchedPhotos: datedCandidates.length - matches.length,
  };
}

/**
 * Auto-linking photos to activities by when they were taken.
 *
 * Two steps, so nothing is linked without the user seeing it first: the client
 * fetches suggestions, the user unticks what is wrong, and only the remainder is
 * applied. Links are ordinary PHOTO → ACTIVITY entity links, the same rows the
 * manual "link photo" flow creates.
 */
class PhotoAutoLinkService {
  /**
   * Suggests an activity for each photo that is not linked to one yet.
   *
   * Photos already linked to any activity are left out entirely: a link the user
   * made by hand is a better answer than a guess from the clock, and offering a
   * second activity for the same photo would only add noise.
   *
   * @returns Suggestions in itinerary order, plus counts explaining what was skipped
   */
  async getActivitySuggestions(
    userId: number,
    tripId: number
  ): Promise<PhotoActivitySuggestionsResponse> {
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const { activities, photos, candidates, datedCandidates, matches } = await loadTripMatches(
      tripId,
      userId
    );

    const photoById = new Map(candidates.map((photo) => [photo.id, photo]));
    const grouped = new Map<number, { photos: SuggestionPhotoRow[]; counts: Record<PhotoMatchKind, number> }>();
    for (const match of matches) {
      const photo = photoById.get(match.photoId);
      if (!photo) continue;
      let group = grouped.get(match.activityId);
      if (!group) {
        group = { photos: [], counts: { during: 0, same_day: 0 } };
        grouped.set(match.activityId, group);
      }
      group.photos.push(photo);
      group.counts[match.kind]++;
    }

    const suggestions: PhotoActivitySuggestion[] = [];
    for (const activity of activities) {
      const group = grouped.get(activity.id);
      if (!group) continue;
      // Photos were fetched oldest first and matches keep that order.
      const first = group.photos[0].takenAt as Date;
      const last = group.photos[group.photos.length - 1].takenAt as Date;
      suggestions.push({
        activity,
        photoIds: group.photos.map((photo) => photo.id),
        previewPhotos: pickPreviewPhotos(group.photos),
        matchCounts: group.counts,
        firstTakenAt: first,
        lastTakenAt: last,
      });
    }
    suggestions.sort(
      (a, b) =>
        (a.activity.startTime?.getTime() ?? 0) - (b.activity.startTime?.getTime() ?? 0) ||
        a.activity.id - b.activity.id
    );

    return {
      suggestions,
      summary: {
        totalPhotos: photos.length,
        matchedPhotos: matches.length,
        alreadyLinkedPhotos: photos.length - candidates.length,
        photosWithoutTime: candidates.length - datedCandidates.length,
        unmatchedPhotos: datedCandidates.length - matches.length,
        activitiesWithoutTime: activities.filter((activity) => !activity.startTime).length,
      },
    };
  }

  /**
   * Links the photos the user kept to their activities.
   *
   * The pairs come from the client rather than being recomputed, because the
   * user may have unticked some: what gets linked is exactly what was reviewed.
   * Every id is checked against the trip, and pairs that are already linked are
   * skipped, so applying the same set twice is harmless.
   */
  async applyActivityLinks(
    userId: number,
    tripId: number,
    data: ApplyPhotoActivityLinksInput
  ): Promise<ApplyPhotoActivityLinksResult> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const pairs = new Map<string, { photoId: number; activityId: number }>();
    for (const link of data.links) {
      for (const photoId of link.photoIds) {
        pairs.set(`${photoId}:${link.activityId}`, { photoId, activityId: link.activityId });
      }
    }
    const requested = [...pairs.values()];
    const activityIds = [...new Set(requested.map((pair) => pair.activityId))];
    const photoIds = [...new Set(requested.map((pair) => pair.photoId))];

    // Entity links are polymorphic with no foreign keys, so nothing but this
    // check stops a link pointing into another trip.
    const [activityCount, photoCount] = await Promise.all([
      prisma.activity.count({ where: { id: { in: activityIds }, tripId } }),
      prisma.photo.count({ where: { id: { in: photoIds }, tripId } }),
    ]);
    if (activityCount !== activityIds.length) {
      throw new AppError("Some of those activities aren't on this trip.", 400);
    }
    if (photoCount !== photoIds.length) {
      throw new AppError("Some of those photos aren't on this trip.", 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      // The unique index only covers PHOTO → ACTIVITY; a link made from the
      // activity's side is the same association and must not be doubled.
      const reversed = await tx.entityLink.findMany({
        where: {
          tripId,
          sourceType: 'ACTIVITY',
          sourceId: { in: activityIds },
          targetType: 'PHOTO',
          targetId: { in: photoIds },
        },
        select: { sourceId: true, targetId: true },
      });
      const reversedKeys = new Set(reversed.map((link) => `${link.targetId}:${link.sourceId}`));
      const toCreate = requested.filter(
        (pair) => !reversedKeys.has(`${pair.photoId}:${pair.activityId}`)
      );
      if (toCreate.length === 0) return 0;

      const result = await tx.entityLink.createMany({
        data: toCreate.map((pair) => ({
          tripId,
          sourceType: 'PHOTO' as const,
          sourceId: pair.photoId,
          targetType: 'ACTIVITY' as const,
          targetId: pair.activityId,
          // The default relationship for a photo and an activity.
          relationship: 'RELATED' as const,
        })),
        skipDuplicates: true,
      });
      return result.count;
    });

    return { created, skipped: requested.length - created };
  }
}

export default new PhotoAutoLinkService();
