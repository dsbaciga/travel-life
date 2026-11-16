import { Router, Request, Response, NextFunction } from 'express';
import { immichController } from '../controllers/immich.controller';
import { immichSyncController } from '../controllers/immichSync.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All Immich routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/immich/test:
 *   post:
 *     summary: Test connection to Immich instance
 *     description: Verifies that the configured Immich API URL and key are valid
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection successful
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Cannot connect to Immich
 */
router.post('/test', immichController.testConnection);

/**
 * @openapi
 * /api/immich/assets:
 *   get:
 *     summary: Get user's assets from Immich
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: size
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Page size
 *     responses:
 *       200:
 *         description: List of Immich assets
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Immich service unavailable
 */
router.get('/assets', immichController.getAssets);

/**
 * @openapi
 * /api/immich/assets/date-range:
 *   get:
 *     summary: Get assets by date range
 *     description: Useful for getting photos matching trip dates
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of assets within date range
 *       400:
 *         description: Invalid date format
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Immich service unavailable
 */
router.get('/assets/date-range', immichController.getAssetsByDateRange);

/**
 * @openapi
 * /api/immich/assets/{assetId}/thumbnail:
 *   get:
 *     summary: Get asset thumbnail (proxied)
 *     description: Proxies the thumbnail request to Immich server
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Immich asset ID
 *     responses:
 *       200:
 *         description: Thumbnail image data
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       503:
 *         description: Immich service unavailable
 */
router.get('/assets/:assetId/thumbnail', immichController.getAssetThumbnail);

/**
 * @openapi
 * /api/immich/assets/{assetId}/original:
 *   get:
 *     summary: Get asset original file (proxied)
 *     description: Proxies the original file request to Immich server
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Immich asset ID
 *     responses:
 *       200:
 *         description: Original file data
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       503:
 *         description: Immich service unavailable
 */
router.get('/assets/:assetId/original', immichController.getAssetOriginal);

/**
 * @openapi
 * /api/immich/assets/{assetId}:
 *   get:
 *     summary: Get a single asset by ID
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Immich asset ID
 *     responses:
 *       200:
 *         description: Asset details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       503:
 *         description: Immich service unavailable
 */
router.get('/assets/:assetId', immichController.getAssetById);

/**
 * @openapi
 * /api/immich/assets/{assetId}/urls:
 *   get:
 *     summary: Get asset URLs (thumbnail and file)
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Immich asset ID
 *     responses:
 *       200:
 *         description: Asset URLs
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Asset not found
 *       503:
 *         description: Immich service unavailable
 */
router.get('/assets/:assetId/urls', immichController.getAssetUrls);

/**
 * @openapi
 * /api/immich/search:
 *   post:
 *     summary: Search assets by metadata
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query
 *               type:
 *                 type: string
 *                 enum: [IMAGE, VIDEO]
 *                 description: Filter by asset type
 *               city:
 *                 type: string
 *                 description: Filter by city
 *               country:
 *                 type: string
 *                 description: Filter by country
 *     responses:
 *       200:
 *         description: Search results
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Immich service unavailable
 */
router.post('/search', immichController.searchAssets);

/**
 * @openapi
 * /api/immich/albums:
 *   get:
 *     summary: Get user's albums from Immich
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Immich albums
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Immich service unavailable
 */
router.get('/albums', immichController.getAlbums);

/**
 * @openapi
 * /api/immich/albums/{albumId}:
 *   get:
 *     summary: Get album by ID with its assets
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: albumId
 *         required: true
 *         schema:
 *           type: string
 *         description: Immich album ID
 *     responses:
 *       200:
 *         description: Album details with assets
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Album not found
 *       503:
 *         description: Immich service unavailable
 */
router.get('/albums/:albumId', immichController.getAlbumById);

// ---------------------------------------------------------------------------
// Filtered browsing, bulk import, album link / sync, and export to Immich
// ---------------------------------------------------------------------------

/**
 * Long-running calls (a sync or export of a big album) are given more than
 * Node's default request timeout.
 */
const extendTimeout = (req: Request, res: Response, next: NextFunction) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
};

/**
 * @openapi
 * /api/immich/assets/query:
 *   post:
 *     summary: Browse the Immich library with server-side filters and paging
 *     description: >
 *       Filters (calendar-day range read in a timezone, favourites, media type,
 *       Immich album, file-name text) and paging are applied by Immich itself.
 *       When tripId is given, each asset is flagged alreadyLinked.
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filters:
 *                 type: object
 *                 properties:
 *                   dateFrom: { type: string, format: date }
 *                   dateTo: { type: string, format: date }
 *                   timezone: { type: string, description: IANA zone the dates are read in; defaults to the user's zone }
 *                   isFavorite: { type: boolean }
 *                   type: { type: string, enum: [IMAGE, VIDEO] }
 *                   albumId: { type: string }
 *                   text: { type: string }
 *               page: { type: integer, minimum: 1, default: 1 }
 *               size: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *               tripId: { type: integer }
 *     responses:
 *       200:
 *         description: A page of assets and whether more pages exist
 *       400:
 *         description: Invalid filters or Immich not configured
 *       502:
 *         description: Immich unreachable or returned an unexpected response
 */
router.post('/assets/query', immichSyncController.browse);

/**
 * @openapi
 * /api/immich/bulk-link/preview:
 *   post:
 *     summary: Count what a bulk import of a filter would link
 *     description: Returns matching, already-linked and to-link counts (capped at 5000) so the user can confirm.
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Counts, the cap, and the number of link requests to make
 */
router.post('/bulk-link/preview', extendTimeout, immichSyncController.previewBulkLink);

/**
 * @openapi
 * /api/immich/bulk-link/page:
 *   post:
 *     summary: Link one page (200) of a filter's matches to a trip
 *     description: >
 *       Uses the existing batch linker, so assets the trip already has are
 *       skipped and re-running never duplicates photos. Returns nextPage, or
 *       null when finished.
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: linked / alreadyLinked / failed for the page, and nextPage
 */
router.post('/bulk-link/page', extendTimeout, immichSyncController.linkBulkPage);

/**
 * @openapi
 * /api/immich/photo-albums/{albumId}/link:
 *   put:
 *     summary: Link (or unlink) a trip photo album and an Immich album
 *     description: Body is { immichAlbumId: string | null }. Reads Immich only, to confirm the album exists.
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The album's immichAlbumId and immichAlbumSyncedAt
 */
router.put('/photo-albums/:albumId/link', immichSyncController.setAlbumLink);

/**
 * @openapi
 * /api/immich/photo-albums/{albumId}/sync:
 *   post:
 *     summary: Pull assets from the linked Immich album into the trip album
 *     description: >
 *       Manual only. Adds assets that are in the Immich album but not yet in
 *       the trip album. Assets removed from the Immich album are never removed
 *       from the trip; they are counted in notInImmichAlbum.
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync summary
 */
router.post('/photo-albums/:albumId/sync', extendTimeout, immichSyncController.syncAlbum);

/**
 * @openapi
 * /api/immich/photo-albums/{albumId}/export-preview:
 *   get:
 *     summary: What exporting a trip album to Immich would write
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: immichAssetCount, skippedUploaded, and whether an album would be created
 */
router.get('/photo-albums/:albumId/export-preview', immichSyncController.previewExport);

/**
 * @openapi
 * /api/immich/photo-albums/{albumId}/export:
 *   post:
 *     summary: Create or update an album in Immich from a trip album (writes to Immich)
 *     description: >
 *       Requires { confirm: true }. Creates an Immich album (or reuses the
 *       linked one) and adds the album's Immich-linked photos to it. Never
 *       deletes or modifies assets, never removes assets from an album, and
 *       never uploads: uploaded photos are skipped and counted.
 *     tags: [Immich]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Export summary
 *       403:
 *         description: Immich refused (the API key lacks permission)
 */
router.post('/photo-albums/:albumId/export', extendTimeout, immichSyncController.exportAlbum);

export default router;
