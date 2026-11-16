/** Mirrors backend/src/types/tripComparison.types.ts (the unwrapped payload). */

export const MAX_COMPARE_TRIPS = 8;
export const MIN_COMPARE_TRIPS = 2;

export interface UnconvertedAmount {
  currency: string;
  amount: number;
  count: number;
}

export interface TripComparisonCost {
  /** Currency of `spent`, `costPerDay` and `breakdown`. */
  currency: string;
  /** Null when the trip total could not be converted into `currency`. */
  spent: number | null;
  costPerDay: number | null;
  breakdown: {
    lodging: number;
    transportation: number;
    activities: number;
    food: number;
    other: number;
  } | null;
  /** Currency the trip's own budget summary was computed in. */
  summaryCurrency: string;
  /** True when `spent` was restated from `summaryCurrency` with the latest rate. */
  restated: boolean;
  /** Amounts left out of `spent` because no rate was available. */
  unconverted: UnconvertedAmount[];
  /** Whole total left out because it could not be converted. */
  excludedTotal: { currency: string; amount: number } | null;
  isComplete: boolean;
}

export interface TripComparisonTrip {
  id: number;
  title: string;
  status: string;
  /** Date-only `YYYY-MM-DD`. */
  startDate: string | null;
  endDate: string | null;
  days: number | null;
  countryCode: string | null;
  isOwner: boolean;
  locationCount: number;
  activityCount: number;
  photoCount: number;
  transportationCount: number;
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
  currency: string;
  trips: TripComparisonTrip[];
  locations: TripComparisonLocation[];
}
