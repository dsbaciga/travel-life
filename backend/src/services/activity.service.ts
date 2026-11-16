import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/errors';
import { CreateActivityInput, UpdateActivityInput, BulkDeleteActivitiesInput, BulkUpdateActivitiesInput } from '../types/activity.types';
import {
  verifyTripAccessWithPermission,
  verifyEntityInTrip,
  verifyEntityAccessWithPermission,
} from '../services/_shared/tripAccess';
import { buildConditionalUpdateData } from '../services/_shared/prismaUpdateData';
import { convertDecimals } from '../services/_shared/decimalConversion';
import { deleteEntity, bulkDeleteEntities, bulkUpdateEntities } from '../prisma/crudHelpers';

// Note: Location association is handled via EntityLink system, not direct FK

class ActivityService {
  async createActivity(userId: number, data: CreateActivityInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Verify parent activity exists and belongs to same trip if provided
    if (data.parentId) {
      await verifyEntityInTrip('activity', data.parentId, data.tripId);
    }

    // Note: Location association is handled via EntityLink system after creation
    const activity = await prisma.activity.create({
      data: {
        tripId: data.tripId,
        parentId: data.parentId || null,
        name: data.name,
        description: data.description || null,
        category: data.category || null,
        allDay: data.allDay ?? false,
        startTime: data.startTime ? new Date(data.startTime) : null,
        endTime: data.endTime ? new Date(data.endTime) : null,
        timezone: data.timezone || null,
        cost: data.cost !== undefined ? data.cost : null,
        currency: data.currency || null,
        bookingUrl: data.bookingUrl || null,
        bookingReference: data.bookingReference || null,
        notes: data.notes || null,
        dietaryTags: data.dietaryTags ?? undefined,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return convertDecimals(activity);
  }

  async getActivitiesByTrip(userId: number, tripId: number) {
    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    // Note: Location association is fetched via EntityLink system, not direct FK
    const activities = await prisma.activity.findMany({
      where: { tripId },
      include: {
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
            description: true,
            startTime: true,
            endTime: true,
            timezone: true,
            category: true,
            cost: true,
            currency: true,
            bookingReference: true,
            notes: true,
            dietaryTags: true,
          },
          orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [
        { manualOrder: { sort: 'asc', nulls: 'last' } },
        { startTime: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' }
      ],
    });

    return convertDecimals(activities);
  }

  async getActivityById(userId: number, activityId: number) {
    // Verify user has view permission on the activity's trip
    await verifyEntityAccessWithPermission('activity', activityId, userId, 'view');

    // Note: Location association is fetched via EntityLink system, not direct FK
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        trip: true,
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
            description: true,
            startTime: true,
            endTime: true,
            timezone: true,
            category: true,
            cost: true,
            currency: true,
            bookingReference: true,
            notes: true,
            dietaryTags: true,
          },
          orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return convertDecimals(activity);
  }

  async updateActivity(
    userId: number,
    activityId: number,
    data: UpdateActivityInput
  ) {
    // Verify user has edit permission on the activity's trip
    const { entity: activity } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'activity',
      activityId,
      userId,
      'edit'
    );

    // Verify parent activity exists and belongs to same trip if provided
    if (data.parentId) {
      // Prevent circular reference - activity cannot be its own parent
      if (data.parentId === activityId) {
        throw new AppError('Activity cannot be its own parent', 400);
      }
      await verifyEntityInTrip('activity', data.parentId, activity.tripId);
    }

    // Note: Location association is handled via EntityLink system, not direct FK
    const updateData: Prisma.ActivityUncheckedUpdateInput = buildConditionalUpdateData(data, {
      transformers: {
        startTime: (val: string | null) => (val ? new Date(val) : null),
        endTime: (val: string | null) => (val ? new Date(val) : null),
        // dietaryTags is a nullable Json column: Prisma needs DbNull to write SQL NULL
        dietaryTags: (val: string[] | null) => val ?? Prisma.DbNull,
      },
    });

    const updatedActivity = await prisma.activity.update({
      where: { id: activityId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildConditionalUpdateData returns Partial which is incompatible with Prisma's Exact type
      data: updateData,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return convertDecimals(updatedActivity);
  }

  async deleteActivity(userId: number, activityId: number) {
    return deleteEntity('activity', activityId, userId);
  }

  /**
   * Bulk delete multiple activities
   * Verifies edit permission for all activities before deletion
   */
  async bulkDeleteActivities(userId: number, tripId: number, data: BulkDeleteActivitiesInput) {
    return bulkDeleteEntities('activity', userId, tripId, data.ids);
  }

  /**
   * Bulk update multiple activities
   * Verifies edit permission for all activities before update
   */
  async bulkUpdateActivities(userId: number, tripId: number, data: BulkUpdateActivitiesInput) {
    return bulkUpdateEntities('activity', userId, tripId, data.ids, data.updates, {
      allowedFields: ['category', 'notes', 'timezone'],
    });
  }
}

export default new ActivityService();
