import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import {
  BACKUP_VERSION,
  type BackupData,
  type BackupTrip,
  type BackupTransportation,
  type BackupChecklistItem,
} from '../types/backup.types';
import { maskDocumentNumber } from '../types/travelDocument.types';
import { AppError } from '../errors/errors';
import { costExpenseSelect, hydrateBookingCost } from './_shared/bookingCost';
import { getUserIntegrations, getUserPreferences } from './_shared/userSettings';

type Decimal = Prisma.Decimal;

/**
 * Batch size for loading trips to prevent memory issues.
 * This limits how many trips (with their nested data) are loaded at once.
 */
const TRIP_BATCH_SIZE = 50;

/**
 * Batch size for loading photos within a trip.
 * Photos can be numerous, so we load them in smaller chunks.
 */
const PHOTO_BATCH_SIZE = 200;

/**
 * Transform a raw trip from the database into the backup format.
 * This is extracted to reduce memory by processing trips one at a time.
 */
/** The companion columns the expense export needs to tell the trip owner from everyone else. */
type BackupExpenseCompanion = { name: string; isMyself: boolean; linkedUserId: number | null };
const expenseCompanionSelect = { name: true, isMyself: true, linkedUserId: true } as const;

/**
 * Bookings export with their cost fields exactly as before: the cost lives on the booking's expense
 * row, which is flattened back onto the booking here (and also appears in `expenses`, see below).
 */
function withHydratedCost<T>(rows: unknown): T {
  type Row = Parameters<typeof hydrateBookingCost>[0] & Record<string, unknown>;
  if (!Array.isArray(rows)) return rows as T;
  return (rows as Row[]).map((row) => hydrateBookingCost(row)) as T;
}

function transformTripToBackupFormat(trip: Record<string, unknown>): BackupTrip {
  const transportation = withHydratedCost<Array<Record<string, unknown>>>(trip.transportation);
  const journalEntries = trip.journalEntries as Array<Record<string, unknown>>;
  const photoAlbums = trip.photoAlbums as Array<Record<string, unknown>>;
  const tagAssignments = trip.tagAssignments as Array<{ tag: { name: string } }>;
  const companionAssignments = trip.companionAssignments as Array<{ companion: { name: string } }>;
  const checklists = trip.checklists as Array<Record<string, unknown>>;
  const languages = trip.languages as Array<{ languageCode: string; language: string }>;

  return {
    // Trip basic info
    title: trip.title as string,
    description: trip.description as string | null,
    startDate: trip.startDate as string | null,
    endDate: trip.endDate as string | null,
    timezone: trip.timezone as string | null,
    status: trip.status as string,
    privacyLevel: trip.privacyLevel as string,
    archived: trip.archived as boolean | undefined,
    coverPhotoId: trip.coverPhotoId as number | null,
    coverImagePath: trip.coverImagePath as string | null,
    coverImageThumbnailPath: trip.coverImageThumbnailPath as string | null,
    bannerPhotoId: trip.bannerPhotoId as number | null,
    addToPlacesVisited: trip.addToPlacesVisited as boolean | undefined,
    excludeFromAutoShare: trip.excludeFromAutoShare as boolean | undefined,
    tripType: trip.tripType as string | null,
    tripTypeEmoji: trip.tripTypeEmoji as string | null,
    seriesId: trip.seriesId as number | null,
    seriesOrder: trip.seriesOrder as number | null,
    budget: trip.budget as number | null,
    budgetCurrency: trip.budgetCurrency as string | null,
    countryCode: trip.countryCode as string | null,

    // Related entities
    locations: trip.locations as BackupTrip['locations'],
    photos: trip.photos as BackupTrip['photos'],
    activities: withHydratedCost<BackupTrip['activities']>(trip.activities),
    transportation: transportation.map((t) => ({
      id: t.id as number,
      type: t.type as string,
      startLocationId: t.startLocationId as number | null,
      startLocationText: t.startLocationText as string | null,
      endLocationId: t.endLocationId as number | null,
      endLocationText: t.endLocationText as string | null,
      scheduledStart: t.scheduledStart as string | null,
      scheduledEnd: t.scheduledEnd as string | null,
      startTimezone: t.startTimezone as string | null,
      endTimezone: t.endTimezone as string | null,
      actualStart: t.actualStart as string | null,
      actualEnd: t.actualEnd as string | null,
      company: t.company as string | null,
      referenceNumber: t.referenceNumber as string | null,
      seatNumber: t.seatNumber as string | null,
      bookingReference: t.bookingReference as string | null,
      loyaltyProgramId: t.loyaltyProgramId as number | null,
      bookingUrl: t.bookingUrl as string | null,
      cost: t.cost as number | null,
      currency: t.currency as string | null,
      exchangeRate: t.exchangeRate as number | null,
      baseAmount: t.baseAmount as number | null,
      baseCurrency: t.baseCurrency as string | null,
      status: t.status as string | undefined,
      delayMinutes: t.delayMinutes as number | null,
      notes: t.notes as string | null,
      connectionGroupId: t.connectionGroupId as string | null,
      isAutoGenerated: t.isAutoGenerated as boolean | undefined,
      calculatedDistance: t.calculatedDistance as number | null,
      calculatedDuration: t.calculatedDuration as number | null,
      distanceSource: t.distanceSource as string | null,
      flightTracking: t.flightTracking as BackupTransportation['flightTracking'],
    })),
    lodging: withHydratedCost<BackupTrip['lodging']>(trip.lodging),
    bookingDeadlines: ((trip.bookingDeadlines ?? []) as Array<Record<string, unknown>>).map((d) => ({
      // Null for a standalone deadline (no booking).
      entityType: (d.lodgingId
        ? 'lodging'
        : d.transportationId
          ? 'transportation'
          : d.activityId
            ? 'activity'
            : null) as 'lodging' | 'transportation' | 'activity' | null,
      entityId: (d.lodgingId ?? d.transportationId ?? d.activityId ?? null) as number | null,
      title: (d.title as string | null) ?? null,
      kind: d.kind as string,
      dueAt: (d.dueAt as Date).toISOString(),
      note: d.note as string | null,
      dismissedAt: d.dismissedAt ? (d.dismissedAt as Date).toISOString() : null,
    })),
    // Already in route order (selected with orderBy position); position itself is not stored.
    stops: ((trip.stops ?? []) as Array<Record<string, unknown>>).map((s) => ({
      name: s.name as string,
      // Decimal(10,8)/(11,8) column: JSON would serialise a Decimal as a string, the file format wants numbers.
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      nights: (s.nights as number | null) ?? null,
      locationId: (s.locationId as number | null) ?? null,
    })),
    foodLogEntries: ((trip.foodLogEntries ?? []) as Array<Record<string, unknown>>).map((f) => ({
      restaurantName: f.restaurantName as string,
      dish: f.dish as string,
      rating: f.rating as number,
      notes: f.notes as string | null,
      orderAgain: f.orderAgain as boolean,
      activityId: f.activityId as number | null,
      locationId: f.locationId as number | null,
      photos: ((f.photos ?? []) as Array<{ photoId: number; sortOrder?: number }>).map((p) => ({
        photoId: p.photoId,
        sortOrder: p.sortOrder ?? 0,
      })),
    })),
    journalEntries: journalEntries.map((j) => ({
      date: j.date as string | null,
      title: j.title as string | null,
      content: j.content as string,
      entryType: j.entryType as string,
      mood: j.mood as string | null,
      weatherNotes: j.weatherNotes as string | null,
    })),
    // Note: Location, Activity, and Lodging associations are now handled via EntityLinks
    photoAlbums: photoAlbums.map((a) => ({
      name: a.name as string,
      description: a.description as string | null,
      coverPhotoId: a.coverPhotoId as number | null,
      immichAlbumId: (a.immichAlbumId as string | null | undefined) ?? null,
      immichAlbumSyncedAt: a.immichAlbumSyncedAt instanceof Date ? a.immichAlbumSyncedAt.toISOString() : null,
      photos: (a.photoAssignments as Array<{ photoId: number; sortOrder?: number }>).map((p) => ({
        photoId: p.photoId,
        sortOrder: p.sortOrder,
      })),
    })),
    weatherData: trip.weatherData as BackupTrip['weatherData'],
    tags: tagAssignments.map((t) => t.tag.name),
    companions: companionAssignments.map((c) => c.companion.name),
    checklists: checklists.map((checklist) => ({
      name: checklist.name as string,
      description: checklist.description as string | null,
      type: checklist.type as string,
      isDefault: checklist.isDefault as boolean | undefined,
      sortOrder: checklist.sortOrder as number | undefined,
      items: checklist.items as BackupChecklistItem[] | undefined,
    })),
    // EntityLinks - stores relationships between entities
    entityLinks: trip.entityLinks as BackupTrip['entityLinks'],
    // Trip languages for language helper feature
    tripLanguages: languages.map((tl) => ({
      languageCode: tl.languageCode,
      language: tl.language,
    })),
    // Saved reference links attached to this trip
    savedLinks: trip.savedLinks as BackupTrip['savedLinks'],
    // Custom items — flatten the joined type down to its name
    customItems: (
      withHydratedCost<Array<{ type: { name: string } | null } & Record<string, unknown>>>(trip.customItems)
    )?.map(({ type, ...item }) => ({
      ...item,
      typeName: type?.name ?? null,
    })) as BackupTrip['customItems'],
    // Expenses and emergency card info (added in v1.6.0)
    // Payers and split participants travel by companion NAME (ids are reassigned on restore).
    // The file shape predates "the owner is their myself companion": the trip owner is still
    // written as `paidByOwner` / `isOwner` with no companion name, and old backups restore too.
    expenses: (
      trip.expenses as
        | Array<
            {
              activityId: number | null;
              transportationId: number | null;
              lodgingId: number | null;
              customItemId: number | null;
              paidByCompanion: BackupExpenseCompanion | null;
              splits: Array<{ companion: BackupExpenseCompanion | null } & Record<string, unknown>>;
            } & Record<string, unknown>
          >
        | undefined
    )?.map(({ paidByCompanion, splits, activityId, transportationId, lodgingId, customItemId, ...expense }) => {
      // v1.9.0: an expense that is a booking's cost names the booking (its id in this file), so the
      // payer, splits and receipt of that cost survive a round trip. The booking itself also exports
      // `cost`; restore creates one row per booking, never two.
      const booking = activityId
        ? { type: 'activity' as const, id: activityId as number }
        : transportationId
          ? { type: 'transportation' as const, id: transportationId as number }
          : lodgingId
            ? { type: 'lodging' as const, id: lodgingId as number }
            : customItemId
              ? { type: 'customItem' as const, id: customItemId as number }
              : null;
      const isOwner = (c: BackupExpenseCompanion | null) =>
        c != null && c.isMyself && c.linkedUserId === trip.userId;
      return {
        ...expense,
        ...(booking ? { booking } : {}),
        paidByOwner: isOwner(paidByCompanion),
        paidByCompanionName: isOwner(paidByCompanion) ? null : paidByCompanion?.name ?? null,
        splits: (splits ?? []).map(({ companion, ...split }) => ({
          ...split,
          isOwner: isOwner(companion),
          companionName: isOwner(companion) ? null : companion?.name ?? null,
        })),
      };
    }) as BackupTrip['expenses'],
    emergencyInfo: (trip.emergencyInfo as BackupTrip['emergencyInfo']) ?? null,
  };
}

/**
 * Photo data structure for backup (selected fields only)
 * Note: Prisma returns Decimal for lat/lng which gets serialized to number in JSON
 */
interface BackupPhoto {
  id: number;
  source: string;
  immichAssetId: string | null;
  localPath: string | null;
  thumbnailPath: string | null;
  caption: string | null;
  latitude: Decimal | null;
  longitude: Decimal | null;
  takenAt: Date | null;
  isFavorite: boolean;
}

/**
 * Fetch photos for a trip in batches to prevent memory issues.
 * Uses cursor-based pagination for efficient loading of large photo collections.
 */
async function fetchPhotosInBatches(tripId: number): Promise<BackupPhoto[]> {
  const allPhotos: BackupPhoto[] = [];
  let cursor: number | undefined = undefined;

  while (true) {
    const photos: BackupPhoto[] = await prisma.photo.findMany({
      where: { tripId },
      select: {
        id: true, // Needed for EntityLink lookup and album photo mapping
        source: true,
        immichAssetId: true,
        localPath: true,
        thumbnailPath: true,
        caption: true,
        latitude: true,
        longitude: true,
        takenAt: true,
        isFavorite: true,
      },
      take: PHOTO_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });

    if (photos.length === 0) {
      break;
    }

    allPhotos.push(...photos);
    cursor = photos[photos.length - 1].id;

    // If we got fewer than the batch size, we've reached the end
    if (photos.length < PHOTO_BATCH_SIZE) {
      break;
    }
  }

  return allPhotos;
}

/**
 * Fetch a single trip with all its related data, using batched photo loading.
 * This prevents loading too much data at once for trips with many photos.
 */
async function fetchTripWithRelatedData(tripId: number): Promise<Record<string, unknown> | null> {
  // Fetch trip with most related data (except photos which we batch separately)
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      locations: {
        include: {
          category: {
            select: {
              name: true,
              icon: true,
              color: true,
              isDefault: true,
            },
          },
          children: true,
        },
      },
      activities: {
        select: {
          id: true,
          parentId: true,
          locationId: true,
          name: true,
          description: true,
          category: true,
          allDay: true,
          startTime: true,
          endTime: true,
          timezone: true,
          costExpense: { select: costExpenseSelect },
          bookingUrl: true,
          bookingReference: true,
          notes: true,
          manualOrder: true,
          dietaryTags: true,
        },
      },
      transportation: {
        include: {
          costExpense: { select: costExpenseSelect },
          flightTracking: {
            select: {
              flightNumber: true,
              airlineCode: true,
              status: true,
              gate: true,
              terminal: true,
              baggageClaim: true,
            },
          },
        },
      },
      lodging: {
        select: {
          id: true,
          locationId: true,
          type: true,
          name: true,
          address: true,
          checkInDate: true,
          checkOutDate: true,
          timezone: true,
          confirmationNumber: true,
          loyaltyProgramId: true,
          bookingUrl: true,
          costExpense: { select: costExpenseSelect },
          notes: true,
        },
      },
      bookingDeadlines: {
        select: {
          lodgingId: true,
          transportationId: true,
          activityId: true,
          title: true,
          kind: true,
          dueAt: true,
          note: true,
          dismissedAt: true,
        },
      },
      stops: {
        orderBy: { position: 'asc' },
        select: { name: true, latitude: true, longitude: true, nights: true, locationId: true },
      },
      foodLogEntries: {
        select: {
          restaurantName: true,
          dish: true,
          rating: true,
          notes: true,
          orderAgain: true,
          activityId: true,
          locationId: true,
          photos: { select: { photoId: true, sortOrder: true } },
        },
      },
      journalEntries: true,
      photoAlbums: {
        include: {
          photoAssignments: {
            select: {
              photoId: true,
              sortOrder: true,
            },
          },
        },
      },
      weatherData: {
        select: {
          locationId: true,
          date: true,
          temperatureHigh: true,
          temperatureLow: true,
          conditions: true,
          precipitation: true,
          humidity: true,
          windSpeed: true,
        },
      },
      tagAssignments: {
        include: {
          tag: {
            select: {
              name: true,
            },
          },
        },
      },
      companionAssignments: {
        include: {
          companion: {
            select: {
              name: true,
            },
          },
        },
      },
      checklists: {
        include: {
          items: {
            select: {
              name: true,
              description: true,
              isChecked: true,
              isDefault: true,
              sortOrder: true,
              metadata: true,
              checkedAt: true,
            },
          },
        },
      },
      entityLinks: {
        select: {
          sourceType: true,
          sourceId: true,
          targetType: true,
          targetId: true,
          relationship: true,
          sortOrder: true,
          notes: true,
        },
      },
      languages: {
        select: {
          languageCode: true,
          language: true,
        },
      },
      savedLinks: {
        select: {
          id: true, // For EntityLink mapping on restore
          url: true,
          title: true,
          description: true,
          siteName: true,
          imageUrl: true,
          notes: true,
          source: true,
          metadataStatus: true,
        },
      },
      customItems: {
        select: {
          id: true, // For EntityLink mapping on restore
          name: true,
          notes: true,
          allDay: true,
          startTime: true,
          endTime: true,
          timezone: true,
          locationId: true,
          costExpense: { select: costExpenseSelect },
          url: true,
          confirmationNumber: true,
          // The type travels by name, not id — see BackupCustomItemSchema.
          type: { select: { name: true } },
        },
      },
      expenses: {
        select: {
          id: true,
          description: true,
          category: true,
          amount: true,
          currency: true,
          exchangeRate: true,
          baseAmount: true,
          baseCurrency: true,
          date: true,
          notes: true,
          // The booking this expense is the cost of (null for an ordinary expense)
          activityId: true,
          transportationId: true,
          lodgingId: true,
          customItemId: true,
          splitMethod: true,
          paidByCompanion: { select: expenseCompanionSelect },
          splits: {
            orderBy: { id: 'asc' },
            select: {
              amount: true,
              percentage: true,
              companion: { select: expenseCompanionSelect },
            },
          },
          receiptPath: true,
          receiptMimeType: true,
          receiptSizeBytes: true,
          receiptUploadedAt: true,
        },
      },
      emergencyInfo: {
        select: {
          insuranceProvider: true,
          insurancePolicyNumber: true,
          insuranceAssistancePhone: true,
          embassyName: true,
          embassyPhone: true,
          embassyAddress: true,
          notes: true,
        },
      },
    },
  });

  if (!trip) {
    return null;
  }

  // Fetch photos in batches to prevent memory issues for trips with many photos
  const photos = await fetchPhotosInBatches(tripId);

  return {
    ...trip,
    photos,
  };
}

/**
 * Create a complete backup of all user data.
 *
 * CHUNKED APPROACH TO PREVENT OUT-OF-MEMORY ERRORS:
 * -------------------------------------------------
 * Instead of loading all trips with deeply nested data in a single query,
 * this function uses a batched approach:
 *
 * 1. User data, tags, companions, etc. are loaded first (these are typically small)
 * 2. Trip IDs are fetched in batches using cursor-based pagination
 * 3. Each trip's related data is loaded individually
 * 4. Photos (the largest dataset) are loaded in separate batches per trip
 *
 * This ensures memory usage stays bounded regardless of how much data the user has.
 * The tradeoff is more database queries, but this is acceptable for a backup operation.
 */
export async function createBackup(userId: number): Promise<BackupData> {
  try {
    // Fetch user data (small, constant size)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        email: true,
        timezone: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const preferences = await getUserPreferences(userId);
    const integrations = await getUserIntegrations(userId);

    // Fetch tags (typically small, bounded by user behavior)
    const tags = await prisma.tripTag.findMany({
      where: { userId },
      select: {
        name: true,
        color: true,
        textColor: true,
      },
    });

    // Fetch companions (typically small, bounded by user behavior)
    const companions = await prisma.travelCompanion.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
      select: {
        name: true,
        email: true,
        phone: true,
        notes: true,
        relationship: true,
        isMyself: true,
        avatarUrl: true,
        dietaryPreferences: true,
        medicalNotes: true,
        allergies: true,
      },
    });

    // Fetch custom location categories (typically small)
    const locationCategories = await prisma.locationCategory.findMany({
      where: { userId },
      select: {
        name: true,
        icon: true,
        color: true,
        isDefault: true,
      },
    });

    // Fetch the custom item type registry (typically small). isDefault is
    // deliberately not exported: it is provenance only, and round-tripping it
    // is what freezes restored location categories.
    const customItemTypes = await prisma.customItemType.findMany({
      where: { userId },
      select: {
        name: true,
        icon: true,
        color: true,
      },
    });

    // Fetch global checklists (not trip-specific, typically small)
    const checklists = await prisma.checklist.findMany({
      where: {
        userId,
        tripId: null, // Only global checklists
      },
      include: {
        items: {
          select: {
            name: true,
            description: true,
            isChecked: true,
            isDefault: true,
            sortOrder: true,
            metadata: true,
            checkedAt: true,
          },
        },
      },
    });

    // Fetch loyalty programs (typically small)
    const loyaltyPrograms = await prisma.loyaltyProgram.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
    });

    // Fetch travel documents (typically small)
    const travelDocuments = await prisma.travelDocument.findMany({
      where: { userId },
      select: {
        type: true,
        issuingCountry: true,
        issuingCountryCode: true,
        documentNumber: true,
        issueDate: true,
        expiryDate: true,
        name: true,
        notes: true,
        isPrimary: true,
        alertDaysBefore: true,
      },
    });

    // Fetch trip series
    const tripSeries = await prisma.tripSeries.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });

    // Fetch unfiled saved links (inbox links where tripId is null)
    const unfiledSavedLinks = await prisma.savedLink.findMany({
      where: { userId, tripId: null },
      select: {
        url: true,
        title: true,
        description: true,
        siteName: true,
        imageUrl: true,
        notes: true,
        source: true,
        metadataStatus: true,
      },
    });

    // =========================================================================
    // CHUNKED TRIP LOADING
    // =========================================================================
    // Fetch trips in batches using cursor-based pagination to prevent OOM.
    // We first get just the trip IDs, then load each trip's full data separately.
    // This bounds memory usage to TRIP_BATCH_SIZE trips at a time.
    // =========================================================================

    const allTransformedTrips: BackupTrip[] = [];
    let tripCursor: number | undefined = undefined;

    while (true) {
      // Fetch a batch of trip IDs only (minimal memory footprint)
      const tripBatch: { id: number }[] = await prisma.trip.findMany({
        where: { userId },
        select: { id: true },
        take: TRIP_BATCH_SIZE,
        ...(tripCursor ? { skip: 1, cursor: { id: tripCursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (tripBatch.length === 0) {
        break;
      }

      // Process each trip in this batch individually
      // This ensures we only hold one trip's full data in memory at a time
      for (const { id: tripId } of tripBatch) {
        const tripWithData = await fetchTripWithRelatedData(tripId);
        if (tripWithData) {
          // Transform and add to results immediately
          // The original trip data can be garbage collected after transformation
          allTransformedTrips.push(transformTripToBackupFormat(tripWithData));
        }
      }

      // Update cursor for next batch
      tripCursor = tripBatch[tripBatch.length - 1].id;

      // If we got fewer than the batch size, we've reached the end
      if (tripBatch.length < TRIP_BATCH_SIZE) {
        break;
      }
    }

    // Build backup data with the pre-transformed trips.
    // SECURITY: Secret fields (API keys, SMTP password) are masked to null in the
    // exported JSON. The DB-fetched values are intentionally discarded here so they
    // never reach disk. Restore handles null by preserving the user's existing keys.
    const sanitizedUser: BackupData['user'] = {
      username: user.username,
      email: user.email,
      timezone: user.timezone,
      activityCategories: preferences.activityCategories as BackupData['user']['activityCategories'],
      tripTypes: preferences.tripTypes as BackupData['user']['tripTypes'],
      dietaryPreferences: (preferences.dietaryPreferences as string[]) ?? [],
      useCustomMapStyle: preferences.useCustomMapStyle,
      baseCurrency: preferences.baseCurrency,
      measurementSystem:
        preferences.measurementSystem === 'imperial' || preferences.measurementSystem === 'metric'
          ? preferences.measurementSystem
          : null,
      preferredMapsApp: preferences.preferredMapsApp,
      immichApiUrl: integrations.immichApiUrl,
      immichApiKey: null,
      weatherApiKey: null,
      aviationstackApiKey: null,
      openrouteserviceApiKey: null,
      llmApiKey: null,
      llmBaseUrl: integrations.llmBaseUrl,
      llmModel: integrations.llmModel,
      smtpPassword: null,
    };

    const backupData: BackupData = {
      version: BACKUP_VERSION,
      exportDate: new Date().toISOString(),
      user: sanitizedUser,
      tags,
      companions: companions.map((c) => ({
        ...c,
        dietaryPreferences: (c.dietaryPreferences as string[]) ?? [],
        allergies: (c.allergies as string[]) ?? [],
      })),
      locationCategories,
      customItemTypes,
      checklists: checklists.map((checklist) => ({
        name: checklist.name,
        description: checklist.description,
        type: checklist.type,
        isDefault: checklist.isDefault,
        sortOrder: checklist.sortOrder,
        items: checklist.items,
      })),
      // Trip series
      tripSeries: tripSeries.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      })),
      // Loyalty programs. Unlike travel documents the membership number is kept in full:
      // a backup with it masked could not restore the programs or the booking links.
      // `id` lets bookings (loyaltyProgramId) be re-linked on restore.
      loyaltyPrograms: loyaltyPrograms.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        providerName: p.providerName,
        providerCode: p.providerCode,
        alliance: p.alliance,
        aliases: p.aliases,
        membershipNumber: p.membershipNumber,
        tier: p.tier,
        pointsBalance: p.pointsBalance,
        notes: p.notes,
      })),
      // Travel documents with masked document numbers for security
      travelDocuments: travelDocuments.map((doc) => ({
        type: doc.type,
        issuingCountry: doc.issuingCountry,
        issuingCountryCode: doc.issuingCountryCode,
        // Mask document number: show only last 4 characters
        documentNumber: maskDocumentNumber(doc.documentNumber),
        issueDate: doc.issueDate,
        expiryDate: doc.expiryDate,
        name: doc.name,
        notes: doc.notes,
        isPrimary: doc.isPrimary,
        alertDaysBefore: doc.alertDaysBefore,
      })),
      // Unfiled saved links (inbox links where tripId is null)
      unfiledSavedLinks,
      // Trips are already transformed during chunked loading above
      trips: allTransformedTrips,
    };

    return backupData;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error creating backup:', error);
    throw new AppError(
      `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      { cause: error }
    );
  }
}

export default {
  createBackup,
};
