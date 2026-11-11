import { z } from 'zod';
import { optionalNullable, requiredStringWithMax } from '../validation/zodHelpers';

const ratingSchema = z.number().int().min(1).max(5);

export const createFoodLogEntrySchema = z.object({
  restaurantName: requiredStringWithMax(200),
  dish: requiredStringWithMax(200),
  rating: ratingSchema,
  notes: optionalNullable(requiredStringWithMax(2000)),
  orderAgain: z.boolean().optional(),
  /** Optional dining activity of the same trip. */
  activityId: z.number().int().positive().nullable().optional(),
  /** Optional location of the same trip. */
  locationId: z.number().int().positive().nullable().optional(),
});

export const updateFoodLogEntrySchema = z.object({
  restaurantName: requiredStringWithMax(200).optional(),
  dish: requiredStringWithMax(200).optional(),
  rating: ratingSchema.optional(),
  notes: optionalNullable(requiredStringWithMax(2000)),
  orderAgain: z.boolean().optional(),
  activityId: z.number().int().positive().nullable().optional(),
  locationId: z.number().int().positive().nullable().optional(),
});

export type CreateFoodLogEntryInput = z.infer<typeof createFoodLogEntrySchema>;
export type UpdateFoodLogEntryInput = z.infer<typeof updateFoodLogEntrySchema>;

export interface FoodLogSearchFilters {
  /** Inclusive minimum rating, 1-5. */
  minRating?: number;
  orderAgain?: boolean;
  /** Case-insensitive match against dish, restaurant name and notes. */
  q?: string;
}
