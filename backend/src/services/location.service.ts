import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { CreateLocationInput, UpdateLocationInput, CreateLocationCategoryInput, UpdateLocationCategoryInput, BulkDeleteLocationsInput, BulkUpdateLocationsInput } from '../types/location.types';
import { verifyTripAccessWithPermission, verifyEntityAccessWithPermission, buildConditionalUpdateData, convertDecimals, cleanupEntityLinks } from '../utils/serviceHelpers';

export class LocationService {
  async createLocation(userId: number, data: CreateLocationInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

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

    return convertDecimals(location);
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
      trip: {
        userId,
        addToPlacesVisited: true,
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

    const updateData = buildConditionalUpdateData(data, {
      transformers: {
        visitDatetime: (val) => val ? new Date(val as string | number | Date) : null,
      },
    });

    const updatedLocation = await prisma.location.update({
      where: { id: locationId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildConditionalUpdateData returns Partial which is incompatible with Prisma's Exact type
      data: updateData as any,
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

  // Helper method to get all descendants of a location using recursive CTE
  // This is O(1) queries instead of O(n) for the recursive approach
  private async getDescendants(locationId: number): Promise<{ id: number }[]> {
    const descendants = await prisma.$queryRaw<{ id: number }[]>`
      WITH RECURSIVE descendants AS (
        -- Base case: direct children of the location
        SELECT id FROM "locations" WHERE "parent_id" = ${locationId}
        UNION ALL
        -- Recursive case: children of descendants
        SELECT l.id FROM "locations" l
        INNER JOIN descendants d ON l."parent_id" = d.id
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
