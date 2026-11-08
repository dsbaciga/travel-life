import type { FoodLogEntry } from '../types/foodLog';

export type RestaurantGroup<T extends FoodLogEntry> = {
  /** Display name, as first entered. */
  restaurantName: string;
  entries: T[];
  /** Mean rating rounded to one decimal. */
  averageRating: number;
};

/**
 * Groups entries by restaurant (case- and whitespace-insensitive) and orders
 * groups by average rating, then by number of dishes. Entries inside a group
 * keep their incoming order (the server sends best-rated first).
 */
export function groupByRestaurant<T extends FoodLogEntry>(entries: T[]): RestaurantGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.restaurantName.trim().toLowerCase();
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.values()]
    .map((list) => {
      const sum = list.reduce((acc, e) => acc + e.rating, 0);
      return {
        restaurantName: list[0].restaurantName.trim(),
        entries: list,
        averageRating: Math.round((sum / list.length) * 10) / 10,
      };
    })
    .sort(
      (a, b) =>
        b.averageRating - a.averageRating ||
        b.entries.length - a.entries.length ||
        a.restaurantName.localeCompare(b.restaurantName)
    );
}

/** "★★★★☆" for a 1-5 rating; out-of-range values are clamped. */
export function ratingStars(rating: number): string {
  const n = Math.min(5, Math.max(0, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
