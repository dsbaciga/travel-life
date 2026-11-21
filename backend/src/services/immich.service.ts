import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { AppError } from '../errors/errors';
import logger from '../config/logger';
import { decryptSecret } from '../security/encryption';
import { integrationRequestOptions } from '../security/integrationRequestGuard';
import {
  ImmichAsset,
  ImmichAlbum,
  ImmichAssetOptions,
  ImmichSearchQuery,
  isAxiosError,
  getErrorMessage,
} from '../types/prisma-helpers';
import { findUserIntegrations } from './_shared/userSettings';

// Re-export types for backward compatibility
export type { ImmichAsset, ImmichAlbum, ImmichAssetOptions };

/**
 * Immich search response structure
 */
export interface ImmichSearchResponse {
  assets: {
    items: ImmichAsset[];
    nextPage: string | null;
  };
  albums: ImmichAlbum[];
}

/**
 * Immich album with assets included (extended type for album detail responses)
 */
export interface ImmichAlbumWithAssets extends ImmichAlbum {
  assets: ImmichAsset[];
}

/**
 * Extended search query with additional search fields
 */
export interface ImmichMetadataSearchQuery extends ImmichSearchQuery {
  q?: string;
  searchTerm?: string;
  state?: string;
}

/**
 * Immich assets as returned by POST /api/search/metadata and GET /api/albums/:id.
 * Only the fields this app reads are validated; everything else passes through.
 * Immich sends explicit nulls for unknown values, hence `nullish()`.
 */
const immichAssetViewSchema = z
  .object({
    id: z.string().min(1),
    type: z.string(),
    originalFileName: z.string().nullish(),
    fileCreatedAt: z.string().nullish(),
    localDateTime: z.string().nullish(),
    isFavorite: z.boolean().nullish(),
    // "HH:MM:SS.sss" on documented versions, plain seconds on some others.
    duration: z.union([z.string(), z.number()]).nullish(),
    exifInfo: z
      .object({
        latitude: z.number().nullish(),
        longitude: z.number().nullish(),
        dateTimeOriginal: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export type ImmichAssetView = z.infer<typeof immichAssetViewSchema>;

const immichSearchPageSchema = z.object({
  assets: z.object({
    items: z.array(immichAssetViewSchema),
    nextPage: z.union([z.string(), z.number()]).nullish(),
  }),
});

const immichAlbumDetailSchema = z
  .object({
    id: z.string().min(1),
    albumName: z.string(),
    assets: z.array(immichAssetViewSchema).default([]),
  })
  .passthrough();

export type ImmichAlbumDetail = z.infer<typeof immichAlbumDetailSchema>;

const immichAlbumSummarySchema = z.object({ id: z.string().min(1), albumName: z.string() }).passthrough();

/** The PUT /api/albums/:id/assets response: one entry per asset. */
const immichAddAssetsResultSchema = z.array(
  z.object({
    id: z.string(),
    success: z.boolean(),
    error: z.string().nullish(),
  })
);

/**
 * Server-side filters for browsing the Immich library. `takenAfter`/`takenBefore`
 * are full ISO 8601 instants (Immich rejects bare dates).
 */
export interface ImmichAssetFilters {
  takenAfter?: string;
  takenBefore?: string;
  /** Only favourites. `false`/undefined means "no favourite filter". */
  isFavorite?: boolean;
  type?: 'IMAGE' | 'VIDEO';
  albumId?: string;
  /** Matched against the original file name, or used as the smart-search query when `smart`. */
  text?: string;
  /** Search by content (POST /api/search/smart) instead of file name. Needs `text`. */
  smart?: boolean;
}

/** True when these filters would call Immich's smart search (a relevance ranking, not a match set). */
export function isSmartSearch(filters: { smart?: boolean; text?: string }): boolean {
  return filters.smart === true && Boolean(filters.text?.trim());
}

const SMART_SEARCH_UNAVAILABLE =
  "Smart search isn't available on your Immich server; machine learning may be turned off.";

/** Immich caps `size` on the metadata search at 1000. */
export const IMMICH_MAX_PAGE_SIZE = 1000;

export interface ImmichAssetsPage {
  assets: ImmichAssetView[];
  nextPage: number | null;
}

export interface ImmichAddAssetsResult {
  added: number;
  alreadyInAlbum: number;
  failed: Array<{ id: string; error: string }>;
}

/**
 * Turn a failed Immich call into an AppError that says what Immich said.
 *
 * Never forwards Immich's 401 as our own 401: the web client treats a 401 as
 * "your session expired" and would log the user out. A rejected key is reported
 * as a 403 with an explicit message instead.
 */
function toImmichAppError(error: unknown, action: string): AppError {
  if (error instanceof AppError) return error;
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as { message?: unknown } | undefined;
    const rawMessage = data && typeof data === 'object' ? data.message : undefined;
    const detail = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : undefined;
    if (status === 401 || status === 403) {
      return new AppError(
        `Immich refused to ${action}${detail ? ` (${detail})` : ''}. Check that your Immich API key has the required permission.`,
        403
      );
    }
    if (status === 404) {
      return new AppError(`Immich could not find what was needed to ${action}${detail ? ` (${detail})` : ''}.`, 404);
    }
    if (status !== undefined) {
      return new AppError(
        `Immich returned an error while trying to ${action}${detail ? `: ${detail}` : ` (HTTP ${status})`}.`,
        502
      );
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new AppError(`Immich took too long to respond while trying to ${action}.`, 504);
    }
    return new AppError(`Could not reach Immich to ${action}.`, 502);
  }
  return new AppError(`Failed to ${action}: ${getErrorMessage(error)}`, 502);
}

/**
 * Sanitize a URL for logging by stripping query parameters and fragments.
 * Prevents accidental leakage of API keys or tokens in log output.
 */
function sanitizeUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

class ImmichService {
  private createClient(apiUrl: string, apiKey: string): AxiosInstance {
    // IMPORTANT: apiUrl should be the base Immich server URL WITHOUT /api suffix
    // (e.g., https://immich.example.com, NOT https://immich.example.com/api)
    // All endpoint paths in this service include /api/ prefix
    const baseURL = apiUrl.trim();

    // Warn if the URL does not use HTTPS (API key will be sent in the clear).
    // Non-HTTPS is only permitted for local/private network URLs (e.g. localhost,
    // 192.168.x.x, 10.x.x.x) for development purposes. Public URLs are required
    // to use HTTPS and are enforced at save time in the user controller.
    if (baseURL && !baseURL.startsWith('https://')) {
      logger.warn('Immich API URL does not use HTTPS — API key may be transmitted insecurely', {
        url: sanitizeUrlForLogging(baseURL),
      });
    }

    return axios.create({
      baseURL,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      // No redirects: a redirect could point anywhere, past the guard below.
      maxRedirects: 0,
      // Re-validate the address at request time (DNS rebinding); see the guard.
      ...integrationRequestOptions(baseURL),
    });
  }

  /**
   * Parse a single page out of a POST /api/search/metadata response.
   * Centralizes the response shape assumption (`{ assets: { items, nextPage } }`)
   * so every call site doesn't repeat its own fallback chain.
   */
  private extractAssetsPage(response: {
    data: { assets?: { items?: ImmichAsset[]; nextPage?: string | null } };
  }): { items: ImmichAsset[]; nextPage: string | null } {
    const items = response.data.assets?.items;
    if (!items) {
      // A well-formed response always includes `items` (even as an empty
      // array). A missing field means the response is malformed, not that
      // there are no assets — fail fast instead of silently treating it as
      // "no more pages," which would mask a broken/misconfigured Immich API.
      throw new AppError('Invalid Immich API response: missing "assets.items" field', 500);
    }
    return {
      items,
      nextPage: response.data.assets?.nextPage ?? null,
    };
  }

  /**
   * Test connection to Immich instance
   */
  async testConnection(apiUrl: string, apiKey: string): Promise<boolean> {
    try {
      const client = this.createClient(apiUrl, apiKey);
      const response = await client.get('/api/server/ping');
      return response.status === 200;
    } catch (error: unknown) {
      // Log error details without exposing full URLs or API keys
      const errorMessage = getErrorMessage(error);
      let errorCode = 'Unknown';
      let responseStatus: number | undefined;

      if (isAxiosError(error)) {
        errorCode = error.code || 'Unknown';
        responseStatus = error.response?.status;
      }

      console.error('[Immich Service] Connection error:', errorCode, '-', errorMessage);

      if (errorCode === 'ECONNREFUSED') {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[Immich Service] Cannot connect to Immich at ${sanitizeUrlForLogging(apiUrl)}: Server refused connection`);
        }
        throw new AppError('Cannot connect to Immich server. Please check your configuration and ensure the server is running.', 400);
      } else if (errorCode === 'ENOTFOUND') {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[Immich Service] Cannot resolve hostname for ${sanitizeUrlForLogging(apiUrl)}: DNS resolution failed`);
        }
        throw new AppError('Cannot connect to Immich server. Please check your configuration and network settings.', 400);
      } else if (errorCode === 'ETIMEDOUT') {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[Immich Service] Connection to ${sanitizeUrlForLogging(apiUrl)} timed out after 30 seconds`);
        }
        throw new AppError('Connection to Immich server timed out. Please check network firewall rules.', 408);
      } else if (errorCode === 'DEPTH_ZERO_SELF_SIGNED_CERT' || errorCode === 'CERT_HAS_EXPIRED' || errorCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[Immich Service] SSL certificate error for ${sanitizeUrlForLogging(apiUrl)}: ${errorCode}`);
        }
        throw new AppError('SSL certificate error. The Immich server has an invalid or self-signed certificate.', 400);
      } else if (responseStatus === 401 || responseStatus === 403) {
        throw new AppError('Invalid Immich API key. Check your API key in user settings.', 401);
      } else if (responseStatus === 404) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`[Immich Service] API endpoint not found at ${sanitizeUrlForLogging(apiUrl)}`);
        }
        throw new AppError('Immich API endpoint not found. Please check that your URL is correct and points to your Immich server.', 404);
      }
      if (process.env.NODE_ENV === 'development') {
        console.error(`[Immich Service] Connection failed to ${sanitizeUrlForLogging(apiUrl)}: ${errorMessage} (Code: ${errorCode})`);
      } else {
        console.error(`[Immich Service] Connection failed: ${errorMessage} (Code: ${errorCode})`);
      }
      throw new AppError('Failed to connect to Immich server. Please check your configuration.', 400);
    }
  }

  /**
   * Get user's Immich assets with server-side pagination
   * Uses the Immich API's size parameter to fetch only the required assets
   */
  async getAssets(
    apiUrl: string,
    apiKey: string,
    options?: ImmichAssetOptions
  ): Promise<{ assets: ImmichAsset[]; hasMore: boolean }> {
    try {
      const client = this.createClient(apiUrl, apiKey);

      const skip = options?.skip ?? 0;
      const take = options?.take ?? 100;

      // Build search query with filters
      const searchQuery: ImmichSearchQuery & { size?: number; page?: number } = {
        size: take,
      };
      if (options?.isFavorite !== undefined) {
        searchQuery.isFavorite = options.isFavorite;
      }
      if (options?.isArchived !== undefined) {
        searchQuery.isArchived = options.isArchived;
      }

      // For skip > 0, we need to paginate through pages using the nextPage cursor
      // Each page returns up to 'size' items, so we need to skip through pages
      let collectedAssets: ImmichAsset[] = [];
      let nextPage: string | null = null;
      let skippedCount = 0;
      let pageNum = 0;
      const maxPages = 100; // Safety limit

      // First, skip through pages until we reach the desired offset
      while (skippedCount < skip && pageNum < maxPages) {
        const skipQuery = { ...searchQuery };
        if (nextPage) {
          // Immich's search endpoint validates `page` as a number, even
          // though the `nextPage` cursor it returns comes back as a string.
          skipQuery.page = Number(nextPage);
        }

        const response = await client.post('/api/search/metadata', skipQuery);
        const { items: pageAssets, nextPage: extractedNextPage } = this.extractAssetsPage(response);
        nextPage = extractedNextPage;
        pageNum++;

        if (pageAssets.length === 0) {
          // No more assets available
          return {
            assets: [],
            hasMore: false,
          };
        }

        const remainingToSkip = skip - skippedCount;
        if (remainingToSkip >= pageAssets.length) {
          // Skip this entire page
          skippedCount += pageAssets.length;
        } else {
          // Take some assets from this page (partial skip)
          const assetsFromThisPage = pageAssets.slice(remainingToSkip);
          collectedAssets = assetsFromThisPage.slice(0, take);
          skippedCount = skip;
          break;
        }

        if (!nextPage) {
          // No more pages, we've skipped past all available assets
          return {
            assets: [],
            hasMore: false,
          };
        }
      }

      // If we still need more assets to fill the 'take' requirement
      while (collectedAssets.length < take && nextPage && pageNum < maxPages) {
        const collectQuery = { ...searchQuery, page: Number(nextPage) };
        const response = await client.post('/api/search/metadata', collectQuery);
        const { items: pageAssets, nextPage: extractedNextPage } = this.extractAssetsPage(response);
        nextPage = extractedNextPage;
        pageNum++;

        const needed = take - collectedAssets.length;
        collectedAssets = collectedAssets.concat(pageAssets.slice(0, needed));

        if (pageAssets.length === 0) {
          break;
        }
      }

      // If skip was 0, we need to fetch the first page
      if (skip === 0 && collectedAssets.length === 0) {
        const response = await client.post('/api/search/metadata', searchQuery);
        const page = this.extractAssetsPage(response);
        collectedAssets = page.items;
        nextPage = page.nextPage;
      }

      const hasMore = nextPage !== null || collectedAssets.length === take;

      return {
        assets: collectedAssets.slice(0, take),
        hasMore,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorCode = isAxiosError(error) ? error.code || 'Unknown' : 'Unknown';
      console.error('[Immich Service] Error fetching assets:', errorCode, '-', errorMessage);
      throw new AppError(`Failed to fetch assets from Immich: ${errorMessage}`, 500);
    }
  }

  /**
   * Get a single asset by ID
   */
  async getAssetById(
    apiUrl: string,
    apiKey: string,
    assetId: string
  ): Promise<ImmichAsset> {
    try {
      const client = this.createClient(apiUrl, apiKey);
      const response = await client.get(`/api/assets/${assetId}`);
      return response.data;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error('Error fetching Immich asset:', errorMessage);
      throw new AppError('Failed to fetch asset from Immich', 404);
    }
  }

  /**
   * Get asset thumbnail URL - returns our backend proxy URL
   */
  getAssetThumbnailUrl(_apiUrl: string, assetId: string, _apiKey: string): string {
    // Return our backend proxy URL instead of direct Immich URL
    return `/api/immich/assets/${assetId}/thumbnail`;
  }

  /**
   * Get asset original file URL - returns our backend proxy URL
   */
  getAssetFileUrl(_apiUrl: string, assetId: string, _apiKey: string): string {
    // Return our backend proxy URL instead of direct Immich URL
    return `/api/immich/assets/${assetId}/original`;
  }

  /**
   * Get asset thumbnail stream from Immich
   */
  async getAssetThumbnailStream(
    apiUrl: string,
    apiKey: string,
    assetId: string
  ): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    try {
      const client = this.createClient(apiUrl, apiKey);

      const response = await client.get(`/api/assets/${assetId}/thumbnail`, {
        params: { size: 'preview' }, // Required query parameter for Immich API
        responseType: 'stream',
      });

      const contentType = response.headers['content-type'];
      return {
        stream: response.data,
        // Immich thumbnails are JPEG by default; if the header is ever
        // missing, guessing 'image/jpeg' keeps the (otherwise valid) image
        // stream renderable instead of failing the whole request over a
        // missing metadata header.
        contentType: typeof contentType === 'string' ? contentType : 'image/jpeg',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorCode = isAxiosError(error) ? error.code || 'Unknown' : 'Unknown';
      console.error('[Immich Service] Error fetching thumbnail:', errorCode, '-', errorMessage);
      throw new AppError('Failed to fetch thumbnail from Immich', 500);
    }
  }

  /**
   * Get asset original file stream from Immich
   */
  async getAssetOriginalStream(
    apiUrl: string,
    apiKey: string,
    assetId: string
  ): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    try {
      const client = this.createClient(apiUrl, apiKey);
      const response = await client.get(`/api/assets/${assetId}/original`, {
        responseType: 'stream',
      });

      const contentType = response.headers['content-type'];
      return {
        stream: response.data,
        // Original files can be any media type Immich stores; if the header
        // is ever missing, 'application/octet-stream' lets the browser still
        // download/handle the (otherwise valid) file rather than failing the
        // whole request over a missing metadata header.
        contentType: typeof contentType === 'string' ? contentType : 'application/octet-stream',
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error('Error fetching original file stream:', errorMessage);
      throw new AppError('Failed to fetch original file from Immich', 500);
    }
  }

  /**
   * Search assets by metadata
   */
  async searchAssets(
    apiUrl: string,
    apiKey: string,
    query: ImmichMetadataSearchQuery
  ): Promise<ImmichAsset[]> {
    try {
      const client = this.createClient(apiUrl, apiKey);
      const response = await client.post('/api/search/metadata', query);
      return this.extractAssetsPage(response).items;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error('Error searching Immich assets:', errorMessage);
      throw new AppError('Failed to search assets in Immich', 500);
    }
  }

  /**
   * Get all albums
   */
  async getAlbums(
    apiUrl: string,
    apiKey: string,
    shared?: boolean
  ): Promise<ImmichAlbum[]> {
    try {
      const client = this.createClient(apiUrl, apiKey);
      const params = shared !== undefined ? { shared } : {};
      const response = await client.get('/api/albums', { params });
      return response.data;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error('Error fetching Immich albums:', errorMessage);
      throw new AppError('Failed to fetch albums from Immich', 500);
    }
  }

  /**
   * Get album by ID with its assets
   */
  async getAlbumById(
    apiUrl: string,
    apiKey: string,
    albumId: string
  ): Promise<ImmichAlbumWithAssets> {
    try {
      const client = this.createClient(apiUrl, apiKey);
      const response = await client.get(`/api/albums/${albumId}`);
      return response.data;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error('Error fetching Immich album:', errorMessage);
      throw new AppError('Failed to fetch album from Immich', 404);
    }
  }

  /**
   * Get assets within a date range with server-side pagination
   * Uses the Immich API's size and page parameters to avoid loading all assets into memory
   */
  async getAssetsByDateRange(
    apiUrl: string,
    apiKey: string,
    startDate: string,
    endDate: string,
    options?: Pick<ImmichAssetOptions, 'skip' | 'take'>
  ): Promise<{ assets: ImmichAsset[]; hasMore: boolean }> {
    try {
      const client = this.createClient(apiUrl, apiKey);

      // When no options provided, fetch ALL assets (used by "Select All" feature)
      const fetchAll = !options;
      const skip = options?.skip ?? 0;
      const take = fetchAll ? Infinity : (options?.take ?? 100);
      const pageSize = fetchAll ? 1000 : take;

      // Immich's metadata search expects full ISO 8601 timestamps for
      // takenAfter/takenBefore; bare "YYYY-MM-DD" dates are rejected with a
      // 400. Expand to the full day so the end date is inclusive too.
      const takenAfter = `${startDate}T00:00:00.000Z`;
      const takenBefore = `${endDate}T23:59:59.999Z`;

      // Build request with date range and size parameter for server-side pagination
      const baseRequest: { takenAfter: string; takenBefore: string; size: number; page?: number } = {
        takenAfter,
        takenBefore,
        size: pageSize,
      };

      let collectedAssets: ImmichAsset[] = [];
      let nextPage: string | null = null;
      let skippedCount = 0;
      let pageNum = 0;
      const maxPages = 100; // Safety limit

      // Skip through pages until we reach the desired offset
      while (skippedCount < skip && pageNum < maxPages) {
        const requestBody = { ...baseRequest };
        if (nextPage) {
          // Immich's search endpoint validates `page` as a number, even
          // though the `nextPage` cursor it returns comes back as a string.
          requestBody.page = Number(nextPage);
        }

        const response = await client.post('/api/search/metadata', requestBody);
        const { items: pageAssets, nextPage: extractedNextPage } = this.extractAssetsPage(response);
        nextPage = extractedNextPage;
        pageNum++;

        if (pageAssets.length === 0) {
          // No more assets available
          return {
            assets: [],
            hasMore: false,
          };
        }

        const remainingToSkip = skip - skippedCount;
        if (remainingToSkip >= pageAssets.length) {
          // Skip this entire page
          skippedCount += pageAssets.length;
        } else {
          // Take some assets from this page (partial skip)
          const assetsFromThisPage = pageAssets.slice(remainingToSkip);
          collectedAssets = fetchAll ? assetsFromThisPage : assetsFromThisPage.slice(0, take);
          skippedCount = skip;
          break;
        }

        if (!nextPage) {
          // No more pages, we've skipped past all available assets
          return {
            assets: [],
            hasMore: false,
          };
        }
      }

      // If we still need more assets (or fetching all)
      while ((fetchAll || collectedAssets.length < take) && nextPage && pageNum < maxPages) {
        const requestBody = { ...baseRequest, page: Number(nextPage) };
        const response = await client.post('/api/search/metadata', requestBody);
        const { items: pageAssets, nextPage: extractedNextPage } = this.extractAssetsPage(response);
        nextPage = extractedNextPage;
        pageNum++;

        if (fetchAll) {
          collectedAssets = collectedAssets.concat(pageAssets);
        } else {
          const needed = take - collectedAssets.length;
          collectedAssets = collectedAssets.concat(pageAssets.slice(0, needed));
        }

        if (pageAssets.length === 0) {
          break;
        }
      }

      // If skip was 0, we need to fetch the first page
      if (skip === 0 && collectedAssets.length === 0) {
        const response = await client.post('/api/search/metadata', baseRequest);
        const page = this.extractAssetsPage(response);
        collectedAssets = page.items;
        nextPage = page.nextPage;
      }

      if (fetchAll) {
        // When fetching all, continue paginating until no more pages
        while (nextPage && pageNum < maxPages) {
          const requestBody = { ...baseRequest, page: Number(nextPage) };
          const response = await client.post('/api/search/metadata', requestBody);
          const { items: pageAssets, nextPage: extractedNextPage } = this.extractAssetsPage(response);
          nextPage = extractedNextPage;
          pageNum++;

          collectedAssets = collectedAssets.concat(pageAssets);

          if (pageAssets.length === 0) {
            break;
          }
        }

        return {
          assets: collectedAssets,
          hasMore: false,
        };
      }

      const hasMore = nextPage !== null || collectedAssets.length === take;

      return {
        assets: collectedAssets.slice(0, take),
        hasMore,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorCode = isAxiosError(error) ? error.code || 'Unknown' : 'Unknown';
      const responseData = isAxiosError(error) ? error.response?.data : undefined;
      console.error(
        '[Immich Service] Error fetching assets by date range:',
        errorCode,
        '-',
        errorMessage,
        responseData ? `- Immich response: ${JSON.stringify(responseData)}` : ''
      );
      throw new AppError('Failed to fetch assets by date range', 500);
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered browsing, album linking and album export
  // ---------------------------------------------------------------------------

  /**
   * One page of the Immich library with server-side filtering.
   *
   * `page` is Immich's own 1-based page number, so paging never downloads
   * anything before the requested page. The response is validated; an
   * unexpected shape fails loudly rather than reading as "no photos".
   */
  async searchAssetsPage(
    apiUrl: string,
    apiKey: string,
    filters: ImmichAssetFilters,
    page: number,
    size: number
  ): Promise<ImmichAssetsPage> {
    const smart = isSmartSearch(filters);
    const body: Record<string, unknown> = {
      page,
      size: Math.min(Math.max(1, size), IMMICH_MAX_PAGE_SIZE),
      withExif: true,
    };
    // Smart results are ranked by relevance; the smart endpoint has no date ordering.
    if (!smart) body.order = 'desc';
    if (filters.takenAfter) body.takenAfter = filters.takenAfter;
    if (filters.takenBefore) body.takenBefore = filters.takenBefore;
    // Immich treats isFavorite=false as "only non-favourites", which is never
    // what a "favourites only" checkbox being off means.
    if (filters.isFavorite === true) body.isFavorite = true;
    if (filters.type) body.type = filters.type;
    if (filters.albumId) body.albumIds = [filters.albumId];
    if (smart) {
      body.query = filters.text?.trim();
    } else if (filters.text?.trim()) {
      body.originalFileName = filters.text.trim();
    }

    try {
      const client = this.createClient(apiUrl, apiKey);
      // Smart queries compute an ML embedding first, so they get a longer timeout.
      const response = smart
        ? await client.post('/api/search/smart', body, { timeout: 60000 })
        : await client.post('/api/search/metadata', body);
      const parsed = immichSearchPageSchema.safeParse(response.data);
      if (!parsed.success) {
        throw new AppError('Immich returned an unexpected response while searching your library', 502);
      }
      const rawNext = parsed.data.assets.nextPage;
      const next = rawNext === null || rawNext === undefined ? NaN : Number(rawNext);
      return {
        assets: parsed.data.assets.items,
        nextPage: Number.isFinite(next) && next > page ? next : null,
      };
    } catch (error: unknown) {
      // Machine learning off, or a server too old for the endpoint: Immich answers
      // with 400/404/5xx. Say so plainly; 401/403 keep their own mapping.
      if (smart && isAxiosError(error) && error.response) {
        const status = error.response.status;
        if (status !== 401 && status !== 403) throw new AppError(SMART_SEARCH_UNAVAILABLE, 503);
      }
      throw toImmichAppError(error, 'search your library');
    }
  }

  /**
   * Walk the pages of a filter and collect assets, stopping at `maxAssets`.
   * `capped` is true when more matching assets exist than were returned.
   */
  async collectAssets(
    apiUrl: string,
    apiKey: string,
    filters: ImmichAssetFilters,
    maxAssets: number
  ): Promise<{ assets: ImmichAssetView[]; capped: boolean }> {
    const assets: ImmichAssetView[] = [];
    let page = 1;
    const maxPages = Math.ceil(maxAssets / IMMICH_MAX_PAGE_SIZE) + 2;
    for (let fetched = 0; fetched < maxPages; fetched++) {
      const result = await this.searchAssetsPage(apiUrl, apiKey, filters, page, IMMICH_MAX_PAGE_SIZE);
      assets.push(...result.assets);
      if (assets.length > maxAssets) {
        return { assets: assets.slice(0, maxAssets), capped: true };
      }
      if (result.nextPage === null || result.assets.length === 0) {
        return { assets, capped: false };
      }
      page = result.nextPage;
    }
    // Ran out of pages before Immich stopped offering them.
    return { assets: assets.slice(0, maxAssets), capped: true };
  }

  /**
   * An Immich album with its assets, validated. Uses GET /api/albums/:id, which
   * exists on every Immich version the app supports (unlike the albumIds
   * search filter), so a failed filter can never be mistaken for "the album".
   */
  async getAlbumDetail(
    apiUrl: string,
    apiKey: string,
    albumId: string,
    options?: { withoutAssets?: boolean }
  ): Promise<ImmichAlbumDetail> {
    try {
      const client = this.createClient(apiUrl, apiKey);
      // Servers that predate `withoutAssets` ignore it and send the assets anyway.
      const response = await client.get(`/api/albums/${encodeURIComponent(albumId)}`, {
        params: options?.withoutAssets ? { withoutAssets: true } : undefined,
      });
      const parsed = immichAlbumDetailSchema.safeParse(response.data);
      if (!parsed.success) {
        throw new AppError('Immich returned an unexpected response for that album', 502);
      }
      return parsed.data;
    } catch (error: unknown) {
      throw toImmichAppError(error, 'read the Immich album');
    }
  }

  /** Create an empty album in Immich (POST /api/albums). Writes to the user's library. */
  async createAlbum(
    apiUrl: string,
    apiKey: string,
    albumName: string,
    description?: string | null
  ): Promise<{ id: string; albumName: string }> {
    try {
      const client = this.createClient(apiUrl, apiKey);
      const response = await client.post('/api/albums', {
        albumName,
        ...(description ? { description } : {}),
      });
      const parsed = immichAlbumSummarySchema.safeParse(response.data);
      if (!parsed.success) {
        throw new AppError('Immich returned an unexpected response after creating the album', 502);
      }
      return { id: parsed.data.id, albumName: parsed.data.albumName };
    } catch (error: unknown) {
      throw toImmichAppError(error, 'create the album');
    }
  }

  /**
   * Add assets to an existing Immich album (PUT /api/albums/:id/assets), in
   * chunks. Only ever adds; there is deliberately no remove counterpart.
   */
  async addAssetsToAlbum(
    apiUrl: string,
    apiKey: string,
    albumId: string,
    assetIds: string[]
  ): Promise<ImmichAddAssetsResult> {
    const result: ImmichAddAssetsResult = { added: 0, alreadyInAlbum: 0, failed: [] };
    const CHUNK = 500;
    try {
      const client = this.createClient(apiUrl, apiKey);
      for (let i = 0; i < assetIds.length; i += CHUNK) {
        const ids = assetIds.slice(i, i + CHUNK);
        const response = await client.put(`/api/albums/${encodeURIComponent(albumId)}/assets`, { ids });
        const parsed = immichAddAssetsResultSchema.safeParse(response.data);
        if (!parsed.success) {
          throw new AppError('Immich returned an unexpected response while adding assets to the album', 502);
        }
        for (const entry of parsed.data) {
          if (entry.success) {
            result.added += 1;
          } else if (entry.error === 'duplicate') {
            result.alreadyInAlbum += 1;
          } else {
            result.failed.push({ id: entry.id, error: entry.error ?? 'unknown' });
          }
        }
      }
      return result;
    } catch (error: unknown) {
      throw toImmichAppError(error, 'add photos to the Immich album');
    }
  }

  /**
   * Load a user's stored Immich credentials.
   *
   * Lives here rather than in the controller so that database access stays in
   * the service layer (Routes -> Controllers -> Services -> Prisma).
   *
   * The URL is validated when saved, and again on every request by
   * `createClient` (`integrationRequestOptions`), which refuses a hostname that
   * has since been re-pointed at a private address. LAN Immich servers stay
   * reachable when `ALLOW_PRIVATE_INTEGRATION_URLS` is on.
   */
  async getUserSettings(userId: number): Promise<{ apiUrl: string; apiKey: string }> {
    const user = await findUserIntegrations(userId);

    const apiKey = decryptSecret(user?.immichApiKey);
    if (!user?.immichApiUrl || !apiKey) {
      throw new AppError('Immich settings not configured', 400);
    }

    return { apiUrl: user.immichApiUrl, apiKey };
  }
}

export default new ImmichService();
