import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import tzlookup from 'tz-lookup';
import { AppError } from '../middleware/errorHandler';
import { TripStatus } from '../types/trip.types';
import logger from '../config/logger';
import config from '../config';
import { CreateLocationInput, UpdateLocationInput, CreateLocationCategoryInput, UpdateLocationCategoryInput, BulkDeleteLocationsInput, BulkUpdateLocationsInput } from '../types/location.types';
import {
  verifyTripAccessWithPermission,
  verifyEntityAccessWithPermission,
} from '../services/_shared/tripAccess';
import { buildConditionalUpdateData } from '../services/_shared/prismaUpdateData';
import { convertDecimals } from '../services/_shared/decimalConversion';
import { cleanupEntityLinks } from '../services/_shared/entityLinkCleanup';

/** Provenance of a location's opening hours. Manual entry always wins over the OSM lookup. */
const OPENING_HOURS_SOURCE_OSM = 'osm';
const OPENING_HOURS_SOURCE_MANUAL = 'manual';

/** Nominatim is a best-effort enrichment; never let it hold up a save for long. */
const NOMINATIM_TIMEOUT_MS = 3000;

/**
 * Validate latitude and longitude ranges.
 * Latitude must be between -90 and 90, longitude between -180 and 180.
 * Only validates if values are provided (they may be optional).
 */
function validateLatLng(latitude?: number | null, longitude?: number | null): void {
  if (latitude != null && (latitude < -90 || latitude > 90)) {
    throw new AppError('Latitude must be between -90 and 90', 400);
  }
  if (longitude != null && (longitude < -180 || longitude > 180)) {
    throw new AppError('Longitude must be between -180 and 180', 400);
  }
}

/**
 * Type guard for the slice of a Nominatim reverse-geocode response we care about.
 * Nominatim only includes `extratags` when `extratags=1` is requested, and only includes
 * `opening_hours` when the underlying OSM object carries that tag — so every level is optional.
 */
function hasOsmOpeningHours(value: unknown): value is { extratags: { opening_hours: string } } {
  if (typeof value !== 'object' || value === null || !('extratags' in value)) return false;
  const { extratags } = value;
  if (typeof extratags !== 'object' || extratags === null || !('opening_hours' in extratags)) return false;
  return typeof extratags.opening_hours === 'string' && extratags.opening_hours.trim().length > 0;
}

export class LocationService {
  /**
   * If the location's parent trip has no timezone set, derive one from the
   * location's coordinates and store it on the trip. A lookup failure must
   * never break location creation, so all errors are swallowed (logged only).
   */
  private async autoSetTripTimezone(tripId: number, latitude?: number | null, longitude?: number | null): Promise<void> {
    if (latitude == null || longitude == null) return;

    try {
      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
        select: { timezone: true },
      });

      if (!trip || trip.timezone) return;

      const timezone = tzlookup(latitude, longitude);
      await prisma.trip.update({
        where: { id: tripId },
        data: { timezone },
      });
      logger.info(`Auto-set timezone "${timezone}" for trip ${tripId} from location coordinates`);
    } catch (error) {
      logger.warn(`Failed to auto-set timezone for trip ${tripId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Resolve the timezone of the place itself from its coordinates.
   *
   * Opening hours are wall-clock times in the *location's* zone, so this must not fall back
   * to the trip's or the server's zone — an unknown zone stays null and the closure check
   * simply reports UNKNOWN rather than comparing against the wrong clock.
   */
  private resolveLocationTimezone(latitude?: number | null, longitude?: number | null): string | null {
    if (latitude == null || longitude == null) return null;

    try {
      return tzlookup(latitude, longitude);
    } catch (error) {
      logger.warn(`Timezone lookup failed for ${latitude},${longitude}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Best-effort lookup of the OSM `opening_hours` tag for a set of coordinates.
   *
   * OpenStreetMap already carries this tag for a large share of museums, restaurants and
   * attractions, so a reverse geocode with `extratags=1` usually gets it for free. Every
   * failure mode — no Nominatim configured, network error, timeout, untagged place,
   * unexpected payload — resolves to null. This must never block or fail a location save.
   */
  private async fetchOpeningHoursFromOsm(latitude: number, longitude: number): Promise<string | null> {
    const baseUrl = config.nominatim.url;
    if (!baseUrl) return null;

    try {
      const response = await axios.get(`${baseUrl.replace(/\/+$/, '')}/reverse`, {
        params: {
          lat: latitude,
          lon: longitude,
          format: 'jsonv2',
          extratags: 1,
          // Building/POI level — coarser zooms resolve to a street or suburb, whose
          // opening_hours tag (if any) would not describe the place the user pinned.
          zoom: 18,
        },
        timeout: NOMINATIM_TIMEOUT_MS,
      });

      if (!hasOsmOpeningHours(response.data)) return null;

      return response.data.extratags.opening_hours.trim();
    } catch (error) {
      logger.warn(`Nominatim opening_hours lookup failed for ${latitude},${longitude}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Fill in a location's opening hours from OpenStreetMap when the user did not supply them.
   *
   * Runs after the location row exists so a failure can never lose the user's own data.
   * Skipped entirely when hours are already present (manual or previously fetched), so a
   * user's override is never clobbered by a later edit.
   *
   * @returns The stored values when hours were added, or null when nothing changed. Callers
   *   merge the result into their response so the caller sees the enriched row immediately.
   */
  private async enrichOpeningHoursFromOsm(
    locationId: number,
    latitude?: number | null,
    longitude?: number | null
  ): Promise<{ openingHours: string; openingHoursSource: string } | null> {
    if (latitude == null || longitude == null) return null;

    try {
      const existing = await prisma.location.findUnique({
        where: { id: locationId },
        select: { openingHours: true },
      });

      if (!existing || existing.openingHours) return null;

      const openingHours = await this.fetchOpeningHoursFromOsm(latitude, longitude);
      if (!openingHours) return null;

      await prisma.location.update({
        where: { id: locationId },
        data: { openingHours, openingHoursSource: OPENING_HOURS_SOURCE_OSM },
      });
      logger.info(`Auto-populated opening hours for location ${locationId} from OpenStreetMap`);

      return { openingHours, openingHoursSource: OPENING_HOURS_SOURCE_OSM };
    } catch (error) {
      logger.warn(`Failed to enrich opening hours for location ${locationId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async createLocation(userId: number, data: CreateLocationInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Validate lat/lng ranges if provided
    validateLatLng(data.latitude, data.longitude);

    // If a category is provided, verify the caller owns it or it is a default category
    if (data.categoryId != null) {
      await this.verifyCategoryAccess(userId, data.categoryId);
    }

    // If parentId is provided, verify it exists and belongs to the same trip
    if (data.parentId) {
      const parent = await prisma.location.findFirst({
        where: {
          id: data.parentId,
          tripId: data.tripId,
        },
      });

      if (!parent) {
        throw new AppError('Parent location not found or does not belong to the same trip', 404);
      }

      // Enforce single-level hierarchy: parent cannot already be a child
      if (parent.parentId) {
        throw new AppError('Cannot nest locations more than one level deep. The selected parent is already a child of another location.', 400);
      }
    }

    const location = await prisma.location.create({
      data: {
        tripId: data.tripId,
        parentId: data.parentId,
        name: data.name,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        categoryId: data.categoryId,
        visitDatetime: data.visitDatetime ? new Date(data.visitDatetime) : null,
        visitDurationMinutes: data.visitDurationMinutes,
        notes: data.notes,
        excludeFromMap: data.excludeFromMap ?? false,
        openingHours: data.openingHours,
        // Hours arriving with the create request came from the user, so mark them manual
        // and keep the OSM lookup from ever replacing them.
        openingHoursSource: data.openingHours ? OPENING_HOURS_SOURCE_MANUAL : null,
        timezone: data.timezone ?? this.resolveLocationTimezone(data.latitude, data.longitude),
      },
      include: {
        category: true,
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Auto-set the trip timezone from this location's coordinates if the trip
    // has none yet. Failures are logged and never break location creation.
    await this.autoSetTripTimezone(data.tripId, data.latitude, data.longitude);

    // Best-effort OSM enrichment. Already committed above, so this can only add data.
    const enriched = await this.enrichOpeningHoursFromOsm(location.id, data.latitude, data.longitude);

    return convertDecimals(enriched ? { ...location, ...enriched } : location);
  }

  async getLocationsByTrip(userId: number, tripId: number) {
    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const locations = await prisma.location.findMany({
      where: { tripId },
      include: {
        category: true,
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
            visitDatetime: true,
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return convertDecimals(locations);
  }

  async getAllVisitedLocations(userId: number, page = 1, limit = 200) {
    const skip = (page - 1) * limit;

    const where = {
      // A place counts as visited when its trip is completed. The trip's
      // `addToPlacesVisited` flag is not used: it is set when a trip is
      // completed but never cleared if the trip moves back out of Completed,
      // so it kept showing places from trips that are still being planned.
      trip: {
        userId,
        status: TripStatus.COMPLETED,
      },
      AND: [
        { latitude: { not: null } },
        { longitude: { not: null } },
      ],
    };

    // Get locations and total count in parallel
    const [locations, total] = await Promise.all([
      prisma.location.findMany({
        where,
        include: {
          category: true,
          trip: {
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        orderBy: { visitDatetime: 'desc' },
        skip,
        take: limit,
      }),
      prisma.location.count({ where }),
    ]);

    return {
      locations: convertDecimals(locations),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get all locations the user has marked as favorite, across all of their
   * trips (owned or shared as collaborator), with trip id/title for navigation.
   */
  async getFavoriteLocations(userId: number) {
    const locations = await prisma.location.findMany({
      where: {
        isFavorite: true,
        trip: {
          OR: [
            { userId },
            { collaborators: { some: { userId } } },
          ],
        },
      },
      include: {
        category: true,
        trip: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return convertDecimals(locations);
  }

  async getLocationById(userId: number, locationId: number) {
    // Verify user has view permission on the location's trip
    await verifyEntityAccessWithPermission('location', locationId, userId, 'view');

    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        category: true,
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
            visitDatetime: true,
            category: true,
          },
        },
        trip: {
          select: {
            userId: true,
            privacyLevel: true,
          },
        },
      },
    });

    return convertDecimals(location);
  }

  async updateLocation(userId: number, locationId: number, data: UpdateLocationInput) {
    // Verify user has edit permission on the location's trip
    const { entity: location } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'location',
      locationId,
      userId,
      'edit'
    );

    // Validate lat/lng ranges if provided
    validateLatLng(data.latitude, data.longitude);

    // If a category is provided, verify the caller owns it or it is a default category
    if (data.categoryId !== undefined && data.categoryId !== null) {
      await this.verifyCategoryAccess(userId, data.categoryId);
    }

    // If updating parentId, verify it exists and belongs to the same trip
    if (data.parentId !== undefined && data.parentId !== null) {
      // Prevent self-referencing
      if (data.parentId === locationId) {
        throw new AppError('A location cannot be its own parent', 400);
      }

      // Enforce single-level hierarchy: location with children cannot become a child
      const hasChildren = await prisma.location.count({
        where: { parentId: locationId },
      });
      if (hasChildren > 0) {
        throw new AppError('Cannot set a parent for a location that has children. Remove children first or use a different location.', 400);
      }

      const parent = await prisma.location.findFirst({
        where: {
          id: data.parentId,
          tripId: location.tripId,
        },
      });

      if (!parent) {
        throw new AppError('Parent location not found or does not belong to the same trip', 404);
      }

      // Enforce single-level hierarchy: parent cannot already be a child
      if (parent.parentId) {
        throw new AppError('Cannot nest locations more than one level deep. The selected parent is already a child of another location.', 400);
      }

      // Prevent circular references (check if new parent is a child of this location)
      const descendants = await this.getDescendants(locationId);
      if (descendants.some(d => d.id === data.parentId)) {
        throw new AppError('Cannot set parent to a descendant location (would create circular reference)', 400);
      }
    }

    const updateData: Prisma.LocationUncheckedUpdateInput = buildConditionalUpdateData(data, {
      transformers: {
        visitDatetime: (val: string | null) => (val ? new Date(val) : null),
      },
    });

    // Any opening-hours edit coming through the API is the user's own doing, so record it as
    // manual: that both preserves their override and stops the OSM lookup from undoing it.
    // Clearing the hours also clears the provenance, which re-opens the location to a lookup.
    if (data.openingHours !== undefined) {
      updateData.openingHoursSource = data.openingHours ? OPENING_HOURS_SOURCE_MANUAL : null;
    }

    // The pin moved without an explicit timezone, so the stored zone may now be wrong.
    // Only re-derived when a complete coordinate pair is supplied — a half-updated pair
    // would resolve to nothing useful, and leaving the old zone alone is the safer default.
    if (data.timezone === undefined && data.latitude != null && data.longitude != null) {
      const resolved = this.resolveLocationTimezone(data.latitude, data.longitude);
      if (resolved) {
        updateData.timezone = resolved;
      }
    }

    const updatedLocation = await prisma.location.update({
      where: { id: locationId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildConditionalUpdateData returns Partial which is incompatible with Prisma's Exact type
      data: updateData,
      include: {
        category: true,
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return convertDecimals(updatedLocation);
  }

  /**
   * Verify a location category is usable by this user: either owned by them
   * or one of the system default categories. Mirrors the visibility rule
   * enforced by getCategories().
   */
  private async verifyCategoryAccess(userId: number, categoryId: number): Promise<void> {
    const category = await prisma.locationCategory.findFirst({
      where: {
        id: categoryId,
        OR: [{ userId }, { isDefault: true }],
      },
    });

    if (!category) {
      throw new AppError('Category not found or access denied', 404);
    }
  }

  // Helper method to get all descendants of a location using recursive CTE
  // This is O(1) queries instead of O(n) for the recursive approach
  // Depth is limited to 10 levels to prevent runaway recursion in case of data corruption
  private async getDescendants(locationId: number): Promise<{ id: number }[]> {
    const descendants = await prisma.$queryRaw<{ id: number }[]>`
      WITH RECURSIVE descendants AS (
        -- Base case: direct children of the location
        SELECT id, 1 AS depth FROM "locations" WHERE "parent_id" = ${locationId}
        UNION ALL
        -- Recursive case: children of descendants (limited to 10 levels)
        SELECT l.id, d.depth + 1 FROM "locations" l
        INNER JOIN descendants d ON l."parent_id" = d.id
        WHERE d.depth < 10
      )
      SELECT id FROM descendants
    `;

    return descendants;
  }

  async deleteLocation(userId: number, locationId: number) {
    // Verify user has edit permission on the location's trip
    const { entity: location } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'location',
      locationId,
      userId,
      'edit'
    );

    // Clean up entity links and delete atomically in a transaction
    await prisma.$transaction(async (tx) => {
      await cleanupEntityLinks(location.tripId, 'LOCATION', locationId, tx);
      await tx.location.delete({
        where: { id: locationId },
      });
    });

    return { message: 'Location deleted successfully' };
  }

  // Location Categories
  async getCategories(userId: number) {
    const categories = await prisma.locationCategory.findMany({
      where: {
        OR: [
          { userId },
          { isDefault: true },
        ],
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });

    return categories;
  }

  async createCategory(userId: number, data: CreateLocationCategoryInput) {
    const category = await prisma.locationCategory.create({
      data: {
        userId,
        name: data.name,
        icon: data.icon,
        color: data.color,
        isDefault: false,
      },
    });

    return category;
  }

  async updateCategory(userId: number, categoryId: number, data: UpdateLocationCategoryInput) {
    const category = await prisma.locationCategory.findFirst({
      where: {
        id: categoryId,
        userId,
        isDefault: false, // Can't edit default categories
      },
    });

    if (!category) {
      throw new AppError('Category not found or cannot be edited', 404);
    }

    const updated = await prisma.locationCategory.update({
      where: { id: categoryId },
      data: {
        ...(data.name !== undefined && data.name !== null && { name: data.name }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
      },
    });

    return updated;
  }

  async deleteCategory(userId: number, categoryId: number) {
    const category = await prisma.locationCategory.findFirst({
      where: {
        id: categoryId,
        userId,
        isDefault: false,
      },
    });

    if (!category) {
      throw new AppError('Category not found or cannot be deleted', 404);
    }

    await prisma.locationCategory.delete({
      where: { id: categoryId },
    });

    return { message: 'Category deleted successfully' };
  }

  /**
   * Bulk delete multiple locations
   * Verifies edit permission for all locations before deletion
   */
  async bulkDeleteLocations(userId: number, tripId: number, data: BulkDeleteLocationsInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    // Verify all locations belong to this trip
    const locations = await prisma.location.findMany({
      where: {
        id: { in: data.ids },
        tripId,
      },
      include: { trip: true },
    });

    if (locations.length !== data.ids.length) {
      throw new AppError('One or more locations not found or do not belong to this trip', 404);
    }

    // Clean up entity links and delete atomically in a transaction
    const result = await prisma.$transaction(async (tx) => {
      for (const location of locations) {
        await cleanupEntityLinks(location.tripId, 'LOCATION', location.id, tx);
      }
      return tx.location.deleteMany({
        where: {
          id: { in: data.ids },
          tripId,
        },
      });
    });

    return { success: true, deletedCount: result.count };
  }

  /**
   * Bulk update multiple locations
   * Verifies edit permission for all locations before update
   */
  async bulkUpdateLocations(userId: number, tripId: number, data: BulkUpdateLocationsInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    // Verify all locations belong to this trip
    const locations = await prisma.location.findMany({
      where: {
        id: { in: data.ids },
        tripId,
      },
    });

    if (locations.length !== data.ids.length) {
      throw new AppError('One or more locations not found or do not belong to this trip', 404);
    }

    // Build update data from non-undefined values
    const updateData: Record<string, unknown> = {};
    if (data.updates.categoryId !== undefined) updateData.categoryId = data.updates.categoryId;
    if (data.updates.notes !== undefined) updateData.notes = data.updates.notes;

    if (Object.keys(updateData).length === 0) {
      throw new AppError('No valid update fields provided', 400);
    }

    // Update all locations
    const result = await prisma.location.updateMany({
      where: {
        id: { in: data.ids },
        tripId,
      },
      data: updateData,
    });

    return { success: true, updatedCount: result.count };
  }
}

export default new LocationService();
