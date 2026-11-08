export const FOOD_RATINGS = [1, 2, 3, 4, 5] as const;

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
