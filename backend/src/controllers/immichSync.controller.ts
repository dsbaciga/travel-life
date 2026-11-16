import { Request, Response } from 'express';
import immichService from '../services/immich.service';
import immichSyncService from '../services/immichSync.service';
import { asyncHandler } from '../http/asyncHandler';
import { parseId } from '../http/parseId';
import { requireUserId } from '../auth/controllerHelpers';
import {
  immichBrowseSchema,
  immichBulkPreviewSchema,
  immichBulkLinkPageSchema,
  immichAlbumLinkSchema,
  immichExportSchema,
} from '../types/immich.types';

export const immichSyncController = {
  /** Server-side filtered, paged browse of the Immich library. */
  browse: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { filters, page, size, tripId } = immichBrowseSchema.parse(req.body);

    const result = await immichSyncService.browse(userId, filters, page, size, tripId);
    const assets = result.assets.map((asset) => ({
      ...asset,
      // Same proxy URLs the other Immich endpoints return; the key never reaches the browser.
      thumbnailUrl: immichService.getAssetThumbnailUrl('', asset.id, ''),
      fileUrl: immichService.getAssetFileUrl('', asset.id, ''),
    }));

    res.json({ status: 'success', data: { assets, hasMore: result.hasMore, page: result.page } });
  }),

  previewBulkLink: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { tripId, filters } = immichBulkPreviewSchema.parse(req.body);
    const preview = await immichSyncService.previewBulkLink(userId, tripId, filters);
    res.json({ status: 'success', data: preview });
  }),

  linkBulkPage: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { tripId, filters, page } = immichBulkLinkPageSchema.parse(req.body);
    const result = await immichSyncService.linkBulkPage(userId, tripId, filters, page);
    res.json({ status: 'success', data: result });
  }),

  setAlbumLink: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const albumId = parseId(req.params.albumId, 'albumId');
    const { immichAlbumId } = immichAlbumLinkSchema.parse(req.body);
    const album = await immichSyncService.setAlbumLink(userId, albumId, immichAlbumId);
    res.json({ status: 'success', data: album });
  }),

  syncAlbum: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const albumId = parseId(req.params.albumId, 'albumId');
    const result = await immichSyncService.syncAlbum(userId, albumId);
    res.json({ status: 'success', data: result });
  }),

  previewExport: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const albumId = parseId(req.params.albumId, 'albumId');
    const preview = await immichSyncService.previewExport(userId, albumId);
    res.json({ status: 'success', data: preview });
  }),

  /** Writes to the user's Immich library; refuses unless the body says `confirm: true`. */
  exportAlbum: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const albumId = parseId(req.params.albumId, 'albumId');
    immichExportSchema.parse(req.body);
    const result = await immichSyncService.exportAlbum(userId, albumId);
    res.json({ status: 'success', data: result });
  }),
};
