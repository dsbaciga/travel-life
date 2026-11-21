import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { convertDecimals } from './_shared/decimalConversion';
import { haversineMeters } from './_shared/vendored/geo';
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

/** A client-supplied position may differ from its saved place by at most this much. */
const MAX_LINKED_DRIFT_KM = 50;

/**
 * Loads the saved place a stop is linked to. It must belong to the trip (404 otherwise) and
 * have coordinates, because a stop with no position cannot be routed.
 */
async function loadLinkedLocation(locationId: number, tripId: number) {
  await verifyEntityInTrip('location', locationId, tripId);
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { name: true, latitude: true, longitude: true },
  });
  if (!location) {
    throw new AppError('Location not found or does not belong to trip', 404);
  }
  if (location.latitude == null || location.longitude == null) {
    throw new AppError('That place has no coordinates, so it cannot be a stop', 400);
  }
  return {
    name: location.name,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  };
}

/** Rejects coordinates that sit far from the place they claim to be linked to. */
function assertNearLocation(
  position: { latitude: number; longitude: number },
  location: { latitude: number; longitude: number }
) {
  const km = haversineMeters(position, location) / 1000;
  if (km > MAX_LINKED_DRIFT_KM) {
    throw new AppError(
      `The coordinates are ${Math.round(km)} km from the linked place; they must be within ${MAX_LINKED_DRIFT_KM} km`,
      400
    );
  }
}

/**
 * The ordered route plan of a trip (Multi-City Trip Planner). Reads need 'view',
 * every write needs 'edit'. Positions are always 0..n-1 with no gaps.
 */
class TripStopService {
  async getStopsByTrip(userId: number, tripId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');
    return convertDecimals(
      await prisma.tripStop.findMany({ where: { tripId }, orderBy: { position: 'asc' } })
    );
  }

  async createStop(userId: number, tripId: number, data: CreateTripStopInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    // A linked stop snapshots the place's own name and coordinates unless the client sent
    // its own (for instance a chosen name), which must still agree with the place.
    let name = data.name;
    let latitude = data.latitude;
    let longitude = data.longitude;
    if (data.locationId != null) {
      const location = await loadLinkedLocation(data.locationId, tripId);
      if (latitude !== undefined && longitude !== undefined) {
        assertNearLocation({ latitude, longitude }, location);
      } else {
        latitude = location.latitude;
        longitude = location.longitude;
      }
      name = name ?? location.name;
    }
    if (name === undefined || latitude === undefined || longitude === undefined) {
      throw new AppError('name, latitude and longitude are required', 400);
    }

    const last = await prisma.tripStop.findFirst({
      where: { tripId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const created = await prisma.tripStop.create({
      data: {
        tripId,
        name,
        latitude,
        longitude,
        nights: data.nights ?? null,
        locationId: data.locationId ?? null,
        position: last ? last.position + 1 : 0,
      },
    });
    return convertDecimals(created);
  }

  async updateStop(userId: number, tripId: number, stopId: number, data: UpdateTripStopInput) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const existing = await findInTrip(stopId, tripId);
    const position = {
      latitude: data.latitude ?? Number(existing.latitude),
      longitude: data.longitude ?? Number(existing.longitude),
    };
    if (data.locationId != null) {
      assertNearLocation(position, await loadLinkedLocation(data.locationId, tripId));
    } else if (
      data.locationId === undefined &&
      existing.locationId !== null &&
      (data.latitude !== undefined || data.longitude !== undefined)
    ) {
      // Moving a stop that stays linked: it must still agree with its place. A place that
      // has lost its coordinates since can no longer be compared against, so it is skipped.
      const place = await prisma.location.findUnique({
        where: { id: existing.locationId },
        select: { latitude: true, longitude: true },
      });
      if (place && place.latitude != null && place.longitude != null) {
        assertNearLocation(position, {
          latitude: Number(place.latitude),
          longitude: Number(place.longitude),
        });
      }
    }

    const updated = await prisma.tripStop.update({
      where: { id: stopId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.nights !== undefined && { nights: data.nights }),
        ...(data.locationId !== undefined && { locationId: data.locationId }),
      },
    });
    return convertDecimals(updated);
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
      return convertDecimals(
        await tx.tripStop.findMany({ where: { tripId }, orderBy: { position: 'asc' } })
      );
    });
  }
}

export default new TripStopService();
