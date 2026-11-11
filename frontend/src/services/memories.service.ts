import axios from '../lib/axios';

export interface MemoryPhotoRef {
  id: number;
  source: string;
  thumbnailPath: string | null;
  localPath: string | null;
}

export interface MemoryTrip {
  id: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  tripTypeEmoji: string | null;
  coverPhoto: MemoryPhotoRef | null;
}

export interface MemoryPhoto extends MemoryPhotoRef {
  tripId: number;
  tripTitle: string;
  caption: string | null;
  takenAt: string | null;
}

export interface MemoryJournalEntry {
  id: number;
  tripId: number;
  tripTitle: string;
  title: string | null;
  date: string | null;
  excerpt: string;
}

export interface OnThisDayYear {
  year: number;
  trips: MemoryTrip[];
  photos: MemoryPhoto[];
  journalEntries: MemoryJournalEntry[];
}

export interface YearInReviewTag {
  id: number;
  name: string;
  color: string | null;
  textColor: string | null;
  tripCount: number;
}

export interface YearInReview {
  year: number;
  /** Years (descending) that have at least one dated trip. */
  availableYears: number[];
  tripCount: number;
  daysTraveled: number;
  countries: string[];
  cities: string[];
  totalDistanceKm: number;
  flightCount: number;
  photoCount: number;
  journalEntryCount: number;
  topTags: YearInReviewTag[];
  /** Trip-day counts per calendar month (index 0 = January). */
  monthlyTripDays: number[];
  trips: MemoryTrip[];
  highlightPhotos: MemoryPhoto[];
}

class MemoriesService {
  /**
   * Get "On This Day" memories grouped by prior year.
   * Sends the client's local month/day so memories match the user's date.
   */
  async getOnThisDay(): Promise<OnThisDayYear[]> {
    const now = new Date();
    const response = await axios.get<OnThisDayYear[]>('/memories/on-this-day', {
      params: { month: now.getMonth() + 1, day: now.getDate() },
    });
    return response.data;
  }

  async getYearInReview(year: number, includePlanning = false): Promise<YearInReview> {
    const response = await axios.get<YearInReview>(`/memories/year-in-review/${year}`, {
      params: includePlanning ? { includePlanning: true } : undefined,
    });
    return response.data;
  }
}

export default new MemoriesService();
