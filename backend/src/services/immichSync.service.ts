import { fromZonedTime } from 'date-fns-tz';
import prisma from '../config/database';
import { AppError } from '../errors/errors';
import immichService, { ImmichAssetFilters, ImmichAssetView } from './immich.service';
import photoService from './photo.service';
import { verifyTripAccessWithPermission, verifyEntityAccessWithPermission } from './_shared/tripAccess';
import { getUserTimezone, resolveTimezone } from './_shared/timezoneResolution';
import { LinkImmichPhotoBatchInput, MediaType, PhotoSource } from '../types/photo.types';
import { ImmichFiltersInput } from '../types/immich.types';

/**
 * Immich features that sit on top of the plain browse/link primitives:
 * filtered browsing with "already linked" marks, bulk import of everything a
 * filter matches, linking a trip album to an Immich album (pull sync), and the
 * opt-in export of a trip album to Immich.
 *
 * Every Immich call uses the signed-in user's stored credentials and goes
 * through ImmichService (timeouts, validated responses, no redirects).
 */

/** Most assets one bulk import will link, however many match. */
export const BULK_LINK_CAP = 5000;
/** Assets fetched and linked per request during a bulk import (progress granularity). */
export const BULK_LINK_PAGE_SIZE = 200;
/** Most assets one album sync will read from an Immich album. */
export const ALBUM_SYNC_CAP = 5000;

type LinkerAsset = LinkImmichPhotoBatchInput['assets'][number];

export interface BrowsedAsset extends ImmichAssetView {
  /** True when this asset is already a photo on the requested trip. */
  alreadyLinked?: boolean;
}

export interface BulkPreview {
  /** Assets that will be considered (never more than `cap`). */
  matching: number;
  alreadyLinked: number;
  toLink: number;
  /** More assets match the filter than `cap`; only the newest `cap` are imported. */
  capped: boolean;
  cap: number;
  pageSize: number;
  /** Number of link requests the client should make. */
  pages: number;
}

export interface BulkLinkPageResult {
  linked: number;
  alreadyLinked: number;
  failed: number;
  errors: string[];
  /** Next page to request, or null when the import is finished. */
  nextPage: number | null;
}

export interface AlbumSyncResult {
  immichAlbumName: string;
  immichAssetCount: number;
  /** Trip photos created by this sync. */
  newlyLinked: number;
  /** Photos added to the trip album by this sync (new or previously unsorted). */
  addedToAlbum: number;
  alreadyInAlbum: number;
  failed: number;
  errors: string[];
  /**
   * Photos in the trip album that came from Immich but are no longer in the
   * Immich album. They are left untouched. Null when the Immich album was
   * larger than the sync cap, because the comparison would be incomplete.
   */
  notInImmichAlbum: number | null;
  capped: boolean;
  syncedAt: string;
}

export interface AlbumExportPreview {
  albumName: string;
  immichAssetCount: number;
  /** Uploaded (non-Immich) photos, which are skipped and never uploaded. */
  skippedUploaded: number;
  linkedImmichAlbumId: string | null;
  /** True when a new Immich album would be created. */
  willCreate: boolean;
}

export interface AlbumExportResult {
  immichAlbumId: string;
  created: boolean;
  added: number;
  alreadyInAlbum: number;
  failed: Array<{ id: string; error: string }>;
  skippedUploaded: number;
}

interface PhotoAlbumRow {
  id: number;
  tripId: number;
  name: string;
  description: string | null;
  immichAlbumId: string | null;
  immichAlbumSyncedAt: Date | null;
}

/** "HH:MM:SS(.fff)" or plain seconds to whole seconds; null when unknown or zero. */
export function parseImmichDuration(duration: string | number | null | undefined): number | null {
  if (duration === null || duration === undefined || duration === '') return null;
  if (typeof duration === 'number') {
    return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
  }
  const parts = duration.split(':');
  if (parts.length > 3) return null;
  let seconds = 0;
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isFinite(value) || value < 0) return null;
    seconds = seconds * 60 + value;
  }
  const rounded = Math.round(seconds);
  return rounded > 0 ? rounded : null;
}

function validCoordinate(value: number | null | undefined, limit: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : undefined;
}

/** Map an Immich asset to what the batch linker stores, validating what Immich says. */
export function toLinkerAsset(asset: ImmichAssetView): LinkerAsset {
  const isVideo = asset.type === 'VIDEO';
  const takenCandidate = asset.exifInfo?.dateTimeOriginal ?? asset.fileCreatedAt ?? undefined;
  const takenAt =
    takenCandidate && !Number.isNaN(Date.parse(takenCandidate)) ? new Date(takenCandidate).toISOString() : undefined;
  const duration = isVideo ? parseImmichDuration(asset.duration) : null;
  return {
    immichAssetId: asset.id,
    mediaType: isVideo ? MediaType.VIDEO : MediaType.IMAGE,
    duration,
    takenAt,
    latitude: validCoordinate(asset.exifInfo?.latitude, 90),
    longitude: validCoordinate(asset.exifInfo?.longitude, 180),
  };
}

/**
 * The instants bounding whole local calendar days. `dateFrom`/`dateTo` are
 * date-only values (a trip's start/end); they are read in `timezone`, so a trip
 * ending on the 10th includes a photo taken at 23:30 local time on the 10th
 * even when that is already the 11th in UTC.
 */
export function dayRangeToInstants(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  timezone: string
): { takenAfter?: string; takenBefore?: string } {
  const result: { takenAfter?: string; takenBefore?: string } = {};
  if (dateFrom) result.takenAfter = fromZonedTime(`${dateFrom}T00:00:00.000`, timezone).toISOString();
  if (dateTo) result.takenBefore = fromZonedTime(`${dateTo}T23:59:59.999`, timezone).toISOString();
  return result;
}

class ImmichSyncService {
  private async resolveFilters(userId: number, filters: ImmichFiltersInput): Promise<ImmichAssetFilters> {
    const needsZone = Boolean(filters.dateFrom || filters.dateTo);
    const timezone = needsZone ? resolveTimezone(filters.timezone, await getUserTimezone(userId)) : 'UTC';
    return {
      ...dayRangeToInstants(filters.dateFrom, filters.dateTo, timezone),
      isFavorite: filters.isFavorite,
      type: filters.type,
      albumId: filters.albumId,
      text: filters.text,
    };
  }

  private async linkedAssetIds(tripId: number, assetIds: string[]): Promise<Set<string>> {
    if (assetIds.length === 0) return new Set();
    const rows = await prisma.photo.findMany({
      where: { tripId, immichAssetId: { in: assetIds } },
      select: { immichAssetId: true },
    });
    return new Set(rows.map((r) => r.immichAssetId).filter((id): id is string => id !== null));
  }

  /** One server-side filtered page of the library, with already-linked assets flagged. */
  async browse(
    userId: number,
    filters: ImmichFiltersInput,
    page: number,
    size: number,
    tripId?: number
  ): Promise<{ assets: BrowsedAsset[]; hasMore: boolean; page: number }> {
    if (tripId !== undefined) await verifyTripAccessWithPermission(userId, tripId, 'view');
    const { apiUrl, apiKey } = await immichService.getUserSettings(userId);
    const resolved = await this.resolveFilters(userId, filters);
    const result = await immichService.searchAssetsPage(apiUrl, apiKey, resolved, page, size);

    let assets: BrowsedAsset[] = result.assets;
    if (tripId !== undefined) {
      const linked = await this.linkedAssetIds(
        tripId,
        result.assets.map((a) => a.id)
      );
      assets = result.assets.map((a) => ({ ...a, alreadyLinked: linked.has(a.id) }));
    }
    return { assets, hasMore: result.nextPage !== null, page };
  }

  /** What "link everything matching" would do, so the user can confirm the count. */
  async previewBulkLink(userId: number, tripId: number, filters: ImmichFiltersInput): Promise<BulkPreview> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const { apiUrl, apiKey } = await immichService.getUserSettings(userId);
    const resolved = await this.resolveFilters(userId, filters);
    const { assets, capped } = await immichService.collectAssets(apiUrl, apiKey, resolved, BULK_LINK_CAP);
    const linked = await this.linkedAssetIds(
      tripId,
      assets.map((a) => a.id)
    );
    const alreadyLinked = assets.filter((a) => linked.has(a.id)).length;
    return {
      matching: assets.length,
      alreadyLinked,
      toLink: assets.length - alreadyLinked,
      capped,
      cap: BULK_LINK_CAP,
      pageSize: BULK_LINK_PAGE_SIZE,
      pages: Math.max(1, Math.ceil(assets.length / BULK_LINK_PAGE_SIZE)),
    };
  }

  /**
   * Link one page of a filter's matches through the existing batch linker.
   * The client calls this page by page (that is what gives it progress). Assets
   * are re-read from Immich here, never taken from the client, and re-running
   * is harmless: the linker skips assets the trip already has.
   */
  async linkBulkPage(
    userId: number,
    tripId: number,
    filters: ImmichFiltersInput,
    page: number
  ): Promise<BulkLinkPageResult> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const offset = (page - 1) * BULK_LINK_PAGE_SIZE;
    if (offset >= BULK_LINK_CAP) {
      return { linked: 0, alreadyLinked: 0, failed: 0, errors: [], nextPage: null };
    }
    const { apiUrl, apiKey } = await immichService.getUserSettings(userId);
    const resolved = await this.resolveFilters(userId, filters);
    const result = await immichService.searchAssetsPage(apiUrl, apiKey, resolved, page, BULK_LINK_PAGE_SIZE);

    const remainingCap = BULK_LINK_CAP - offset;
    const assets = result.assets.slice(0, remainingCap);
    const reachedCap = result.assets.length > remainingCap || offset + assets.length >= BULK_LINK_CAP;
    const nextPage = result.nextPage !== null && !reachedCap ? result.nextPage : null;

    if (assets.length === 0) {
      return { linked: 0, alreadyLinked: 0, failed: 0, errors: [], nextPage };
    }

    const linkResult = await photoService.linkImmichPhotosBatch(userId, {
      tripId,
      assets: assets.map(toLinkerAsset),
    });
    // The linker reports `total` as the number it actually tried to create.
    const alreadyLinked = Math.max(0, assets.length - linkResult.total);
    return {
      linked: linkResult.successful,
      alreadyLinked,
      failed: linkResult.failed,
      errors: linkResult.errors,
      nextPage,
    };
  }

  private async loadAlbum(userId: number, albumId: number): Promise<PhotoAlbumRow> {
    const { entity } = await verifyEntityAccessWithPermission<PhotoAlbumRow>('photoAlbum', albumId, userId, 'edit');
    return entity;
  }

  /** Link a trip album to an Immich album (or unlink with null). Reads Immich only. */
  async setAlbumLink(userId: number, albumId: number, immichAlbumId: string | null) {
    const album = await this.loadAlbum(userId, albumId);
    if (immichAlbumId !== null) {
      const { apiUrl, apiKey } = await immichService.getUserSettings(userId);
      // Confirms the album exists and this key can read it, before storing the id.
      await immichService.getAlbumDetail(apiUrl, apiKey, immichAlbumId, { withoutAssets: true });
    }
    const updated = await prisma.photoAlbum.update({
      where: { id: album.id },
      data: {
        immichAlbumId,
        // A different album starts from scratch; unlinking clears the history too.
        immichAlbumSyncedAt: null,
      },
      select: { id: true, immichAlbumId: true, immichAlbumSyncedAt: true },
    });
    return updated;
  }

  /**
   * Pull assets from the linked Immich album into the trip album.
   *
   * What is "new" is decided by comparing ids, not timestamps: Immich does not
   * say when an asset joined an album, and a diff also repairs a sync that was
   * interrupted half way. Assets removed from the Immich album are NOT removed
   * from the trip: a trip photo is the user's data, and it may also have been
   * added by hand. They are only counted in `notInImmichAlbum`.
   */
  async syncAlbum(userId: number, albumId: number): Promise<AlbumSyncResult> {
    const album = await this.loadAlbum(userId, albumId);
    if (!album.immichAlbumId) {
      throw new AppError('This album is not linked to an Immich album', 400);
    }
    const { apiUrl, apiKey } = await immichService.getUserSettings(userId);
    const detail = await immichService.getAlbumDetail(apiUrl, apiKey, album.immichAlbumId);

    const capped = detail.assets.length > ALBUM_SYNC_CAP;
    const assets = detail.assets.slice(0, ALBUM_SYNC_CAP);
    const ids = assets.map((a) => a.id);

    const alreadyOnTrip = await this.linkedAssetIds(album.tripId, ids);
    const toLink = assets.filter((a) => !alreadyOnTrip.has(a.id));

    let newlyLinked = 0;
    let failed = 0;
    let errors: string[] = [];
    if (toLink.length > 0) {
      const linkResult = await photoService.linkImmichPhotosBatch(userId, {
        tripId: album.tripId,
        assets: toLink.map(toLinkerAsset),
      });
      newlyLinked = linkResult.successful;
      failed = linkResult.failed;
      errors = linkResult.errors;
    }

    const photos = await prisma.photo.findMany({
      where: { tripId: album.tripId, immichAssetId: { in: ids } },
      select: { id: true },
    });
    const assigned = await prisma.photoAlbumAssignment.createMany({
      data: photos.map((p) => ({ albumId: album.id, photoId: p.id })),
      skipDuplicates: true,
    });

    let notInImmichAlbum: number | null = null;
    if (!capped) {
      notInImmichAlbum = await prisma.photoAlbumAssignment.count({
        where: {
          albumId: album.id,
          photo: { source: PhotoSource.IMMICH, immichAssetId: { not: null, notIn: ids } },
        },
      });
    }

    const syncedAt = new Date();
    await prisma.photoAlbum.update({ where: { id: album.id }, data: { immichAlbumSyncedAt: syncedAt } });

    return {
      immichAlbumName: detail.albumName,
      immichAssetCount: detail.assets.length,
      newlyLinked,
      addedToAlbum: assigned.count,
      alreadyInAlbum: photos.length - assigned.count,
      failed,
      errors,
      notInImmichAlbum,
      capped,
      syncedAt: syncedAt.toISOString(),
    };
  }

  private async exportableAssets(albumId: number): Promise<{ assetIds: string[]; skippedUploaded: number }> {
    const assignments = await prisma.photoAlbumAssignment.findMany({
      where: { albumId },
      select: { photo: { select: { source: true, immichAssetId: true } } },
    });
    const assetIds = new Set<string>();
    let skippedUploaded = 0;
    for (const { photo } of assignments) {
      if (photo.source === PhotoSource.IMMICH && photo.immichAssetId) {
        assetIds.add(photo.immichAssetId);
      } else {
        skippedUploaded += 1;
      }
    }
    return { assetIds: [...assetIds], skippedUploaded };
  }

  /** What an export would write, shown to the user before they confirm. Reads only our own database. */
  async previewExport(userId: number, albumId: number): Promise<AlbumExportPreview> {
    const album = await this.loadAlbum(userId, albumId);
    const { assetIds, skippedUploaded } = await this.exportableAssets(album.id);
    return {
      albumName: album.name,
      immichAssetCount: assetIds.length,
      skippedUploaded,
      linkedImmichAlbumId: album.immichAlbumId,
      willCreate: !album.immichAlbumId,
    };
  }

  /**
   * Create (or add to) an Immich album from a trip album. Writes to the user's
   * Immich library, so the controller only calls this for an explicit,
   * confirmed request. It only ever adds: nothing in Immich is modified,
   * deleted or removed from an album, and uploaded photos are not uploaded.
   */
  async exportAlbum(userId: number, albumId: number): Promise<AlbumExportResult> {
    const album = await this.loadAlbum(userId, albumId);
    const { assetIds, skippedUploaded } = await this.exportableAssets(album.id);
    if (assetIds.length === 0) {
      throw new AppError('This album has no Immich photos to add to an Immich album', 400);
    }
    const { apiUrl, apiKey } = await immichService.getUserSettings(userId);

    let immichAlbumId = album.immichAlbumId;
    let created = false;
    if (!immichAlbumId) {
      const createdAlbum = await immichService.createAlbum(apiUrl, apiKey, album.name, album.description);
      immichAlbumId = createdAlbum.id;
      created = true;
      // Remember the link straight away: if adding assets fails below, a retry
      // updates this album instead of creating a second one.
      await prisma.photoAlbum.update({
        where: { id: album.id },
        data: { immichAlbumId, immichAlbumSyncedAt: null },
      });
    }

    const addResult = await immichService.addAssetsToAlbum(apiUrl, apiKey, immichAlbumId, assetIds);
    return {
      immichAlbumId,
      created,
      added: addResult.added,
      alreadyInAlbum: addResult.alreadyInAlbum,
      failed: addResult.failed,
      skippedUploaded,
    };
  }
}

export default new ImmichSyncService();
