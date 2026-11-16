export type TransportationType =
  | 'flight'
  | 'train'
  | 'bus'
  | 'car'
  | 'ferry'
  | 'bicycle'
  | 'walk'
  | 'other';

/** Every member of TransportationType, as values. `satisfies` keeps it in step
 *  with the union above: adding a member here that isn't in the type fails to
 *  compile, and the type stays the single source of truth. */
export const TRANSPORTATION_TYPES = [
  'flight',
  'train',
  'bus',
  'car',
  'ferry',
  'bicycle',
  'walk',
  'other',
] as const satisfies readonly TransportationType[];

/**
 * Narrows a raw string — a `<select>` value, a query param — to a
 * TransportationType. Lives here rather than in a component so every form
 * validates against the same list instead of asserting.
 */
export function isTransportationType(value: string): value is TransportationType {
  return TRANSPORTATION_TYPES.some((type) => type === value);
}

export type TransportationRoute = {
  from: {
    name: string;
    latitude: number;
    longitude: number;
  };
  to: {
    name: string;
    latitude: number;
    longitude: number;
  };
  geometry?: number[][]; // Array of [longitude, latitude] coordinates from OpenRouteService
};

export type Transportation = {
  id: number;
  tripId: number;
  type: TransportationType;
  fromLocationId: number | null;
  toLocationId: number | null;
  fromLocationName: string | null;
  toLocationName: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  startTimezone: string | null;
  endTimezone: string | null;
  carrier: string | null;
  vehicleNumber: string | null;
  confirmationNumber: string | null;
  /** The user's loyalty program this leg was booked under; the number itself is never on the booking. */
  loyaltyProgramId: number | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  connectionGroupId: string | null; // For grouping multi-leg journeys
  createdAt: string;
  updatedAt: string;
  fromLocation?: {
    id: number;
    name: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  toLocation?: {
    id: number;
    name: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  route?: TransportationRoute | null;
  durationMinutes?: number | null;
  calculatedDistance?: number | null; // Route distance in kilometers
  calculatedDuration?: number | null; // Route duration in minutes
  distanceSource?: 'route' | 'haversine' | null; // Source of distance calculation
  isUpcoming?: boolean;
  isInProgress?: boolean;
  flightTracking?: FlightTracking | null;
};

export type FlightTracking = {
  id: number;
  transportationId: number;
  flightNumber: string | null;
  airlineCode: string | null;
  status: 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted' | null;
  gate: string | null;
  terminal: string | null;
  baggageClaim: string | null;
  departureDelay: number | null;
  arrivalDelay: number | null;
  scheduledDeparture: string | null;
  actualDeparture: string | null;
  scheduledArrival: string | null;
  actualArrival: string | null;
  lastUpdatedAt: string;
  createdAt: string;
};

// Optional fields mirror createTransportationSchema on the backend, which
// declares them `.nullable().optional()` — an explicit null is accepted and
// stored as null, so the frontend may send either null or omit the field.
export type CreateTransportationInput = {
  tripId: number;
  type: TransportationType;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  fromLocationName?: string | null;
  toLocationName?: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  startTimezone?: string | null;
  endTimezone?: string | null;
  carrier?: string | null;
  vehicleNumber?: string | null;
  confirmationNumber?: string | null;
  loyaltyProgramId?: number | null;
  cost?: number | null;
  currency?: string | null;
  notes?: string | null;
};

export type UpdateTransportationInput = {
  type?: TransportationType;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  fromLocationName?: string | null;
  toLocationName?: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  startTimezone?: string | null;
  endTimezone?: string | null;
  carrier?: string | null;
  vehicleNumber?: string | null;
  confirmationNumber?: string | null;
  loyaltyProgramId?: number | null;
  cost?: number | null;
  currency?: string | null;
  notes?: string | null;
};
