/**
 * Emergency Card types (feature #111).
 *
 * These mirror the unwrapped payloads of `/api/trips/:tripId/emergency-info`.
 * Local emergency numbers are deliberately absent: they come from the static
 * `constants/countryFacts.ts` dataset bundled with the app, not from the server,
 * so the card still renders when there is no network.
 */

/** The traveller-entered half of the card, as stored per trip. */
export interface TripEmergencyInfo {
  id: number;
  tripId: number;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceAssistancePhone: string | null;
  embassyName: string | null;
  embassyPhone: string | null;
  embassyAddress: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A companion as it appears on the card. */
export interface EmergencyCardCompanion {
  id: number;
  name: string;
  relationship: string | null;
  phone: string | null;
  /** Null when withheld (the requester does not own the trip) OR simply not recorded. */
  medicalNotes: string | null;
  allergies: string[];
  dietaryPreferences: string[];
}

/** The full card payload returned by `GET /trips/:tripId/emergency-info`. */
export interface EmergencyCardData {
  tripId: number;
  tripTitle: string;
  /**
   * The trip's stored country override (`Trip.countryCode`), or null to infer one
   * from `locationAddresses`. Shared with the local-norms card, so a correction
   * made on either one applies to both.
   */
  countryCode: string | null;
  info: TripEmergencyInfo | null;
  /** Free-text location addresses, in trip order, for client-side country resolution. */
  locationAddresses: string[];
  /**
   * Structured `Location.countryCode` values in trip order (uncoded locations skipped).
   * Preferred over `locationAddresses`; absent in payloads cached by older versions.
   */
  locationCountryCodes?: string[];
  companions: EmergencyCardCompanion[];
  /**
   * False when companion medical fields were withheld by the server. Lets the UI
   * say "only the trip owner can see this" instead of implying nothing was recorded.
   */
  includesMedicalDetails: boolean;
}

/**
 * Body of `PUT /trips/:tripId/emergency-info`. Absent leaves unchanged; null clears.
 *
 * The country is not here: it lives on the trip and is written through
 * `tripService.updateTrip({ countryCode })`.
 */
export interface UpdateTripEmergencyInfoInput {
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceAssistancePhone?: string | null;
  embassyName?: string | null;
  embassyPhone?: string | null;
  embassyAddress?: string | null;
  notes?: string | null;
}
