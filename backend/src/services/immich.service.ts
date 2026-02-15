import axios, { AxiosInstance } from 'axios';
import { AppError } from '../utils/errors';
import {
  ImmichAsset,
  ImmichAlbum,
  ImmichAssetOptions,
  ImmichSearchQuery,
  isAxiosError,
  getErrorMessage,
} from '../types/prisma-helpers';

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

    // Warn if the URL does not use HTTPS (API key will be sent in the clear)
    if (baseURL && !baseURL.startsWith('https://')) {
      console.warn(`[Immich Service] WARNING: Immich API URL does not use HTTPS. API key may be transmitted insecurely. URL: ${sanitizeUrlForLogging(baseURL)}`);
    }

    return axios.create({
      baseURL,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
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

      const skip = options?.skip || 0;
      const take = options?.take || 100;

      // Build search query with filters
      const searchQuery: ImmichSearchQuery & { size?: number; page?: string } = {
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
          skipQuery.page = nextPage;
        }

        const response = await client.post('/api/search/metadata', skipQuery);
        const pageAssets = response.data.assets?.items || [];
        nextPage = response.data.assets?.nextPage || null;
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
        const collectQuery = { ...searchQuery, page: nextPage };
        const response = await client.post('/api/search/metadata', collectQuery);
        const pageAssets = response.data.assets?.items || [];
        nextPage = response.data.assets?.nextPage || null;
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
        collectedAssets = response.data.assets?.items || [];
        nextPage = response.data.assets?.nextPage || null;
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

      return {
        stream: response.data,
        contentType: response.headers['content-type'] || 'image/jpeg',
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

      return {
        stream: response.data,
        contentType: response.headers['content-type'] || 'application/octet-stream',
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
      return response.data.assets?.items || [];
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

      const skip = options?.skip || 0;
      const take = options?.take || 100;

      // Build request with date range and size parameter for server-side pagination
      const baseRequest: { takenAfter: string; takenBefore: string; size: number; page?: string } = {
        takenAfter: startDate,
        takenBefore: endDate,
        size: take,
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
          requestBody.page = nextPage;
        }

        const response = await client.post('/api/search/metadata', requestBody);
        const pageAssets = response.data.assets?.items || response.data.assets || [];
        nextPage = response.data.assets?.nextPage || null;
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
        const requestBody = { ...baseRequest, page: nextPage };
        const response = await client.post('/api/search/metadata', requestBody);
        const pageAssets = response.data.assets?.items || response.data.assets || [];
        nextPage = response.data.assets?.nextPage || null;
        pageNum++;

        const needed = take - collectedAssets.length;
        collectedAssets = collectedAssets.concat(pageAssets.slice(0, needed));

        if (pageAssets.length === 0) {
          break;
        }
      }

      // If skip was 0, we need to fetch the first page
      if (skip === 0 && collectedAssets.length === 0) {
        const response = await client.post('/api/search/metadata', baseRequest);
        collectedAssets = response.data.assets?.items || response.data.assets || [];
        nextPage = response.data.assets?.nextPage || null;
      }

      const hasMore = nextPage !== null || collectedAssets.length === take;

      return {
        assets: collectedAssets.slice(0, take),
        hasMore,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorCode = isAxiosError(error) ? error.code || 'Unknown' : 'Unknown';
      console.error('[Immich Service] Error fetching assets by date range:', errorCode, '-', errorMessage);
      throw new AppError('Failed to fetch assets by date range', 500);
    }
  }
}

export default new ImmichService();
