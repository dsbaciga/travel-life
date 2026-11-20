/**
 * Test fixtures for frontend unit tests
 * Provides consistent mock data matching the application's type definitions
 */

import type { Trip } from '../../types/trip';
import type { User, ActivityCategory, TripTypeCategory } from '../../types/user';
import type { Activity, CreateActivityInput, UpdateActivityInput } from '../../types/activity';
import type { Location, LocationCategory, CreateLocationInput, UpdateLocationInput } from '../../types/location';
import type { Photo, PhotoAlbum } from '../../types/photo';

// ============================================================================
// User Fixtures
// ============================================================================

export const mockActivityCategories: ActivityCategory[] = [
  { name: 'Sightseeing', emoji: '🏛️' },
  { name: 'Food & Drink', emoji: '🍽️' },
  { name: 'Adventure', emoji: '🏔️' },
  { name: 'Culture', emoji: '🎭' },
  { name: 'Shopping', emoji: '🛍️' },
  { name: 'Relaxation', emoji: '🧘' },
];

export const mockTripTypes: TripTypeCategory[] = [
  { name: 'Vacation', emoji: '🏖️' },
  { name: 'Business', emoji: '💼' },
];

export const mockUser: User = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  avatarUrl: null,
  timezone: 'America/New_York',
  activityCategories: mockActivityCategories,
  tripTypes: mockTripTypes,
  dietaryPreferences: [],
  useCustomMapStyle: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// ============================================================================
// Trip Fixtures
// ============================================================================

export const mockTrip: Trip = {
  id: 1,
  userId: 1,
  title: 'Test Trip to Paris',
  description: 'A wonderful trip to explore Paris',
  startDate: '2024-06-01',
  endDate: '2024-06-10',
  timezone: 'Europe/Paris',
  status: 'Planning',
  tripType: null,
  tripTypeEmoji: null,
  privacyLevel: 'Private',
  addToPlacesVisited: true,
  excludeFromAutoShare: false,
  archived: false,
  coverPhotoId: null,
  coverImagePath: null,
  coverImageThumbnailPath: null,
  bannerPhotoId: null,
  seriesId: null,
  seriesOrder: null,
  series: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  _count: {
    locations: 5,
    photos: 10,
    transportation: 2,
    activities: 8,
    lodging: 1,
    journalEntries: 3,
  },
};

export const mockTripInProgress: Trip = {
  ...mockTrip,
  id: 2,
  title: 'Active Trip to Tokyo',
  status: 'In Progress',
  timezone: 'Asia/Tokyo',
  startDate: '2024-05-15',
  endDate: '2024-05-25',
};

export const mockTripCompleted: Trip = {
  ...mockTrip,
  id: 3,
  title: 'Completed Trip to London',
  status: 'Completed',
  timezone: 'Europe/London',
  startDate: '2024-01-01',
  endDate: '2024-01-07',
};

// ============================================================================
// Location Fixtures
// ============================================================================

export const mockLocationCategories: LocationCategory[] = [
  { id: 1, userId: 1, name: 'Restaurant', icon: '🍽️', color: '#FF5733', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 2, userId: 1, name: 'Museum', icon: '🏛️', color: '#3498DB', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 3, userId: 1, name: 'Park', icon: '🌳', color: '#27AE60', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 4, userId: 1, name: 'Hotel', icon: '🏨', color: '#9B59B6', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 5, userId: 1, name: 'Landmark', icon: '🗼', color: '#F1C40F', isDefault: true, createdAt: '2024-01-01T00:00:00.000Z' },
];

export const mockLocation: Location = {
  id: 1,
  tripId: 1,
  parentId: null,
  name: 'Eiffel Tower',
  address: 'Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France',
  latitude: 48.8584,
  longitude: 2.2945,
  categoryId: 5,
  visitDatetime: null,
  visitDurationMinutes: null,
  notes: 'Must visit at night for the light show',
  isFavorite: false,
  excludeFromMap: false,
  openingHours: 'Mo-Su 09:00-23:45',
  openingHoursSource: 'osm',
  timezone: 'Europe/Paris',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  category: mockLocationCategories[4],
};

export const mockLocationParent: Location = {
  id: 2,
  tripId: 1,
  parentId: null,
  name: 'Paris',
  address: 'Paris, France',
  latitude: 48.8566,
  longitude: 2.3522,
  categoryId: null,
  visitDatetime: null,
  visitDurationMinutes: null,
  notes: 'Capital of France',
  isFavorite: false,
  excludeFromMap: false,
  openingHours: null,
  openingHoursSource: null,
  timezone: 'Europe/Paris',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  category: null,
  children: [
    {
      id: 1,
      name: 'Eiffel Tower',
      latitude: 48.8584,
      longitude: 2.2945,
      visitDatetime: null,
      category: mockLocationCategories[4],
    },
    {
      id: 3,
      name: 'Louvre Museum',
      latitude: 48.8606,
      longitude: 2.3376,
      visitDatetime: null,
      category: mockLocationCategories[1],
    },
  ],
};

export const mockLocationChild: Location = {
  ...mockLocation,
  id: 3,
  parentId: 2,
  name: 'Louvre Museum',
  address: 'Rue de Rivoli, 75001 Paris, France',
  latitude: 48.8606,
  longitude: 2.3376,
  categoryId: 2,
  notes: 'Home of the Mona Lisa',
  category: mockLocationCategories[1],
  parent: {
    id: 2,
    name: 'Paris',
  },
};

export const mockLocations: Location[] = [
  mockLocation,
  mockLocationParent,
  mockLocationChild,
];

export const mockCreateLocationInput: CreateLocationInput = {
  tripId: 1,
  name: 'New Location',
  address: '123 Test Street',
  latitude: 40.7128,
  longitude: -74.006,
  categoryId: 1,
  notes: 'Test notes',
};

export const mockUpdateLocationInput: UpdateLocationInput = {
  name: 'Updated Location Name',
  notes: 'Updated notes',
};

// ============================================================================
// Activity Fixtures
// ============================================================================

export const mockActivity: Activity = {
  id: 1,
  tripId: 1,
  parentId: null,
  locationId: null,
  name: 'Visit Eiffel Tower',
  description: 'Morning visit to the Eiffel Tower with tower climb',
  category: 'Sightseeing',
  allDay: false,
  startTime: '2024-06-02T09:00:00.000Z',
  endTime: '2024-06-02T12:00:00.000Z',
  timezone: 'Europe/Paris',
  cost: 25.50,
  currency: 'EUR',
  bookingUrl: 'https://www.toureiffel.paris/en',
  bookingReference: 'EIFFEL-12345',
  notes: 'Arrive early to avoid crowds',
  dietaryTags: null,
  manualOrder: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export const mockActivityUnscheduled: Activity = {
  id: 2,
  tripId: 1,
  parentId: null,
  locationId: null,
  name: 'Try French Pastries',
  description: 'Visit a local patisserie',
  category: 'Food & Drink',
  allDay: false,
  startTime: null,
  endTime: null,
  timezone: null,
  cost: null,
  currency: null,
  bookingUrl: null,
  bookingReference: null,
  notes: 'Ask locals for recommendations',
  dietaryTags: null,
  manualOrder: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export const mockActivityAllDay: Activity = {
  id: 3,
  tripId: 1,
  parentId: null,
  locationId: null,
  name: 'Day Trip to Versailles',
  description: 'Full day exploring the Palace of Versailles',
  category: 'Sightseeing',
  allDay: true,
  startTime: '2024-06-05T00:00:00.000Z',
  endTime: '2024-06-05T23:59:59.000Z',
  timezone: 'Europe/Paris',
  cost: 45.00,
  currency: 'EUR',
  bookingUrl: 'https://www.chateauversailles.fr/',
  bookingReference: 'VER-67890',
  notes: 'Includes gardens and Trianon',
  dietaryTags: null,
  manualOrder: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export const mockActivityWithChildren: Activity = {
  id: 4,
  tripId: 1,
  parentId: null,
  locationId: null,
  name: 'Museum Day',
  description: 'Visit multiple museums',
  category: 'Culture',
  allDay: true,
  startTime: '2024-06-03T00:00:00.000Z',
  endTime: null,
  timezone: 'Europe/Paris',
  cost: null,
  currency: null,
  bookingUrl: null,
  bookingReference: null,
  notes: null,
  dietaryTags: null,
  manualOrder: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  children: [
    {
      id: 5,
      name: 'Louvre Museum',
      description: 'Morning at the Louvre',
      startTime: '2024-06-03T09:00:00.000Z',
      endTime: '2024-06-03T13:00:00.000Z',
      timezone: 'Europe/Paris',
      category: 'Culture',
      cost: 17,
      currency: 'EUR',
      bookingReference: 'LOUVRE-001',
      notes: 'See Mona Lisa first',
    },
    {
      id: 6,
      name: "Musee d'Orsay",
      description: 'Afternoon at Orsay',
      startTime: '2024-06-03T14:00:00.000Z',
      endTime: '2024-06-03T18:00:00.000Z',
      timezone: 'Europe/Paris',
      category: 'Culture',
      cost: 14,
      currency: 'EUR',
      bookingReference: 'ORSAY-002',
      notes: 'Impressionist collection',
    },
  ],
};

export const mockActivityChild: Activity = {
  id: 5,
  tripId: 1,
  parentId: 4,
  locationId: null,
  name: 'Louvre Museum',
  description: 'Morning at the Louvre',
  category: 'Culture',
  allDay: false,
  startTime: '2024-06-03T09:00:00.000Z',
  endTime: '2024-06-03T13:00:00.000Z',
  timezone: 'Europe/Paris',
  cost: 17,
  currency: 'EUR',
  bookingUrl: null,
  bookingReference: 'LOUVRE-001',
  notes: 'See Mona Lisa first',
  dietaryTags: null,
  manualOrder: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  parent: {
    id: 4,
    name: 'Museum Day',
  },
};

export const mockActivities: Activity[] = [
  mockActivity,
  mockActivityUnscheduled,
  mockActivityAllDay,
  mockActivityWithChildren,
  mockActivityChild,
];

export const mockCreateActivityInput: CreateActivityInput = {
  tripId: 1,
  name: 'New Activity',
  description: 'Test description',
  category: 'Sightseeing',
  allDay: false,
  startTime: '2024-06-05T10:00:00.000Z',
  endTime: '2024-06-05T12:00:00.000Z',
  timezone: 'Europe/Paris',
  cost: 50,
  currency: 'EUR',
};

export const mockUpdateActivityInput: UpdateActivityInput = {
  name: 'Updated Activity Name',
  description: 'Updated description',
  cost: 75,
};

// ============================================================================
// Photo Fixtures
// ============================================================================

export const mockPhoto: Photo = {
  id: 1,
  tripId: 1,
  source: 'local',
  mediaType: 'image',
  immichAssetId: null,
  localPath: '/uploads/photos/trip-1/photo-1.jpg',
  thumbnailPath: '/uploads/photos/trip-1/thumb-1.jpg',
  duration: null,
  caption: 'Beautiful view of the Eiffel Tower',
  takenAt: '2024-06-02T10:30:00.000Z',
  latitude: 48.8584,
  longitude: 2.2945,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export const mockPhotoImmich: Photo = {
  id: 2,
  tripId: 1,
  source: 'immich',
  mediaType: 'image',
  immichAssetId: 'immich-asset-12345',
  localPath: null,
  thumbnailPath: null,
  duration: null,
  caption: 'Sunset at the Seine',
  takenAt: '2024-06-02T20:30:00.000Z',
  latitude: 48.8566,
  longitude: 2.3522,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export const mockPhotoVideo: Photo = {
  id: 3,
  tripId: 1,
  source: 'local',
  mediaType: 'video',
  immichAssetId: null,
  localPath: '/uploads/photos/trip-1/video-1.mp4',
  thumbnailPath: '/uploads/photos/trip-1/thumb-video-1.jpg',
  duration: 30,
  caption: 'Street performer in Montmartre',
  takenAt: '2024-06-03T15:00:00.000Z',
  latitude: 48.8867,
  longitude: 2.3431,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export const mockPhotos: Photo[] = [
  mockPhoto,
  mockPhotoImmich,
  mockPhotoVideo,
];

export const mockPhotoAlbum: PhotoAlbum = {
  id: 1,
  tripId: 1,
  name: 'Eiffel Tower Visit',
  description: 'Photos from our visit to the Eiffel Tower',
  coverPhotoId: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  coverPhoto: mockPhoto,
  _count: {
    photos: 5,
    photoAssignments: 5,
  },
};

export const mockPhotoAlbums: PhotoAlbum[] = [
  mockPhotoAlbum,
  {
    ...mockPhotoAlbum,
    id: 2,
    name: 'Louvre Museum',
    description: 'Art and architecture',
    coverPhotoId: null,
    coverPhoto: undefined,
    _count: { photos: 12, photoAssignments: 12 },
  },
];

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a mock trip with custom overrides
 */
export function createMockTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    ...mockTrip,
    id: Math.floor(Math.random() * 10000),
    ...overrides,
  };
}

/**
 * Create a mock location with custom overrides
 */
export function createMockLocation(overrides: Partial<Location> = {}): Location {
  return {
    ...mockLocation,
    id: Math.floor(Math.random() * 10000),
    ...overrides,
  };
}

/**
 * Create a mock activity with custom overrides
 */
export function createMockActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    ...mockActivity,
    id: Math.floor(Math.random() * 10000),
    ...overrides,
  };
}

/**
 * Create a mock photo with custom overrides
 */
export function createMockPhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    ...mockPhoto,
    id: Math.floor(Math.random() * 10000),
    ...overrides,
  };
}

/**
 * Create a mock user with custom overrides
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    ...mockUser,
    id: Math.floor(Math.random() * 10000),
    ...overrides,
  };
}

// ============================================================================
// API Response Helpers
// ============================================================================

/**
 * Wrap data in standard API success response format
 */
export function wrapApiResponse<T>(data: T): { status: 'success'; data: T } {
  return {
    status: 'success',
    data,
  };
}

/**
 * Create a standard API error response
 */
export function createApiErrorResponse(
  message: string,
  statusCode = 400
): { status: 'error'; message: string; statusCode: number } {
  return {
    status: 'error',
    message,
    statusCode,
  };
}
