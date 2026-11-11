import axios from '../lib/axios';
import type {
  FoodLogEntry,
  FoodLogEntryWithTrip,
  FoodLogSearchFilters,
  CreateFoodLogEntryInput,
  UpdateFoodLogEntryInput,
} from '../types/foodLog';

export const foodLogService = {
  async getEntriesByTrip(tripId: number): Promise<FoodLogEntry[]> {
    const response = await axios.get<FoodLogEntry[]>(`/trips/${tripId}/food-log`);
    return response.data;
  },

  async createEntry(tripId: number, data: CreateFoodLogEntryInput): Promise<FoodLogEntry> {
    const response = await axios.post<FoodLogEntry>(`/trips/${tripId}/food-log`, data);
    return response.data;
  },

  async updateEntry(
    tripId: number,
    entryId: number,
    data: UpdateFoodLogEntryInput
  ): Promise<FoodLogEntry> {
    const response = await axios.put<FoodLogEntry>(`/trips/${tripId}/food-log/${entryId}`, data);
    return response.data;
  },

  async deleteEntry(tripId: number, entryId: number): Promise<void> {
    await axios.delete(`/trips/${tripId}/food-log/${entryId}`);
  },

  /** Attaches existing photos of the trip to an entry; returns the entry with its photos. */
  async attachPhotos(tripId: number, entryId: number, photoIds: number[]): Promise<FoodLogEntry> {
    const response = await axios.post<FoodLogEntry>(
      `/trips/${tripId}/food-log/${entryId}/photos`,
      { photoIds }
    );
    return response.data;
  },

  /** Detaches a photo from an entry. The photo stays in the trip gallery. */
  async removePhoto(tripId: number, entryId: number, photoId: number): Promise<void> {
    await axios.delete(`/trips/${tripId}/food-log/${entryId}/photos/${photoId}`);
  },

  /** Best-meals search across all of the user's trips. */
  async search(filters: FoodLogSearchFilters): Promise<FoodLogEntryWithTrip[]> {
    const params: Record<string, string | number | boolean> = {};
    if (filters.minRating) params.minRating = filters.minRating;
    if (filters.orderAgain !== undefined) params.orderAgain = filters.orderAgain;
    if (filters.q?.trim()) params.q = filters.q.trim();
    const response = await axios.get<FoodLogEntryWithTrip[]>('/food-log', { params });
    return response.data;
  },
};

export default foodLogService;
