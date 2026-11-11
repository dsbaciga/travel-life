import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyEntityInTrip, verifyTripAccessWithPermission } from './_shared/tripAccess';
import photoService from './photo.service';
import { MediaType } from '../types/photo.types';
import {
  CreateFoodLogEntryInput,
  UpdateFoodLogEntryInput,
  FoodLogSearchFilters,
  AttachFoodLogImmichInput,
} from '../types/foodLog.types';

const MAX_SEARCH_RESULTS = 200;
const MAX_PHOTOS_PER_ENTRY = 12;

/** Photo fields a client needs to render a thumbnail. */
const photoSelect = {
  id: true,
  source: true,
  mediaType: true,
  immichAssetId: true,
  localPath: true,
  thumbnailPath: true,
  caption: true,
} as const;

/** Include clause that returns an entry's photos in display order. */
const photosInclude = {
  photos: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    select: { photo: { select: photoSelect } },
  },
};

/** Flattens the join rows so clients receive `photos: Photo[]` directly. */
function flattenPhotos<T extends { photos: Array<{ photo: unknown }> }>(entry: T) {
  return { ...entry, photos: entry.photos.map((link) => link.photo) };
}

async function findInTrip(entryId: number, tripId: number) {
  const entry = await prisma.foodLogEntry.findFirst({ where: { id: entryId, tripId } });
  if (!entry) {
    throw new AppError('Food log entry not found or does not belong to trip', 404);
  }
  return entry;
}

async function verifyLinks(
  tripId: number,
  links: { activityId?: number | null; locationId?: number | null }
) {
  if (links.activityId) await verifyEntityInTrip('activity', links.activityId, tripId);
  if (links.locationId) await verifyEntityInTrip('location', links.locationId, tripId);
}

class FoodLogService {
  async createEntry(userId: number, tripId: number, data: CreateFoodLogEntryInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await verifyLinks(tripId, data);

    const created = await prisma.foodLogEntry.create({
      include: photosInclude,
      data: {
        tripId,
        restaurantName: data.restaurantName,
        dish: data.dish,
        rating: data.rating,
        notes: data.notes ?? null,
        orderAgain: data.orderAgain ?? false,
        activityId: data.activityId ?? null,
        locationId: data.locationId ?? null,
      },
    });
    return flattenPhotos(created);
  }

  async getEntriesByTrip(userId: number, tripId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');
    const entries = await prisma.foodLogEntry.findMany({
      where: { tripId },
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      include: photosInclude,
    });
    return entries.map(flattenPhotos);
  }

  async updateEntry(
    userId: number,
    tripId: number,
    entryId: number,
    data: UpdateFoodLogEntryInput
  ) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(entryId, tripId);
    await verifyLinks(tripId, data);

    const updated = await prisma.foodLogEntry.update({
      where: { id: entryId },
      include: photosInclude,
      data: {
        ...(data.restaurantName !== undefined && { restaurantName: data.restaurantName }),
        ...(data.dish !== undefined && { dish: data.dish }),
        ...(data.rating !== undefined && { rating: data.rating }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.orderAgain !== undefined && { orderAgain: data.orderAgain }),
        ...(data.activityId !== undefined && { activityId: data.activityId }),
        ...(data.locationId !== undefined && { locationId: data.locationId }),
      },
    });
    return flattenPhotos(updated);
  }

  /**
   * Attaches existing trip photos to an entry. Photos must belong to the same trip;
   * photos already attached are ignored, and the entry is capped at
   * MAX_PHOTOS_PER_ENTRY so one dish cannot become a gallery.
   */
  async attachPhotos(userId: number, tripId: number, entryId: number, photoIds: number[]) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(entryId, tripId);

    const uniqueIds = [...new Set(photoIds)];
    // Only still images belong on a food log entry; a video id counts as "not found".
    const found = await prisma.photo.count({
      where: { id: { in: uniqueIds }, tripId, mediaType: MediaType.IMAGE },
    });
    if (found !== uniqueIds.length) {
      throw new AppError('One or more photos were not found in this trip, or are not images', 404);
    }

    const existing = await prisma.foodLogEntryPhoto.findMany({
      where: { entryId },
      select: { photoId: true, sortOrder: true },
    });
    const have = new Set(existing.map((e) => e.photoId));
    const toAdd = uniqueIds.filter((id) => !have.has(id));
    if (existing.length + toAdd.length > MAX_PHOTOS_PER_ENTRY) {
      throw new AppError(`An entry can have at most ${MAX_PHOTOS_PER_ENTRY} photos`, 400);
    }

    const nextOrder = existing.reduce((max, e) => Math.max(max, e.sortOrder), -1) + 1;
    if (toAdd.length > 0) {
      await prisma.foodLogEntryPhoto.createMany({
        data: toAdd.map((photoId, i) => ({ entryId, photoId, sortOrder: nextOrder + i })),
        skipDuplicates: true,
      });
    }

    const entry = await prisma.foodLogEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: photosInclude,
    });
    return flattenPhotos(entry);
  }

  /**
   * Attaches Immich photos to an entry. Each asset is resolved to a trip photo first:
   * an asset already linked to the trip reuses its photo row, a new one is linked
   * (and so also appears in the trip gallery). Resolution is server-side because the
   * public link endpoints either 409 or silently skip an already-linked asset, and
   * neither tells the caller which photo row it maps to.
   *
   * The per-entry cap is checked BEFORE anything is linked, so a rejected request
   * does not leave stray photos in the gallery.
   */
  async attachImmichAssets(
    userId: number,
    tripId: number,
    entryId: number,
    input: AttachFoodLogImmichInput
  ) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(entryId, tripId);

    const byAsset = new Map(input.assets.map((a) => [a.immichAssetId, a]));
    const assetIds = [...byAsset.keys()];

    const existing = await prisma.photo.findMany({
      where: { tripId, immichAssetId: { in: assetIds } },
      select: { id: true, immichAssetId: true, mediaType: true },
    });
    if (existing.some((p) => p.mediaType !== MediaType.IMAGE)) {
      throw new AppError('Only photos can be attached to a food log entry, not videos', 400);
    }

    const linkedAssetIds = new Set(existing.map((p) => p.immichAssetId));
    const missing = assetIds.filter((id) => !linkedAssetIds.has(id));

    const attached = await prisma.foodLogEntryPhoto.findMany({
      where: { entryId },
      select: { photoId: true },
    });
    const attachedIds = new Set(attached.map((a) => a.photoId));
    const newlyAttached = missing.length + existing.filter((p) => !attachedIds.has(p.id)).length;
    if (attached.length + newlyAttached > MAX_PHOTOS_PER_ENTRY) {
      throw new AppError(`An entry can have at most ${MAX_PHOTOS_PER_ENTRY} photos`, 400);
    }

    if (missing.length > 0) {
      const result = await photoService.linkImmichPhotosBatch(userId, {
        tripId,
        assets: missing.map((id) => {
          const a = byAsset.get(id)!;
          return {
            immichAssetId: id,
            mediaType: MediaType.IMAGE,
            takenAt: a.takenAt,
            latitude: a.latitude,
            longitude: a.longitude,
          };
        }),
      });
      if (result.failed > 0) {
        throw new AppError('Could not link one or more Immich photos to this trip', 500);
      }
    }

    const resolved = await prisma.photo.findMany({
      where: { tripId, immichAssetId: { in: assetIds }, mediaType: MediaType.IMAGE },
      select: { id: true },
    });
    return this.attachPhotos(
      userId,
      tripId,
      entryId,
      resolved.map((p) => p.id)
    );
  }

  /** Detaches a photo from an entry. The photo itself stays in the trip gallery. */
  async removePhoto(userId: number, tripId: number, entryId: number, photoId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(entryId, tripId);
    await prisma.foodLogEntryPhoto.deleteMany({ where: { entryId, photoId } });
    return { entryId, photoId };
  }

  async deleteEntry(userId: number, tripId: number, entryId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(entryId, tripId);
    await prisma.foodLogEntry.delete({ where: { id: entryId } });
    return { id: entryId };
  }

  /**
   * "Best meals" across every trip the user owns or collaborates on, best first.
   * Cancelled trips are excluded.
   */
  async searchEntries(userId: number, filters: FoodLogSearchFilters) {
    const q = filters.q?.trim();
    const entries = await prisma.foodLogEntry.findMany({
      where: {
        trip: {
          status: { notIn: ['cancelled', 'Cancelled'] },
          OR: [{ userId }, { collaborators: { some: { userId } } }],
        },
        ...(filters.minRating !== undefined && { rating: { gte: filters.minRating } }),
        ...(filters.orderAgain !== undefined && { orderAgain: filters.orderAgain }),
        ...(q && {
          OR: [
            { dish: { contains: q, mode: 'insensitive' as const } },
            { restaurantName: { contains: q, mode: 'insensitive' as const } },
            { notes: { contains: q, mode: 'insensitive' as const } },
          ],
        }),
      },
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: MAX_SEARCH_RESULTS,
      include: {
        ...photosInclude,
        trip: { select: { id: true, title: true, timezone: true } },
      },
    });
    return entries.map(flattenPhotos);
  }
}

export const foodLogService = new FoodLogService();
export default foodLogService;
