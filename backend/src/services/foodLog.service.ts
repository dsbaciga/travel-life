import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyEntityInTrip, verifyTripAccessWithPermission } from './_shared/tripAccess';
import {
  CreateFoodLogEntryInput,
  UpdateFoodLogEntryInput,
  FoodLogSearchFilters,
} from '../types/foodLog.types';

const MAX_SEARCH_RESULTS = 200;

async function findInTrip(entryId: number, tripId: number) {
  const entry = await prisma.foodLogEntry.findFirst({ where: { id: entryId, tripId } });
  if (!entry) {
    throw new AppError('Food log entry not found or does not belong to trip', 404);
  }
  return entry;
}

async function verifyLinks(
  tripId: number,
  links: { activityId?: number | null; locationId?: number | null }
) {
  if (links.activityId) await verifyEntityInTrip('activity', links.activityId, tripId);
  if (links.locationId) await verifyEntityInTrip('location', links.locationId, tripId);
}

class FoodLogService {
  async createEntry(userId: number, tripId: number, data: CreateFoodLogEntryInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await verifyLinks(tripId, data);

    return prisma.foodLogEntry.create({
      data: {
        tripId,
        restaurantName: data.restaurantName,
        dish: data.dish,
        rating: data.rating,
        notes: data.notes ?? null,
        orderAgain: data.orderAgain ?? false,
        activityId: data.activityId ?? null,
        locationId: data.locationId ?? null,
      },
    });
  }

  async getEntriesByTrip(userId: number, tripId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');
    return prisma.foodLogEntry.findMany({
      where: { tripId },
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async updateEntry(
    userId: number,
    tripId: number,
    entryId: number,
    data: UpdateFoodLogEntryInput
  ) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(entryId, tripId);
    await verifyLinks(tripId, data);

    return prisma.foodLogEntry.update({
      where: { id: entryId },
      data: {
        ...(data.restaurantName !== undefined && { restaurantName: data.restaurantName }),
        ...(data.dish !== undefined && { dish: data.dish }),
        ...(data.rating !== undefined && { rating: data.rating }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.orderAgain !== undefined && { orderAgain: data.orderAgain }),
        ...(data.activityId !== undefined && { activityId: data.activityId }),
        ...(data.locationId !== undefined && { locationId: data.locationId }),
      },
    });
  }

  async deleteEntry(userId: number, tripId: number, entryId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(entryId, tripId);
    await prisma.foodLogEntry.delete({ where: { id: entryId } });
    return { id: entryId };
  }

  /**
   * "Best meals" across every trip the user owns or collaborates on, best first.
   * Cancelled trips are excluded.
   */
  async searchEntries(userId: number, filters: FoodLogSearchFilters) {
    const q = filters.q?.trim();
    return prisma.foodLogEntry.findMany({
      where: {
        trip: {
          status: { notIn: ['cancelled', 'Cancelled'] },
          OR: [{ userId }, { collaborators: { some: { userId } } }],
        },
        ...(filters.minRating !== undefined && { rating: { gte: filters.minRating } }),
        ...(filters.orderAgain !== undefined && { orderAgain: filters.orderAgain }),
        ...(q && {
          OR: [
            { dish: { contains: q, mode: 'insensitive' as const } },
            { restaurantName: { contains: q, mode: 'insensitive' as const } },
            { notes: { contains: q, mode: 'insensitive' as const } },
          ],
        }),
      },
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      take: MAX_SEARCH_RESULTS,
      include: { trip: { select: { id: true, title: true, timezone: true } } },
    });
  }
}

export const foodLogService = new FoodLogService();
export default foodLogService;
