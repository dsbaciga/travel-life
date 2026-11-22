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

/** Routing profiles the legs endpoint accepts (the ones RoutingService supports). */
export const LEG_PROFILES = ['driving-car', 'cycling-regular', 'foot-walking'] as const;
export type LegProfile = (typeof LEG_PROFILES)[number];

export const tripStopLegsQuerySchema = z.object({
  profile: z.enum(LEG_PROFILES).default('driving-car'),
});

/** Straight-line distance at or above which a leg is a flight (no road route, no time estimate). */
export const FLIGHT_LEG_THRESHOLD_KM = 600;

export type TripStopLegMode = 'drive' | 'flight';

export interface TripStopLeg {
  fromStopId: number;
  toStopId: number;
  /** 'flight' when the straight-line distance is at least FLIGHT_LEG_THRESHOLD_KM; never routed, no duration. */
  mode: TripStopLegMode;
  /** Road distance when `routed`, otherwise the straight-line distance. */
  distanceKm: number;
  /** Road travel time; null when the leg is not routed (the client estimates drive legs) and always null for flights. */
  durationMinutes: number | null;
  /** True when the figures come from a road route (fresh or cached), false for straight-line. */
  routed: boolean;
}

export interface TripStopLegsResult {
  profile: LegProfile;
  legs: TripStopLeg[];
}

export type CreateTripStopInput = z.infer<typeof createTripStopSchema>;
export type UpdateTripStopInput = z.infer<typeof updateTripStopSchema>;
export type ReorderTripStopsInput = z.infer<typeof reorderTripStopsSchema>;
