import axios from '../lib/axios';
import type {
  ImmichAsset,
  ImmichAlbum,
  ImmichSettings,
  ImmichConnectionTest,
} from '../types/immich';

class ImmichService {
  /**
   * Test connection to Immich instance
   */
  async testConnection(apiUrl: string, apiKey: string): Promise<ImmichConnectionTest> {
    const response = await axios.post('/immich/test', { apiUrl, apiKey });
    return response.data;
  }

  /**
   * Get user's Immich settings
   */
  async getSettings(): Promise<ImmichSettings> {
    const response = await axios.get('/users/immich-settings');
    return response.data;
  }

  /**
   * Update user's Immich settings
   */
  async updateSettings(settings: {
    immichApiUrl?: string | null;
    immichApiKey?: string | null;
  }): Promise<{ success: boolean; message: string; immichConfigured: boolean }> {
    const response = await axios.put('/users/immich-settings', settings);
    return response.data;
  }

  /**
   * Get user's assets from Immich
   */
  async getAssets(options?: {
    skip?: number;
    take?: number;
    isFavorite?: boolean;
    isArchived?: boolean;
  }): Promise<{ assets: ImmichAsset[]; hasMore: boolean }> {
    const response = await axios.get('/immich/assets', { params: options });
    return response.data;
  }

  /**
   * Get a single asset by ID
   */
  async getAssetById(assetId: string): Promise<ImmichAsset> {
    const response = await axios.get(`/immich/assets/${assetId}`);
    return response.data;
  }

  /**
   * Get asset URLs (thumbnail and file)
   */
  async getAssetUrls(assetId: string): Promise<{
    assetId: string;
    thumbnailUrl: string;
    fileUrl: string;
  }> {
    const response = await axios.get(`/immich/assets/${assetId}/urls`);
    return response.data;
  }

  /**
   * Search assets by metadata
   */
  async searchAssets(query: {
    q?: string;
    searchTerm?: string;
    city?: string;
    state?: string;
    country?: string;
    make?: string;
    model?: string;
    takenAfter?: string;
    takenBefore?: string;
  }): Promise<{ assets: ImmichAsset[] }> {
    const response = await axios.post('/immich/search', query);
    return response.data;
  }

  /**
   * Get assets by date range (useful for trip dates)
   */
  async getAssetsByDateRange(
    startDate: string,
    endDate: string,
    options?: {
      skip?: number;
      take?: number;
    }
  ): Promise<{ assets: ImmichAsset[]; hasMore: boolean }> {
    // Normalize dates to YYYY-MM-DD format (strip time component from ISO strings)
    const normalizedStart = startDate.includes('T') ? startDate.split('T')[0] : startDate;
    const normalizedEnd = endDate.includes('T') ? endDate.split('T')[0] : endDate;
    const response = await axios.get('/immich/assets/date-range', {
      params: { startDate: normalizedStart, endDate: normalizedEnd, ...options },
    });
    return response.data;
  }

  /**
   * Get user's albums
   */
  async getAlbums(shared?: boolean): Promise<{ albums: ImmichAlbum[] }> {
    const response = await axios.get('/immich/albums', {
      params: shared !== undefined ? { shared } : {},
    });
    return response.data;
  }

  /**
   * Get album by ID with its assets
   */
  async getAlbumById(albumId: string): Promise<ImmichAlbum> {
    const response = await axios.get(`/immich/albums/${albumId}`);
    return response.data;
  }
}

export default new ImmichService();
