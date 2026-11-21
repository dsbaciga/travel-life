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
import {
  buildBookingCostCreate,
  costExpenseInclude,
  costExpenseSelect,
  hydrateBookingCost,
  syncBookingCost,
} from '../services/_shared/bookingCost';
import { deleteReceiptFiles } from './expenseReceipt.service';

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

    const checkInDate = data.checkInDate ? new Date(data.checkInDate) : new Date();
    const costExpense = await buildBookingCostCreate(
      prisma,
      data.tripId,
      { kind: 'lodging', name: data.name, checkInDate, timezone: data.timezone || null },
      { cost: data.cost, currency: data.currency }
    );

    const lodging = await prisma.lodging.create({
      data: {
        tripId: data.tripId,
        locationId: data.locationId || null,
        type: data.type,
        name: data.name,
        address: data.address || null,
        checkInDate,
        checkOutDate: data.checkOutDate ? new Date(data.checkOutDate) : new Date(),
        timezone: data.timezone || null,
        confirmationNumber: data.confirmationNumber || null,
        loyaltyProgramId: data.loyaltyProgramId || null,
        costExpense,
        bookingUrl: data.bookingUrl || null,
        notes: data.notes || null,
      },
      include: { location: { select: locationWithAddressSelect }, ...costExpenseInclude },
    });

    return convertDecimals(hydrateBookingCost(lodging));
  }

  async getLodgingByTrip(userId: number, tripId: number) {
    // Verify user has view permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const lodgings = await prisma.lodging.findMany({
      where: { tripId },
      include: { location: { select: locationWithAddressSelect }, ...costExpenseInclude },
      orderBy: [{ checkInDate: 'asc' }, { createdAt: 'asc' }],
    });

    return convertDecimals(lodgings.map((lodging) => hydrateBookingCost(lodging)));
  }

  async getLodgingById(userId: number, lodgingId: number) {
    // Verify user has view permission on the lodging's trip
    await verifyEntityAccessWithPermission('lodging', lodgingId, userId, 'view');

    const lodging = await prisma.lodging.findUnique({
      where: { id: lodgingId },
      include: {
        trip: true,
        location: { select: locationWithAddressSelect },
        ...costExpenseInclude,
      },
    });

    return convertDecimals(lodging ? hydrateBookingCost(lodging) : lodging);
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

    // The cost lives on the expense row of the stay (see syncBookingCost), not on the lodging.
    const { cost, currency, ...lodgingData } = data;
    const updateData: Prisma.LodgingUncheckedUpdateInput = buildConditionalUpdateData(lodgingData, {
      transformers: {
        checkInDate: dateTransformer,
        checkOutDate: dateTransformer,
      },
    });

    const { updatedLodging, costExpense, receiptPaths } = await prisma.$transaction(async (tx) => {
      const row = await tx.lodging.update({
        where: { id: lodgingId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- buildConditionalUpdateData returns Partial which is incompatible with Prisma's Exact type
        data: updateData,
        include: { location: { select: locationWithAddressSelect } },
      });
      const sync = await syncBookingCost(tx, 'lodging', lodgingId, {
        cost,
        currency,
        refresh: data.name !== undefined || data.checkInDate !== undefined || data.timezone !== undefined,
      });
      const linked = await tx.tripExpense.findUnique({ where: { lodgingId }, select: costExpenseSelect });
      return { updatedLodging: row, costExpense: linked, receiptPaths: sync.receiptPaths };
    });
    await deleteReceiptFiles(receiptPaths);

    return convertDecimals(hydrateBookingCost({ ...updatedLodging, costExpense }));
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
