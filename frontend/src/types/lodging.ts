export type LodgingType =
  | 'hotel'
  | 'hostel'
  | 'airbnb'
  | 'vacation_rental'
  | 'camping'
  | 'resort'
  | 'motel'
  | 'bed_and_breakfast'
  | 'apartment'
  | 'friends_family'
  | 'other';

/** Every member of LodgingType, as values. See TRANSPORTATION_TYPES for why
 *  `satisfies` guards this against drifting from the union above. */
export const LODGING_TYPES = [
  'hotel',
  'hostel',
  'airbnb',
  'vacation_rental',
  'camping',
  'resort',
  'motel',
  'bed_and_breakfast',
  'apartment',
  'friends_family',
  'other',
] as const satisfies readonly LodgingType[];

/** Narrows a raw string — a `<select>` value — to a LodgingType. */
export function isLodgingType(value: string): value is LodgingType {
  return LODGING_TYPES.some((type) => type === value);
}

// The stay's place is its own locationId (a direct FK), not an entity link
export type Lodging = {
  id: number;
  tripId: number;
  locationId: number | null;
  location?: {
    id: number;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  type: LodgingType;
  name: string;
  address: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  timezone: string | null;
  confirmationNumber: string | null;
  /** The user's loyalty program this stay was booked under; the number itself is never on the booking. */
  loyaltyProgramId: number | null;
  cost: number | null;
  currency: string | null;
  bookingUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

// Note: Location association is handled via EntityLink system, not direct FK
export type CreateLodgingInput = {
  tripId: number;
  locationId?: number | null;
  type: LodgingType;
  name: string;
  address?: string;
  checkInDate?: string;
  checkOutDate?: string;
  timezone?: string;
  confirmationNumber?: string;
  loyaltyProgramId?: number;
  cost?: number;
  currency?: string;
  bookingUrl?: string;
  notes?: string;
};

// Note: Location association is handled via EntityLink system, not direct FK
export type UpdateLodgingInput = {
  locationId?: number | null;
  type?: LodgingType;
  name?: string;
  address?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  timezone?: string | null;
  confirmationNumber?: string | null;
  loyaltyProgramId?: number | null;
  cost?: number | null;
  currency?: string | null;
  bookingUrl?: string | null;
  notes?: string | null;
};
