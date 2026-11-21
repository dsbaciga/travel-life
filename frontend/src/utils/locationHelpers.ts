import type { Location } from '../types/location';

/**
 * Creates a minimal Location stub for optimistic local state updates.
 *
 * When a location is quick-created from within a Manager form (e.g., LodgingManager,
 * TransportationManager, ActivityManager), we need to immediately add it to the
 * local locations dropdown without a full refetch. This function builds the stub
 * that all managers use, eliminating the ~15-line duplication in each
 * `handleLocationCreated` callback.
 *
 * The stub is only used for local display in the locations dropdown. The actual
 * full Location object is fetched from the server on the next data load.
 *
 * @param locationId - ID of the newly created location (returned from the API)
 * @param locationName - Name of the newly created location
 * @param tripId - Trip ID the location belongs to
 * @returns A minimal Location object suitable for local state updates
 *
 * @example
 * ```typescript
 * const handleLocationCreated = (locationId: number, locationName: string) => {
 *   const newLocation = createLocationStub(locationId, locationName, tripId);
 *   setLocalLocations(prev => [...prev, newLocation]);
 *   handleChange('locationId', locationId);
 *   setShowLocationQuickAdd(false);
 * };
 * ```
 */
export function createLocationStub(
  locationId: number,
  locationName: string,
  tripId: number,
): Location {
  const now = new Date().toISOString();
  return {
    id: locationId,
    name: locationName,
    tripId,
    parentId: null,
    address: null,
    countryCode: null,
    latitude: null,
    longitude: null,
    categoryId: null,
    visitDatetime: null,
    visitDurationMinutes: null,
    notes: null,
    isFavorite: false,
    excludeFromMap: false,
    // A stub for an entity the caller just created; the server fills these in.
    openingHours: null,
    openingHoursSource: null,
    timezone: null,
    createdAt: now,
    updatedAt: now,
  };
}
