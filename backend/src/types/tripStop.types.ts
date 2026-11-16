import { z } from 'zod';
import {
  latitude,
  longitude,
  numericId,
  optionalNullable,
} from '../validation/zodHelpers';

/** Upper bound on nights for one stop; also enforced by a CHECK constraint. */
export const MAX_STOP_NIGHTS = 365;

const stopName = z.string().trim().min(1).max(200);
const nightsSchema = z.number().int().min(0).max(MAX_STOP_NIGHTS);

/**
 * A stop is either a free place (name, latitude and longitude all given) or made from a
 * saved place of the trip (locationId). For a saved place the name and coordinates may be
 * left out and are taken from the place on the server; if they are sent anyway they must
 * agree with it (see TripStopService).
 */
export const createTripStopSchema = z
  .object({
    name: stopName.optional(),
    latitude: latitude().optional(),
    longitude: longitude().optional(),
    nights: optionalNullable(nightsSchema),
    locationId: optionalNullable(numericId()),
  })
  .superRefine((value, ctx) => {
    if (value.locationId != null) return;
    for (const field of ['name', 'latitude', 'longitude'] as const) {
      if (value[field] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when the stop is not linked to a saved place`,
        });
      }
    }
  });

export const updateTripStopSchema = z.object({
  name: stopName.optional(),
  latitude: latitude().optional(),
  longitude: longitude().optional(),
  nights: optionalNullable(nightsSchema),
  locationId: optionalNullable(numericId()),
});

/** The full ordered list of the trip's stop ids, first stop first. */
export const reorderTripStopsSchema = z.object({
  stopIds: z.array(numericId()),
});

export type CreateTripStopInput = z.infer<typeof createTripStopSchema>;
export type UpdateTripStopInput = z.infer<typeof updateTripStopSchema>;
export type ReorderTripStopsInput = z.infer<typeof reorderTripStopsSchema>;
