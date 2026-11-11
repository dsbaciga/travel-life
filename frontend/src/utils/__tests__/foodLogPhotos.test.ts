import { describe, it, expect } from 'vitest';
import { foodPhotoUrls } from '../foodLogPhotos';
import type { FoodLogPhoto } from '../../types/foodLog';

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

describe('foodPhotoUrls', () => {
  it('returns separate thumbnail and full-size URLs for a local photo', () => {
    const urls = foodPhotoUrls(photo());
    expect(urls?.thumb).toMatch(/a-thumb\.jpg$/);
    expect(urls?.full).toMatch(/a\.jpg$/);
  });

  it('falls back to the full image when there is no thumbnail', () => {
    const urls = foodPhotoUrls(photo({ thumbnailPath: null }));
    expect(urls?.thumb).toBe(urls?.full);
  });

  it('skips Immich photos, which need an authenticated fetch', () => {
    expect(foodPhotoUrls(photo({ source: 'immich', immichAssetId: 'abc', localPath: null }))).toBeNull();
  });

  it('skips a local photo with no stored file', () => {
    expect(foodPhotoUrls(photo({ localPath: null, thumbnailPath: null }))).toBeNull();
  });
});
