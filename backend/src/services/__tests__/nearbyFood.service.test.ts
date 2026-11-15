/**
 * Nearby Food Service Tests
 *
 * Test cases:
 * - NF-001: Asks Overpass for food places around the (rounded) point, identified and form-encoded
 * - NF-002: With a diet: best match first, then nearest; places that say no are left out and counted
 * - NF-003: Without a diet: nearest first, with each place's own dietary profile
 * - NF-004: Skips elements with no name or no position, drops ones outside the radius, and de-duplicates
 * - NF-005: Cached per area: changing the diet does not ask Overpass again; a different area does
 * - NF-006: A busy Overpass is a 503, any other failure a 502, and failures are not cached
 * - NF-007: limit caps the page after ranking
 * - NF-008: Parses address, cuisine, phone, website and opening hours
 * - NF-009: Falls back to the next server, and remembers the one that worked
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('axios');
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import axios from 'axios';
import config from '../../config';
import nearbyFoodService, { buildOverpassQuery } from '../nearbyFood.service';

const mockedPost = axios.post as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;

// Reykjavik. 0.001 degrees of latitude is about 111 m.
const LAT = 64.1466;
const LNG = -21.9426;
const at = (northMetres: number) => ({ lat: LAT + northMetres / 111_195, lon: LNG });

const FIXTURE = {
  elements: [
    { type: 'node', id: 1, ...at(222), tags: { name: 'Vegan Vibes', amenity: 'restaurant', cuisine: 'vegan', 'diet:vegan': 'only' } },
    { type: 'way', id: 2, center: at(111), tags: { name: 'Garden Bistro', amenity: 'restaurant', 'diet:vegan': 'yes' } },
    { type: 'node', id: 3, ...at(55), tags: { name: 'Plain Cafe', amenity: 'cafe' } },
    { type: 'node', id: 4, ...at(78), tags: { name: 'Steak House', amenity: 'restaurant', 'diet:vegetarian': 'no' } },
    { type: 'node', id: 5, ...at(40), tags: { amenity: 'restaurant' } }, // no name
    { type: 'node', id: 6, ...at(2200), tags: { name: 'Far Away Pizza', amenity: 'restaurant' } }, // outside 1 km
    { type: 'relation', id: 7, tags: { name: 'No Position', amenity: 'restaurant' } }, // no coordinates
    {
      type: 'node',
      id: 8,
      ...at(333),
      tags: {
        name: 'Bakery Bliss',
        shop: 'bakery',
        'diet:vegan': 'limited',
        'addr:street': 'Laugavegur',
        'addr:housenumber': '5',
        'addr:city': 'Reykjavik',
      },
    },
    { type: 'node', id: 1, ...at(222), tags: { name: 'Vegan Vibes', amenity: 'restaurant', 'diet:vegan': 'only' } }, // duplicate
  ],
};

const search = (overrides: Partial<Parameters<typeof nearbyFoodService.searchNearbyFood>[0]> = {}) =>
  nearbyFoodService.searchNearbyFood({
    latitude: LAT,
    longitude: LNG,
    radiusMeters: 1000,
    limit: 50,
    ...overrides,
  });

describe('NearbyFoodService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nearbyFoodService.clearCache();
    mockedPost.mockResolvedValue({ data: FIXTURE });
  });

  describe('NF-001: the Overpass request', () => {
    it('asks around the rounded point, with a margin, form-encoded and identified', async () => {
      await search();

      expect(mockedPost).toHaveBeenCalledTimes(1);
      const [url, body, options] = mockedPost.mock.calls[0] as [string, string, { headers: Record<string, string>; timeout: number }];
      expect(url).toBe(config.overpass.urls[0]);
      expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(options.headers['User-Agent']).toMatch(/^TravelLife\//);
      expect(options.timeout).toBeGreaterThan(0);

      const query = new URLSearchParams(body).get('data') as string;
      // 64.1466 / -21.9426 round to 3 decimals; the radius grows by the rounding margin.
      expect(query).toContain('(around:1120,64.147,-21.943)');
      expect(query).toContain('["amenity"~"^(restaurant|cafe|fast_food|food_court|pub|bar|biergarten|ice_cream)$"]["name"]');
      expect(query).toContain('["shop"~"^(bakery|deli|pastry)$"]["name"]');
      expect(query).toBe(buildOverpassQuery(64.147, -21.943, 1120));
    });
  });

  describe('NF-002: a diet', () => {
    it('ranks the best match first, then nearest, and leaves out (and counts) refusals', async () => {
      const result = await search({ diet: 'vegan' });

      expect(result.places.map((p) => [p.name, p.diet])).toEqual([
        ['Vegan Vibes', 'only'],
        ['Garden Bistro', 'yes'],
        ['Bakery Bliss', 'limited'],
        ['Plain Cafe', 'unknown'],
      ]);
      // "Steak House" says it has no vegetarian options, so nothing vegan either.
      expect(result.excludedCount).toBe(1);
      expect(result.diet).toBe('vegan');
    });

    it('orders places with the same match by distance', async () => {
      mockedPost.mockResolvedValue({
        data: {
          elements: [
            { type: 'node', id: 10, ...at(500), tags: { name: 'Far Veg', amenity: 'cafe', 'diet:vegan': 'yes' } },
            { type: 'node', id: 11, ...at(100), tags: { name: 'Near Veg', amenity: 'cafe', 'diet:vegan': 'yes' } },
          ],
        },
      });

      const result = await search({ diet: 'vegan' });

      expect(result.places.map((p) => p.name)).toEqual(['Near Veg', 'Far Veg']);
    });
  });

  describe('NF-003: no diet', () => {
    it('orders by distance and carries each place\'s own dietary profile', async () => {
      const result = await search();

      expect(result.places.map((p) => p.name)).toEqual([
        'Plain Cafe',
        'Steak House',
        'Garden Bistro',
        'Vegan Vibes',
        'Bakery Bliss',
      ]);
      expect(result.diet).toBeNull();
      expect(result.excludedCount).toBe(0);
      expect(result.places.every((p) => p.diet === null)).toBe(true);

      const vibes = result.places.find((p) => p.name === 'Vegan Vibes');
      expect(vibes?.dietary).toMatchObject({ vegan: 'only', vegetarian: 'only', pescetarian: 'yes' });
      expect(result.places.find((p) => p.name === 'Plain Cafe')?.dietary).toEqual({});
    });
  });

  describe('NF-004: what is skipped', () => {
    it('drops nameless, positionless, out-of-radius and duplicate elements', async () => {
      const result = await search();
      const names = result.places.map((p) => p.name);

      expect(names).not.toContain('Far Away Pizza');
      expect(names).not.toContain('No Position');
      expect(names.filter((n) => n === 'Vegan Vibes')).toHaveLength(1);
      expect(result.places.map((p) => p.id)).not.toContain('node/5');
      // The way's position is its centre.
      expect(result.places.find((p) => p.id === 'way/2')?.latitude).toBeCloseTo(LAT + 111 / 111_195, 6);
    });

    it('reports distances from the exact point searched, not the rounded one', async () => {
      const result = await search();
      const cafe = result.places.find((p) => p.name === 'Plain Cafe');
      expect(cafe?.distanceMeters).toBeGreaterThan(50);
      expect(cafe?.distanceMeters).toBeLessThan(60);
    });
  });

  describe('NF-005: the cache', () => {
    it('serves a different diet from the cache, but asks again for another area or radius', async () => {
      await search({ diet: 'vegan' });
      await search({ diet: 'vegetarian' });
      await search();
      expect(mockedPost).toHaveBeenCalledTimes(1);

      // Within the same ~110 m cell: the same entry.
      await search({ latitude: LAT + 0.0001 });
      expect(mockedPost).toHaveBeenCalledTimes(1);

      await search({ latitude: LAT + 0.01 });
      expect(mockedPost).toHaveBeenCalledTimes(2);
      await search({ radiusMeters: 2000 });
      expect(mockedPost).toHaveBeenCalledTimes(3);
    });

    it('de-duplicates concurrent identical searches into one request', async () => {
      await Promise.all([search({ diet: 'vegan' }), search({ diet: 'halal' }), search()]);
      expect(mockedPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('NF-006: failures', () => {
    const failAll = (error: unknown) => {
      for (let i = 0; i < config.overpass.urls.length; i += 1) mockedPost.mockRejectedValueOnce(error);
    };

    it('maps a busy Overpass (or one that never answers) to 503, and a hard failure to 502', async () => {
      failAll({ isAxiosError: true, message: 'busy', response: { status: 429 } });
      await expect(search()).rejects.toMatchObject({ statusCode: 503 });

      // "All query workers are busy" is a 502 from Overpass itself, and still just busy.
      failAll({ isAxiosError: true, message: 'capacity', response: { status: 502 } });
      await expect(search()).rejects.toMatchObject({ statusCode: 503 });

      failAll({ isAxiosError: true, message: 'gateway', response: { status: 504 } });
      await expect(search()).rejects.toMatchObject({ statusCode: 503 });

      // A timeout has no status at all.
      failAll(new Error('timeout of 20000ms exceeded'));
      await expect(search()).rejects.toMatchObject({ statusCode: 503 });

      failAll({ isAxiosError: true, message: 'down', response: { status: 500 } });
      await expect(search()).rejects.toMatchObject({ statusCode: 502 });
    });

    it('does not cache a failure: the next search goes out again and succeeds', async () => {
      failAll({ isAxiosError: true, message: 'busy', response: { status: 429 } });
      await expect(search()).rejects.toMatchObject({ statusCode: 503 });

      const result = await search();
      expect(result.places.length).toBeGreaterThan(0);
    });
  });

  describe('NF-009: several servers', () => {
    it('falls back to the next server, and starts there next time', async () => {
      expect(config.overpass.urls.length).toBeGreaterThan(1);
      mockedPost
        .mockRejectedValueOnce({ isAxiosError: true, message: 'capacity', response: { status: 502 } })
        .mockResolvedValueOnce({ data: FIXTURE });

      const first = await search();

      expect(first.places.length).toBeGreaterThan(0);
      const calledUrls = mockedPost.mock.calls.map((call) => call[0]);
      expect(calledUrls).toEqual([config.overpass.urls[0], config.overpass.urls[1]]);

      // A different area (so not cached) starts with the server that worked.
      mockedPost.mockClear();
      mockedPost.mockResolvedValue({ data: FIXTURE });
      await search({ latitude: LAT + 0.05 });
      expect(mockedPost.mock.calls.map((call) => call[0])).toEqual([config.overpass.urls[1]]);
    });

    it('probes every server but the last briefly, and gives the last one longer', async () => {
      mockedPost.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ data: FIXTURE });
      await search();

      const timeouts = mockedPost.mock.calls.map((call) => (call[2] as { timeout: number }).timeout);
      expect(timeouts).toHaveLength(2);
      expect(timeouts[0]).toBeLessThan(timeouts[1]);
      expect(timeouts[0]).toBeLessThanOrEqual(10_000);
    });

    it('wraps round to the earlier server when the preferred one then fails', async () => {
      mockedPost
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ data: FIXTURE }); // second server becomes preferred
      await search();

      mockedPost.mockClear();
      mockedPost
        .mockRejectedValueOnce({ isAxiosError: true, message: 'busy', response: { status: 429 } })
        .mockResolvedValueOnce({ data: FIXTURE });
      await search({ latitude: LAT + 0.05 });

      expect(mockedPost.mock.calls.map((call) => call[0])).toEqual([config.overpass.urls[1], config.overpass.urls[0]]);
    });
  });

  describe('NF-007: limit', () => {
    it('caps the page after ranking, so the best matches are the ones kept', async () => {
      const result = await search({ diet: 'vegan', limit: 2 });
      expect(result.places.map((p) => p.name)).toEqual(['Vegan Vibes', 'Garden Bistro']);
    });
  });

  describe('NF-008: place details', () => {
    it('parses address, cuisine, phone, website and opening hours', async () => {
      mockedPost.mockResolvedValue({
        data: {
          elements: [
            {
              type: 'node',
              id: 20,
              ...at(100),
              tags: {
                name: 'Cafe Loki',
                amenity: 'cafe',
                cuisine: 'icelandic; coffee_shop ;',
                opening_hours: 'Mo-Su 09:00-21:00',
                'contact:phone': '+354 466 2828',
                website: ' https://example.is ',
                'addr:street': 'Lokastigur',
                'addr:housenumber': '28',
                'addr:city': 'Reykjavik',
              },
            },
            { type: 'node', id: 21, ...at(150), tags: { name: 'Bare Bones', shop: 'deli', 'addr:full': '1 Main St' } },
          ],
        },
      });

      const [loki, bare] = (await search()).places;

      expect(loki).toMatchObject({
        id: 'node/20',
        name: 'Cafe Loki',
        category: 'cafe',
        cuisine: ['icelandic', 'coffee_shop'],
        openingHours: 'Mo-Su 09:00-21:00',
        phone: '+354 466 2828',
        website: 'https://example.is',
        address: 'Lokastigur 28, Reykjavik',
      });
      expect(bare).toMatchObject({
        category: 'deli',
        cuisine: [],
        openingHours: null,
        phone: null,
        website: null,
        address: '1 Main St',
      });
    });
  });
});
