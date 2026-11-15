import axios from 'axios';
import config from '../config';
import logger from '../config/logger';
import { haversineMeters } from './_shared/vendored/geo';
import type { DietaryRestriction, NearbyFoodPlace } from './_shared/vendored/nearbyFood';

/**
 * Yelp Fusion as a second source for the nearby food search.
 *
 * Yelp files businesses under diet categories ("Gluten-Free", "Vegan", ...), which is a
 * statement from the business or its reviewers that it caters for them: far better coverage
 * than OpenStreetMap's diet tags, though Yelp has no category for lactose-free or pescatarian.
 * Only searched when a diet is chosen and `YELP_API_KEY` is set; a Yelp failure never fails
 * the search, the map results still come back.
 */

/** Yelp category alias for each diet; diets absent here are not searched on Yelp. */
export const YELP_DIET_CATEGORIES: Readonly<Partial<Record<DietaryRestriction, string>>> = {
  gluten_free: 'gluten_free',
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  halal: 'halal',
  kosher: 'kosher',
};

const TIMEOUT_MS = 8_000;
const YELP_PAGE = 50;

interface YelpBusiness {
  id?: string;
  name?: string;
  url?: string;
  rating?: number;
  review_count?: number;
  price?: string;
  phone?: string;
  is_closed?: boolean;
  categories?: { alias?: string; title?: string }[];
  coordinates?: { latitude?: number | null; longitude?: number | null };
  location?: { display_address?: string[] };
}

export const isYelpEnabled = (): boolean => config.yelp.apiKey.length > 0;

/** Map Yelp category aliases onto the amenity values the rest of the search uses. */
export function categoryOf(aliases: readonly string[]): string {
  const has = (...wanted: string[]) => aliases.some((alias) => wanted.includes(alias));
  if (has('bakeries', 'patisserie', 'cupcakes', 'donuts')) return 'bakery';
  if (has('cafes', 'coffee', 'coffeeroasteries', 'tea')) return 'cafe';
  if (has('pubs', 'gastropubs', 'irish_pubs')) return 'pub';
  if (has('bars', 'cocktailbars', 'wine_bars', 'beerbar', 'sportsbars')) return 'bar';
  if (has('icecream', 'gelato', 'frozenyogurt')) return 'ice_cream';
  if (has('hotdogs', 'burgers', 'fastfood', 'sandwiches', 'pizza')) return 'fast_food';
  return 'restaurant';
}

/** Turn Yelp's businesses into places, dropping closed, unnamed or unlocated ones. */
export function yelpToPlaces(
  businesses: readonly YelpBusiness[],
  origin: { latitude: number; longitude: number },
  diet: DietaryRestriction,
  dietAlias: string
): NearbyFoodPlace[] {
  const places: NearbyFoodPlace[] = [];
  for (const business of businesses) {
    const latitude = business.coordinates?.latitude;
    const longitude = business.coordinates?.longitude;
    const name = business.name?.trim();
    if (!business.id || !name || !business.url || business.is_closed) continue;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
    if (latitude === 0 && longitude === 0) continue;

    const aliases = (business.categories ?? []).map((category) => category.alias ?? '');
    places.push({
      id: `yelp/${business.id}`,
      name,
      category: categoryOf(aliases),
      // The diet's own category is the reason it is here, not a cuisine.
      cuisine: (business.categories ?? [])
        .filter((category) => category.alias !== dietAlias && category.title)
        .map((category) => (category.title as string).toLowerCase()),
      latitude,
      longitude,
      distanceMeters: Math.round(haversineMeters(origin, { latitude, longitude })),
      openingHours: null,
      phone: business.phone?.trim() || null,
      website: null,
      address: business.location?.display_address?.join(', ') || null,
      // Listed under the diet's category: it has a proper offering, though Yelp cannot say "only".
      diet: 'yes',
      dietary: { [diet]: 'yes' },
      sources: ['yelp'],
      yelp: {
        url: business.url,
        rating: typeof business.rating === 'number' ? business.rating : null,
        reviewCount: typeof business.review_count === 'number' ? business.review_count : null,
        price: business.price ?? null,
      },
    });
  }
  return places;
}

/** Businesses Yelp files under the diet's category around a point. Returns [] when Yelp cannot help. */
export async function searchYelp(
  origin: { latitude: number; longitude: number },
  radiusMeters: number,
  diet: DietaryRestriction
): Promise<NearbyFoodPlace[]> {
  const alias = YELP_DIET_CATEGORIES[diet];
  if (!isYelpEnabled() || !alias) return [];

  try {
    const response = await axios.get<{ businesses?: YelpBusiness[] }>(`${config.yelp.url.replace(/\/$/, '')}/businesses/search`, {
      params: {
        latitude: origin.latitude,
        longitude: origin.longitude,
        radius: Math.min(Math.round(radiusMeters), 40_000),
        categories: alias,
        sort_by: 'distance',
        limit: YELP_PAGE,
      },
      headers: { Authorization: `Bearer ${config.yelp.apiKey}`, Accept: 'application/json' },
      timeout: TIMEOUT_MS,
    });
    return yelpToPlaces(response.data?.businesses ?? [], origin, diet, alias);
  } catch (error) {
    // Never log the request: its headers carry the key.
    logger.warn(`[Yelp] search failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
