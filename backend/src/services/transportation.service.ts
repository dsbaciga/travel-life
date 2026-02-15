import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import {
  CreateTransportationInput,
  UpdateTransportationInput,
  BulkDeleteTransportationInput,
  BulkUpdateTransportationInput,
} from '../types/transportation.types';
import { AppError } from '../utils/errors';
import { verifyTripAccessWithPermission, verifyEntityAccessWithPermission, verifyEntityInTrip, convertDecimals, cleanupEntityLinks, buildConditionalUpdateData } from '../utils/serviceHelpers';
import { locationWithAddressSelect } from '../utils/prismaIncludes';
import routingService from './routing.service';

// Type for transportation with included relations
type TransportationWithRelations = Prisma.TransportationGetPayload<{
  include: {
    startLocation: { select: typeof locationWithAddressSelect };
    endLocation: { select: typeof locationWithAddressSelect };
    flightTracking: true;
  };
}>;

// Type for the frontend-mapped transportation object
interface TransportationFrontend {
  id: number;
  tripId: number;
  type: string;
  fromLocationId: number | null;
  toLocationId: number | null;
  fromLocationName: string | null;
  toLocationName: string | null;
  departureTime: Date | null;
  arrivalTime: Date | null;
  startTimezone: string | null;
  endTimezone: string | null;
  carrier: string | null;
  vehicleNumber: string | null;
  confirmationNumber: string | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  connectionGroupId: string | null;
  calculatedDistance: number | null;
  calculatedDuration: number | null;
  distanceSource: string | null;
  createdAt: Date;
  updatedAt: Date;
  fromLocation: {
    id: number;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  toLocation: {
    id: number;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  flightTracking: Prisma.FlightTrackingGetPayload<object> | null;
  route?: {
    from: { name: string; latitude: number; longitude: number };
    to: { name: string; latitude: number; longitude: number };
    geometry?: number[][];
  };
  durationMinutes?: number;
  isUpcoming?: boolean;
  isInProgress?: boolean;
}

// Helper to map database fields to frontend field names
const mapTransportationToFrontend = (t: TransportationWithRelations): TransportationFrontend => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- convertDecimals converts Decimal->number at runtime but its return type remains T; every field is explicitly mapped below
  const converted = convertDecimals(t) as any;
  return {
    id: converted.id,
    tripId: converted.tripId,
    type: converted.type,
    fromLocationId: converted.startLocationId,
    toLocationId: converted.endLocationId,
    fromLocationName: converted.startLocationText,
    toLocationName: converted.endLocationText,
    departureTime: converted.scheduledStart,
    arrivalTime: converted.scheduledEnd,
    startTimezone: converted.startTimezone,
    endTimezone: converted.endTimezone,
    carrier: converted.company,
    vehicleNumber: converted.referenceNumber,
    confirmationNumber: converted.bookingReference,
    cost: converted.cost,
    currency: converted.currency,
    notes: converted.notes,
    connectionGroupId: converted.connectionGroupId,
    calculatedDistance: converted.calculatedDistance,
    calculatedDuration: converted.calculatedDuration,
    distanceSource: converted.distanceSource,
    createdAt: converted.createdAt,
    updatedAt: converted.updatedAt,
    fromLocation: converted.startLocation ? {
      id: converted.startLocation.id,
      name: converted.startLocation.name,
      address: converted.startLocation.address,
      latitude: converted.startLocation.latitude,
      longitude: converted.startLocation.longitude,
    } : null,
    toLocation: converted.endLocation ? {
      id: converted.endLocation.id,
      name: converted.endLocation.name,
      address: converted.endLocation.address,
      latitude: converted.endLocation.latitude,
      longitude: converted.endLocation.longitude,
    } : null,
    flightTracking: converted.flightTracking,
  };
};

class TransportationService {
  async createTransportation(userId: number, data: CreateTransportationInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    // Verify locations belong to trip if provided
    if (data.fromLocationId) {
      await verifyEntityInTrip('location', data.fromLocationId, data.tripId);
    }

    if (data.toLocationId) {
      await verifyEntityInTrip('location', data.toLocationId, data.tripId);
    }

    const transportation = await prisma.transportation.create({
      data: {
        tripId: data.tripId,
        type: data.type,
        startLocationId: data.fromLocationId || null,
        endLocationId: data.toLocationId || null,
        startLocationText: data.fromLocationName || null,
        endLocationText: data.toLocationName || null,
        scheduledStart: data.departureTime ? new Date(data.departureTime) : null,
        scheduledEnd: data.arrivalTime ? new Date(data.arrivalTime) : null,
        startTimezone: data.startTimezone || null,
        endTimezone: data.endTimezone || null,
        company: data.carrier || null,
        referenceNumber: data.vehicleNumber || null,
        bookingReference: data.confirmationNumber || null,
        cost: data.cost || null,
        currency: data.currency || null,
        notes: data.notes || null,
      },
      include: {
        startLocation: {
          select: locationWithAddressSelect,
        },
        endLocation: {
          select: locationWithAddressSelect,
        },
        flightTracking: true,
      },
    });

    // Calculate route distance asynchronously (don't block the response)
    this.calculateAndStoreRouteDistance(transportation.id).catch(err =>
      console.error('Background route calculation failed:', err)
    );

    return mapTransportationToFrontend(transportation);
  }

  async getTransportationByTrip(userId: number, tripId: number) {
    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const transportations = await prisma.transportation.findMany({
      where: { tripId },
      include: {
        startLocation: {
          select: locationWithAddressSelect,
        },
        endLocation: {
          select: locationWithAddressSelect,
        },
        flightTracking: true,
      },
      orderBy: [{ scheduledStart: 'asc' }, { createdAt: 'asc' }],
    });

    return await this.enhanceTransportations(transportations);
  }

  async getAllTransportation(
    userId: number,
    options?: { page?: number; limit?: number }
  ) {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 50;
    const skip = (page - 1) * limit;

    // Get all trips user has access to
    const trips = await prisma.trip.findMany({
      where: { userId },
      select: { id: true },
    });

    const tripIds = trips.map((t) => t.id);

    const whereClause = { tripId: { in: tripIds } };

    // Run data query and count query in parallel
    const [transportations, total] = await Promise.all([
      prisma.transportation.findMany({
        where: whereClause,
        include: {
          startLocation: {
            select: locationWithAddressSelect,
          },
          endLocation: {
            select: locationWithAddressSelect,
          },
          flightTracking: true,
        },
        orderBy: [{ scheduledStart: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.transportation.count({ where: whereClause }),
    ]);

    const data = await this.enhanceTransportations(transportations);
    const totalPages = Math.ceil(total / limit);

    return { data, total, page, limit, totalPages };
  }

  private async enhanceTransportations(transportations: TransportationWithRelations[]): Promise<TransportationFrontend[]> {
    // Enhance with computed fields and map to frontend format
    const now = new Date();
    let enhancedTransportations: TransportationFrontend[];
    try {
      enhancedTransportations = await Promise.all(transportations.map(async (t) => {
      const mapped = mapTransportationToFrontend(t);

      // Calculate route if we have coordinates
      if (
        t.startLocation?.latitude &&
        t.startLocation?.longitude &&
        t.endLocation?.latitude &&
        t.endLocation?.longitude
      ) {
        mapped.route = {
          from: {
            name: t.startLocation.name,
            latitude: Number(t.startLocation.latitude),
            longitude: Number(t.startLocation.longitude),
          },
          to: {
            name: t.endLocation.name,
            latitude: Number(t.endLocation.latitude),
            longitude: Number(t.endLocation.longitude),
          },
        };

        // Try to get route geometry for road-based transportation
        // Always attempt for car/bike/walk types, even if distance was calculated with Haversine
        // The routing service will use cache if available and handle fallbacks gracefully
        if (t.type === 'car' || t.type === 'bicycle' || t.type === 'bike' || t.type === 'walk' || t.type === 'walking') {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Transportation Service] Fetching route geometry for ${t.type} transportation (id: ${t.id})`);
          }
          try {
            // Determine routing profile based on transportation type
            let profile: 'driving-car' | 'cycling-regular' | 'foot-walking' = 'driving-car';
            if (t.type === 'bicycle' || t.type === 'bike') {
              profile = 'cycling-regular';
            } else if (t.type === 'walk' || t.type === 'walking') {
              profile = 'foot-walking';
            }

            const route = await routingService.calculateRoute(
              {
                latitude: Number(t.startLocation.latitude),
                longitude: Number(t.startLocation.longitude),
              },
              {
                latitude: Number(t.endLocation.latitude),
                longitude: Number(t.endLocation.longitude),
              },
              profile
            );

            if (route.geometry) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[Transportation Service] Route geometry obtained: ${route.geometry.length} coordinates, source: ${route.source}`);
              }
              mapped.route.geometry = route.geometry;
            } else if (process.env.NODE_ENV === 'development') {
              console.log(`[Transportation Service] No geometry returned (source: ${route.source})`);
            }
          } catch (error) {
            console.error('[Transportation Service] Failed to fetch route geometry:', error);
          }
        }
      }

      // Calculate duration
      if (t.scheduledStart && t.scheduledEnd) {
        const start = new Date(t.scheduledStart);
        const end = new Date(t.scheduledEnd);
        mapped.durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      }

      // Calculate status flags
      if (t.scheduledStart) {
        const departureTime = new Date(t.scheduledStart);
        mapped.isUpcoming = departureTime > now;

        if (t.scheduledEnd) {
          const arrivalTime = new Date(t.scheduledEnd);
          mapped.isInProgress = departureTime <= now && arrivalTime > now;
        } else {
          mapped.isInProgress = false;
        }
      }

      return mapped;
    }));
    } catch (error) {
      console.error('Failed to enhance transportation data:', error);
      throw new Error('Failed to enhance transportation data: ' + (error as Error).message);
    }

    return enhancedTransportations;
  }

  async getTransportationById(userId: number, transportationId: number) {
    // Verify user has view permission on the transportation's trip
    await verifyEntityAccessWithPermission('transportation', transportationId, userId, 'view');

    const transportation = await prisma.transportation.findUnique({
      where: { id: transportationId },
      include: {
        trip: true,
        startLocation: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        endLocation: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        flightTracking: true,
      },
    });

    return mapTransportationToFrontend(transportation as TransportationWithRelations);
  }

  async updateTransportation(
    userId: number,
    transportationId: number,
    data: UpdateTransportationInput
  ) {
    // Verify user has edit permission on the transportation's trip
    const { entity: transportation } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'transportation',
      transportationId,
      userId,
      'edit'
    );

    // Verify locations belong to trip if provided
    if (data.fromLocationId !== undefined && data.fromLocationId !== null) {
      await verifyEntityInTrip('location', data.fromLocationId, transportation.tripId);
    }

    if (data.toLocationId !== undefined && data.toLocationId !== null) {
      await verifyEntityInTrip('location', data.toLocationId, transportation.tripId);
    }

    // Map frontend field names to database field names
    const mappedData = {
      type: data.type,
      startLocationId: data.fromLocationId,
      endLocationId: data.toLocationId,
      startLocationText: data.fromLocationName,
      endLocationText: data.toLocationName,
      scheduledStart: data.departureTime,
      scheduledEnd: data.arrivalTime,
      startTimezone: data.startTimezone,
      endTimezone: data.endTimezone,
      company: data.carrier,
      referenceNumber: data.vehicleNumber,
      bookingReference: data.confirmationNumber,
      cost: data.cost,
      currency: data.currency,
      notes: data.notes,
    };

    // Transformer for datetime fields: convert string to Date, or null if empty/falsy
    const dateTimeTransformer = (val: string | null | undefined) => val ? new Date(val) : null;

    const updateData = buildConditionalUpdateData(mappedData, {
      transformers: {
        scheduledStart: dateTimeTransformer,
        scheduledEnd: dateTimeTransformer,
      },
    });

    const updatedTransportation = await prisma.transportation.update({
      where: { id: transportationId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildConditionalUpdateData returns Partial which is incompatible with Prisma's Exact type
      data: updateData as any,
      include: {
        startLocation: {
          select: locationWithAddressSelect,
        },
        endLocation: {
          select: locationWithAddressSelect,
        },
        flightTracking: true,
      },
    });

    // Recalculate route distance if locations changed
    if (
      data.fromLocationId !== undefined ||
      data.toLocationId !== undefined
    ) {
      this.calculateAndStoreRouteDistance(transportationId).catch(err =>
        console.error('Background route calculation failed:', err)
      );
    }

    return mapTransportationToFrontend(updatedTransportation);
  }

  /**
   * Calculate route distance and duration for a transportation
   * Updates the database with the calculated values
   */
  private async calculateAndStoreRouteDistance(
    transportationId: number
  ): Promise<void> {
    // Get the transportation with location data
    const transportation = await prisma.transportation.findUnique({
      where: { id: transportationId },
      include: {
        startLocation: {
          select: {
            latitude: true,
            longitude: true,
          },
        },
        endLocation: {
          select: {
            latitude: true,
            longitude: true,
          },
        },
      },
    });

    if (!transportation) {
      return;
    }

    // Only calculate if we have both locations with coordinates
    if (
      !transportation.startLocation?.latitude ||
      !transportation.startLocation?.longitude ||
      !transportation.endLocation?.latitude ||
      !transportation.endLocation?.longitude
    ) {
      return;
    }

    const from = {
      latitude: Number(transportation.startLocation.latitude),
      longitude: Number(transportation.startLocation.longitude),
    };

    const to = {
      latitude: Number(transportation.endLocation.latitude),
      longitude: Number(transportation.endLocation.longitude),
    };

    // Determine routing profile based on transportation type
    let profile: 'driving-car' | 'cycling-regular' | 'foot-walking' = 'driving-car';
    if (transportation.type === 'bicycle' || transportation.type === 'bike') {
      profile = 'cycling-regular';
    } else if (transportation.type === 'walk' || transportation.type === 'walking') {
      profile = 'foot-walking';
    }

    try {
      // Calculate route (will fallback to Haversine if API unavailable)
      const route = await routingService.calculateRoute(from, to, profile);

      // Update the transportation with calculated values
      await prisma.transportation.update({
        where: { id: transportationId },
        data: {
          calculatedDistance: route.distance,
          calculatedDuration: route.duration,
          distanceSource: route.source,
        },
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[Transportation Service] Calculated ${route.source} distance for transportation ${transportationId}: ${route.distance.toFixed(2)} km`
        );
      }
    } catch (error) {
      console.error('[Transportation Service] Failed to calculate route distance:', error);
      // Don't throw - route calculation failure shouldn't break the request
    }
  }

  /**
   * Recalculate distances for all transportation in a trip
   */
  async recalculateDistancesForTrip(userId: number, tripId: number): Promise<number> {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const transportations = await prisma.transportation.findMany({
      where: { tripId },
      select: { id: true },
    });

    let count = 0;
    for (const t of transportations) {
      await this.calculateAndStoreRouteDistance(t.id);
      count++;
    }

    return count;
  }

  async deleteTransportation(userId: number, transportationId: number) {
    // Verify user has edit permission on the transportation's trip
    const { entity: transportation } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'transportation',
      transportationId,
      userId,
      'edit'
    );

    // Clean up entity links and delete atomically in a transaction
    await prisma.$transaction(async (tx) => {
      await cleanupEntityLinks(transportation.tripId, 'TRANSPORTATION', transportationId, tx);
      await tx.transportation.delete({
        where: { id: transportationId },
      });
    });

    return { success: true };
  }

  /**
   * Bulk delete multiple transportation items
   * Verifies edit permission for all items before deletion
   */
  async bulkDeleteTransportation(userId: number, tripId: number, data: BulkDeleteTransportationInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    // Verify all transportation items belong to this trip
    const transportations = await prisma.transportation.findMany({
      where: {
        id: { in: data.ids },
        tripId,
      },
      include: { trip: true },
    });

    if (transportations.length !== data.ids.length) {
      throw new AppError('One or more transportation items not found or do not belong to this trip', 404);
    }

    // Clean up entity links and delete atomically in a transaction
    const result = await prisma.$transaction(async (tx) => {
      for (const transportation of transportations) {
        await cleanupEntityLinks(transportation.tripId, 'TRANSPORTATION', transportation.id, tx);
      }
      return tx.transportation.deleteMany({
        where: {
          id: { in: data.ids },
          tripId,
        },
      });
    });

    return { success: true, deletedCount: result.count };
  }

  /**
   * Bulk update multiple transportation items
   * Verifies edit permission for all items before update
   */
  async bulkUpdateTransportation(userId: number, tripId: number, data: BulkUpdateTransportationInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    // Verify all transportation items belong to this trip
    const transportations = await prisma.transportation.findMany({
      where: {
        id: { in: data.ids },
        tripId,
      },
    });

    if (transportations.length !== data.ids.length) {
      throw new AppError('One or more transportation items not found or do not belong to this trip', 404);
    }

    // Build update data from non-undefined values, mapping frontend names to DB names
    const updateData: Record<string, unknown> = {};
    if (data.updates.type !== undefined) updateData.type = data.updates.type;
    if (data.updates.carrier !== undefined) updateData.company = data.updates.carrier;
    if (data.updates.notes !== undefined) updateData.notes = data.updates.notes;

    if (Object.keys(updateData).length === 0) {
      throw new AppError('No valid update fields provided', 400);
    }

    // Update all transportation items
    const result = await prisma.transportation.updateMany({
      where: {
        id: { in: data.ids },
        tripId,
      },
      data: updateData,
    });

    return { success: true, updatedCount: result.count };
  }
}

export default new TransportationService();
