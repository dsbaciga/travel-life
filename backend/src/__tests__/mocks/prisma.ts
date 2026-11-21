/**
 * Comprehensive Prisma mock for Travel Life application backend tests
 *
 * This module provides a fully mocked Prisma client that can be used across all service tests.
 * Each model has standard CRUD methods mocked with jest.fn() for easy verification and customization.
 */

import { jest } from '@jest/globals';

/**
 * Type for mock model delegate
 */
interface MockModelDelegate {
  findUnique: jest.Mock;
  findUniqueOrThrow: jest.Mock;
  findFirst: jest.Mock;
  findFirstOrThrow: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  count: jest.Mock;
  aggregate: jest.Mock;
  groupBy: jest.Mock;
}

/**
 * Creates a mock model delegate with all standard Prisma methods
 */
const createMockModelDelegate = (): MockModelDelegate => ({
  findUnique: jest.fn(),
  findUniqueOrThrow: jest.fn(),
  findFirst: jest.fn(),
  findFirstOrThrow: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  groupBy: jest.fn(),
});

/**
 * Mock Prisma Client with all model delegates
 */
export const mockPrismaClient = {
  // User model
  user: createMockModelDelegate(),

  // Trip model
  trip: createMockModelDelegate(),

  // TripTag model
  tripTag: createMockModelDelegate(),

  // TripTagAssignment model
  tripTagAssignment: createMockModelDelegate(),

  // TravelCompanion model
  travelCompanion: createMockModelDelegate(),

  // TripCompanion model
  tripCompanion: createMockModelDelegate(),

  // TripCollaborator model
  tripCollaborator: createMockModelDelegate(),

  // TripInvitation model
  tripInvitation: createMockModelDelegate(),

  // Location model
  location: createMockModelDelegate(),

  // LocationCategory model
  locationCategory: createMockModelDelegate(),

  // Photo model
  photo: createMockModelDelegate(),

  // PhotoAlbum model
  photoAlbum: createMockModelDelegate(),

  // PhotoAlbumAssignment model
  photoAlbumAssignment: createMockModelDelegate(),

  // Activity model
  activity: createMockModelDelegate(),

  // Transportation model
  transportation: createMockModelDelegate(),

  // Lodging model
  lodging: createMockModelDelegate(),

  // JournalEntry model
  journalEntry: createMockModelDelegate(),

  // WeatherData model
  weatherData: createMockModelDelegate(),

  // FlightTracking model
  flightTracking: createMockModelDelegate(),

  // Checklist model
  checklist: createMockModelDelegate(),

  // ChecklistItem model
  checklistItem: createMockModelDelegate(),

  // RouteCache model
  routeCache: createMockModelDelegate(),

  // EntityLink model
  entityLink: createMockModelDelegate(),

  // TripExpense model (a booking's cost is its linked expense row)
  tripExpense: createMockModelDelegate(),
  tripExpenseSplit: createMockModelDelegate(),

  // Transaction support
  $transaction: jest.fn((callback: unknown) => {
    // If callback is a function, execute it with the mock client
    if (typeof callback === 'function') {
      return callback(mockPrismaClient);
    }
    // If callback is an array of promises, resolve them all
    if (Array.isArray(callback)) {
      return Promise.all(callback);
    }
    return Promise.resolve(callback);
  }),

  // Raw query support
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),

  // Connection management
  $connect: jest.fn(),
  $disconnect: jest.fn(),

  // Extensions support
  $extends: jest.fn().mockReturnThis(),
};

/**
 * Type for the mock Prisma client
 */
export type MockPrismaClient = typeof mockPrismaClient;

/**
 * Reset all mock functions in the Prisma client
 * Call this in beforeEach() to ensure clean state between tests
 */
export const resetPrismaMocks = (): void => {
  const resetModel = (model: MockModelDelegate) => {
    Object.values(model).forEach((method) => {
      if (typeof method === 'function' && 'mockReset' in method) {
        (method as jest.Mock).mockReset();
      }
    });
  };

  // Reset all model delegates
  resetModel(mockPrismaClient.user);
  resetModel(mockPrismaClient.trip);
  resetModel(mockPrismaClient.tripTag);
  resetModel(mockPrismaClient.tripTagAssignment);
  resetModel(mockPrismaClient.travelCompanion);
  resetModel(mockPrismaClient.tripCompanion);
  resetModel(mockPrismaClient.tripCollaborator);
  resetModel(mockPrismaClient.tripInvitation);
  resetModel(mockPrismaClient.location);
  resetModel(mockPrismaClient.locationCategory);
  resetModel(mockPrismaClient.photo);
  resetModel(mockPrismaClient.photoAlbum);
  resetModel(mockPrismaClient.photoAlbumAssignment);
  resetModel(mockPrismaClient.activity);
  resetModel(mockPrismaClient.transportation);
  resetModel(mockPrismaClient.lodging);
  resetModel(mockPrismaClient.journalEntry);
  resetModel(mockPrismaClient.weatherData);
  resetModel(mockPrismaClient.flightTracking);
  resetModel(mockPrismaClient.checklist);
  resetModel(mockPrismaClient.checklistItem);
  resetModel(mockPrismaClient.routeCache);
  resetModel(mockPrismaClient.entityLink);
  resetModel(mockPrismaClient.tripExpense);
  resetModel(mockPrismaClient.tripExpenseSplit);
  // Deleting a booking looks up the receipt files of its cost row first: none by default.
  mockPrismaClient.tripExpense.findMany.mockResolvedValue([]);

  // Reset top-level methods
  mockPrismaClient.$transaction.mockReset();
  mockPrismaClient.$queryRaw.mockReset();
  mockPrismaClient.$executeRaw.mockReset();
  mockPrismaClient.$queryRawUnsafe.mockReset();
  mockPrismaClient.$executeRawUnsafe.mockReset();
  mockPrismaClient.$connect.mockReset();
  mockPrismaClient.$disconnect.mockReset();

  // Re-setup default transaction behavior
  mockPrismaClient.$transaction.mockImplementation((callback: unknown) => {
    if (typeof callback === 'function') {
      return callback(mockPrismaClient);
    }
    if (Array.isArray(callback)) {
      return Promise.all(callback);
    }
    return Promise.resolve(callback);
  });
};

/**
 * Setup mock module for Prisma database import
 * Use this with jest.mock() to replace the actual database import
 *
 * Example:
 * ```typescript
 * jest.mock('../../config/database', () => ({
 *   default: mockPrismaClient,
 * }));
 * ```
 */
export const setupPrismaMock = (): void => {
  jest.mock('../../config/database', () => ({
    default: mockPrismaClient,
  }));
};

/**
 * Helper to setup common return values for user-related queries
 */
export const setupUserMocks = (user: unknown) => {
  mockPrismaClient.user.findUnique.mockResolvedValue(user);
  mockPrismaClient.user.findFirst.mockResolvedValue(user);
  return mockPrismaClient.user;
};

/**
 * Helper to setup common return values for trip-related queries
 */
export const setupTripMocks = (trip: unknown) => {
  mockPrismaClient.trip.findUnique.mockResolvedValue(trip);
  mockPrismaClient.trip.findFirst.mockResolvedValue(trip);
  return mockPrismaClient.trip;
};

/**
 * Helper to setup common return values for photo-related queries
 */
export const setupPhotoMocks = (photo: unknown) => {
  mockPrismaClient.photo.findUnique.mockResolvedValue(photo);
  mockPrismaClient.photo.findFirst.mockResolvedValue(photo);
  return mockPrismaClient.photo;
};

/**
 * Helper to setup common return values for location-related queries
 */
export const setupLocationMocks = (location: unknown) => {
  mockPrismaClient.location.findUnique.mockResolvedValue(location);
  mockPrismaClient.location.findFirst.mockResolvedValue(location);
  return mockPrismaClient.location;
};

/**
 * Model delegate keys (for type-safe model access)
 */
type ModelKey =
  | 'user' | 'trip' | 'tripTag' | 'tripTagAssignment'
  | 'travelCompanion' | 'tripCompanion' | 'tripCollaborator' | 'tripInvitation'
  | 'location' | 'locationCategory' | 'photo' | 'photoAlbum' | 'photoAlbumAssignment'
  | 'activity' | 'transportation' | 'lodging' | 'journalEntry'
  | 'weatherData' | 'flightTracking' | 'checklist' | 'checklistItem'
  | 'routeCache' | 'entityLink';

/**
 * Helper to mock a not found scenario (entity doesn't exist)
 */
export const setupNotFoundMocks = (model: ModelKey) => {
  const delegate = mockPrismaClient[model];
  delegate.findUnique.mockResolvedValue(null);
  delegate.findFirst.mockResolvedValue(null);
};

/**
 * Helper to mock an authorization failure (user doesn't own the entity)
 */
export const setupUnauthorizedMocks = (model: ModelKey) => {
  // Return null to simulate "not found for this user" scenario
  setupNotFoundMocks(model);
};

/**
 * Mock Prisma types for EntityLink (matching the actual enum values)
 */
export const MockEntityType = {
  PHOTO: 'PHOTO',
  LOCATION: 'LOCATION',
  ACTIVITY: 'ACTIVITY',
  LODGING: 'LODGING',
  TRANSPORTATION: 'TRANSPORTATION',
  JOURNAL_ENTRY: 'JOURNAL_ENTRY',
  PHOTO_ALBUM: 'PHOTO_ALBUM',
} as const;

export const MockLinkRelationship = {
  RELATED: 'RELATED',
  TAKEN_AT: 'TAKEN_AT',
  OCCURRED_AT: 'OCCURRED_AT',
  PART_OF: 'PART_OF',
  DOCUMENTS: 'DOCUMENTS',
  FEATURED_IN: 'FEATURED_IN',
} as const;

export default mockPrismaClient;
