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
import { locationWithAddressSelect } from '../prisma/prismaIncludes';
import {
  buildBookingCostCreate,
  costExpenseInclude,
  childCostExpenseSelect,
  costExpenseSelect,
  hydrateActivityCost,
  hydrateBookingCost,
  syncBookingCost,
} from '../services/_shared/bookingCost';
import { deleteReceiptFiles } from './expenseReceipt.service';

// The activity's place is the direct `locationId` FK (not an EntityLink). Responses carry
// `locationId` plus a small `location` object.

class ActivityService {
  async createActivity(userId: number, data: CreateActivityInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Verify parent activity exists and belongs to same trip if provided
    if (data.parentId) {
      await verifyEntityInTrip('activity', data.parentId, data.tripId);
    }

    if (data.locationId) {
      await verifyEntityInTrip('location', data.locationId, data.tripId);
    }

    const startTime = data.startTime ? new Date(data.startTime) : null;
    const costExpense = await buildBookingCostCreate(
      prisma,
      data.tripId,
      { kind: 'activity', name: data.name, startTime, timezone: data.timezone || null },
      { cost: data.cost, currency: data.currency }
    );

    const activity = await prisma.activity.create({
      data: {
        tripId: data.tripId,
        parentId: data.parentId || null,
        locationId: data.locationId || null,
        name: data.name,
        description: data.description || null,
        category: data.category || null,
        allDay: data.allDay ?? false,
        startTime,
        endTime: data.endTime ? new Date(data.endTime) : null,
        timezone: data.timezone || null,
        costExpense,
        bookingUrl: data.bookingUrl || null,
        bookingReference: data.bookingReference || null,
        notes: data.notes || null,
        dietaryTags: data.dietaryTags ?? undefined,
      },
      include: {
        location: { select: locationWithAddressSelect },
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        ...costExpenseInclude,
      },
    });

    return convertDecimals(hydrateActivityCost(activity));
  }

  async getActivitiesByTrip(userId: number, tripId: number) {
    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const activities = await prisma.activity.findMany({
      where: { tripId },
      include: {
        location: { select: locationWithAddressSelect },
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
            locationId: true,
            description: true,
            startTime: true,
            endTime: true,
            timezone: true,
            category: true,
            ...childCostExpenseSelect,
            bookingReference: true,
            notes: true,
            dietaryTags: true,
          },
          orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
        },
        ...costExpenseInclude,
      },
      orderBy: [
        { manualOrder: { sort: 'asc', nulls: 'last' } },
        { startTime: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' }
      ],
    });

    return convertDecimals(activities.map((activity) => hydrateActivityCost(activity)));
  }

  async getActivityById(userId: number, activityId: number) {
    // Verify user has view permission on the activity's trip
    await verifyEntityAccessWithPermission('activity', activityId, userId, 'view');

    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        trip: true,
        location: { select: locationWithAddressSelect },
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
            locationId: true,
            description: true,
            startTime: true,
            endTime: true,
            timezone: true,
            category: true,
            ...childCostExpenseSelect,
            bookingReference: true,
            notes: true,
            dietaryTags: true,
          },
          orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
        },
        ...costExpenseInclude,
      },
    });

    return convertDecimals(activity ? hydrateActivityCost(activity) : activity);
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
        throw new AppError("An activity can't be its own parent.", 400);
      }
      await verifyEntityInTrip('activity', data.parentId, activity.tripId);
    }

    if (data.locationId) {
      await verifyEntityInTrip('location', data.locationId, activity.tripId);
    }

    // The cost lives on the activity's expense row (see syncBookingCost), not on the activity.
    const { cost, currency, ...activityData } = data;
    const updateData: Prisma.ActivityUncheckedUpdateInput = buildConditionalUpdateData(activityData, {
      transformers: {
        startTime: (val: string | null) => (val ? new Date(val) : null),
        endTime: (val: string | null) => (val ? new Date(val) : null),
        // dietaryTags is a nullable Json column: Prisma needs DbNull to write SQL NULL
        dietaryTags: (val: string[] | null) => val ?? Prisma.DbNull,
      },
    });

    const { updatedActivity, costExpense, receiptPaths } = await prisma.$transaction(async (tx) => {
      const row = await tx.activity.update({
        where: { id: activityId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildConditionalUpdateData returns Partial which is incompatible with Prisma's Exact type
        data: updateData,
        include: {
          location: { select: locationWithAddressSelect },
          parent: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      const sync = await syncBookingCost(tx, 'activity', activityId, {
        cost,
        currency,
        refresh: data.name !== undefined || data.startTime !== undefined || data.timezone !== undefined,
      });
      const linked = await tx.tripExpense.findUnique({ where: { activityId }, select: costExpenseSelect });
      return { updatedActivity: row, costExpense: linked, receiptPaths: sync.receiptPaths };
    });
    await deleteReceiptFiles(receiptPaths);

    return convertDecimals(hydrateBookingCost({ ...updatedActivity, costExpense }));
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
