/**
 * Place Search Service Tests
 *
 * Test cases:
 * - PS-001: Asks Nominatim with an identifying User-Agent and maps hits to name/description/coordinates
 * - PS-002: Skips hits with unusable coordinates or no description
 * - PS-003: Cached per normalised query, so a repeat does not ask again
 * - PS-004: A failure is a 503 and is not cached
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('axios');
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import axios from 'axios';
import { clearPlaceSearchCache, normalizeQuery, searchPlaces, toResults } from '../placeSearch.service';

const mockedGet = axios.get as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const HITS = [
  { lat: '64.1466', lon: '-21.9426', name: 'Reykjavik', display_name: 'Reykjavik, Capital Region, Iceland' },
  { lat: '64.14', lon: '-21.94', name: '', display_name: 'Hallgrimskirkja, Reykjavik, Iceland' },
];

describe('placeSearch.service', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    clearPlaceSearchCache();
  });

  it('PS-001: asks Nominatim, identified, and maps the hits', async () => {
    mockedGet.mockResolvedValue({ data: HITS });

    const results = await searchPlaces('Reykjavik', 5);

    const [url, options] = mockedGet.mock.calls[0] as [string, { params: Record<string, unknown>; headers: Record<string, string> }];
    expect(url).toMatch(/\/search$/);
    expect(options.params).toMatchObject({ q: 'Reykjavik', format: 'jsonv2', limit: 5 });
    expect(options.headers['User-Agent']).toContain('TravelLife');
    expect(results).toEqual([
      { name: 'Reykjavik', description: 'Reykjavik, Capital Region, Iceland', latitude: 64.1466, longitude: -21.9426 },
      // No short name: the first part of the description.
      { name: 'Hallgrimskirkja', description: 'Hallgrimskirkja, Reykjavik, Iceland', latitude: 64.14, longitude: -21.94 },
    ]);
  });

  it('PS-002: skips hits with unusable coordinates or no description', () => {
    expect(
      toResults([
        { lat: 'x', lon: '1', display_name: 'Bad lat' },
        { lat: '95', lon: '1', display_name: 'Out of range' },
        { lat: '1', lon: '1' },
        { lat: '1', lon: '2', display_name: 'Fine, Place' },
      ])
    ).toEqual([{ name: 'Fine', description: 'Fine, Place', latitude: 1, longitude: 2 }]);
  });

  it('PS-003: caches per normalised query', async () => {
    mockedGet.mockResolvedValue({ data: HITS });

    await searchPlaces('Reykjavik');
    await searchPlaces('  reykjavik ');
    expect(mockedGet).toHaveBeenCalledTimes(1);

    await searchPlaces('Akureyri');
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(normalizeQuery('  Foo   Bar ')).toBe('foo bar');
  });

  it('PS-004: a failure is a 503 and is not cached', async () => {
    mockedGet.mockRejectedValueOnce(new Error('timeout'));
    await expect(searchPlaces('Reykjavik')).rejects.toMatchObject({ statusCode: 503 });

    mockedGet.mockResolvedValueOnce({ data: HITS });
    await expect(searchPlaces('Reykjavik')).resolves.toHaveLength(2);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
