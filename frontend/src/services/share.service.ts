import axios from '../lib/axios';

// ---------------------------------------------------------------------------
// Types (mirror the backend share.service payloads)
// ---------------------------------------------------------------------------

export interface ShareInfo {
  shareEnabled: boolean;
  shareToken: string | null;
  /** Frontend route path for the share link (no origin), e.g. /share/<token> */
  sharePath: string | null;
}

export interface PublicLocation {
  id: number;
  name: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  excludeFromMap: boolean;
}

export interface PublicActivity {
  id: number;
  name: string;
  category: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  locationName: string | null;
  notes: string | null;
}

export interface PublicTransportation {
  id: number;
  type: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startTimezone: string | null;
  endTimezone: string | null;
  from: string | null;
  to: string | null;
}

export interface PublicLodging {
  id: number;
  name: string;
  type: string;
  checkInDate: string;
  checkOutDate: string;
  timezone: string | null;
}

export interface PublicJournalEntry {
  id: number;
  title: string | null;
  content: string;
  date: string | null;
  entryType: string;
  mood: string | null;
}

export interface PublicPhoto {
  id: number;
  caption: string | null;
  takenAt: string | null;
  /** True for photos the owner starred; these form the trip highlights. */
  isFavorite: boolean;
  /** API path (starts with /api/) that streams the full-size image. */
  url: string;
  /** API path (starts with /api/) that streams the thumbnail. */
  thumbnailUrl: string;
}

export interface PublicTrip {
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  tripType: string | null;
  tripTypeEmoji: string | null;
  locations: PublicLocation[];
  activities: PublicActivity[];
  transportation: PublicTransportation[];
  lodging: PublicLodging[];
  journalEntries: PublicJournalEntry[];
  photos: PublicPhoto[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ShareService {
  /** Enable sharing for a trip (owner only). Generates a token on first use. */
  async enableShare(tripId: number): Promise<ShareInfo> {
    const response = await axios.post<ShareInfo>(`/trips/${tripId}/share`);
    return response.data;
  }

  /** Rotate the share token (owner only). The old link stops working immediately. */
  async rotateShareToken(tripId: number): Promise<ShareInfo> {
    const response = await axios.post<ShareInfo>(`/trips/${tripId}/share/rotate`);
    return response.data;
  }

  /** Disable sharing (owner only). The token is kept so re-enabling restores the same URL. */
  async disableShare(tripId: number): Promise<ShareInfo> {
    const response = await axios.delete<ShareInfo>(`/trips/${tripId}/share`);
    return response.data;
  }

  /** Public, unauthenticated fetch of a shared trip. 404s if the link is invalid or disabled. */
  async getPublicTrip(token: string): Promise<PublicTrip> {
    const response = await axios.get<PublicTrip>(`/public/trips/${token}`);
    return response.data;
  }
}

export default new ShareService();
