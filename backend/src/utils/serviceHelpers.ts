import prisma from '../config/database';
import { AppError } from './errors';
import { EntityType, Prisma } from '@prisma/client';
type Decimal = Prisma.Decimal;
import { PrismaModelDelegate } from '../types/prisma-helpers';

/**
 * Service helper utilities to reduce duplication across service files
 * Provides common patterns for:
 * - Trip ownership verification
 * - Entity access verification
 * - Location validation
 * - Update data building
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
  | 'photoAlbum';

/**
 * Configuration for each entity type's Prisma model and display name
 */
interface EntityConfig {
  model: keyof typeof prisma;
  displayName: string;
}

const entityConfigs: Record<VerifiableEntityType, EntityConfig> = {
  location: { model: 'location', displayName: 'Location' },
  photo: { model: 'photo', displayName: 'Photo' },
  activity: { model: 'activity', displayName: 'Activity' },
  lodging: { model: 'lodging', displayName: 'Lodging' },
  transportation: { model: 'transportation', displayName: 'Transportation' },
  journalEntry: { model: 'journalEntry', displayName: 'Journal entry' },
  album: { model: 'photoAlbum', displayName: 'Album' },
  photoAlbum: { model: 'photoAlbum', displayName: 'Album' },
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
  // TypeScript cannot infer the correct model type from a dynamic key lookup.
  // The entityConfigs mapping ensures config.model is always a valid Prisma model name,
  // so this cast is safe. Prisma's generated types don't support dynamic model access.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic Prisma model access requires type assertion
  const model = prisma[config.model] as PrismaModelDelegate;

  const entity = await model.findFirst({
    where: { id: entityId, tripId },
  });

  if (!entity) {
    throw new AppError(`${config.displayName} not found or does not belong to trip`, 404);
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
  // TypeScript cannot infer the correct model type from a dynamic key lookup.
  // The entityConfigs mapping ensures config.model is always a valid Prisma model name,
  // so this cast is safe. Prisma's generated types don't support dynamic model access.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic Prisma model access requires type assertion
  const model = prisma[config.model] as PrismaModelDelegate;

  const entity = await model.findFirst({
    where: {
      id: entityId,
      trip: { userId },
    },
  });

  if (!entity) {
    throw new AppError(`${config.displayName} not found or access denied`, 404);
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
    throw new AppError('Trip not found or access denied', 404);
  }

  return trip;
}

/**
 * Permission levels for trip access
 */
export type TripPermissionLevel = 'view' | 'edit' | 'admin';

/**
 * Valid permission level values
 */
const VALID_PERMISSION_LEVELS: readonly TripPermissionLevel[] = ['view', 'edit', 'admin'] as const;

/**
 * Type guard to check if a value is a valid permission level
 */
export function isValidPermissionLevel(value: unknown): value is TripPermissionLevel {
  return typeof value === 'string' && VALID_PERMISSION_LEVELS.includes(value as TripPermissionLevel);
}

/**
 * Validates and returns a safe permission level.
 * If the value is invalid or missing, returns the default permission level.
 *
 * @param value - The permission level value to validate (from database or user input)
 * @param defaultLevel - The default permission level to use if invalid (default: 'edit')
 * @returns A valid TripPermissionLevel
 *
 * @example
 * ```typescript
 * // Returns 'admin' (valid)
 * toSafePermissionLevel('admin')
 *
 * // Returns 'edit' (default for invalid/missing values)
 * toSafePermissionLevel(null)
 * toSafePermissionLevel('invalid')
 * toSafePermissionLevel(undefined)
 *
 * // Returns 'view' (custom default)
 * toSafePermissionLevel(null, 'view')
 * ```
 */
export function toSafePermissionLevel(
  value: string | null | undefined,
  defaultLevel: TripPermissionLevel = 'edit'
): TripPermissionLevel {
  if (isValidPermissionLevel(value)) {
    return value;
  }
  return defaultLevel;
}

/**
 * Permission hierarchy - higher number = more permissions
 */
const PERMISSION_HIERARCHY: Record<TripPermissionLevel, number> = {
  view: 1,
  edit: 2,
  admin: 3,
};

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
 * Supports owners, collaborators, and public trips.
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
        { privacyLevel: 'Public' }, // Public trip
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
    throw new AppError('Trip not found or access denied', 404);
  }

  const isOwner = trip.userId === userId;
  let permissionLevel: TripPermissionLevel;

  if (isOwner) {
    // Owner always has admin permissions
    permissionLevel = 'admin';
  } else if (trip.collaborators.length > 0) {
    // User is a collaborator - validate the permission level from database
    permissionLevel = toSafePermissionLevel(trip.collaborators[0].permissionLevel, 'view');
  } else if (trip.privacyLevel === 'Public') {
    // Public trip - view only
    permissionLevel = 'view';
  } else {
    // Should not reach here, but handle gracefully
    throw new AppError('Access denied', 403);
  }

  // Check if user has required permission level
  if (PERMISSION_HIERARCHY[permissionLevel] < PERMISSION_HIERARCHY[requiredPermission]) {
    throw new AppError('Insufficient permissions', 403);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic Prisma model access requires type assertion
  const model = prisma[config.model] as PrismaModelDelegate;

  // First, find the entity to get its tripId
  const entity = await model.findUnique({
    where: { id: entityId },
  });

  if (!entity || !(entity as { tripId?: number }).tripId) {
    throw new AppError(`${config.displayName} not found`, 404);
  }

  // Then verify trip access with permission
  const tripAccess = await verifyTripAccessWithPermission(
    userId,
    (entity as { tripId: number }).tripId,
    requiredPermission
  );

  return { entity: entity as T, tripAccess };
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
    throw new AppError(`${entityName} not found`, 404);
  }

  if (entity.trip.userId !== userId) {
    throw new AppError('Access denied', 403);
  }

  return entity;
}

/**
 * Builds update data object, converting empty strings to null
 * Only includes fields that are defined (not undefined)
 * This ensures empty fields are cleared in updates
 *
 * @deprecated Use buildConditionalUpdateData() instead, which supports transformers
 */
export function buildUpdateData<T extends Record<string, unknown>>(
  data: Partial<T>
): Partial<T> {
  const updateData: Partial<T> = {};

  for (const key in data) {
    if (data[key] !== undefined) {
      // Convert empty strings to null for updates to clear fields
      updateData[key] = (data[key] === '' ? null : data[key]) as T[Extract<keyof T, string>];
    }
  }

  return updateData;
}

/**
 * Enhanced update data builder with conditional field inclusion and transformers
 * Eliminates the pattern: if (data.field !== undefined) updateData.field = data.field
 *
 * This function only includes fields that are explicitly defined (not undefined),
 * allowing partial updates where omitted fields remain unchanged in the database.
 *
 * @template T - The data type (typically a Partial<EntityInput>)
 * @param data - Partial data object with fields to update
 * @param options - Configuration options
 * @param options.emptyStringToNull - Convert empty strings to null (default: true)
 * @param options.transformers - Custom field transformers (e.g., date conversion)
 *
 * @returns Update data object with only defined fields, optionally transformed
 *
 * @example
 * ```typescript
 * // Simple usage (converts empty strings to null)
 * const updateData = buildConditionalUpdateData(data);
 *
 * // With date transformers
 * const updateData = buildConditionalUpdateData(data, {
 *   transformers: {
 *     startDate: tripDateTransformer,
 *     endDate: tripDateTransformer,
 *   }
 * });
 * ```
 */
export function buildConditionalUpdateData<T extends Record<string, unknown>>(
  data: Partial<T>,
  options: {
    emptyStringToNull?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Transformers accept various input types
    transformers?: Record<string, (value: any) => any>;
  } = {}
): Partial<T> {
  const { emptyStringToNull = true, transformers = {} } = options;
  const updateData: Partial<T> = {};

  for (const key in data) {
    const value = data[key];

    // Only include defined values (skip undefined to preserve existing values)
    if (value !== undefined) {
      // Apply custom transformer if exists
      if (transformers[key]) {
        updateData[key] = transformers[key](value) as T[Extract<keyof T, string>];
      }
      // Convert empty strings to null
      else if (emptyStringToNull && value === '') {
        updateData[key] = null as T[Extract<keyof T, string>];
      }
      // Include as-is
      else {
        updateData[key] = value;
      }
    }
  }

  return updateData;
}

/**
 * Transformer for trip date fields (common pattern)
 * Converts date strings to UTC Date objects with T00:00:00.000Z
 *
 * @param dateStr - Date string (YYYY-MM-DD) or null
 * @returns Date object in UTC or null
 *
 * @example
 * ```typescript
 * tripDateTransformer("2025-01-15") // Date("2025-01-15T00:00:00.000Z")
 * tripDateTransformer(null) // null
 * ```
 */
export function tripDateTransformer(dateStr: string | null): Date | null {
  return dateStr ? new Date(dateStr + 'T00:00:00.000Z') : null;
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

/**
 * Utility type that transforms Decimal properties to number recursively.
 * This accurately represents the runtime transformation performed by convertDecimals.
 * Use this type when you need type-accurate representation of converted data.
 *
 * @example
 * type ConvertedLocation = ConvertDecimalsToNumbers<Location>;
 * // latitude: number (instead of Decimal)
 */
export type ConvertDecimalsToNumbers<T> = T extends Decimal
  ? number
  : T extends Array<infer U>
    ? ConvertDecimalsToNumbers<U>[]
    : T extends object
      ? { [K in keyof T]: ConvertDecimalsToNumbers<T[K]> }
      : T;

/**
 * Recursively converts Decimal objects (from Prisma) to numbers.
 * Useful for ensuring JSON responses have numbers instead of Decimal objects.
 *
 * Note: At runtime, Decimal fields become numbers. The return type is `T` for
 * backward compatibility, but callers should be aware that Decimal properties
 * will be numbers at runtime. Use `ConvertDecimalsToNumbers<T>` utility type
 * when you need type-accurate representation.
 *
 * @param obj - The object or array containing Decimal fields
 * @returns The object with Decimals converted to numbers (typed as T for compatibility)
 */
export function convertDecimals<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Prisma.Decimal) {
    return Number(obj) as T;
  }

  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertDecimals(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = convertDecimals(obj[key]);
      }
    }
    return result as T;
  }

  return obj;
}

// Type for Prisma transaction client
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Cleans up all entity links associated with an entity before deletion.
 * This removes links where the entity is either the source or target.
 *
 * @param tripId - The trip ID the entity belongs to
 * @param entityType - The type of entity being deleted
 * @param entityId - The ID of the entity being deleted
 * @param tx - Optional Prisma transaction client for atomic operations
 */
export async function cleanupEntityLinks(
  tripId: number,
  entityType: EntityType,
  entityId: number,
  tx?: TransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  await client.entityLink.deleteMany({
    where: {
      tripId,
      OR: [
        { sourceType: entityType, sourceId: entityId },
        { targetType: entityType, targetId: entityId },
      ],
    },
  });
}
