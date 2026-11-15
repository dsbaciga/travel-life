// GENERATED FILE - DO NOT EDIT.
// Vendored from packages/shared/src/food/nearbyFood.ts by packages/shared/scripts/sync-vendored.mjs.
// Edit the source and re-run the script.

/**
 * Nearby food search: what a dietary restriction means in OpenStreetMap data, and
 * the shapes the backend and the phone agree on.
 *
 * Pure and import-free so the backend can vendor it (see
 * `packages/shared/scripts/sync-vendored.mjs`): one tested reading of OSM's diet
 * tags serves both sides.
 *
 * OpenStreetMap records diets as `diet:vegan=yes|only|limited|no` and so on, but only
 * where a mapper added them. Most places have no diet tags at all, which is not the
 * same as "does not cater for it", so the result is `unknown` rather than `no`, and
 * callers should present it as "not confirmed".
 */

export const DIETARY_RESTRICTIONS = [
  'vegetarian',
  'vegan',
  'halal',
  'kosher',
  'gluten_free',
  'lactose_free',
  'pescetarian',
] as const;

export type DietaryRestriction = (typeof DIETARY_RESTRICTIONS)[number];

export const DIETARY_LABELS: Readonly<Record<DietaryRestriction, string>> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  halal: 'Halal',
  kosher: 'Kosher',
  gluten_free: 'Gluten-free',
  lactose_free: 'Lactose-free',
  pescetarian: 'Pescatarian',
};

/**
 * How well a place caters for a diet, from the place's own tags:
 * `only` everything it serves fits, `yes` it has a proper offering, `limited` a few
 * items, `no` it says it does not, `unknown` nobody has said.
 */
export type DietMatch = 'only' | 'yes' | 'limited' | 'no' | 'unknown';

/** OpenStreetMap tags as returned by Overpass. */
export type OsmTags = Readonly<Record<string, string | undefined>>;

const VALUES: Readonly<Record<string, DietMatch>> = {
  yes: 'yes',
  only: 'only',
  limited: 'limited',
  no: 'no',
};

const parseValue = (value: string | undefined): DietMatch => VALUES[(value ?? '').trim().toLowerCase()] ?? 'unknown';

/** Higher is a stronger statement in the diet's favour. An explicit `no` outranks silence. */
const STRENGTH: Readonly<Record<DietMatch, number>> = { only: 4, yes: 3, limited: 2, no: 1, unknown: 0 };

const strongest = (...matches: DietMatch[]): DietMatch =>
  matches.reduce<DietMatch>((best, match) => (STRENGTH[match] > STRENGTH[best] ? match : best), 'unknown');

const isPositive = (match: DietMatch): boolean => STRENGTH[match] >= STRENGTH.limited;

/** Older tags that predate the `diet:` namespace and are still common. */
const LEGACY_KEYS: Readonly<Partial<Record<DietaryRestriction, string>>> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  halal: 'halal',
  kosher: 'kosher',
};

/** What a `cuisine=` value says about a diet. */
const CUISINE_IMPLIES: Readonly<Record<string, Partial<Record<DietaryRestriction, DietMatch>>>> = {
  vegan: { vegan: 'only', vegetarian: 'only', pescetarian: 'yes' },
  vegetarian: { vegetarian: 'only', pescetarian: 'yes' },
  halal: { halal: 'yes' },
  kosher: { kosher: 'yes' },
};

/** How one diet's evidence carries over to a broader one (vegan food is vegetarian). */
const carryOver = (match: DietMatch, cap?: DietMatch): DietMatch => {
  if (!isPositive(match)) return 'unknown';
  return cap && STRENGTH[match] > STRENGTH[cap] ? cap : match;
};

/** A diet's own evidence: its `diet:` tag, the older bare tag, and `cuisine=`. */
function ownMatch(tags: OsmTags, diet: DietaryRestriction): DietMatch {
  const legacyKey = LEGACY_KEYS[diet];
  return strongest(
    parseValue(tags[`diet:${diet}`]),
    legacyKey ? parseValue(tags[legacyKey]) : 'unknown',
    ...(tags.cuisine ?? '')
      .split(';')
      .map((token) => CUISINE_IMPLIES[token.trim().toLowerCase()]?.[diet] ?? 'unknown')
  );
}

/**
 * What a place's tags say about one diet.
 *
 * Reads the diet's own evidence plus what a related diet implies: a vegan place is
 * vegetarian, either suits a pescatarian, and a place with no vegetarian options has
 * no vegan ones.
 */
export function dietMatch(tags: OsmTags, diet: DietaryRestriction): DietMatch {
  if (diet === 'vegan') {
    // A place that says it has nothing vegetarian has nothing vegan either.
    return strongest(ownMatch(tags, 'vegan'), ownMatch(tags, 'vegetarian') === 'no' ? 'no' : 'unknown');
  }
  if (diet === 'vegetarian') {
    return strongest(ownMatch(tags, 'vegetarian'), carryOver(ownMatch(tags, 'vegan')));
  }
  if (diet === 'pescetarian') {
    // A vegetarian-only kitchen is fine for a pescatarian but is not serving fish, so it is `yes`, not `only`.
    return strongest(
      ownMatch(tags, 'pescetarian'),
      carryOver(ownMatch(tags, 'vegetarian'), 'yes'),
      carryOver(ownMatch(tags, 'vegan'), 'yes')
    );
  }
  return ownMatch(tags, diet);
}

/** Every diet a place has anything to say about, for showing alongside the one searched for. */
export function dietaryProfile(tags: OsmTags): Partial<Record<DietaryRestriction, DietMatch>> {
  const profile: Partial<Record<DietaryRestriction, DietMatch>> = {};
  for (const diet of DIETARY_RESTRICTIONS) {
    const match = dietMatch(tags, diet);
    if (match !== 'unknown') profile[diet] = match;
  }
  return profile;
}

/** Sort key: best match first, then places nobody has described, then explicit refusals. */
export function dietMatchRank(match: DietMatch): number {
  return { only: 0, yes: 1, limited: 2, unknown: 3, no: 4 }[match];
}

export type DietBadgeTone = 'good' | 'ok' | 'unknown' | 'bad';

/** Words and a tone for showing how a place fares for a diet. */
export function dietBadge(match: DietMatch, diet: DietaryRestriction): { label: string; tone: DietBadgeTone } {
  const name = DIETARY_LABELS[diet];
  const lower = name.toLowerCase();
  switch (match) {
    case 'only':
      return { label: `${name} only`, tone: 'good' };
    case 'yes':
      return { label: `${name} options`, tone: 'good' };
    case 'limited':
      return { label: `A few ${lower} options`, tone: 'ok' };
    case 'no':
      return { label: `No ${lower} options`, tone: 'bad' };
    default:
      return { label: 'Not confirmed', tone: 'unknown' };
  }
}

/** What kinds of place the search looks for, and how each is shown. */
export const FOOD_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  fast_food: 'Fast food',
  food_court: 'Food court',
  pub: 'Pub',
  bar: 'Bar',
  biergarten: 'Beer garden',
  ice_cream: 'Ice cream',
  bakery: 'Bakery',
  deli: 'Deli',
  pastry: 'Pastry',
};

export const foodCategoryLabel = (category: string): string => FOOD_CATEGORY_LABELS[category] ?? 'Food';

/** A cuisine tag value as words: `middle_eastern` becomes `Middle eastern`. */
export const cuisineLabel = (cuisine: string): string => {
  const words = cuisine.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Metres as people say them: `45 m`, `240 m`, `1.2 km`. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 100) return `${Math.max(5, Math.round(meters / 5) * 5)} m`;
  // Round first, so 999 m reads as 1.0 km rather than "1000 m".
  const nearest10 = Math.round(meters / 10) * 10;
  if (nearest10 < 1000) return `${nearest10} m`;
  const km = meters / 1000;
  return km < 10 ? `${(Math.round(km * 10) / 10).toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Where a place's information came from. */
export type FoodSource = 'osm' | 'yelp';

/** A place's Yelp listing, when Yelp is configured and knows it. */
export interface YelpListing {
  url: string;
  /** 1 to 5, in half steps. */
  rating: number | null;
  reviewCount: number | null;
  /** "$" to "$$$$". */
  price: string | null;
}

/** One place from the search. */
export interface NearbyFoodPlace {
  /** OpenStreetMap element (`node/123456`), or `yelp/<id>` for a place only Yelp knows. */
  id: string;
  name: string;
  /** The amenity or shop value: `restaurant`, `cafe`, `bakery` ... */
  category: string;
  cuisine: string[];
  latitude: number;
  longitude: number;
  /** From the point searched around. */
  distanceMeters: number;
  /** Raw OSM `opening_hours`, for the phone to evaluate on its own clock. */
  openingHours: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  /** How the place fares for the diet searched for, or null when none was chosen. */
  diet: DietMatch | null;
  /** Everything the place's tags say about any diet. */
  dietary: Partial<Record<DietaryRestriction, DietMatch>>;
  /** Who vouches for the place; absent on older servers, meaning OpenStreetMap alone. */
  sources?: FoodSource[];
  /** Present when Yelp lists the place. */
  yelp?: YelpListing;
}

export interface NearbyFoodResponse {
  center: { latitude: number; longitude: number };
  radiusMeters: number;
  diet: DietaryRestriction | null;
  places: NearbyFoodPlace[];
  /** Places left out because they say they do not cater for the diet. */
  excludedCount: number;
  /** True when Yelp contributed to this search, so the screen can credit it. */
  yelpUsed?: boolean;
}
