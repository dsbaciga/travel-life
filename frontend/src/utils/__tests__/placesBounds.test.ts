import { describe, it, expect } from 'vitest';
import { validCoordinates, isSinglePoint, pointsSignature } from '../placesBounds';

describe('placesBounds', () => {
  it('keeps only places with usable coordinates', () => {
    const points = validCoordinates([
      { latitude: 48.8, longitude: 2.3 },
      { latitude: null, longitude: 2 },
      { latitude: '40.7', longitude: '-74' },
      { latitude: 95, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: 'x', longitude: 1 },
      {},
    ]);
    expect(points).toEqual([
      [48.8, 2.3],
      [40.7, -74],
    ]);
  });

  it('keeps places on the equator and prime meridian', () => {
    expect(validCoordinates([{ latitude: 0, longitude: 0 }])).toEqual([[0, 0]]);
  });

  it('detects a single spot', () => {
    expect(isSinglePoint([[1, 2]])).toBe(true);
    expect(isSinglePoint([[1, 2], [1, 2]])).toBe(true);
    expect(isSinglePoint([[1, 2], [1, 3]])).toBe(false);
  });

  it('builds a signature that changes with the places', () => {
    expect(pointsSignature([[1, 2], [3, 4]])).toBe('1,2|3,4');
    expect(pointsSignature([])).toBe('');
  });
});
