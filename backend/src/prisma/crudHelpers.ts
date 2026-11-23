import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { EntityType } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';
import {
  verifyTripAccessWithPermission,
  verifyEntityAccessWithPermission,
  VerifiableEntityType,
} from '../services/_shared/tripAccess';
import { getEntityDelegate } from './modelDelegates';
import { bookingReceiptPaths, BookingKind } from '../services/_shared/bookingCost';
import { deleteReceiptFiles } from '../services/expenseReceipt.service';

/** The booking kinds whose cost lives on an expense row, by the generic entity type. */
const BOOKING_KIND_BY_ENTITY: Partial<Record<VerifiableEntityType, BookingKind>> = {
  activity: 'activity',
  lodging: 'lodging',
  transportation: 'transportation',
  customItem: 'customItem',
};

// =============================================================================
// CONTROLLER FACTORY
// =============================================================================

/**
 * Extracts only the keys of T whose values are function types.
 * This prevents referencing non-callable properties (e.g., a string field)
 * as a service method in HandlerConfig.
 */
// `never[]` for the parameter list makes this match any function regardless of
// its parameter types (parameters are contravariant, so `never[]` is assignable
// to every parameter list), which avoids needing `any` here.
type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];

/**
 * Configuration for a standard CRUD handler.
 *
 * Each handler config describes how to extract parameters from the request,
 * which service method to call, and what status code to return.
 */
interface HandlerConfig<TService> {
  /** The service method name to call (must be a callable method on TService). */
  method: FunctionKeys<TService>;
  /** HTTP status code for the response (default: 200). */
  statusCode?: number;
  /**
   * Zod schema to validate req.body. If provided, req.body is parsed
   * through this schema before passing to the service.
   */
  bodySchema?: ZodType;
  /**
   * How to build the arguments array for the service method call.
   * Receives the parsed userId, request, and validated body (if bodySchema was provided).
   * Must return an array of arguments to spread into the service call.
   *
   * Default behavior (if not provided):
   * - For methods with bodySchema: [userId, body]
   * - For methods without bodySchema: [userId]
   */
  buildArgs?: (userId: number, req: Request, body?: unknown) => unknown[];
}

/**
 * Configuration for creating a CRUD controller via the factory.
 *
 * @template TService - The service type (used to type-check method names)
 *
 * @example
 * ```typescript
 * const controller = createCrudController({
 *   service: activityService,
 *   handlers: {
 *     create: {
 *       method: 'createActivity',
 *       statusCode: 201,
 *       bodySchema: createActivitySchema,
 *     },
 *     getByTrip: {
 *       method: 'getActivitiesByTrip',
 *       buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
 *     },
 *     // ... more handlers
 *   },
 * });
 * ```
 */
interface CrudControllerConfig<TService> {
  /** The service instance to delegate calls to. */
  service: TService;
  /** Map of handler name to handler configuration. */
  handlers: Record<string, HandlerConfig<TService>>;
}

/**
 * The return type of createCrudController: a record of Express request handlers.
 * The handler signature matches what asyncHandler returns (req, res, next).
 */
type CrudController = Record<
  string,
  (req: Request, res: Response, next: NextFunction) => void
>;

/**
 * Creates a set of Express request handlers from a declarative configuration.
 *
 * This factory eliminates the repetitive pattern of:
 * 1. Extract userId from request
 * 2. Parse and validate request body (optional)
 * 3. Call service method with arguments
 * 4. Return `{ status: 'success', data: result }` response
 *
 * Each handler is wrapped in asyncHandler for automatic error propagation.
 *
 * @template TService - The service type
 * @param config - The controller configuration
 * @returns An object of Express request handlers keyed by handler name
 *
 * @example
 * ```typescript
 * export const activityController = createCrudController({
 *   service: activityService,
 *   handlers: {
 *     createActivity: {
 *       method: 'createActivity',
 *       statusCode: 201,
 *       bodySchema: createActivitySchema,
 *     },
 *     getActivitiesByTrip: {
 *       method: 'getActivitiesByTrip',
 *       buildArgs: (userId, req) => [userId, parseId(req.params.tripId, 'tripId')],
 *     },
 *     getActivityById: {
 *       method: 'getActivityById',
 *       buildArgs: (userId, req) => [userId, parseId(req.params.id)],
 *     },
 *     updateActivity: {
 *       method: 'updateActivity',
 *       bodySchema: updateActivitySchema,
 *       buildArgs: (userId, req, body) => [userId, parseId(req.params.id), body],
 *     },
 *     deleteActivity: {
 *       method: 'deleteActivity',
 *       buildArgs: (userId, req) => [userId, parseId(req.params.id)],
 *     },
 *   },
 * });
 * ```
 */
export function createCrudController<TService extends object>(
  config: CrudControllerConfig<TService>
): CrudController {
  const { service, handlers } = config;
  const controller: CrudController = {};

  for (const [handlerName, handlerConfig] of Object.entries(handlers)) {
    const { method, statusCode = 200, bodySchema, buildArgs } = handlerConfig;

    // `method` is constrained to FunctionKeys<TService>, so indexing the service
    // with it is well-typed and needs no cast.
    const serviceFn = service[method];
    if (typeof serviceFn !== 'function') {
      throw new Error(
        `Handler "${handlerName}": service method "${String(method)}" is not a function on the provided service`
      );
    }

    controller[handlerName] = asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);

      // Validate request body if schema is provided
      let body: unknown;
      if (bodySchema) {
        body = bodySchema.parse(req.body);
      }

      // Build service method arguments
      let args: unknown[];
      if (buildArgs) {
        args = buildArgs(userId, req, body);
      } else if (body !== undefined) {
        args = [userId, body];
      } else {
        args = [userId];
      }

      // Call the service method
      const result = await (serviceFn as (...a: unknown[]) => Promise<unknown>).apply(
        service,
        args
      );

      // Return standardized response
      res.status(statusCode).json({
        status: 'success',
        data: result,
      });
    });
  }

  return controller;
}

// =============================================================================
// GENERIC SERVICE HELPERS
// =============================================================================

/**
 * Maps VerifiableEntityType to the Prisma EntityType enum used by entity links.
 * Not all verifiable entity types have a corresponding EntityType value.
 */
const entityTypeToLinkType: Partial<Record<VerifiableEntityType, EntityType>> = {
  activity: 'ACTIVITY',
  lodging: 'LODGING',
  transportation: 'TRANSPORTATION',
  location: 'LOCATION',
  journalEntry: 'JOURNAL_ENTRY',
  photo: 'PHOTO',
  photoAlbum: 'PHOTO_ALBUM',
  customItem: 'CUSTOM_ITEM',
};

/**
 * Human-readable display names for entity types.
 */
const entityTypeDisplayNames: Record<VerifiableEntityType, string> = {
  activity: 'activities',
  lodging: 'stays',
  transportation: 'transport items',
  location: 'places',
  journalEntry: 'journal entries',
  photo: 'photos',
  album: 'albums',
  photoAlbum: 'albums',
  customItem: 'custom items',
};

/** Prisma transaction client (the argument the `$transaction` callback receives). */
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Collects every descendant activity ID beneath the given roots.
 *
 * `Activity.parentId` cascades at the database level, so deleting a parent silently removes
 * its whole subtree in Postgres. `EntityLink` is polymorphic with no foreign key to
 * `activities`, so those descendants' links have to be cleaned up explicitly or they are
 * orphaned. Walks one level at a time to handle arbitrary nesting depth; the `seen` set also
 * guarantees termination if the data ever contains a parent cycle.
 */
async function collectActivityDescendantIds(
  tx: TransactionClient,
  rootIds: number[]
): Promise<number[]> {
  const seen = new Set<number>(rootIds);
  const descendants: number[] = [];
  let frontier = rootIds;

  while (frontier.length > 0) {
    const children = await tx.activity.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });

    const next: number[] = [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      descendants.push(child.id);
      next.push(child.id);
    }
    frontier = next;
  }

  return descendants;
}

/**
 * Generic delete for a single entity with ownership verification and entity link cleanup.
 *
 * Follows the common pattern across services:
 * 1. Verify user has edit permission on the entity's trip
 * 2. Clean up entity links (if entityLinkType is provided)
 * 3. Delete the entity
 *
 * @param entityType - The verifiable entity type (e.g., 'activity', 'lodging')
 * @param entityId - The ID of the entity to delete
 * @param userId - The authenticated user's ID
 * @returns `{ success: true }`
 *
 * @example
 * ```typescript
 * async deleteActivity(userId: number, activityId: number) {
 *   return deleteEntity('activity', activityId, userId);
 * }
 * ```
 */
export async function deleteEntity(
  entityType: VerifiableEntityType,
  entityId: number,
  userId: number
): Promise<{ success: true }> {
  // Verify user has edit permission on the entity's trip
  const { entity } = await verifyEntityAccessWithPermission<{ tripId: number }>(
    entityType,
    entityId,
    userId,
    'edit'
  );

  // Wrap link cleanup + delete in a transaction for atomicity
  const linkType = entityTypeToLinkType[entityType];

  // The cost row of the entity (and of the child activities a delete cascades to) goes with it; its
  // receipt file is unlinked once the delete committed.
  const bookingKind = BOOKING_KIND_BY_ENTITY[entityType];
  let receiptPaths: string[] = [];

  await prisma.$transaction(async (tx) => {
    // Child activities are cascade-deleted by the database, so their links and cost rows go too:
    // collect the whole subtree once, for both clean-ups.
    const treeIds =
      entityType === 'activity'
        ? [entityId, ...(await collectActivityDescendantIds(tx, [entityId]))]
        : [entityId];
    if (bookingKind) receiptPaths = await bookingReceiptPaths(tx, bookingKind, treeIds);

    // Clean up entity links before deleting
    if (linkType) {
      const linkedIds = treeIds;

      await tx.entityLink.deleteMany({
        where: {
          tripId: entity.tripId,
          OR: [
            { sourceType: linkType, sourceId: { in: linkedIds } },
            { targetType: linkType, targetId: { in: linkedIds } },
          ],
        },
      });
    }

    // Delete the entity
    await getEntityDelegate(entityType, tx).delete({
      where: { id: entityId },
    });
  });
  await deleteReceiptFiles(receiptPaths);

  return { success: true };
}

/**
 * Generic bulk delete for entities belonging to a trip.
 *
 * Follows the common pattern across services:
 * 1. Verify user has edit permission on the trip
 * 2. Verify all entity IDs belong to the trip
 * 3. Clean up entity links for each entity
 * 4. Delete all entities in a single batch
 *
 * @param entityType - The verifiable entity type (e.g., 'activity', 'lodging')
 * @param userId - The authenticated user's ID
 * @param tripId - The trip the entities belong to
 * @param ids - Array of entity IDs to delete
 * @returns `{ success: true, deletedCount: number }`
 *
 * @example
 * ```typescript
 * async bulkDeleteActivities(userId: number, tripId: number, data: BulkDeleteActivitiesInput) {
 *   return bulkDeleteEntities('activity', userId, tripId, data.ids);
 * }
 * ```
 */
export async function bulkDeleteEntities(
  entityType: VerifiableEntityType,
  userId: number,
  tripId: number,
  ids: number[]
): Promise<{ success: true; deletedCount: number }> {
  // Verify user has edit permission on the trip
  await verifyTripAccessWithPermission(userId, tripId, 'edit');

  const model = getEntityDelegate(entityType);
  const displayName = entityTypeDisplayNames[entityType];

  // Verify all entities belong to this trip
  const entities = await model.findMany({
    where: {
      id: { in: ids },
      tripId,
    },
  }) as Array<{ id: number; tripId: number }>;

  if (entities.length !== ids.length) {
    throw new AppError(
      `Some of those ${displayName} aren't on this trip.`,
      404
    );
  }

  // Wrap link cleanup + delete in a transaction for atomicity
  const linkType = entityTypeToLinkType[entityType];

  const bookingKind = BOOKING_KIND_BY_ENTITY[entityType];
  let receiptPaths: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const entityIds = entities.map((entity) => entity.id);
    // Child activities are cascade-deleted by the database, so their links and cost rows go too:
    // collect the whole subtree once, for both clean-ups.
    const treeIds =
      entityType === 'activity'
        ? [...entityIds, ...(await collectActivityDescendantIds(tx, entityIds))]
        : entityIds;
    if (bookingKind) receiptPaths = await bookingReceiptPaths(tx, bookingKind, treeIds);

    // Clean up entity links for all entities (every entity was verified to be in `tripId`
    // above, so a single deleteMany over the ID set covers them all)
    if (linkType) {
      const linkedIds = treeIds;

      await tx.entityLink.deleteMany({
        where: {
          tripId,
          OR: [
            { sourceType: linkType, sourceId: { in: linkedIds } },
            { targetType: linkType, targetId: { in: linkedIds } },
          ],
        },
      });
    }

    // Delete all entities
    return getEntityDelegate(entityType, tx).deleteMany({
      where: {
        id: { in: ids },
        tripId,
      },
    });
  });

  await deleteReceiptFiles(receiptPaths);

  return { success: true, deletedCount: result.count };
}

/**
 * Generic bulk update for entities belonging to a trip.
 *
 * Follows the common pattern across services:
 * 1. Verify user has edit permission on the trip
 * 2. Verify all entity IDs belong to the trip
 * 3. Build update data from non-undefined values
 * 4. Update all entities in a single batch
 *
 * @param entityType - The verifiable entity type (e.g., 'activity', 'lodging')
 * @param userId - The authenticated user's ID
 * @param tripId - The trip the entities belong to
 * @param ids - Array of entity IDs to update
 * @param updates - Object of field values to update (only non-undefined values are applied)
 * @param fieldMapping - Optional mapping from input field names to database field names
 *                       (e.g., `{ carrier: 'company' }` for transportation)
 * @returns `{ success: true, updatedCount: number }`
 *
 * @example
 * ```typescript
 * async bulkUpdateActivities(userId: number, tripId: number, data: BulkUpdateActivitiesInput) {
 *   return bulkUpdateEntities('activity', userId, tripId, data.ids, data.updates);
 * }
 *
 * // With field mapping (transportation maps frontend names to DB names)
 * async bulkUpdateTransportation(userId: number, tripId: number, data: BulkUpdateTransportationInput) {
 *   return bulkUpdateEntities('transportation', userId, tripId, data.ids, data.updates, {
 *     carrier: 'company',
 *   });
 * }
 * ```
 */
export async function bulkUpdateEntities(
  entityType: VerifiableEntityType,
  userId: number,
  tripId: number,
  ids: number[],
  updates: Record<string, unknown>,
  options?: {
    fieldMapping?: Record<string, string>;
    /** Whitelist of allowed field names. If provided, any field not in this list is rejected. */
    allowedFields?: string[];
  }
): Promise<{ success: true; updatedCount: number }> {
  const { fieldMapping, allowedFields } = options ?? {};

  // Verify user has edit permission on the trip
  await verifyTripAccessWithPermission(userId, tripId, 'edit');

  const model = getEntityDelegate(entityType);
  const displayName = entityTypeDisplayNames[entityType];

  // Verify all entities belong to this trip
  const entities = await model.findMany({
    where: {
      id: { in: ids },
      tripId,
    },
  });

  if ((entities as unknown[]).length !== ids.length) {
    throw new AppError(
      `Some of those ${displayName} aren't on this trip.`,
      404
    );
  }

  // Build update data from non-undefined values, applying field mapping if provided
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      // Enforce whitelist if provided (defense-in-depth against field injection)
      if (allowedFields && !allowedFields.includes(key)) continue;
      const dbField = fieldMapping?.[key] ?? key;
      updateData[dbField] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError('No valid update fields provided', 400);
  }

  // Update all entities
  const result = await model.updateMany({
    where: {
      id: { in: ids },
      tripId,
    },
    data: updateData,
  });

  return { success: true, updatedCount: result.count };
}
