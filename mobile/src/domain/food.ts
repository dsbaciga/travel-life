/**
 * Food nearby: the parts of the screen that are logic rather than layout, kept
 * pure so they can be tested without a phone.
 */
import {
  DIETARY_RESTRICTIONS,
  cuisineLabel,
  dietBadge,
  foodCategoryLabel,
  formatDistance,
  type DietaryRestriction,
  type NearbyFoodPlace,
} from '@travel-life/shared';

/** The search distances offered, in metres. */
export const FOOD_RADII = [500, 1000, 2000] as const;
export type FoodRadius = (typeof FOOD_RADII)[number];
export const DEFAULT_FOOD_RADIUS: FoodRadius = 1000;

/** Read a stored diet back, ignoring anything that is no longer a diet we know. */
export function parseStoredDiet(value: unknown): DietaryRestriction | null {
  return typeof value === 'string' && (DIETARY_RESTRICTIONS as readonly string[]).includes(value)
    ? (value as DietaryRestriction)
    : null;
}

/** Read a stored distance back, falling back to the default for anything unexpected. */
export function parseStoredRadius(value: unknown): FoodRadius {
  return (FOOD_RADII as readonly unknown[]).includes(value) ? (value as FoodRadius) : DEFAULT_FOOD_RADIUS;
}

export interface PlaceGroup {
  key: 'matches' | 'unconfirmed' | 'all';
  /** Null when there is only one group and nothing to separate. */
  title: string | null;
  places: NearbyFoodPlace[];
}

/**
 * Split results for display. With a diet, places that fit (only / yes / limited) come
 * first and the ones nobody has described come under their own heading, so "not
 * confirmed" never reads as "suitable". The server already ordered them best first.
 */
export function groupPlaces(places: readonly NearbyFoodPlace[], diet: DietaryRestriction | null): PlaceGroup[] {
  if (!diet) return places.length > 0 ? [{ key: 'all', title: null, places: [...places] }] : [];

  const matches = places.filter((place) => place.diet !== 'unknown');
  const unconfirmed = places.filter((place) => place.diet === 'unknown');
  const groups: PlaceGroup[] = [];
  if (matches.length > 0) groups.push({ key: 'matches', title: 'Good for you', places: matches });
  if (unconfirmed.length > 0) {
    groups.push({ key: 'unconfirmed', title: 'Not confirmed. Ask the restaurant', places: unconfirmed });
  }
  return groups;
}

/**
 * What else a place is confirmed for, to show alongside the diet searched for (or
 * on its own when none was chosen): only diets it fully or properly caters for, so
 * a "limited" never advertises itself, at most three.
 */
export function dietHighlights(
  place: NearbyFoodPlace,
  exclude: DietaryRestriction | null
): { diet: DietaryRestriction; label: string }[] {
  const highlights: { diet: DietaryRestriction; label: string }[] = [];
  for (const diet of DIETARY_RESTRICTIONS) {
    const match = place.dietary[diet];
    if (diet === exclude || (match !== 'only' && match !== 'yes')) continue;
    highlights.push({ diet, label: dietBadge(match, diet).label });
  }
  return highlights.slice(0, 3);
}

/** "Café · Italian, Coffee shop · 240 m" */
export function describePlace(place: NearbyFoodPlace): string {
  const cuisine = place.cuisine.slice(0, 2).map(cuisineLabel).join(', ');
  return [foodCategoryLabel(place.category), cuisine, formatDistance(place.distanceMeters)]
    .filter(Boolean)
    .join(' · ');
}

/** A phone number as a `tel:` link, or null when there is nothing dialable in it. */
export function telUrl(phone: string | null): string | null {
  const digits = phone?.replace(/[^\d+]/g, '') ?? '';
  return /\d/.test(digits) ? `tel:${digits}` : null;
}

/** A website as an openable link, adding https:// when the map data left it off. */
export function websiteUrl(website: string | null): string | null {
  const trimmed = website?.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Route params for logging a meal at a place: name filled in, position for auto-linking. */
export function mealParamsFor(place: NearbyFoodPlace, tripId: number): Record<string, string> {
  return {
    kind: 'FOOD_LOG',
    id: 'new',
    tripId: String(tripId),
    latitude: place.latitude.toFixed(6),
    longitude: place.longitude.toFixed(6),
    preset: JSON.stringify({ restaurantName: place.name }),
  };
}

/** What to tell the user when the search could not run. */
export function foodSearchErrorMessage(error: unknown): string {
  // An ApiError carries `status`, which is null when the server was never reached.
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status: number | null }).status
      : undefined;
  if (status === null) return 'No connection. Searching for food needs the internet.';
  if (status === 429) return 'Too many searches. Wait a minute and try again.';
  if (status === 503) return 'The map service is busy. Try again in a moment.';
  if (status === 401) return 'Your session expired. Sign in again to search.';
  return 'The food search is unavailable right now. Try again in a moment.';
}
