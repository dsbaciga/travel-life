import { describe, expect, it } from 'vitest';
import { isMappableLocation } from '../geo';

describe('isMappableLocation', () => {
  const place = { latitude: 48.85, longitude: 2.35 };

  it('accepts a place with coordinates', () => {
    expect(isMappableLocation(place)).toBe(true);
  });

  it('rejects a place marked "exclude from map"', () => {
    expect(isMappableLocation({ ...place, excludeFromMap: true })).toBe(false);
  });

  it('treats a missing flag as not excluded (rows mirrored before the field existed)', () => {
    expect(isMappableLocation({ ...place, excludeFromMap: undefined })).toBe(true);
  });

  it('still rejects missing or unusable coordinates', () => {
    expect(isMappableLocation({ latitude: null, longitude: null })).toBe(false);
    expect(isMappableLocation({ latitude: 0, longitude: 0 })).toBe(false);
  });
});
