/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../lib/axios';
import photoService from '../photo.service';

describe('PhotoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadPhoto', () => {
    it('should call POST /photos/upload with FormData containing file and trip data', async () => {
      const mockFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      const uploadData = { tripId: 1, caption: 'Beautiful view' };
      const mockPhoto = { id: 1, tripId: 1, caption: 'Beautiful view', url: '/uploads/photo.jpg' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockPhoto });

      const result = await photoService.uploadPhoto(mockFile, uploadData);

      expect(api.post).toHaveBeenCalledTimes(1);
      const [url, formData, config] = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/photos/upload');
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('tripId')).toBe('1');
      expect(formData.get('caption')).toBe('Beautiful view');
      expect(formData.get('photo')).toBe(mockFile);
      expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
      expect(result).toEqual(mockPhoto);
    });

    it('should include optional fields in FormData when provided', async () => {
      const mockFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      const uploadData = {
        tripId: 2,
        caption: 'Sunset',
        takenAt: '2024-06-15T18:00:00Z',
        latitude: 48.8584,
        longitude: 2.2945,
      };
      const mockPhoto = { id: 2, ...uploadData };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockPhoto });

      await photoService.uploadPhoto(mockFile, uploadData);

      const formData = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(formData.get('takenAt')).toBe('2024-06-15T18:00:00Z');
      expect(formData.get('latitude')).toBe('48.8584');
      expect(formData.get('longitude')).toBe('2.2945');
    });

    it('should not include optional fields in FormData when not provided', async () => {
      const mockFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      const uploadData = { tripId: 1 };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 1 } });

      await photoService.uploadPhoto(mockFile, uploadData);

      const formData = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(formData.get('caption')).toBeNull();
      expect(formData.get('takenAt')).toBeNull();
      expect(formData.get('latitude')).toBeNull();
      expect(formData.get('longitude')).toBeNull();
    });

    it('should propagate errors on upload failure', async () => {
      const mockFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      const error = new Error('Upload failed');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(photoService.uploadPhoto(mockFile, { tripId: 1 })).rejects.toThrow('Upload failed');
    });
  });

  describe('linkImmichPhoto', () => {
    it('should call POST /photos/immich with link data', async () => {
      const linkData = { tripId: 1, immichAssetId: 'asset-123' };
      const mockPhoto = { id: 5, tripId: 1, immichAssetId: 'asset-123' };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockPhoto });

      const result = await photoService.linkImmichPhoto(linkData as any);

      expect(api.post).toHaveBeenCalledWith('/photos/immich', linkData);
      expect(result).toEqual(mockPhoto);
    });
  });

  describe('linkImmichPhotosBatch', () => {
    it('should call POST /photos/immich/batch with batch data', async () => {
      const batchData = {
        tripId: 1,
        assets: [
          { immichAssetId: 'asset-1', caption: 'Photo 1' },
          { immichAssetId: 'asset-2', caption: 'Photo 2' },
        ],
      };
      const mockResult = { total: 2, successful: 2, failed: 0, errors: [], photoIds: [1, 2] };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await photoService.linkImmichPhotosBatch(batchData);

      expect(api.post).toHaveBeenCalledWith('/photos/immich/batch', batchData);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getPhotosByTrip', () => {
    it('should call GET /photos/trip/:tripId without options', async () => {
      const mockResponse = { photos: [{ id: 1 }], total: 1, hasMore: false };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await photoService.getPhotosByTrip(3);

      expect(api.get).toHaveBeenCalledWith('/photos/trip/3', { params: undefined });
      expect(result).toEqual(mockResponse);
    });

    it('should call GET /photos/trip/:tripId with pagination options', async () => {
      const options = { skip: 0, take: 20, sortBy: 'takenAt', sortOrder: 'desc' };
      const mockResponse = { photos: [], total: 0, hasMore: false };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await photoService.getPhotosByTrip(3, options);

      expect(api.get).toHaveBeenCalledWith('/photos/trip/3', { params: options });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getUnsortedPhotosByTrip', () => {
    it('should call GET /photos/trip/:tripId/unsorted', async () => {
      const mockResponse = { photos: [{ id: 2 }], total: 1, hasMore: false };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await photoService.getUnsortedPhotosByTrip(4);

      expect(api.get).toHaveBeenCalledWith('/photos/trip/4/unsorted', { params: undefined });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getPhotoById', () => {
    it('should call GET /photos/:photoId', async () => {
      const mockPhoto = { id: 10, caption: 'Mountain view' };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockPhoto });

      const result = await photoService.getPhotoById(10);

      expect(api.get).toHaveBeenCalledWith('/photos/10');
      expect(result).toEqual(mockPhoto);
    });
  });

  describe('updatePhoto', () => {
    it('should call PUT /photos/:photoId with update data', async () => {
      const updateData = { caption: 'Updated caption' };
      const mockPhoto = { id: 10, caption: 'Updated caption' };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockPhoto });

      const result = await photoService.updatePhoto(10, updateData as any);

      expect(api.put).toHaveBeenCalledWith('/photos/10', updateData);
      expect(result).toEqual(mockPhoto);
    });
  });

  describe('deletePhoto', () => {
    it('should call DELETE /photos/:photoId', async () => {
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await photoService.deletePhoto(10);

      expect(api.delete).toHaveBeenCalledWith('/photos/10');
      expect(api.delete).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors on delete failure', async () => {
      const error = new Error('Not found');
      (api.delete as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(photoService.deletePhoto(999)).rejects.toThrow('Not found');
    });
  });

  describe('createAlbum', () => {
    it('should call POST /albums with album data', async () => {
      const albumData = { tripId: 1, name: 'Day 1 Photos', description: 'First day of the trip' };
      const mockAlbum = { id: 1, ...albumData };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockAlbum });

      const result = await photoService.createAlbum(albumData as any);

      expect(api.post).toHaveBeenCalledWith('/albums', albumData);
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('getAlbumsByTrip', () => {
    it('should call GET /albums/trip/:tripId without options', async () => {
      const mockResponse = {
        albums: [{ id: 1, name: 'Album 1' }],
        totalAlbums: 1,
        hasMore: false,
        unsortedCount: 5,
        totalCount: 10,
      };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await photoService.getAlbumsByTrip(2);

      expect(api.get).toHaveBeenCalledWith('/albums/trip/2', { params: undefined });
      expect(result).toEqual(mockResponse);
    });

    it('should call GET /albums/trip/:tripId with pagination options', async () => {
      const options = { skip: 0, take: 10 };
      const mockResponse = { albums: [], totalAlbums: 0, hasMore: false, unsortedCount: 0, totalCount: 0 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await photoService.getAlbumsByTrip(2, options);

      expect(api.get).toHaveBeenCalledWith('/albums/trip/2', { params: options });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getAlbumById', () => {
    it('should call GET /albums/:albumId with options', async () => {
      const options = { skip: 0, take: 20 };
      const mockAlbum = { id: 1, name: 'Album', photos: [] };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockAlbum });

      const result = await photoService.getAlbumById(1, options);

      expect(api.get).toHaveBeenCalledWith('/albums/1', { params: options });
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('updateAlbum', () => {
    it('should call PUT /albums/:albumId with update data', async () => {
      const updateData = { name: 'Updated Album Name' };
      const mockAlbum = { id: 1, name: 'Updated Album Name' };
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockAlbum });

      const result = await photoService.updateAlbum(1, updateData as any);

      expect(api.put).toHaveBeenCalledWith('/albums/1', updateData);
      expect(result).toEqual(mockAlbum);
    });
  });

  describe('deleteAlbum', () => {
    it('should call DELETE /albums/:albumId', async () => {
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await photoService.deleteAlbum(5);

      expect(api.delete).toHaveBeenCalledWith('/albums/5');
    });
  });

  describe('addPhotosToAlbum', () => {
    it('should call POST /albums/:albumId/photos with photo IDs', async () => {
      const addData = { photoIds: [1, 2, 3] };
      const mockResult = { success: true, addedCount: 3 };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await photoService.addPhotosToAlbum(1, addData as any);

      expect(api.post).toHaveBeenCalledWith('/albums/1/photos', addData);
      expect(result).toEqual(mockResult);
    });
  });

  describe('removePhotoFromAlbum', () => {
    it('should call DELETE /albums/:albumId/photos/:photoId', async () => {
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null });

      await photoService.removePhotoFromAlbum(1, 5);

      expect(api.delete).toHaveBeenCalledWith('/albums/1/photos/5');
    });
  });

  describe('getAllAlbums', () => {
    it('should call GET /albums without options', async () => {
      const mockResponse = { albums: [], total: 0 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await photoService.getAllAlbums();

      expect(api.get).toHaveBeenCalledWith('/albums', { params: {} });
      expect(result).toEqual(mockResponse);
    });

    it('should call GET /albums with skip, take, and tagIds', async () => {
      const mockResponse = { albums: [{ id: 1 }], total: 1 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResponse });

      const result = await photoService.getAllAlbums({ skip: 0, take: 10, tagIds: [1, 2] });

      expect(api.get).toHaveBeenCalledWith('/albums', { params: { skip: 0, take: 10, tagIds: '1,2' } });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getImmichAssetIdsByTrip', () => {
    it('should call GET /photos/trip/:tripId/immich-asset-ids and return assetIds', async () => {
      const mockData = { assetIds: ['asset-1', 'asset-2'] };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockData });

      const result = await photoService.getImmichAssetIdsByTrip(1);

      expect(api.get).toHaveBeenCalledWith('/photos/trip/1/immich-asset-ids');
      expect(result).toEqual(['asset-1', 'asset-2']);
    });
  });

  describe('getPhotoDateGroupings', () => {
    it('should call GET /photos/trip/:tripId/date-groupings without timezone', async () => {
      const mockData = { groupings: [], totalWithDates: 0, totalWithoutDates: 0 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockData });

      const result = await photoService.getPhotoDateGroupings(1);

      expect(api.get).toHaveBeenCalledWith('/photos/trip/1/date-groupings', { params: undefined });
      expect(result).toEqual(mockData);
    });

    it('should call GET /photos/trip/:tripId/date-groupings with timezone', async () => {
      const mockData = { groupings: [{ date: '2024-06-01', count: 5 }], totalWithDates: 5, totalWithoutDates: 0 };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockData });

      const result = await photoService.getPhotoDateGroupings(1, 'America/New_York');

      expect(api.get).toHaveBeenCalledWith('/photos/trip/1/date-groupings', { params: { timezone: 'America/New_York' } });
      expect(result).toEqual(mockData);
    });
  });

  describe('getAlbumSuggestions', () => {
    it('should call GET /photos/trip/:tripId/suggest-albums', async () => {
      const mockSuggestions = [{ name: 'Day 1', photoIds: [1, 2], type: 'date', confidence: 0.9, metadata: { date: '2024-06-01' } }];
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockSuggestions });

      const result = await photoService.getAlbumSuggestions(1);

      expect(api.get).toHaveBeenCalledWith('/photos/trip/1/suggest-albums');
      expect(result).toEqual(mockSuggestions);
    });
  });

  describe('acceptAlbumSuggestion', () => {
    it('should call POST /photos/trip/:tripId/accept-suggestion with suggestion data', async () => {
      const suggestion = { name: 'Day 1', photoIds: [1, 2] };
      const mockResult = { albumId: 10 };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await photoService.acceptAlbumSuggestion(1, suggestion);

      expect(api.post).toHaveBeenCalledWith('/photos/trip/1/accept-suggestion', suggestion);
      expect(result).toEqual(mockResult);
    });
  });
});
