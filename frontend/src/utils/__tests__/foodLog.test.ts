import { describe, it, expect } from 'vitest';
import { groupByRestaurant, ratingStars } from '../foodLog';
import type { FoodLogEntry } from '../../types/foodLog';

const entry = (id: number, restaurantName: string, rating: number): FoodLogEntry => ({
  id,
  tripId: 1,
  activityId: null,
  locationId: null,
  restaurantName,
  dish: `dish ${id}`,
  rating,
  notes: null,
  orderAgain: false,
  photos: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('groupByRestaurant', () => {
  it('merges names case- and whitespace-insensitively and averages ratings', () => {
    const groups = groupByRestaurant([
      entry(1, 'Trattoria', 5),
      entry(2, ' trattoria ', 4),
      entry(3, 'Cafe', 3),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].restaurantName).toBe('Trattoria');
    expect(groups[0].entries.map((e) => e.id)).toEqual([1, 2]);
    expect(groups[0].averageRating).toBe(4.5);
  });

  it('orders by average rating, then dish count, then name', () => {
    const groups = groupByRestaurant([
      entry(1, 'B', 4),
      entry(2, 'A', 4),
      entry(3, 'C', 4),
      entry(4, 'C', 4),
      entry(5, 'D', 5),
    ]);
    expect(groups.map((g) => g.restaurantName)).toEqual(['D', 'C', 'A', 'B']);
  });

  it('returns an empty list for no entries', () => {
    expect(groupByRestaurant([])).toEqual([]);
  });
});

describe('ratingStars', () => {
  it('renders filled and empty stars', () => {
    expect(ratingStars(4)).toBe('★★★★☆');
  });

  it('clamps out-of-range values', () => {
    expect(ratingStars(9)).toBe('★★★★★');
    expect(ratingStars(-1)).toBe('☆☆☆☆☆');
  });
});
