import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { convertDecimals } from './_shared/decimalConversion';
import { haversineMeters } from './_shared/vendored/geo';
import routingService from './routing.service';
import { verifyEntityInTrip, verifyTripAccessWithPermission } from './_shared/tripAccess';
import {
  CreateTripStopInput,
  UpdateTripStopInput,
  ReorderTripStopsInput,
  LegProfile,
  TripStopLeg,
  TripStopLegsResult,
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

/** Legs longer than this (straight-line) are not sent to the router: they are flights or sea crossings. */
const MAX_ROUTED_LEG_KM = 2500;
/** At most this many uncached OpenRouteService requests in flight at once (the free tier is rate limited). */
const LEG_CONCURRENCY = 3;

interface StopPoint {
  id: number;
  latitude: number;
  longitude: number;
}

function straightLineLeg(from: StopPoint, to: StopPoint, km: number): TripStopLeg {
  return { fromStopId: from.id, toStopId: to.id, distanceKm: km, durationMinutes: null, routed: false };
}

/** Runs `fn` over `items` with a bounded number in flight; results keep the input order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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

  /**
   * Road distance and time between each pair of consecutive stops (view access). Uses the
   * shared RoutingService, so routes come from its 30-day database cache before any
   * OpenRouteService call. A leg that cannot be routed (no API key, ORS error or rate limit,
   * or too far apart) is returned as a straight-line leg with `routed: false`; one bad leg
   * never fails the response.
   */
  async getLegs(userId: number, tripId: number, profile: LegProfile): Promise<TripStopLegsResult> {
    await verifyTripAccessWithPermission(userId, tripId, 'view');
    const rows = await prisma.tripStop.findMany({
      where: { tripId },
      orderBy: { position: 'asc' },
      select: { id: true, latitude: true, longitude: true },
    });
    const stops: StopPoint[] = rows.map((r) => ({
      id: r.id,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
    }));
    const pairs = stops.slice(1).map((to, i) => ({ from: stops[i], to }));
    const canRoute = routingService.hasApiKey();

    const legs = await mapWithConcurrency<{ from: StopPoint; to: StopPoint }, TripStopLeg>(
      pairs,
      LEG_CONCURRENCY,
      async ({ from, to }) => {
        const km = haversineMeters(from, to) / 1000;
        if (km === 0) {
          // The same place twice: nothing to route, and the answer is exact.
          return { fromStopId: from.id, toStopId: to.id, distanceKm: 0, durationMinutes: 0, routed: true };
        }
        if (!canRoute || km > MAX_ROUTED_LEG_KM) return straightLineLeg(from, to, km);
        try {
          const route = await routingService.calculateRoute(from, to, profile);
          if (route.source !== 'route') return straightLineLeg(from, to, km);
          return {
            fromStopId: from.id,
            toStopId: to.id,
            distanceKm: route.distance,
            durationMinutes: route.duration,
            routed: true,
          };
        } catch {
          return straightLineLeg(from, to, km);
        }
      }
    );

    return { profile, legs };
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
