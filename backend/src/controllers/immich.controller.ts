import { Request, Response } from 'express';
import immichService from '../services/immich.service';
import { AppError } from '../errors/errors';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';
import { validateUrlNotInternal, isLocalNetworkHostname } from '../security/urlValidation';
import { config } from '../config';

// Type for getAssets query options
interface GetAssetsOptions {
  skip?: number;
  take?: number;
  isFavorite?: boolean;
  isArchived?: boolean;
}

// Type for pagination options
interface PaginationOptions {
  skip?: number;
  take?: number;
}

// Helper to get user's Immich settings.
// Delegates to the service layer so the controller does not query Prisma directly.
async function getUserImmichSettings(userId: number) {
  return immichService.getUserSettings(userId);
}

/**
 * Immich identifiers are UUIDs. The value is placed into the path of a request
 * to the Immich server, and Express decodes %2F in route params, so without
 * this an id such as `..%2F..%2Fusers` would address a different Immich
 * endpoint with the stored API key.
 */
function requireImmichId(value: string | undefined, label: string): string {
  if (!value || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return value;
}

// Helper to add thumbnail and file URLs to assets
function addAssetUrls(
  assets: Array<{ id: string }>,
  apiUrl: string,
  apiKey: string
) {
  return assets.map(asset => ({
    ...asset,
    thumbnailUrl: immichService.getAssetThumbnailUrl(apiUrl, asset.id, apiKey),
    fileUrl: immichService.getAssetFileUrl(apiUrl, asset.id, apiKey),
  }));
}

export const immichController = {
  /**
   * Test connection to user's Immich instance
   */
  testConnection: asyncHandler(async (req: Request, res: Response) => {
    requireUserId(req); // Validate authentication

    const { apiUrl, apiKey } = req.body;

    if (typeof apiUrl !== 'string' || typeof apiKey !== 'string' || !apiUrl || !apiKey) {
      throw new AppError('API URL and API Key are required', 400);
    }

    // The same rules as saving the URL (user.controller updateImmichSettings).
    // Without them this endpoint is a way around that check: any signed-in user
    // could point it at an arbitrary internal host and read "connected or not"
    // back, i.e. probe the server's network. Private addresses stay reachable
    // only when the operator opted in with ALLOW_PRIVATE_INTEGRATION_URLS.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(apiUrl);
    } catch {
      throw new AppError('Invalid URL format', 400);
    }
    const isLocalHost = isLocalNetworkHostname(parsedUrl.hostname);
    if (parsedUrl.protocol !== 'https:' && !isLocalHost) {
      throw new AppError('Immich URL must use HTTPS for non-local connections', 400);
    }
    if (!(config.security.allowPrivateIntegrationUrls && isLocalHost)) {
      await validateUrlNotInternal(apiUrl);
    }

    const isConnected = await immichService.testConnection(apiUrl, apiKey);

    res.json({
      status: 'success',
      data: {
        connected: isConnected,
        message: 'Successfully connected to Immich instance',
      },
    });
  }),

  /**
   * Get user's Immich assets
   */
  getAssets: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    const { skip, take, isFavorite, isArchived } = req.query;

    // Build options object only if any parameters are provided
    const options: GetAssetsOptions = {};
    let hasOptions = false;

    if (skip !== undefined || take !== undefined) {
      options.skip = skip ? parseInt(skip as string) : 0;
      options.take = take ? parseInt(take as string) : 100;
      hasOptions = true;
    }
    if (isFavorite !== undefined) {
      options.isFavorite = isFavorite === 'true';
      hasOptions = true;
    }
    if (isArchived !== undefined) {
      options.isArchived = isArchived === 'true';
      hasOptions = true;
    }

    const result = await immichService.getAssets(
      apiUrl,
      apiKey,
      hasOptions ? options : undefined
    );

    const assetsWithUrls = addAssetUrls(result.assets, apiUrl, apiKey);

    res.json({ status: 'success', data: { assets: assetsWithUrls, hasMore: result.hasMore } });
  }),

  /**
   * Get a single asset by ID
   */
  getAssetById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const assetId = requireImmichId(req.params.assetId, 'asset ID');
    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    const asset = await immichService.getAssetById(apiUrl, apiKey, assetId);

    const assetWithUrls = {
      ...asset,
      thumbnailUrl: immichService.getAssetThumbnailUrl(apiUrl, assetId, apiKey),
      fileUrl: immichService.getAssetFileUrl(apiUrl, assetId, apiKey),
    };

    res.json({ status: 'success', data: assetWithUrls });
  }),

  /**
   * Search Immich assets
   */
  searchAssets: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    const assets = await immichService.searchAssets(apiUrl, apiKey, req.body);

    const assetsWithUrls = addAssetUrls(assets, apiUrl, apiKey);

    res.json({ status: 'success', data: { assets: assetsWithUrls } });
  }),

  /**
   * Get user's Immich albums
   */
  getAlbums: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    const { shared } = req.query;
    const albums = await immichService.getAlbums(apiUrl, apiKey, shared === 'true');

    res.json({ status: 'success', data: { albums } });
  }),

  /**
   * Get album by ID with its assets
   */
  getAlbumById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const albumId = requireImmichId(req.params.albumId, 'album ID');
    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    const album = await immichService.getAlbumById(apiUrl, apiKey, albumId);

    const albumWithUrls = {
      ...album,
      assets: addAssetUrls(album.assets, apiUrl, apiKey),
    };

    res.json({ status: 'success', data: albumWithUrls });
  }),

  /**
   * Get assets by date range (useful for trip dates)
   */
  getAssetsByDateRange: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { startDate, endDate, skip, take } = req.query;

    if (!startDate || !endDate) {
      throw new AppError('Start date and end date are required', 400);
    }

    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    // Only pass pagination options if they were provided in the request
    const paginationOptions: PaginationOptions | undefined =
      skip !== undefined || take !== undefined
        ? {
            skip: skip ? parseInt(skip as string) : 0,
            take: take ? parseInt(take as string) : 100,
          }
        : undefined;

    const result = await immichService.getAssetsByDateRange(
      apiUrl,
      apiKey,
      startDate as string,
      endDate as string,
      paginationOptions
    );

    const assetsWithUrls = addAssetUrls(result.assets, apiUrl, apiKey);

    res.json({ status: 'success', data: { assets: assetsWithUrls, hasMore: result.hasMore } });
  }),

  /**
   * Get asset URLs (thumbnail and file)
   */
  getAssetUrls: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const assetId = requireImmichId(req.params.assetId, 'asset ID');
    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    const thumbnailUrl = immichService.getAssetThumbnailUrl(apiUrl, assetId, apiKey);
    const fileUrl = immichService.getAssetFileUrl(apiUrl, assetId, apiKey);

    res.json({
      status: 'success',
      data: {
        assetId,
        thumbnailUrl,
        fileUrl,
      },
    });
  }),

  /**
   * Proxy asset thumbnail from Immich
   */
  getAssetThumbnail: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const assetId = requireImmichId(req.params.assetId, 'asset ID');

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Thumbnail Proxy] Request for asset: ${assetId} from user: ${userId}`);
    }

    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Thumbnail Proxy] Fetching thumbnail stream for asset: ${assetId}`);
    }

    const thumbnail = await immichService.getAssetThumbnailStream(apiUrl, apiKey, assetId);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Thumbnail Proxy] Successfully fetched thumbnail, content-type: ${thumbnail.contentType}`);
    }

    res.setHeader('Content-Type', thumbnail.contentType);
    res.setHeader('Cache-Control', 'private, max-age=31536000'); // Per-user content: browser cache only, never a shared proxy

    thumbnail.stream.pipe(res);
  }),

  /**
   * Proxy asset original file from Immich
   */
  getAssetOriginal: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const assetId = requireImmichId(req.params.assetId, 'asset ID');
    const { apiUrl, apiKey } = await getUserImmichSettings(userId);

    const file = await immichService.getAssetOriginalStream(apiUrl, apiKey, assetId);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=31536000'); // Per-user content: browser cache only, never a shared proxy

    file.stream.pipe(res);
  }),
};
