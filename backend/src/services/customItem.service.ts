import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/errors';
import {
  CreateCustomItemInput,
  UpdateCustomItemInput,
  CreateCustomItemTypeInput,
  UpdateCustomItemTypeInput,
  BulkDeleteCustomItemsInput,
  BulkUpdateCustomItemsInput,
} from '../types/customItem.types';
import {
  verifyTripAccessWithPermission,
  verifyEntityInTrip,
  verifyEntityAccessWithPermission,
} from '../services/_shared/tripAccess';
import { buildConditionalUpdateData } from '../services/_shared/prismaUpdateData';
import { convertDecimals } from '../services/_shared/decimalConversion';
import { deleteEntity, bulkDeleteEntities, bulkUpdateEntities } from '../prisma/crudHelpers';
import {
  buildBookingCostCreate,
  costExpenseInclude,
  hydrateBookingCost,
  syncBookingCost,
} from '../services/_shared/bookingCost';
import { deleteReceiptFiles } from './expenseReceipt.service';

/**
 * Starter types seeded on a user's first read of the registry.
 *
 * Seeded lazily rather than at registration so existing accounts get them too —
 * one code path, no backfill migration that would miss anyone created between
 * deploy and migrate.
 */
const DEFAULT_CUSTOM_ITEM_TYPES: ReadonlyArray<{ name: string; icon: string; color: string }> = [
  { name: 'Reservation', icon: 'calendar-check', color: '#4F46E5' },
  { name: 'Contact', icon: 'phone', color: '#0891B2' },
  { name: 'Reminder', icon: 'bell', color: '#D97706' },
  { name: 'Misc', icon: 'pin', color: '#6B7280' },
];

/** Shape returned to the client for one custom item's joined relations. */
const ITEM_INCLUDE = {
  type: { select: { id: true, name: true, icon: true, color: true } },
  location: { select: { id: true, name: true, latitude: true, longitude: true } },
  ...costExpenseInclude,
} as const;

class CustomItemService {
  // ===========================================================================
  // Type registry
  // ===========================================================================

  /**
   * Seed the starter types if this user has none at all.
   *
   * Guards on the total count, NOT on `isDefault`: a user who deliberately
   * deleted every type must not have them resurrected on the next read, and a
   * restored backup (whose types are all isDefault false by design) must not
   * collide with a re-seed. `skipDuplicates` covers the concurrent-request race
   * against the (userId, name) unique index.
   */
  private async seedDefaultTypesIfEmpty(userId: number): Promise<void> {
    const existing = await prisma.customItemType.count({ where: { userId } });
    if (existing > 0) return;

    await prisma.customItemType.createMany({
      data: DEFAULT_CUSTOM_ITEM_TYPES.map((type) => ({
        userId,
        name: type.name,
        icon: type.icon,
        color: type.color,
        // Provenance only — never an edit gate. Unlike LocationCategory, update
        // and delete below do NOT filter on this, so seeded types stay editable.
        isDefault: true,
      })),
      skipDuplicates: true,
    });
  }

  async getTypes(userId: number) {
    await this.seedDefaultTypesIfEmpty(userId);

    return prisma.customItemType.findMany({
      where: { userId },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createType(userId: number, data: CreateCustomItemTypeInput) {
    const duplicate = await prisma.customItemType.findFirst({
      where: { userId, name: data.name },
    });
    if (duplicate) {
      throw new AppError('A custom item type with that name already exists', 409);
    }

    return prisma.customItemType.create({
      data: {
        userId,
        name: data.name,
        icon: data.icon ?? null,
        color: data.color ?? null,
      },
    });
  }

  async updateType(userId: number, typeId: number, data: UpdateCustomItemTypeInput) {
    // Scoped by userId so one user cannot edit another's type. Deliberately NOT
    // filtered on isDefault — seeded types are the user's to rename or recolor.
    const existing = await prisma.customItemType.findFirst({
      where: { id: typeId, userId },
    });
    if (!existing) {
      throw new AppError("We couldn't find that item type.", 404);
    }

    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.customItemType.findFirst({
        where: { userId, name: data.name, id: { not: typeId } },
      });
      if (duplicate) {
        throw new AppError('A custom item type with that name already exists', 409);
      }
    }

    return prisma.customItemType.update({
      where: { id: typeId },
      data: buildConditionalUpdateData(data),
    });
  }

  /**
   * Delete a type. Items keep existing and fall back to an untyped presentation
   * via the schema's SetNull, so this never destroys trip content.
   */
  async deleteType(userId: number, typeId: number) {
    const existing = await prisma.customItemType.findFirst({
      where: { id: typeId, userId },
    });
    if (!existing) {
      throw new AppError("We couldn't find that item type.", 404);
    }

    await prisma.customItemType.delete({ where: { id: typeId } });
    return { success: true };
  }

  // ===========================================================================
  // Items
  // ===========================================================================

  /**
   * Verify a type belongs to this user before attaching it to an item.
   * Types are user-scoped while items are trip-scoped, so a trip collaborator
   * cannot borrow the owner's types (nor vice versa).
   */
  private async verifyTypeOwnership(userId: number, typeId: number): Promise<void> {
    const type = await prisma.customItemType.findFirst({
      where: { id: typeId, userId },
    });
    if (!type) {
      throw new AppError("We couldn't find that item type.", 404);
    }
  }

  async createCustomItem(userId: number, data: CreateCustomItemInput) {
    await verifyTripAccessWithPermission(userId, data.tripId, 'edit');

    if (data.typeId) {
      await this.verifyTypeOwnership(userId, data.typeId);
    }

    if (data.locationId) {
      await verifyEntityInTrip('location', data.locationId, data.tripId);
    }

    const startTime = data.startTime ? new Date(data.startTime) : null;
    const costExpense = await buildBookingCostCreate(
      prisma,
      data.tripId,
      { kind: 'customItem', name: data.name, startTime, timezone: data.timezone || null },
      { cost: data.cost, currency: data.currency }
    );

    const item = await prisma.customItem.create({
      data: {
        tripId: data.tripId,
        typeId: data.typeId || null,
        name: data.name,
        notes: data.notes || null,
        allDay: data.allDay ?? false,
        startTime,
        endTime: data.endTime ? new Date(data.endTime) : null,
        timezone: data.timezone || null,
        locationId: data.locationId || null,
        costExpense,
        url: data.url || null,
        confirmationNumber: data.confirmationNumber || null,
      },
      include: ITEM_INCLUDE,
    });

    return convertDecimals(hydrateBookingCost(item));
  }

  async getCustomItemsByTrip(userId: number, tripId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'view');

    const items = await prisma.customItem.findMany({
      where: { tripId },
      include: ITEM_INCLUDE,
      // Flat, date-then-name ordering. Undated items sort last rather than
      // leading, so a partially scheduled trip still reads chronologically.
      orderBy: [
        { startTime: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
      ],
    });

    return convertDecimals(items.map((item) => hydrateBookingCost(item)));
  }

  async getCustomItemById(userId: number, itemId: number) {
    await verifyEntityAccessWithPermission('customItem', itemId, userId, 'view');

    const item = await prisma.customItem.findUnique({
      where: { id: itemId },
      include: { ...ITEM_INCLUDE, trip: true },
    });

    return convertDecimals(item ? hydrateBookingCost(item) : item);
  }

  async updateCustomItem(userId: number, itemId: number, data: UpdateCustomItemInput) {
    const { entity: item } = await verifyEntityAccessWithPermission<{ tripId: number }>(
      'customItem',
      itemId,
      userId,
      'edit'
    );

    if (data.typeId) {
      await this.verifyTypeOwnership(userId, data.typeId);
    }

    if (data.locationId) {
      await verifyEntityInTrip('location', data.locationId, item.tripId);
    }

    // The cost lives on the expense row of the item (see syncBookingCost), not on the item.
    const { cost, currency, ...itemData } = data;
    const updateData: Prisma.CustomItemUncheckedUpdateInput = buildConditionalUpdateData(itemData, {
      transformers: {
        startTime: (val: string | null) => (val ? new Date(val) : null),
        endTime: (val: string | null) => (val ? new Date(val) : null),
      },
    });

    // Changing the cost or currency invalidates the frozen FX snapshot: syncBookingCost clears it so the
    // budget summary recomputes lazily (leaving it would report the old converted amount).
    const { updated, receiptPaths } = await prisma.$transaction(async (tx) => {
      await tx.customItem.update({ where: { id: itemId }, data: updateData });
      const sync = await syncBookingCost(tx, 'customItem', itemId, {
        cost,
        currency,
        refresh: data.name !== undefined || data.startTime !== undefined || data.timezone !== undefined,
      });
      const row = await tx.customItem.findUniqueOrThrow({ where: { id: itemId }, include: ITEM_INCLUDE });
      return { updated: row, receiptPaths: sync.receiptPaths };
    });
    await deleteReceiptFiles(receiptPaths);

    return convertDecimals(hydrateBookingCost(updated));
  }

  async deleteCustomItem(userId: number, itemId: number) {
    return deleteEntity('customItem', itemId, userId);
  }

  async bulkDeleteCustomItems(userId: number, tripId: number, data: BulkDeleteCustomItemsInput) {
    return bulkDeleteEntities('customItem', userId, tripId, data.ids);
  }

  async bulkUpdateCustomItems(userId: number, tripId: number, data: BulkUpdateCustomItemsInput) {
    // bulkUpdateEntities only whitelists field NAMES, it does not validate
    // values — so without this a user could bulk-assign another user's type id.
    if (data.updates.typeId) {
      await this.verifyTypeOwnership(userId, data.updates.typeId);
    }

    return bulkUpdateEntities('customItem', userId, tripId, data.ids, data.updates, {
      allowedFields: ['typeId', 'notes', 'timezone'],
    });
  }
}

export default new CustomItemService();
