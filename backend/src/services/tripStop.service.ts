import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyEntityInTrip, verifyTripAccessWithPermission } from './_shared/tripAccess';
import {
  CreateTripStopInput,
  UpdateTripStopInput,
  ReorderTripStopsInput,
} from '../types/tripStop.types';

async function findInTrip(stopId: number, tripId: number) {
  const stop = await prisma.tripStop.findFirst({ where: { id: stopId, tripId } });
  if (!stop) {
    throw new AppError('Stop not found or does not belong to trip', 404);
  }
  return stop;
}

/**
 * The ordered route plan of a trip (Multi-City Trip Planner). Reads need 'view',
 * every write needs 'edit'. Positions are always 0..n-1 with no gaps.
 */
class TripStopService {
  async getStopsByTrip(userId: number, tripId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');
    return prisma.tripStop.findMany({ where: { tripId }, orderBy: { position: 'asc' } });
  }

  async createStop(userId: number, tripId: number, data: CreateTripStopInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    if (data.locationId != null) {
      await verifyEntityInTrip('location', data.locationId, tripId);
    }

    const last = await prisma.tripStop.findFirst({
      where: { tripId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    return prisma.tripStop.create({
      data: {
        tripId,
        name: data.name,
        latitude: data.latitude,
        longitude: data.longitude,
        nights: data.nights ?? null,
        locationId: data.locationId ?? null,
        position: last ? last.position + 1 : 0,
      },
    });
  }

  async updateStop(userId: number, tripId: number, stopId: number, data: UpdateTripStopInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(stopId, tripId);
    if (data.locationId != null) {
      await verifyEntityInTrip('location', data.locationId, tripId);
    }

    return prisma.tripStop.update({
      where: { id: stopId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.nights !== undefined && { nights: data.nights }),
        ...(data.locationId !== undefined && { locationId: data.locationId }),
      },
    });
  }

  async deleteStop(userId: number, tripId: number, stopId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    await findInTrip(stopId, tripId);

    // Close the gap so positions stay 0..n-1.
    await prisma.$transaction(async (tx) => {
      await tx.tripStop.delete({ where: { id: stopId } });
      const remaining = await tx.tripStop.findMany({
        where: { tripId },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      for (const [index, stop] of remaining.entries()) {
        if (stop.position !== index) {
          await tx.tripStop.update({ where: { id: stop.id }, data: { position: index } });
        }
      }
    });
  }

  /**
   * Writes positions from the full ordered id list in one transaction. The list must
   * contain exactly the trip's stop ids, each once; a partial or stale list is rejected
   * so a concurrent add or delete is never silently lost.
   */
  async reorderStops(userId: number, tripId: number, data: ReorderTripStopsInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const ids = data.stopIds;
    if (new Set(ids).size !== ids.length) {
      throw new AppError('stopIds must not contain duplicates', 400);
    }

    return prisma.$transaction(async (tx) => {
      const current = await tx.tripStop.findMany({ where: { tripId }, select: { id: true } });
      const currentIds = new Set(current.map((s) => s.id));
      if (ids.length !== currentIds.size || ids.some((id) => !currentIds.has(id))) {
        throw new AppError(
          "stopIds must list exactly the trip's stops; reload the plan and try again",
          400
        );
      }

      for (const [position, id] of ids.entries()) {
        await tx.tripStop.update({ where: { id }, data: { position } });
      }
      return tx.tripStop.findMany({ where: { tripId }, orderBy: { position: 'asc' } });
    });
  }
}

export default new TripStopService();
