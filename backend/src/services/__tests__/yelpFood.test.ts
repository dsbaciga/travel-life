/**
 * Yelp as a second source for nearby food
 *
 * Test cases:
 * - YF-001: Without a key, or for a diet Yelp has no category for, Yelp is not asked
 * - YF-002: Asks Yelp for the diet's category, authenticated, and maps businesses to places
 * - YF-003: Skips closed, unnamed or unlocated businesses; maps categories
 * - YF-004: A Yelp failure returns nothing rather than throwing
 * - YF-005: A place both sources know keeps the map's details, gains Yelp's listing and the better diet match
 * - YF-006: A place only Yelp knows is added; one the map says does not cater stays out
 * - YF-007: The service searches both, merges them and credits Yelp; with no diet Yelp is not asked
 * - YF-008: If the map is down but Yelp answers, Yelp's places come back; with neither, the map's error
 * - YF-009: Name matching ignores case, accents and punctuation
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('axios');
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import axios from 'axios';
import config from '../../config';
import nearbyFoodService, { mergeYelp, normalizeName } from '../nearbyFood.service';
import { categoryOf, searchYelp, yelpToPlaces } from '../yelp.service';
import type { NearbyFoodPlace } from '../_shared/vendored/nearbyFood';

const mockedGet = axios.get as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockedPost = axios.post as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const ORIGIN = { latitude: 64.1466, longitude: -21.9426 };
const at = (northMetres: number) => ORIGIN.latitude + northMetres / 111_195;

const business = (id: string, name: string, northMetres: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name,
  url: `https://www.yelp.com/biz/${id}`,
  rating: 4.5,
  review_count: 120,
  price: '$$',
  phone: '+3541234567',
  is_closed: false,
  categories: [{ alias: 'gluten_free', title: 'Gluten-Free' }, { alias: 'icelandic', title: 'Icelandic' }],
  coordinates: { latitude: at(northMetres), longitude: ORIGIN.longitude },
  location: { display_address: ['Laugavegur 1', '101 Reykjavik'] },
  ...overrides,
});

const place = (overrides: Partial<NearbyFoodPlace> = {}): NearbyFoodPlace => ({
  id: 'node/1',
  name: 'Cafe Loki',
  category: 'cafe',
  cuisine: [],
  latitude: at(100),
  longitude: ORIGIN.longitude,
  distanceMeters: 100,
  openingHours: null,
  phone: null,
  website: null,
  address: null,
  diet: 'unknown',
  dietary: {},
  sources: ['osm'],
  ...overrides,
});

describe('yelp as a second source', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
    nearbyFoodService.clearCache();
    config.yelp.apiKey = 'test-key';
  });

  it('YF-001: is not asked without a key, or for a diet with no Yelp category', async () => {
    config.yelp.apiKey = '';
    expect(await searchYelp(ORIGIN, 1000, 'gluten_free')).toEqual([]);

    config.yelp.apiKey = 'test-key';
    expect(await searchYelp(ORIGIN, 1000, 'lactose_free')).toEqual([]);
    expect(await searchYelp(ORIGIN, 1000, 'pescetarian')).toEqual([]);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('YF-002: asks for the diet category with the key, and maps businesses to places', async () => {
    mockedGet.mockResolvedValue({ data: { businesses: [business('b1', 'Gló', 200)] } });

    const places = await searchYelp(ORIGIN, 1000, 'gluten_free');

    const [url, options] = mockedGet.mock.calls[0] as [string, { params: Record<string, unknown>; headers: Record<string, string> }];
    expect(url).toBe('https://api.yelp.com/v3/businesses/search');
    expect(options.params).toMatchObject({ categories: 'gluten_free', sort_by: 'distance', radius: 1000 });
    expect(options.headers.Authorization).toBe('Bearer test-key');
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      id: 'yelp/b1',
      name: 'Gló',
      category: 'restaurant',
      // The diet's own category is not a cuisine.
      cuisine: ['icelandic'],
      diet: 'yes',
      dietary: { gluten_free: 'yes' },
      sources: ['yelp'],
      address: 'Laugavegur 1, 101 Reykjavik',
      yelp: { url: 'https://www.yelp.com/biz/b1', rating: 4.5, reviewCount: 120, price: '$$' },
    });
    expect(places[0].distanceMeters).toBeGreaterThan(180);
    expect(places[0].distanceMeters).toBeLessThan(220);
  });

  it('YF-003: skips closed, unnamed and unlocated businesses, and maps categories', () => {
    const places = yelpToPlaces(
      [
        business('open', 'Open', 10),
        business('closed', 'Closed', 10, { is_closed: true }),
        business('noname', '  ', 10),
        business('nocoords', 'Nowhere', 10, { coordinates: { latitude: null, longitude: null } }),
        business('zero', 'Null Island', 10, { coordinates: { latitude: 0, longitude: 0 } }),
        business('bake', 'Brauð', 10, { categories: [{ alias: 'bakeries', title: 'Bakeries' }] }),
      ],
      ORIGIN,
      'gluten_free',
      'gluten_free'
    );
    expect(places.map((p) => p.name)).toEqual(['Open', 'Brauð']);
    expect(places[1].category).toBe('bakery');
    expect(categoryOf(['coffee'])).toBe('cafe');
    expect(categoryOf(['pubs'])).toBe('pub');
    expect(categoryOf(['pizza'])).toBe('fast_food');
    expect(categoryOf(['icelandic'])).toBe('restaurant');
  });

  it('YF-004: a failure returns nothing rather than throwing', async () => {
    mockedGet.mockRejectedValue(new Error('401'));
    await expect(searchYelp(ORIGIN, 1000, 'vegan')).resolves.toEqual([]);
  });

  it('YF-005: a place both know keeps the map details, and gains the listing and better match', () => {
    const osm = place({ phone: null, website: 'https://loki.is' });
    const yelp = yelpToPlaces([business('loki', 'Café Loki', 105)], ORIGIN, 'gluten_free', 'gluten_free');

    const merged = mergeYelp([osm], yelp, 'gluten_free', 1000);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'node/1',
      website: 'https://loki.is',
      phone: '+3541234567',
      diet: 'yes',
      dietary: { gluten_free: 'yes' },
      sources: ['osm', 'yelp'],
      yelp: { rating: 4.5 },
    });
  });

  it('YF-006: adds a place only Yelp knows; a place the map says does not cater stays out', () => {
    const osmNo = place({ id: 'node/2', name: 'Steak House', diet: 'no', dietary: { gluten_free: 'no' } });
    const yelp = yelpToPlaces(
      [business('steak', 'Steak House', 5), business('new', 'Gló', 300), business('far', 'Far Away', 5000)],
      ORIGIN,
      'gluten_free',
      'gluten_free'
    );

    const merged = mergeYelp([osmNo], yelp, 'gluten_free', 1000);

    // The map's "no" is kept (and later excluded); Gló is added; the one beyond the radius is not.
    expect(merged.map((p) => `${p.name}:${p.diet}`)).toEqual(['Steak House:no', 'Gló:yes']);
    expect(merged[0].sources).toEqual(['osm', 'yelp']);
  });

  it('YF-007: the service searches both, merges them and credits Yelp; with no diet Yelp is not asked', async () => {
    mockedPost.mockResolvedValue({
      data: {
        elements: [{ type: 'node', id: 1, lat: at(100), lon: ORIGIN.longitude, tags: { name: 'Cafe Loki', amenity: 'cafe' } }],
      },
    });
    mockedGet.mockResolvedValue({
      data: { businesses: [business('loki', 'Café Loki', 100), business('glo', 'Gló', 250)] },
    });

    const withDiet = await nearbyFoodService.searchNearbyFood({ ...ORIGIN, radiusMeters: 1000, diet: 'gluten_free', limit: 50 });
    expect(withDiet.yelpUsed).toBe(true);
    expect(withDiet.places.map((p) => p.name).sort()).toEqual(['Cafe Loki', 'Gló']);
    expect(withDiet.places.every((p) => p.diet === 'yes')).toBe(true);

    mockedGet.mockClear();
    const without = await nearbyFoodService.searchNearbyFood({ ...ORIGIN, radiusMeters: 1000, limit: 50 });
    expect(mockedGet).not.toHaveBeenCalled();
    expect(without.yelpUsed).toBeUndefined();
    expect(without.places).toHaveLength(1);
  });

  it('YF-008: with the map down, Yelp still answers; with neither, the map error is reported', async () => {
    mockedPost.mockRejectedValue(Object.assign(new Error('busy'), { isAxiosError: true, response: { status: 502 } }));
    mockedGet.mockResolvedValue({ data: { businesses: [business('glo', 'Gló', 250)] } });

    const result = await nearbyFoodService.searchNearbyFood({ ...ORIGIN, radiusMeters: 1000, diet: 'gluten_free', limit: 50 });
    expect(result.places.map((p) => p.name)).toEqual(['Gló']);

    nearbyFoodService.clearCache();
    mockedGet.mockResolvedValue({ data: { businesses: [] } });
    await expect(
      nearbyFoodService.searchNearbyFood({ ...ORIGIN, radiusMeters: 1000, diet: 'gluten_free', limit: 50 })
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });
  });

  it('YF-009: name matching ignores case, accents and punctuation', () => {
    expect(normalizeName('Café Loki!')).toBe('cafeloki');
    expect(normalizeName('  CAFE  loki ')).toBe('cafeloki');
  });
});
