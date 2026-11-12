import { z } from 'zod';
import {
  optionalNullable,
  requiredStringWithMax,
  optionalDatetime,
  optionalLatitude,
  optionalLongitude,
} from '../validation/zodHelpers';

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

/** Existing photos of the same trip to attach to an entry. */
export const attachFoodLogPhotosSchema = z.object({
  photoIds: z.array(z.number().int().positive()).min(1).max(12),
});

/**
 * Immich assets to attach to an entry. Each asset is resolved to a trip photo
 * server-side (reusing the row when the asset is already linked to the trip).
 * Only photos can be attached to a food log entry, so a video is rejected.
 */
export const attachFoodLogImmichSchema = z.object({
  assets: z
    .array(
      z.object({
        immichAssetId: z.string().min(1).max(255),
        mediaType: z.literal('image').optional().default('image'),
        takenAt: optionalDatetime(),
        latitude: optionalLatitude(),
        longitude: optionalLongitude(),
      })
    )
    .min(1)
    .max(12),
});

export type AttachFoodLogPhotosInput = z.infer<typeof attachFoodLogPhotosSchema>;
export type AttachFoodLogImmichInput = z.infer<typeof attachFoodLogImmichSchema>;
export type CreateFoodLogEntryInput = z.infer<typeof createFoodLogEntrySchema>;
export type UpdateFoodLogEntryInput = z.infer<typeof updateFoodLogEntrySchema>;

export interface FoodLogSearchFilters {
  /** Inclusive minimum rating, 1-5. */
  minRating?: number;
  orderAgain?: boolean;
  /** Case-insensitive match against dish, restaurant name and notes. */
  q?: string;
}
