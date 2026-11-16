import { z } from 'zod';
import type { UnconvertedAmount } from './expense.types';

/** Most trips one comparison may include. Keeps the aggregate query bounded. */
export const MAX_COMPARE_TRIPS = 8;
export const MIN_COMPARE_TRIPS = 2;

/**
 * `?ids=1,2,3` — a comma-separated list of distinct trip ids. Duplicates are
 * rejected rather than silently merged so the response order always matches the
 * request.
 */
export const compareTripsQuerySchema = z.object({
  ids: z
    .string()
    .min(1, 'ids is required')
    .transform((raw) => raw.split(',').map((part) => part.trim()))
    .pipe(
      z
        .array(z.string().regex(/^\d{1,9}$/, 'ids must be positive integers').transform(Number))
        .min(MIN_COMPARE_TRIPS, `Pick at least ${MIN_COMPARE_TRIPS} trips to compare`)
        .max(MAX_COMPARE_TRIPS, `You can compare at most ${MAX_COMPARE_TRIPS} trips at once`)
    )
    .refine((ids) => ids.every((id) => id > 0), {
      message: 'ids must be positive integers',
    })
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'ids must not contain duplicates',
    }),
});

/** Cost figures for one trip, expressed in the comparison currency where possible. */
export interface TripComparisonCost {
  /** Currency of `spent`, `costPerDay` and `breakdown` (the comparison currency). */
  currency: string;
  /** Null when the trip's total could not be converted into `currency`. */
  spent: number | null;
  /** Null when `spent` is null or the trip has no known length. */
  costPerDay: number | null;
  breakdown: {
    lodging: number;
    transportation: number;
    activities: number;
    food: number;
    other: number;
  } | null;
  /** Currency the trip's own budget summary was computed in (its owner's base currency). */
  summaryCurrency: string;
  /** True when `spent` was restated from `summaryCurrency` into `currency`. */
  restated: boolean;
  /** Amounts excluded from `spent` because no rate was available, per currency. */
  unconverted: UnconvertedAmount[];
  /**
   * Set when the whole trip total had to be left out because `summaryCurrency`
   * could not be converted into `currency`. Carries the figure in its own currency.
   */
  excludedTotal: { currency: string; amount: number } | null;
  /** True when nothing was excluded or approximated. */
  isComplete: boolean;
}

export interface TripComparisonTrip {
  id: number;
  title: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  /** Inclusive day count, or null when either date is missing. */
  days: number | null;
  countryCode: string | null;
  isOwner: boolean;
  locationCount: number;
  activityCount: number;
  photoCount: number;
  transportationCount: number;
  /** Sum of stored leg distances in km; null when no leg has one. */
  totalDistanceKm: number | null;
  cost: TripComparisonCost;
}

export interface TripComparisonLocation {
  id: number;
  tripId: number;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

export interface TripComparison {
  /** Currency every trip's cost is compared in (the viewer's base currency when set). */
  currency: string;
  /** In the order the ids were requested. */
  trips: TripComparisonTrip[];
  /** Mappable locations of all trips; locations flagged `excludeFromMap` are omitted. */
  locations: TripComparisonLocation[];
}
