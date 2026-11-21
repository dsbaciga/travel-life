export type ActivityLocation = {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

// The activity's place is its own locationId (a direct FK), not an entity link
export type Activity = {
  id: number;
  tripId: number;
  parentId: number | null;
  locationId: number | null;
  location?: ActivityLocation | null;
  name: string;
  description: string | null;
  category: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  cost: number | null;
  currency: string | null;
  bookingUrl: string | null;
  bookingReference: string | null;
  notes: string | null;
  dietaryTags: string[] | null;
  manualOrder: number | null;
  createdAt: string;
  updatedAt: string;
  parent?: {
    id: number;
    name: string;
  };
  children?: {
    id: number;
    name: string;
    description: string | null;
    startTime: string | null;
    endTime: string | null;
    timezone: string | null;
    category: string | null;
    cost: number | null;
    currency: string | null;
    bookingReference: string | null;
    notes: string | null;
  }[];
};

export type CreateActivityInput = {
  tripId: number;
  parentId?: number | null;
  locationId?: number | null;
  name: string;
  description?: string;
  category?: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  cost?: number;
  currency?: string;
  bookingUrl?: string;
  bookingReference?: string;
  notes?: string;
  dietaryTags?: string[];
};

export type UpdateActivityInput = {
  parentId?: number | null;
  locationId?: number | null;
  name?: string;
  description?: string | null;
  category?: string | null;
  allDay?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  cost?: number | null;
  currency?: string | null;
  bookingUrl?: string | null;
  bookingReference?: string | null;
  notes?: string | null;
  dietaryTags?: string[] | null;
};
