import prisma from '../../config/database';
import { AppError } from '../../errors/errors';

import { getEntityDelegate } from '../../prisma/modelDelegates';
import {
  PERMISSION_HIERARCHY,
  toSafePermissionLevel,
  TripPermissionLevel,
} from './tripPermissions';

/**
 * Authorization for trips and the entities that hang off them:
 * - Trip ownership verification
 * - Entity access verification
 * - Permission-aware access checks that also cover collaborators
 */

/**
 * Entity types that support ownership verification
 */
export type VerifiableEntityType =
  | 'location'
  | 'photo'
  | 'activity'
  | 'lodging'
  | 'transportation'
  | 'journalEntry'
  | 'album'
  | 'photoAlbum'
  | 'customItem';

/**
 * Configuration for each entity type's Prisma model and display name
 */
interface EntityConfig {
  model: keyof typeof prisma;
  displayName: string;
  /** Lowercase noun used in user-facing messages. */
  noun: string;
}

const entityConfigs: Record<VerifiableEntityType, EntityConfig> = {
  location: { model: 'location', displayName: 'Location', noun: 'place' },
  photo: { model: 'photo', displayName: 'Photo', noun: 'photo' },
  activity: { model: 'activity', displayName: 'Activity', noun: 'activity' },
  lodging: { model: 'lodging', displayName: 'Lodging', noun: 'stay' },
  transportation: { model: 'transportation', displayName: 'Transportation', noun: 'transport item' },
  journalEntry: { model: 'journalEntry', displayName: 'Journal entry', noun: 'journal entry' },
  album: { model: 'photoAlbum', displayName: 'Album', noun: 'album' },
  photoAlbum: { model: 'photoAlbum', displayName: 'Album', noun: 'album' },
  customItem: { model: 'customItem', displayName: 'Custom item', noun: 'custom item' },
};

/**
 * Generic function to verify entity exists and belongs to a specific trip
 * Consolidates verifyLocationInTrip, verifyPhotoInTrip, etc.
 *
 * @param entityType - The type of entity to verify
 * @param entityId - The ID of the entity
 * @param tripId - The trip ID to verify against
 * @throws {AppError} 404 if entity not found or doesn't belong to trip
 */
export async function verifyEntityInTrip(
  entityType: VerifiableEntityType,
  entityId: number,
  tripId: number
): Promise<void> {
  const config = entityConfigs[entityType];
  const model = getEntityDelegate(entityType);

  const entity = await model.findFirst({
    where: { id: entityId, tripId },
  });

  if (!entity) {
    throw new AppError(`We couldn't find that ${config.noun} on this trip.`, 404);
  }
}

/**
 * Generic function to verify entity exists and user owns the associated trip.
 *
 * Note: For permission-aware access checks that support collaborators,
 * prefer verifyEntityAccessWithPermission() instead.
 *
 * @param entityType - The type of entity to verify
 * @param entityId - The ID of the entity
 * @param userId - The user ID to verify ownership against
 * @throws {AppError} 404 if entity not found or access denied
 * @returns The entity with trip included if verification passes
 */
export async function verifyEntityAccessById<T = unknown>(
  entityType: VerifiableEntityType,
  entityId: number,
  userId: number
): Promise<T> {
  const config = entityConfigs[entityType];
  const model = getEntityDelegate(entityType);

  const entity = await model.findFirst({
    where: {
      id: entityId,
      trip: { userId },
    },
  });

  if (!entity) {
    throw new AppError(`We couldn't find that ${config.noun}, or you don't have access to it.`, 404);
  }

  return entity as T;
}

/**
 * Verifies user owns the trip
 * @throws {AppError} 404 if trip not found or access denied
 * @returns The trip if access is granted
 * @deprecated Use verifyTripAccessWithPermission for collaborator support
 */
export async function verifyTripAccess(
  userId: number,
  tripId: number
) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId },
  });

  if (!trip) {
    throw new AppError("We couldn't find that trip, or you don't have access to it.", 404);
  }

  return trip;
}

/**
 * Result of trip access verification
 */
export interface TripAccessResult {
  trip: {
    id: number;
    userId: number;
    title: string;
    privacyLevel: string;
  };
  isOwner: boolean;
  permissionLevel: TripPermissionLevel;
}

/**
 * Verifies user has access to trip with the required permission level.
 * Supports owners and collaborators.
 *
 * `privacyLevel: 'Public'` deliberately grants nothing here. It used to give every
 * authenticated user 'view', and because every read path that requires only 'view' goes
 * through this function, that exposed expenses, lodging confirmation numbers and
 * transportation booking references — the exact fields share.service.ts strips from the
 * public payload. Public exposure belongs to the sanitised share-token path only.
 *
 * @param userId - The user requesting access
 * @param tripId - The trip to access
 * @param requiredPermission - Minimum permission level required (default: 'view')
 * @throws {AppError} 404 if trip not found or no access
 * @throws {AppError} 403 if insufficient permissions
 * @returns Trip access result with permission level
 */
export async function verifyTripAccessWithPermission(
  userId: number,
  tripId: number,
  requiredPermission: TripPermissionLevel = 'view'
): Promise<TripAccessResult> {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { userId }, // Owner
        { collaborators: { some: { userId } } }, // Collaborator
      ],
    },
    include: {
      collaborators: {
        where: { userId },
        select: { permissionLevel: true },
      },
    },
  });

  if (!trip) {
    throw new AppError("We couldn't find that trip, or you don't have access to it.", 404);
  }

  const isOwner = trip.userId === userId;
  let permissionLevel: TripPermissionLevel;

  if (isOwner) {
    // Owner always has admin permissions
    permissionLevel = 'admin';
  } else if (trip.collaborators.length > 0) {
    // User is a collaborator - validate the permission level from database
    permissionLevel = toSafePermissionLevel(trip.collaborators[0].permissionLevel, 'view');
  } else {
    // Should not reach here, but handle gracefully
    throw new AppError("You don't have access to this trip.", 403);
  }

  // Check if user has required permission level
  if (PERMISSION_HIERARCHY[permissionLevel] < PERMISSION_HIERARCHY[requiredPermission]) {
    throw new AppError("You don't have permission to do that.", 403);
  }

  return {
    trip: {
      id: trip.id,
      userId: trip.userId,
      title: trip.title,
      privacyLevel: trip.privacyLevel,
    },
    isOwner,
    permissionLevel,
  };
}

/**
 * Verifies user has access to a trip entity (location, activity, etc.) with the required permission.
 * This is for accessing entities that belong to a trip via the tripId field.
 *
 * @param entityType - The type of entity to verify
 * @param entityId - The ID of the entity
 * @param userId - The user requesting access
 * @param requiredPermission - Minimum permission level required (default: 'view')
 * @throws {AppError} 404 if entity not found or no access
 * @throws {AppError} 403 if insufficient permissions
 * @returns The entity and trip access info
 */
export async function verifyEntityAccessWithPermission<T = unknown>(
  entityType: VerifiableEntityType,
  entityId: number,
  userId: number,
  requiredPermission: TripPermissionLevel = 'view'
): Promise<{ entity: T; tripAccess: TripAccessResult }> {
  const config = entityConfigs[entityType];
  const model = getEntityDelegate(entityType);

  // First, find the entity to get its tripId
  const entity = await model.findUnique({
    where: { id: entityId },
  });

  if (!entity || !hasNumericTripId(entity)) {
    throw new AppError(`We couldn't find that ${config.noun}.`, 404);
  }

  // Then verify trip access with permission
  const tripAccess = await verifyTripAccessWithPermission(
    userId,
    entity.tripId,
    requiredPermission
  );

  return { entity: entity as T, tripAccess };
}

/**
 * Type guard: true if `value` is an object with a numeric `tripId` field.
 * Used after dynamic Prisma model dispatch where the returned entity's type
 * is not statically known.
 */
function hasNumericTripId(value: unknown): value is { tripId: number } {
  if (typeof value !== 'object' || value === null || !('tripId' in value)) return false;
  // `'tripId' in value` already narrows `value` to an object known to carry
  // the key, so the property access needs no assertion.
  return typeof value.tripId === 'number';
}

/**
 * Verifies entity belongs to user's trip
 * @throws {AppError} 404 if entity not found, 403 if access denied
 * @returns The entity if access is granted
 * @deprecated Use verifyEntityAccessWithPermission() for permission-aware access checks.
 * Kept for backward compatibility with existing tests.
 */
export async function verifyEntityAccess<T extends { trip: { userId: number } }>(
  entity: T | null,
  userId: number,
  entityName: string
): Promise<T> {
  if (!entity) {
    throw new AppError(`We couldn't find that ${entityName.toLowerCase()}.`, 404);
  }

  if (entity.trip.userId !== userId) {
    throw new AppError("You don't have access to this trip.", 403);
  }

  return entity;
}

/**
 * Generic function to verify entity ownership through trip relationship
 * More flexible version that works with any entity type
 *
 * @deprecated Use verifyEntityAccessWithPermission() for permission-aware access checks
 */
export async function verifyEntityOwnership<T extends { trip: { userId: number } }>(
  findQuery: () => Promise<T | null>,
  userId: number,
  entityName: string
): Promise<T> {
  const entity = await findQuery();
  return verifyEntityAccess(entity, userId, entityName);
}
