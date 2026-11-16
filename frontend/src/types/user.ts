export interface ActivityCategory {
  name: string;
  emoji: string;
}

export interface TripTypeCategory {
  name: string;
  emoji: string;
}

// Alias to match backend type naming (backend uses 'TripType')
export type TripType = TripTypeCategory;

export interface User {
  id: number;
  username: string;
  email: string;
  avatarUrl: string | null;
  timezone?: string;
  activityCategories: ActivityCategory[];
  tripTypes: TripTypeCategory[];
  dietaryPreferences: string[];
  useCustomMapStyle: boolean;
  /** Home currency (ISO 4217) mixed-currency budget totals are reported in. */
  baseCurrency?: string | null;
  measurementSystem?: 'imperial' | 'metric' | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserSettingsInput {
  activityCategories?: ActivityCategory[];
  tripTypes?: TripTypeCategory[];
  timezone?: string;
  dietaryPreferences?: string[];
  useCustomMapStyle?: boolean;
  /** Null clears the home currency, reverting to the per-trip fallback. */
  baseCurrency?: string | null;
  /** Null clears the choice, reverting to the app default. */
  measurementSystem?: 'imperial' | 'metric' | null;
}

// User search result for travel partner selection
export interface UserSearchResult {
  id: number;
  username: string;
  avatarUrl: string | null;
}

// Permission level a travel partner gets on trips auto-shared by their partner.
// Matches the backend's `defaultPartnerPermission` enum. Single source of truth for
// this union — derive from it rather than spelling the three strings out again.
export const PARTNER_PERMISSIONS = ['view', 'edit', 'admin'] as const;

export type PartnerPermission = (typeof PARTNER_PERMISSIONS)[number];

/**
 * Runtime narrowing for values that are only `string` until checked — notably
 * `<select>` change events, where nothing enforces that the rendered options and this
 * union stay in sync. Prefer this over asserting the cast.
 */
export const isPartnerPermission = (value: string): value is PartnerPermission =>
  (PARTNER_PERMISSIONS as readonly string[]).includes(value);

// Travel partner settings
export interface TravelPartnerSettings {
  travelPartnerId: number | null;
  defaultPartnerPermission: PartnerPermission;
  travelPartner: UserSearchResult | null;
}

export interface UpdateTravelPartnerInput {
  travelPartnerId?: number | null;
  defaultPartnerPermission?: PartnerPermission;
}

// Travel partner requests — the consent step. A partnership is only established
// once the recipient accepts; sending a request changes nothing on either profile.
export type TravelPartnerRequestStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface TravelPartnerRequest {
  id: number;
  status: TravelPartnerRequestStatus;
  message: string | null;
  /** The REQUESTER opted in to sharing THEIR existing trips if this is accepted. */
  shareExistingTrips: boolean;
  createdAt: string;
  respondedAt: string | null;
  requester: UserSearchResult;
  recipient: UserSearchResult;
}

export interface TravelPartnerRequests {
  /** Requests sent TO the current user, awaiting their accept/decline. */
  incoming: TravelPartnerRequest[];
  /** Requests the current user sent, awaiting the other user's response. */
  outgoing: TravelPartnerRequest[];
}

export interface SendTravelPartnerRequestInput {
  recipientId: number;
  message?: string;
  /**
   * Share MY existing trips with them if they accept. Never shares their trips with
   * me — that is their own choice, made when they accept.
   */
  shareExistingTrips?: boolean;
}

export interface AcceptTravelPartnerRequestInput {
  /**
   * Share MY existing trips with the requester. Whether THEIR existing trips come to
   * me was their choice, made when they sent the request.
   */
  shareExistingTrips?: boolean;
}

export interface AcceptTravelPartnerRequestResult extends TravelPartnerSettings {
  message: string;
  /** How many of MY trips were shared with them. */
  sharedTripCount: number;
  /** How many of THEIR trips were shared with me. */
  receivedTripCount: number;
}
