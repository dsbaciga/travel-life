/**
 * Food nearby logic tests
 *
 * Test cases:
 * - FNEAR-001: Stored diet and distance are read back safely
 * - FNEAR-002: With a diet, matches come first and unconfirmed places get their own heading
 * - FNEAR-003: Without a diet there is a single ungrouped list
 * - FNEAR-004: Place descriptions, phone and website links
 * - FNEAR-005: The meal form is opened with the place's name and position
 * - FNEAR-006: Error wording by status
 * - FNEAR-007: Highlights show only diets a place properly caters for, not the one searched, at most three
 */
import { describe, expect, it } from 'vitest';
import type { NearbyFoodPlace } from '@travel-life/shared';
import {
  DEFAULT_FOOD_RADIUS,
  describePlace,
  foodSearchErrorMessage,
  dietHighlights,
  groupPlaces,
  mealParamsFor,
  parseStoredDiet,
  parseStoredRadius,
  telUrl,
  websiteUrl,
} from '../food';

const place = (overrides: Partial<NearbyFoodPlace> = {}): NearbyFoodPlace => ({
  id: 'node/1',
  name: 'Cafe Loki',
  category: 'cafe',
  cuisine: ['icelandic', 'coffee_shop', 'extra'],
  latitude: 64.1466,
  longitude: -21.9426,
  distanceMeters: 243,
  openingHours: null,
  phone: null,
  website: null,
  address: null,
  diet: null,
  dietary: {},
  ...overrides,
});

describe('food nearby', () => {
  it('FNEAR-001: reads stored preferences back safely', () => {
    expect(parseStoredDiet('vegan')).toBe('vegan');
    expect(parseStoredDiet('gluten_free')).toBe('gluten_free');
    // A diet that no longer exists, or junk, means "any".
    expect(parseStoredDiet('carnivore')).toBeNull();
    expect(parseStoredDiet(null)).toBeNull();
    expect(parseStoredDiet(5)).toBeNull();

    expect(parseStoredRadius(500)).toBe(500);
    expect(parseStoredRadius(2000)).toBe(2000);
    expect(parseStoredRadius(750)).toBe(DEFAULT_FOOD_RADIUS);
    expect(parseStoredRadius('1000')).toBe(DEFAULT_FOOD_RADIUS);
    expect(parseStoredRadius(undefined)).toBe(DEFAULT_FOOD_RADIUS);
  });

  it('FNEAR-002: with a diet, matches lead and unconfirmed places sit under their own heading', () => {
    const places = [
      place({ id: 'a', diet: 'only' }),
      place({ id: 'b', diet: 'yes' }),
      place({ id: 'c', diet: 'limited' }),
      place({ id: 'd', diet: 'unknown' }),
      place({ id: 'e', diet: 'unknown' }),
    ];

    const groups = groupPlaces(places, 'vegan');

    expect(groups.map((g) => [g.key, g.title, g.places.map((p) => p.id)])).toEqual([
      ['matches', 'Good for you', ['a', 'b', 'c']],
      ['unconfirmed', 'Not confirmed. Ask the restaurant', ['d', 'e']],
    ]);
    // Only one kind present: only that heading appears.
    expect(groupPlaces([place({ diet: 'only' })], 'vegan').map((g) => g.key)).toEqual(['matches']);
    expect(groupPlaces([place({ diet: 'unknown' })], 'vegan').map((g) => g.key)).toEqual(['unconfirmed']);
    expect(groupPlaces([], 'vegan')).toEqual([]);
  });

  it('FNEAR-003: without a diet there is one ungrouped list', () => {
    const places = [place({ id: 'a' }), place({ id: 'b' })];
    expect(groupPlaces(places, null)).toEqual([{ key: 'all', title: null, places }]);
    expect(groupPlaces([], null)).toEqual([]);
  });

  it('FNEAR-004: describes a place and builds phone and website links', () => {
    expect(describePlace(place())).toBe('Café · Icelandic, Coffee shop · 240 m');
    expect(describePlace(place({ cuisine: [], category: 'bakery', distanceMeters: 1240 }))).toBe('Bakery · 1.2 km');
    expect(describePlace(place({ category: 'mystery', cuisine: [] }))).toBe('Food · 240 m');

    expect(telUrl('+354 466 2828')).toBe('tel:+3544662828');
    expect(telUrl('(555) 123-4567')).toBe('tel:5551234567');
    expect(telUrl('call us')).toBeNull();
    expect(telUrl(null)).toBeNull();

    expect(websiteUrl('https://example.is')).toBe('https://example.is');
    expect(websiteUrl('HTTP://example.is')).toBe('HTTP://example.is');
    expect(websiteUrl(' example.is/menu ')).toBe('https://example.is/menu');
    expect(websiteUrl('  ')).toBeNull();
    expect(websiteUrl(null)).toBeNull();
  });

  it('FNEAR-005: opens the meal form with the name filled in and the position for auto-linking', () => {
    const params = mealParamsFor(place({ name: "Dino's" }), 7);
    expect(params).toMatchObject({ kind: 'FOOD_LOG', id: 'new', tripId: '7', latitude: '64.146600', longitude: '-21.942600' });
    expect(JSON.parse(params.preset)).toEqual({ restaurantName: "Dino's" });
  });

  it('FNEAR-007: highlights only diets a place properly caters for, not the one searched, at most three', () => {
    const p = place({
      dietary: { vegetarian: 'yes', vegan: 'only', halal: 'limited', kosher: 'no', gluten_free: 'yes', lactose_free: 'yes' },
    });
    expect(dietHighlights(p, null).map((h) => h.label)).toEqual([
      'Vegetarian options',
      'Vegan only',
      'Gluten-free options',
    ]);
    // The diet already being searched for is not repeated.
    expect(dietHighlights(p, 'vegan').map((h) => h.diet)).toEqual(['vegetarian', 'gluten_free', 'lactose_free']);
    expect(dietHighlights(place({ dietary: { halal: 'limited', kosher: 'no' } }), null)).toEqual([]);
    expect(dietHighlights(place(), null)).toEqual([]);
  });

  it('FNEAR-006: words errors by status', () => {
    expect(foodSearchErrorMessage({ status: null })).toMatch(/internet/i);
    expect(foodSearchErrorMessage({ status: 429 })).toMatch(/too many/i);
    expect(foodSearchErrorMessage({ status: 503 })).toMatch(/busy/i);
    expect(foodSearchErrorMessage({ status: 401 })).toMatch(/sign in/i);
    expect(foodSearchErrorMessage({ status: 502 })).toMatch(/unavailable/i);
    // Not an ApiError: nothing says the connection was the problem.
    expect(foodSearchErrorMessage(new Error('boom'))).toMatch(/unavailable/i);
  });
});
