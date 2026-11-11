import { describe, it, expect } from 'vitest';
import {
  foodPhotoFullUrl,
  foodPhotoThumbPath,
  immichAssetPayload,
  immichThumbPath,
} from '../foodLogPhotos';
import type { FoodLogPhoto } from '../../types/foodLog';
import type { ImmichAsset } from '../../types/immich';

const photo = (over: Partial<FoodLogPhoto> = {}): FoodLogPhoto => ({
  id: 1,
  source: 'local',
  mediaType: 'image',
  immichAssetId: null,
  localPath: '/uploads/photos/a.jpg',
  thumbnailPath: '/uploads/photos/a-thumb.jpg',
  caption: null,
  ...over,
});

describe('foodPhotoThumbPath', () => {
  it('uses the thumbnail when there is one', () => {
    expect(foodPhotoThumbPath(photo())).toBe('/uploads/photos/a-thumb.jpg');
  });

  it('falls back to the full image for a local photo with no thumbnail', () => {
    expect(foodPhotoThumbPath(photo({ thumbnailPath: null }))).toBe('/uploads/photos/a.jpg');
  });

  it('uses the proxied thumbnail for an Immich photo', () => {
    const p = photo({ source: 'immich', immichAssetId: 'abc', localPath: null, thumbnailPath: '/api/immich/assets/abc/thumbnail' });
    expect(foodPhotoThumbPath(p)).toBe('/api/immich/assets/abc/thumbnail');
  });

  it('returns null when there is nothing displayable', () => {
    expect(foodPhotoThumbPath(photo({ localPath: null, thumbnailPath: null }))).toBeNull();
    expect(foodPhotoThumbPath(photo({ source: 'immich', localPath: null, thumbnailPath: null }))).toBeNull();
  });
});

describe('foodPhotoFullUrl', () => {
  it('links local photos to the stored file', () => {
    expect(foodPhotoFullUrl(photo())).toMatch(/\/uploads\/photos\/a\.jpg$/);
  });

  it('never links Immich photos (the original needs an authenticated fetch)', () => {
    expect(foodPhotoFullUrl(photo({ source: 'immich', localPath: null }))).toBeNull();
  });

  it('returns null for a local photo with no stored file', () => {
    expect(foodPhotoFullUrl(photo({ localPath: null }))).toBeNull();
  });
});

describe('immich helpers', () => {
  const asset = (over: Partial<ImmichAsset> = {}): ImmichAsset =>
    ({
      id: 'asset-1',
      type: 'IMAGE',
      fileCreatedAt: '2026-07-01T12:00:00.000Z',
      exifInfo: { dateTimeOriginal: '2026-07-01T10:30:00.000Z', latitude: 41.9, longitude: 12.5 },
      ...over,
    }) as ImmichAsset;

  it('builds the proxied thumbnail path the backend stores', () => {
    expect(immichThumbPath('asset-1')).toBe('/api/immich/assets/asset-1/thumbnail');
  });

  it('prefers the EXIF capture time and carries coordinates', () => {
    expect(immichAssetPayload(asset())).toEqual({
      immichAssetId: 'asset-1',
      takenAt: '2026-07-01T10:30:00.000Z',
      latitude: 41.9,
      longitude: 12.5,
    });
  });

  it('falls back to the file creation time, with null coordinates, when there is no EXIF', () => {
    expect(immichAssetPayload(asset({ exifInfo: undefined }))).toEqual({
      immichAssetId: 'asset-1',
      takenAt: '2026-07-01T12:00:00.000Z',
      latitude: null,
      longitude: null,
    });
  });
});
