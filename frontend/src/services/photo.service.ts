import api from '../lib/axios';
import type {
  Photo,
  PhotoAlbum,
  AlbumWithPhotos,
  UploadPhotoInput,
  LinkImmichPhotoInput,
  UpdatePhotoInput,
  CreateAlbumInput,
  UpdateAlbumInput,
  AddPhotosToAlbumInput,
  AllAlbumsResponse,
} from '../types/photo';

class PhotoService {
  async uploadPhoto(file: File, data: UploadPhotoInput, options?: { signal?: AbortSignal }): Promise<Photo> {
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('tripId', data.tripId.toString());
    if (data.caption) {
      formData.append('caption', data.caption);
    }
    if (data.takenAt) {
      formData.append('takenAt', data.takenAt);
    }
    if (data.latitude !== undefined) {
      formData.append('latitude', data.latitude.toString());
    }
    if (data.longitude !== undefined) {
      formData.append('longitude', data.longitude.toString());
    }

    const response = await api.post('/photos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal: options?.signal,
    });
    return response.data;
  }

  async linkImmichPhoto(data: LinkImmichPhotoInput): Promise<Photo> {
    const response = await api.post('/photos/immich', data);
    return response.data;
  }

  async linkImmichPhotosBatch(data: {
    tripId: number;
    assets: Array<{
      immichAssetId: string;
      mediaType?: 'image' | 'video';
      duration?: number;
      caption?: string;
      takenAt?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }>;
  }): Promise<{ total: number; successful: number; failed: number; errors: string[]; photoIds: number[] }> {
    const response = await api.post('/photos/immich/batch', data);
    return response.data;
  }

  async getPhotosByTrip(
    tripId: number,
    options?: { skip?: number; take?: number; sortBy?: string; sortOrder?: string }
  ): Promise<{ photos: Photo[]; total: number; hasMore: boolean }> {
    const response = await api.get(`/photos/trip/${tripId}`, {
      params: options,
    });
    return response.data;
  }

  async getUnsortedPhotosByTrip(
    tripId: number,
    options?: { skip?: number; take?: number; sortBy?: string; sortOrder?: string }
  ): Promise<{ photos: Photo[]; total: number; hasMore: boolean }> {
    const response = await api.get(`/photos/trip/${tripId}/unsorted`, {
      params: options,
    });
    return response.data;
  }

  async getImmichAssetIdsByTrip(tripId: number): Promise<string[]> {
    const response = await api.get(`/photos/trip/${tripId}/immich-asset-ids`);
    return response.data.assetIds;
  }

  async getPhotoById(photoId: number): Promise<Photo> {
    const response = await api.get(`/photos/${photoId}`);
    return response.data;
  }

  async updatePhoto(photoId: number, data: UpdatePhotoInput): Promise<Photo> {
    const response = await api.put(`/photos/${photoId}`, data);
    return response.data;
  }

  async deletePhoto(photoId: number): Promise<void> {
    await api.delete(`/photos/${photoId}`);
  }

  // Album methods
  async getAllAlbums(options?: { skip?: number; take?: number; tagIds?: number[] }): Promise<AllAlbumsResponse> {
    const params: Record<string, string | number> = {};
    if (options?.skip !== undefined) params.skip = options.skip;
    if (options?.take !== undefined) params.take = options.take;
    if (options?.tagIds && options.tagIds.length > 0) {
      params.tagIds = options.tagIds.join(',');
    }

    const response = await api.get('/albums', { params });
    return response.data;
  }

  async createAlbum(data: CreateAlbumInput): Promise<PhotoAlbum> {
    const response = await api.post('/albums', data);
    return response.data;
  }

  async getAlbumsByTrip(
    tripId: number,
    options?: { skip?: number; take?: number }
  ): Promise<{ albums: PhotoAlbum[]; totalAlbums: number; hasMore: boolean; unsortedCount: number; totalCount: number }> {
    const response = await api.get(`/albums/trip/${tripId}`, {
      params: options,
    });
    return response.data;
  }

  async getAlbumById(
    albumId: number,
    options?: { skip?: number; take?: number; sortBy?: string; sortOrder?: string }
  ): Promise<AlbumWithPhotos> {
    const response = await api.get(`/albums/${albumId}`, {
      params: options,
    });
    return response.data;
  }

  async updateAlbum(
    albumId: number,
    data: UpdateAlbumInput
  ): Promise<PhotoAlbum> {
    const response = await api.put(`/albums/${albumId}`, data);
    return response.data;
  }

  async deleteAlbum(albumId: number): Promise<void> {
    await api.delete(`/albums/${albumId}`);
  }

  async addPhotosToAlbum(
    albumId: number,
    data: AddPhotosToAlbumInput
  ): Promise<{ success: boolean; addedCount: number }> {
    const response = await api.post(`/albums/${albumId}/photos`, data);
    return response.data;
  }

  async removePhotoFromAlbum(
    albumId: number,
    photoId: number
  ): Promise<void> {
    await api.delete(`/albums/${albumId}/photos/${photoId}`);
  }

  async getPhotoDateGroupings(tripId: number, timezone?: string): Promise<PhotoDateGroupingsResponse> {
    const response = await api.get(`/photos/trip/${tripId}/date-groupings`, {
      params: timezone ? { timezone } : undefined,
    });
    return response.data;
  }

  async getPhotosByDate(tripId: number, date: string, timezone?: string): Promise<PhotosByDateResponse> {
    const response = await api.get(`/photos/trip/${tripId}/by-date/${date}`, {
      params: timezone ? { timezone } : undefined,
    });
    return response.data;
  }

  async getAlbumSuggestions(tripId: number): Promise<AlbumSuggestion[]> {
    const response = await api.get(`/photos/trip/${tripId}/suggest-albums`);
    return response.data;
  }

  async acceptAlbumSuggestion(
    tripId: number,
    suggestion: { name: string; photoIds: number[] }
  ): Promise<{ albumId: number }> {
    const response = await api.post(`/photos/trip/${tripId}/accept-suggestion`, suggestion);
    return response.data;
  }
}

export interface PhotoDateGrouping {
  date: string; // YYYY-MM-DD format
  count: number;
}

export interface PhotoDateGroupingsResponse {
  groupings: PhotoDateGrouping[];
  totalWithDates: number;
  totalWithoutDates: number;
}

export interface PhotosByDateResponse {
  photos: Photo[];
  date: string;
  count: number;
}

export interface AlbumSuggestion {
  name: string;
  photoIds: number[];
  type: 'date' | 'location';
  confidence: number;
  metadata: {
    date?: string;
    locationName?: string;
    locationId?: number;
  };
}

export const photoService = new PhotoService();
export default photoService;
