import prisma from '../config/database';
import { AppError } from '../errors/errors';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { convertDecimals } from './_shared/decimalConversion';

/** Only the live fields the Today screen shows; not the tracking internals. */
const flightTrackingSelect = {
  flightNumber: true,
  airlineCode: true,
  status: true,
  gate: true,
  terminal: true,
  baggageClaim: true,
} as const;

/**
 * Trip snapshot for the native companion app's offline mirror.
 *
 * One request returns every entity of a trip plus its EntityLink graph, so a
 * phone on roaming data does a single round trip instead of a dozen. With
 * `since`, only rows changed after that instant are returned (delta sync); the
 * `ids` lists always cover *all* current rows so the client can also detect
 * deletions made on another device, which a pure "changed since" query cannot.
 *
 * Rows are returned with their Prisma column names (`scheduledStart`, not the
 * web API's `departureTime` alias) — the mobile SQLite mirror is keyed on the
 * schema, not on per-endpoint response shapes.
 */
class MobileSyncService {
  /**
   * @param userId - The requesting user
   * @param tripId - Trip to snapshot
   * @param since - ISO instant from a previous snapshot's `serverTime`
   * @throws {AppError} 400 when `since` is not a valid instant
   */
  async getSnapshot(userId: number, tripId: number, since?: string) {
    const access = await verifyTripAccessWithPermission(userId, tripId, 'view');

    let sinceDate: Date | null = null;
    if (since !== undefined && since !== '') {
      sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        throw new AppError('Invalid "since" timestamp', 400);
      }
    }

    // Captured BEFORE the reads: a row written while the queries run then has
    // updatedAt >= serverTime and is picked up again by the next delta pull,
    // instead of slipping through the gap.
    const serverTime = new Date();

    const changed = sinceDate ? { updatedAt: { gt: sinceDate } } : {};
    const tripScope = { tripId };

    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        timezone: true,
        status: true,
        countryCode: true,
        budget: true,
        budgetCurrency: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!trip) {
      throw new AppError('Trip not found or access denied', 404);
    }

    const checklistRows = await prisma.checklist.findMany({
      where: tripScope,
      select: { id: true },
    });
    const checklistIds = checklistRows.map((c) => c.id);

    const [
      locations,
      albums,
      lodging,
      transportation,
      activities,
      journals,
      savedLinks,
      customItems,
      foodLog,
      expenses,
      photos,
      checklists,
      checklistItems,
      // Links have no updatedAt, and a trip's link set is small: always send all.
      links,
      locationIds,
      albumIds,
      lodgingIds,
      transportationIds,
      activityIds,
      journalIds,
      savedLinkIds,
      customItemIds,
      foodLogIds,
      expenseIds,
      photoIds,
      checklistItemIds,
    ] = await Promise.all([
      prisma.location.findMany({ where: { ...tripScope, ...changed } }),
      prisma.photoAlbum.findMany({ where: { ...tripScope, ...changed } }),
      prisma.lodging.findMany({ where: { ...tripScope, ...changed } }),
      prisma.transportation.findMany({
        where: { ...tripScope, ...changed },
        include: { flightTracking: { select: flightTrackingSelect } },
      }),
      prisma.activity.findMany({ where: { ...tripScope, ...changed } }),
      prisma.journalEntry.findMany({ where: { ...tripScope, ...changed } }),
      prisma.savedLink.findMany({ where: { ...tripScope, ...changed } }),
      prisma.customItem.findMany({ where: { ...tripScope, ...changed } }),
      prisma.foodLogEntry.findMany({ where: { ...tripScope, ...changed } }),
      prisma.tripExpense.findMany({ where: { ...tripScope, ...changed } }),
      prisma.photo.findMany({
        where: { ...tripScope, ...changed },
        select: {
          id: true,
          tripId: true,
          source: true,
          mediaType: true,
          localPath: true,
          thumbnailPath: true,
          caption: true,
          latitude: true,
          longitude: true,
          takenAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.checklist.findMany({ where: { ...tripScope, ...changed } }),
      prisma.checklistItem.findMany({
        where: { checklistId: { in: checklistIds }, ...changed },
      }),
      prisma.entityLink.findMany({ where: tripScope }),
      prisma.location.findMany({ where: tripScope, select: { id: true } }),
      prisma.photoAlbum.findMany({ where: tripScope, select: { id: true } }),
      prisma.lodging.findMany({ where: tripScope, select: { id: true } }),
      prisma.transportation.findMany({ where: tripScope, select: { id: true } }),
      prisma.activity.findMany({ where: tripScope, select: { id: true } }),
      prisma.journalEntry.findMany({ where: tripScope, select: { id: true } }),
      prisma.savedLink.findMany({ where: tripScope, select: { id: true } }),
      prisma.customItem.findMany({ where: tripScope, select: { id: true } }),
      prisma.foodLogEntry.findMany({ where: tripScope, select: { id: true } }),
      prisma.tripExpense.findMany({ where: tripScope, select: { id: true } }),
      prisma.photo.findMany({ where: tripScope, select: { id: true } }),
      prisma.checklistItem.findMany({
        where: { checklistId: { in: checklistIds } },
        select: { id: true },
      }),
    ]);

    const idsOf = (rows: Array<{ id: number }>): number[] => rows.map((row) => row.id);

    return convertDecimals({
      serverTime: serverTime.toISOString(),
      delta: sinceDate !== null,
      trip: {
        ...trip,
        permission: access.isOwner ? ('owner' as const) : access.permissionLevel,
      },
      entities: {
        LOCATION: locations,
        PHOTO_ALBUM: albums,
        LODGING: lodging,
        TRANSPORTATION: transportation,
        ACTIVITY: activities,
        JOURNAL_ENTRY: journals,
        SAVED_LINK: savedLinks,
        CUSTOM_ITEM: customItems,
        FOOD_LOG: foodLog,
        EXPENSE: expenses,
        PHOTO: photos,
        CHECKLIST: checklists,
        CHECKLIST_ITEM: checklistItems,
      },
      links,
      ids: {
        LOCATION: idsOf(locationIds),
        PHOTO_ALBUM: idsOf(albumIds),
        LODGING: idsOf(lodgingIds),
        TRANSPORTATION: idsOf(transportationIds),
        ACTIVITY: idsOf(activityIds),
        JOURNAL_ENTRY: idsOf(journalIds),
        SAVED_LINK: idsOf(savedLinkIds),
        CUSTOM_ITEM: idsOf(customItemIds),
        FOOD_LOG: idsOf(foodLogIds),
        EXPENSE: idsOf(expenseIds),
        PHOTO: idsOf(photoIds),
        CHECKLIST: checklistIds,
        CHECKLIST_ITEM: idsOf(checklistItemIds),
      },
      linkIds: idsOf(links),
    });
  }
}

export default new MobileSyncService();
