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

export const createTripStopSchema = z.object({
  name: stopName,
  latitude: latitude(),
  longitude: longitude(),
  nights: optionalNullable(nightsSchema),
  locationId: optionalNullable(numericId()),
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
