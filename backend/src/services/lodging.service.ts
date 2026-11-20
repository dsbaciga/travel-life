import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import {
  CreateLodgingInput,
  UpdateLodgingInput,
  BulkDeleteLodgingInput,
  BulkUpdateLodgingInput,
} from '../types/lodging.types';
import {
  verifyTripAccessWithPermission,
  verifyEntityAccessWithPermission,
  verifyEntityInTrip,
} from '../services/_shared/tripAccess';
import { buildConditionalUpdateData } from '../services/_shared/prismaUpdateData';
import { convertDecimals } from '../services/_shared/decimalConversion';
import loyaltyProgramService from './loyaltyProgram.service';
import { deleteEntity, bulkDeleteEntities, bulkUpdateEntities } from '../prisma/crudHelpers';
import { locationWithAddressSelect } from '../prisma/prismaIncludes';

// The stay's place is the direct `locationId` FK (not an EntityLink). Responses carry
// `locationId` plus a small `location` object.

class LodgingService {
  async createLodging(userId: number, data: CreateLodgingInput) {
    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    if (data.loyaltyProgramId) {
      await loyaltyProgramService.assertOwnedBy(userId, data.loyaltyProgramId);
    }

    if (data.locationId) {
      await verifyEntityInTrip('location', data.locationId, data.tripId);
    }

    const lodging = await prisma.lodging.create({
      data: {
        tripId: data.tripId,
        locationId: data.locationId || null,
        type: data.type,
        name: data.name,
        address: data.address || null,
        checkInDate: data.checkInDate ? new Date(data.checkInDate) : new Date(),
        checkOutDate: data.checkOutDate ? new Date(data.checkOutDate) : new Date(),
        timezone: data.timezone || null,
        confirmationNumber: data.confirmationNumber || null,
        loyaltyProgramId: data.loyaltyProgramId || null,
        cost: data.cost !== undefined ? data.cost : null,
        currency: data.currency || null,
        bookingUrl: data.bookingUrl || null,
        notes: data.notes || null,
      },
      include: { location: { select: locationWithAddressSelect } },
    });

    return convertDecimals(lodging);
  }

  async getLodgingByTrip(userId: number, tripId: number) {
    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const lodgings = await prisma.lodging.findMany({
      where: { tripId },
      include: { location: { select: locationWithAddressSelect } },
      orderBy: [{ checkInDate: 'asc' }, { createdAt: 'asc' }],
    });

    return convertDecimals(lodgings);
  }

  async getLodgingById(userId: number, lodgingId: number) {
    // Verify user has view permission on the lodging's trip
    await verifyEntityAccessWithPermission('lodging', lodgingId, userId, 'view');

    const lodging = await prisma.lodging.findUnique({
      where: { id: lodgingId },
      include: {
        trip: true,
        location: { select: locationWithAddressSelect },
      },
    });

    return convertDecimals(lodging);
  }

  async updateLodging(
    userId: number,
    lodgingId: number,
    data: UpdateLodgingInput
  ) {
    // Verify user has edit permission on the lodging's trip
    const { entity: existing } = await verifyEntityAccessWithPermission<{ tripId: number }>('lodging', lodgingId, userId, 'edit');

    if (data.loyaltyProgramId) {
      await loyaltyProgramService.assertOwnedBy(userId, data.loyaltyProgramId);
    }

    if (data.locationId) {
      await verifyEntityInTrip('location', data.locationId, existing.tripId);
    }

    // Transformer for date fields: convert to Date if truthy, skip update if null/undefined.
    // This preserves existing dates if not explicitly provided (dates are required for lodging).
    // Note: This differs from activity.service.ts which returns null to allow clearing times.
    const dateTransformer = (val: string | null | undefined) =>
      val ? new Date(val) : undefined;

    const updateData: Prisma.LodgingUncheckedUpdateInput = buildConditionalUpdateData(data, {
      transformers: {
        checkInDate: dateTransformer,
        checkOutDate: dateTransformer,
      },
    });

    const updatedLodging = await prisma.lodging.update({
      where: { id: lodgingId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildConditionalUpdateData returns Partial which is incompatible with Prisma's Exact type
      data: updateData,
      include: { location: { select: locationWithAddressSelect } },
    });

    return convertDecimals(updatedLodging);
  }

  async deleteLodging(userId: number, lodgingId: number) {
    return deleteEntity('lodging', lodgingId, userId);
  }

  /**
   * Bulk delete multiple lodging items
   * Verifies edit permission for all items before deletion
   */
  async bulkDeleteLodging(userId: number, tripId: number, data: BulkDeleteLodgingInput) {
    return bulkDeleteEntities('lodging', userId, tripId, data.ids);
  }

  /**
   * Bulk update multiple lodging items
   * Verifies edit permission for all items before update
   */
  async bulkUpdateLodging(userId: number, tripId: number, data: BulkUpdateLodgingInput) {
    return bulkUpdateEntities('lodging', userId, tripId, data.ids, data.updates, {
      allowedFields: ['type', 'notes'],
    });
  }
}

export default new LodgingService();
