/** One stop in a trip's ordered route plan (Multi-City Trip Planner). */
export interface TripStop {
  id: number;
  tripId: number;
  /** A saved place on the same trip this stop was created from, if any. */
  locationId: number | null;
  name: string;
  latitude: number;
  longitude: number;
  /** 0-based place in the route. */
  position: number;
  nights: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripStopInput {
  name: string;
  latitude: number;
  longitude: number;
  nights?: number | null;
  locationId?: number | null;
}

export interface UpdateTripStopInput {
  name?: string;
  latitude?: number;
  longitude?: number;
  nights?: number | null;
  locationId?: number | null;
}

/** Road distance and time between two consecutive stops, as returned by the legs endpoint. */
export interface TripStopLeg {
  fromStopId: number;
  toStopId: number;
  /** Road distance when `routed`, otherwise the straight-line distance. */
  distanceKm: number;
  /** Road travel time; null when `routed` is false. */
  durationMinutes: number | null;
  routed: boolean;
}

export interface TripStopLegs {
  profile: string;
  legs: TripStopLeg[];
}
