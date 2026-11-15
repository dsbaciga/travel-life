import { z } from 'zod';
import { DIETARY_RESTRICTIONS } from '../services/_shared/vendored/nearbyFood';

/** Shortest and longest search radius, in metres. Wider searches ask Overpass for too much. */
export const NEARBY_FOOD_MIN_RADIUS_M = 100;
export const NEARBY_FOOD_MAX_RADIUS_M = 3000;
export const NEARBY_FOOD_DEFAULT_RADIUS_M = 1000;

/** Query string of GET /api/places/food. */
export const nearbyFoodQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce
    .number()
    .min(NEARBY_FOOD_MIN_RADIUS_M)
    .max(NEARBY_FOOD_MAX_RADIUS_M)
    .default(NEARBY_FOOD_DEFAULT_RADIUS_M),
  diet: z.enum(DIETARY_RESTRICTIONS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type NearbyFoodQuery = z.infer<typeof nearbyFoodQuerySchema>;
