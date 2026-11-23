import { describe, expect, it } from 'vitest';
import { contourSeed, generateContours } from './contours';

describe('generateContours', () => {
  it('is deterministic for the same seed', () => {
    const a = generateContours({ seed: 'trip-1', width: 400, height: 200 });
    const b = generateContours({ seed: 'trip-1', width: 400, height: 200 });
    expect(a).toEqual(b);
  });

  it('differs between seeds', () => {
    const a = generateContours({ seed: 'trip-1', width: 400, height: 200 });
    const b = generateContours({ seed: 'trip-2', width: 400, height: 200 });
    expect(a).not.toEqual(b);
  });

  it('returns the requested number of closed paths', () => {
    const paths = generateContours({ seed: 7, width: 400, height: 200, count: 9 });
    expect(paths).toHaveLength(9);
    for (const d of paths) {
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      expect(d).not.toMatch(/NaN|Infinity/);
    }
  });

  it('clamps count and handles a degenerate box', () => {
    expect(generateContours({ seed: 1, width: 100, height: 100, count: 500 })).toHaveLength(24);
    expect(generateContours({ seed: 1, width: 100, height: 100, count: 0 })).toHaveLength(1);
    expect(generateContours({ seed: 1, width: 0, height: 100 })).toEqual([]);
  });
});

describe('contourSeed', () => {
  it('combines id and rounded coordinates', () => {
    expect(contourSeed({ id: 5, latitude: 48.8566, longitude: 2.3522 })).toBe('id5|ll48.9,2.4');
  });
  it('falls back to a constant', () => {
    expect(contourSeed({})).toBe('travel-life');
  });
});
