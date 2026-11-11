export const FOOD_RATINGS = [1, 2, 3, 4, 5] as const;

/** The subset of a trip Photo needed to show it on a food log entry. */
export type FoodLogPhoto = {
  id: number;
  source: string;
  mediaType: string;
  immichAssetId: string | null;
  localPath: string | null;
  thumbnailPath: string | null;
  caption: string | null;
};

/** Most photos one entry can carry; mirrors the backend cap. */
export const MAX_FOOD_PHOTOS = 12;

export type FoodLogEntry = {
  id: number;
  tripId: number;
  activityId: number | null;
  locationId: number | null;
  restaurantName: string;
  dish: string;
  /** 1-5 */
  rating: number;
  notes: string | null;
  orderAgain: boolean;
  /** Attached photos in display order. */
  photos: FoodLogPhoto[];
  createdAt: string;
  updatedAt: string;
};

export type FoodLogEntryWithTrip = FoodLogEntry & {
  trip: { id: number; title: string; timezone: string | null };
};

export type CreateFoodLogEntryInput = {
  restaurantName: string;
  dish: string;
  rating: number;
  notes?: string | null;
  orderAgain?: boolean;
  activityId?: number | null;
  locationId?: number | null;
};

export type UpdateFoodLogEntryInput = Partial<CreateFoodLogEntryInput>;

export type FoodLogSearchFilters = {
  minRating?: number;
  orderAgain?: boolean;
  q?: string;
};
