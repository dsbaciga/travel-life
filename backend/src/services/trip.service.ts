import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { CreateTripInput, UpdateTripInput, GetTripQuery, TripStatus, DuplicateTripInput } from '../types/trip.types';
import { companionService } from './companion.service';
import { tripCoverImageService } from './tripCoverImage.service';
import { toSafePermissionLevel } from '../services/_shared/tripPermissions';
import { buildConditionalUpdateData, tripDateTransformer } from '../services/_shared/prismaUpdateData';
import { convertDecimals } from '../services/_shared/decimalConversion';
import { resolveTimezone } from '../services/_shared/timezoneResolution';
import { compareTripsForList } from '../services/_shared/tripListOrder';

/**
 * Maps each source row to a *distinct* copy, matching on a composite key.
 *
 * Used by duplicateTrip for entities inserted with createMany() and read back afterwards.
 * A plain `find` is not enough: it returns the first match and marks nothing as used, so two
 * source rows sharing a key (two flights with no reference number, two identical lodgings,
 * two checklists with the same name and type) would both map to the same copy and the second
 * copy would get no mapping at all — silently corrupting the EntityLinks rebuilt from these
 * maps. Each candidate is consumed on match, so every old ID maps to its own new ID.
 */
function mapCopiesByCompositeKey<TOld extends { id: number }, TNew extends { id: number }>(
  target: Map<number, number>,
  oldRecords: readonly TOld[],
  newRecords: readonly TNew[],
  keyOf: (record: TOld | TNew) => string
): void {
  const unclaimed = [...newRecords];

  for (const oldRecord of oldRecords) {
    const key = keyOf(oldRecord);
    const index = unclaimed.findIndex((candidate) => keyOf(candidate) === key);
    if (index !== -1) {
      target.set(oldRecord.id, unclaimed[index].id);
      unclaimed.splice(index, 1);
    }
  }
}

export class TripService {
  /**
   * Verifies a series belongs to the caller before a trip is attached to it.
   *
   * Series are user-scoped, but nothing else on the trip write paths checks that: without
   * this, a user could set their own trip's seriesId to a victim's series, where
   * tripSeries.getById/getAll would render it (they select trips by seriesId alone) and the
   * victim's seriesOrder normalisation would be corrupted. The dedicated series endpoints
   * already perform the equivalent check.
   */
  private async verifySeriesOwnership(userId: number, seriesId: number): Promise<void> {
    const series = await prisma.tripSeries.findFirst({
      where: { id: seriesId, userId },
    });

    if (!series) {
      throw new AppError('Trip series not found or you do not have permission to use it', 404);
    }
  }

  async createTrip(userId: number, data: CreateTripInput) {
    // Auto-set addToPlacesVisited if status is Completed
    const addToPlacesVisited = data.status === TripStatus.COMPLETED
      ? true
      : data.addToPlacesVisited || false;

    // Get user's timezone and travel partner settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        timezone: true,
        travelPartnerId: true,
        defaultPartnerPermission: true,
      },
    });

    const timezone = resolveTimezone(data.timezone, user?.timezone);

    // createTripSchema accepts seriesId, so it has to be verified and actually written —
    // it was previously validated and then silently dropped.
    if (data.seriesId != null) {
      await this.verifySeriesOwnership(userId, data.seriesId);
    }

    // Pre-fetch "Myself" companion outside transaction (read-only)
    const myselfCompanion = await companionService.getMyselfCompanion(userId);

    // Wrap all writes in a transaction for atomicity
    const trip = await prisma.$transaction(async (tx) => {
      const newTrip = await tx.trip.create({
        data: {
          userId,
          title: data.title,
          description: data.description,
          startDate: data.startDate ? new Date(data.startDate + 'T00:00:00.000Z') : null,
          endDate: data.endDate ? new Date(data.endDate + 'T00:00:00.000Z') : null,
          timezone,
          status: data.status,
          privacyLevel: data.privacyLevel,
          addToPlacesVisited,
          excludeFromAutoShare: data.excludeFromAutoShare || false,
          seriesId: data.seriesId ?? null,
          tripType: data.tripType || null,
          tripTypeEmoji: data.tripTypeEmoji || null,
        },
      });

      // Auto-add "Myself" companion to new trips
      if (myselfCompanion) {
        await tx.tripCompanion.create({
          data: {
            tripId: newTrip.id,
            companionId: myselfCompanion.id,
          },
        });
      }

      // Auto-add travel partner as collaborator (if set and not excluded)
      if (user?.travelPartnerId && !data.excludeFromAutoShare) {
        await tx.tripCollaborator.create({
          data: {
            tripId: newTrip.id,
            userId: user.travelPartnerId,
            permissionLevel: toSafePermissionLevel(user.defaultPartnerPermission, 'edit'),
          },
        });
      }

      return newTrip;
    });

    return convertDecimals(trip);
  }

  async getTrips(userId: number, query: GetTripQuery) {
    // page/limit are validated and bounded by getTripQuerySchema
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortOption = query.sort || 'startDate-desc';

    const where: Prisma.TripWhereInput = { userId };

    // Filter by archived state (excluded by default; 'true' shows only archived, 'all' shows both)
    if (query.archived === 'true') {
      where.archived = true;
    } else if (query.archived !== 'all') {
      where.archived = false;
    }

    // Filter by status (supports comma-separated multiple values)
    if (query.status) {
      const statuses = query.status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where.status = statuses[0];
      } else if (statuses.length > 1) {
        where.status = { in: statuses };
      }
    }

    // Search in title and description
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Filter by date range
    if (query.startDateFrom || query.startDateTo) {
      const startDateFilter: Prisma.DateTimeNullableFilter = {};
      if (query.startDateFrom) {
        startDateFilter.gte = new Date(query.startDateFrom + 'T00:00:00.000Z');
      }
      if (query.startDateTo) {
        startDateFilter.lte = new Date(query.startDateTo + 'T23:59:59.999Z');
      }
      where.startDate = startDateFilter;
    }

    // Filter by trip type (supports comma-separated multiple values)
    if (query.tripType) {
      const types = query.tripType.split(',').map(t => t.trim()).filter(Boolean);
      if (types.length === 1) {
        where.tripType = types[0];
      } else if (types.length > 1) {
        where.tripType = { in: types };
      }
    }

    // Filter by series
    if (query.seriesId) {
      where.seriesId = query.seriesId;
    }

    // Filter by tags
    if (query.tags) {
      const tagIds = query.tags.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (tagIds.length > 0) {
        where.tagAssignments = {
          some: {
            tagId: { in: tagIds }
          }
        };
      }
    }

    // What a list row carries besides the trip itself.
    const include = {
      coverPhoto: true,
      series: {
        select: { id: true, name: true },
      },
      tagAssignments: {
        include: {
          tag: true,
        },
      },
      _count: {
        select: {
          locations: true,
          photos: true,
          transportation: true,
          activities: true,
          lodging: true,
          journalEntries: true,
        },
      },
    } satisfies Prisma.TripInclude;

    // Date and status sorts put open trips (Dream, Planning, Planned, In Progress)
    // ahead of Completed and Cancelled ones whatever their dates, so an undated
    // Planning trip is never buried under finished ones. SQL can only order a
    // status alphabetically, so these sort in memory: read the few columns that
    // decide the order, sort, page, then load full rows for just that page.
    if (sortOption === 'startDate-desc' || sortOption === 'startDate-asc' || sortOption === 'status') {
      const candidates = await prisma.trip.findMany({
        where,
        select: { id: true, status: true, startDate: true, createdAt: true },
      });
      candidates.sort(compareTripsForList(sortOption));

      const total = candidates.length;
      const pageIds = candidates.slice(skip, skip + limit).map((trip) => trip.id);
      const rows = pageIds.length > 0 ? await prisma.trip.findMany({ where: { id: { in: pageIds } }, include }) : [];
      const byId = new Map(rows.map((row) => [row.id, row]));
      const trips = pageIds.map((id) => byId.get(id)).filter((trip): trip is NonNullable<typeof trip> => trip !== undefined);

      return {
        trips: trips.map((trip) => convertDecimals(trip)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    // Title sorts have no status grouping: database-level sorting and pagination.
    const orderBy: Prisma.TripOrderByWithRelationInput[] =
      sortOption === 'title-desc' ? [{ title: 'desc' }] : [{ title: 'asc' }];

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({ where, orderBy, skip, take: limit, include }),
      prisma.trip.count({ where }),
    ]);

    return {
      trips: trips.map((trip) => convertDecimals(trip)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Auto-update status for all trips in the system that have dates
   * Does not update trips that are Completed or Cancelled
   */
  async autoUpdateGlobalTripStatuses() {
    const BATCH_SIZE = 500;
    let totalUpdated = 0;
    let hasMore = true;
    let cursor: number | undefined;

    // Trip dates are stored as UTC midnight (see tripDateTransformer), so "today" and the
    // trip bounds must both be normalised in UTC. setHours() would use the server process's
    // local timezone and shift the day boundary on any non-UTC deployment.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    while (hasMore) {
      const trips = await prisma.trip.findMany({
        where: {
          startDate: { not: null },
          endDate: { not: null },
          status: {
            notIn: [TripStatus.COMPLETED, TripStatus.CANCELLED],
          },
        },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
        },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      hasMore = trips.length === BATCH_SIZE;
      if (trips.length > 0) {
        cursor = trips[trips.length - 1].id;
      }

      // Collect IDs grouped by target status for batch updates
      const toComplete: number[] = [];
      const toInProgress: number[] = [];

      for (const trip of trips) {
        if (!trip.startDate || !trip.endDate) continue;

        const startDate = new Date(trip.startDate);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(trip.endDate);
        endDate.setUTCHours(0, 0, 0, 0);

        // If today is after end date, mark as Completed
        if (today > endDate && trip.status !== TripStatus.COMPLETED) {
          toComplete.push(trip.id);
        }
        // If today is within trip dates (inclusive), mark as In Progress
        else if (today >= startDate && today <= endDate && trip.status !== TripStatus.IN_PROGRESS) {
          toInProgress.push(trip.id);
        }
      }

      // Batch updates using updateMany instead of individual updates
      // Note: Prisma's @updatedAt doesn't auto-update with updateMany, so we set it manually
      const now = new Date();
      if (toComplete.length > 0) {
        await prisma.trip.updateMany({
          where: { id: { in: toComplete } },
          data: { status: TripStatus.COMPLETED, addToPlacesVisited: true, updatedAt: now },
        });
      }

      if (toInProgress.length > 0) {
        await prisma.trip.updateMany({
          where: { id: { in: toInProgress } },
          data: { status: TripStatus.IN_PROGRESS, updatedAt: now },
        });
      }

      totalUpdated += toComplete.length + toInProgress.length;
    }

    return totalUpdated;
  }

  async getTripById(userId: number, tripId: number) {
    const trip = await prisma.trip.findFirst({
      // `privacyLevel: 'Public'` deliberately grants nothing here.
      //
      // It used to let any authenticated user read any trip marked Public. Trip
      // IDs are sequential, so that made every Public trip enumerable by every
      // registered account. The child data (expenses, lodging confirmation
      // numbers, transportation booking references) was already closed off in
      // verifyTripAccessWithPermission; this closes the trip row itself.
      //
      // Public sharing belongs exclusively to the token-based share path, which
      // serves a sanitised payload built field-by-field in share.service.ts.
      where: {
        id: tripId,
        OR: [
          { userId },
          {
            collaborators: {
              some: { userId },
            },
          },
        ],
      },
      include: {
        coverPhoto: true,
        bannerPhoto: true,
        series: {
          select: { id: true, name: true },
        },
        tagAssignments: {
          include: {
            tag: true,
          },
        },
        companionAssignments: {
          include: {
            companion: true,
          },
        },
      },
    });

    if (!trip) {
      throw new AppError('Trip not found', 404);
    }

    // The share token is a secret capability — only the owner may see it.
    // Collaborators and viewers of Public-privacy trips get null.
    if (trip.userId !== userId) {
      trip.shareToken = null;
    }

    return convertDecimals(trip);
  }

  async updateTrip(userId: number, tripId: number, data: UpdateTripInput) {
    // Verify ownership
    const existingTrip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!existingTrip) {
      throw new AppError('Trip not found or you do not have permission to edit it', 404);
    }

    // A null seriesId detaches the trip from its series and needs no check; any other value
    // must be a series the caller owns.
    if (data.seriesId != null) {
      await this.verifySeriesOwnership(userId, data.seriesId);
    }

    // Auto-set addToPlacesVisited if status changed to Completed
    let addToPlacesVisited = data.addToPlacesVisited;
    if (data.status === TripStatus.COMPLETED && addToPlacesVisited === undefined) {
      addToPlacesVisited = true;
    }

    const updateData = buildConditionalUpdateData(
      { ...data, addToPlacesVisited },
      {
        transformers: {
          startDate: tripDateTransformer,
          endDate: tripDateTransformer,
        },
      }
    );

    const trip = await prisma.trip.update({
      where: { id: tripId },
      data: updateData,
    });

    return convertDecimals(trip);
  }

  async deleteTrip(userId: number, tripId: number) {
    // Verify ownership
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      throw new AppError('Trip not found or you do not have permission to delete it', 404);
    }

    await prisma.trip.delete({
      where: { id: tripId },
    });

    // Uploaded cover images live outside the photos table, so nothing else cleans them up
    await tripCoverImageService.deleteCoverFilesForPaths([
      trip.coverImagePath,
      trip.coverImageThumbnailPath,
    ]);

    return { message: 'Trip deleted successfully' };
  }

  async updateCoverPhoto(userId: number, tripId: number, photoId: number | null) {
    // Verify ownership
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
    });

    if (!trip) {
      throw new AppError('Trip not found or you do not have permission to edit it', 404);
    }

    // If photoId is provided, verify the photo belongs to this trip
    if (photoId) {
      const photo = await prisma.photo.findFirst({
        where: { id: photoId, tripId },
      });

      if (!photo) {
        throw new AppError('Photo not found or does not belong to this trip', 404);
      }
    }

    // A gallery photo replaces any uploaded cover image (and vice versa) — the two are
    // mutually exclusive, so clear the upload and delete its files.
    const previousUpload = [trip.coverImagePath, trip.coverImageThumbnailPath];

    const updatedTrip = await prisma.trip.update({
      where: { id: tripId },
      data: {
        coverPhotoId: photoId,
        ...(photoId ? { coverImagePath: null, coverImageThumbnailPath: null } : {}),
      },
      include: {
        coverPhoto: true,
      },
    });

    if (photoId) {
      await tripCoverImageService.deleteCoverFilesForPaths(previousUpload);
    }

    return convertDecimals(updatedTrip);
  }

  /**
   * Duplicates a trip with all its entities while maintaining relationships.
   *
   * ID MAPPING STRATEGY:
   * Relationships (photo-location links, parent-child hierarchies, album membership) are
   * preserved by mapping each source entity's ID to its copy. Two approaches are used:
   *
   * 1. Sequential create() — locations, photos and activities are inserted one at a time
   *    so each new ID maps directly to its source. These are the entities other records
   *    point at, so the mapping has to be exact; duplicate names or coordinates within a
   *    trip would defeat any key-matching scheme.
   *
   * 2. Bulk createMany() + composite-key match — for entities nothing else references by
   *    ID, rows are inserted in one statement and queried back, matching on a composite
   *    key. Single fields like name are not enough: a trip may hold several lodgings
   *    called "Airport Hotel", and matching on name alone would collapse them into one
   *    mapping. Keys per entity:
   *      - Lodging: name + address + confirmationNumber
   *      - Journal entries: title + entryType + content prefix (50 chars)
   *      - Albums: name + description prefix (50 chars)
   *      - Checklists: name + type + description prefix (50 chars)
   *
   * Albums and checklists are read by their own queries rather than the trip include,
   * because they are the only relations whose nested children get copied too.
   */
  async duplicateTrip(userId: number, sourceTripId: number, data: DuplicateTripInput) {
    // Verify ownership of source trip
    const sourceTrip = await prisma.trip.findFirst({
      where: { id: sourceTripId, userId },
      include: {
        tagAssignments: data.copyEntities?.tags ? true : false,
        companionAssignments: data.copyEntities?.companions ? true : false,
        locations: data.copyEntities?.locations ? true : false,
        photos: data.copyEntities?.photos ? true : false,
        // Note: Activity and Lodging locations are handled via EntityLink system (copied separately)
        activities: data.copyEntities?.activities ? true : false,
        transportation: data.copyEntities?.transportation ? true : false,
        lodging: data.copyEntities?.lodging ? true : false,
        journalEntries: data.copyEntities?.journalEntries ? true : false,
      },
    });

    if (!sourceTrip) {
      throw new AppError('Trip not found or you do not have permission to duplicate it', 404);
    }

    // Albums and checklists are loaded separately because they are the only relations
    // whose *nested* children are copied. A conditional include (`cond ? {...} : false`)
    // widens to `boolean`, which drops the nested shape from Prisma's inferred type;
    // these static queries keep `photoAssignments` and `items` fully typed.
    const sourceAlbums = data.copyEntities?.photoAlbums
      ? await prisma.photoAlbum.findMany({
          where: { tripId: sourceTripId },
          include: { photoAssignments: true },
        })
      : [];

    const sourceChecklists = data.copyEntities?.checklists
      ? await prisma.checklist.findMany({
          where: { tripId: sourceTripId },
          include: { items: true },
        })
      : [];

    // Get user's timezone for new trip
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = resolveTimezone(sourceTrip.timezone, user?.timezone);

    // Pre-fetch "Myself" companion outside transaction (read-only)
    const myselfCompanion = await companionService.getMyselfCompanion(userId);

    // Wrap all writes in a transaction for atomicity - failure mid-way rolls back everything
    const newTripId = await prisma.$transaction(async (tx) => {

    // Create new trip with basic info (no dates, status = Dream)
    const newTrip = await tx.trip.create({
      data: {
        userId,
        title: data.title,
        description: sourceTrip.description,
        timezone,
        status: TripStatus.DREAM,
        privacyLevel: sourceTrip.privacyLevel,
        addToPlacesVisited: false,
        tripType: sourceTrip.tripType,
        tripTypeEmoji: sourceTrip.tripTypeEmoji,
        // Don't copy seriesId/seriesOrder - duplicated trip should be independent
      },
    });

    // Maps to track old ID -> new ID for maintaining relationships
    const locationIdMap = new Map<number, number>();
    const photoIdMap = new Map<number, number>();
    const activityIdMap = new Map<number, number>();
    const transportationIdMap = new Map<number, number>();
    const lodgingIdMap = new Map<number, number>();
    const journalIdMap = new Map<number, number>();
    const albumIdMap = new Map<number, number>();

    // Copy locations (with parent-child hierarchy)
    // Uses sequential create to get reliable ID mapping (avoids composite key collisions
    // when multiple locations share the same name + coordinates)
    if (data.copyEntities?.locations && sourceTrip.locations && Array.isArray(sourceTrip.locations)) {
      const locations = sourceTrip.locations;
      // First pass: locations without parent references
      const locationsWithoutParent = locations.filter((loc) => !loc.parentId);
      for (const location of locationsWithoutParent) {
        const newLocation = await tx.location.create({
          data: {
            tripId: newTrip.id,
            name: location.name,
            address: location.address,
            latitude: location.latitude,
            longitude: location.longitude,
            categoryId: location.categoryId,
            visitDatetime: null,
            visitDurationMinutes: location.visitDurationMinutes,
            notes: location.notes,
            // Opening hours and timezone describe the place itself, not the trip, so they
            // carry over to the copy unchanged.
            openingHours: location.openingHours,
            openingHoursSource: location.openingHoursSource,
            timezone: location.timezone,
          },
        });
        locationIdMap.set(location.id, newLocation.id);
      }

      // Second pass: child locations need parent FK resolved from the map
      const locationsWithParent = locations.filter((loc) => loc.parentId !== null);
      for (const location of locationsWithParent) {
        const newParentId = location.parentId !== null ? locationIdMap.get(location.parentId) : undefined;
        const newLocation = await tx.location.create({
          data: {
            tripId: newTrip.id,
            parentId: newParentId || null,
            name: location.name,
            address: location.address,
            latitude: location.latitude,
            longitude: location.longitude,
            categoryId: location.categoryId,
            visitDatetime: null,
            visitDurationMinutes: location.visitDurationMinutes,
            notes: location.notes,
            // Opening hours and timezone describe the place itself, not the trip, so they
            // carry over to the copy unchanged.
            openingHours: location.openingHours,
            openingHoursSource: location.openingHoursSource,
            timezone: location.timezone,
          },
        });
        locationIdMap.set(location.id, newLocation.id);
      }
    }

    // Copy photos sequentially to get deterministic ID mapping
    if (data.copyEntities?.photos && sourceTrip.photos && Array.isArray(sourceTrip.photos)) {
      const photos = sourceTrip.photos;
      for (const photo of photos) {
        const newPhoto = await tx.photo.create({
          data: {
            tripId: newTrip.id,
            source: photo.source,
            immichAssetId: photo.immichAssetId,
            localPath: photo.localPath,
            thumbnailPath: photo.thumbnailPath,
            caption: photo.caption,
            latitude: photo.latitude,
            longitude: photo.longitude,
            takenAt: photo.takenAt,
          },
        });
        photoIdMap.set(photo.id, newPhoto.id);
      }
    }

    // Copy activities (with parent-child hierarchy)
    if (data.copyEntities?.activities && sourceTrip.activities && Array.isArray(sourceTrip.activities)) {
      const activities = sourceTrip.activities;
      // First pass: create activities without parent sequentially for deterministic ID mapping
      const activitiesWithoutParent = activities.filter((act) => !act.parentId);
      for (const activity of activitiesWithoutParent) {
        const newActivity = await tx.activity.create({
          data: {
            tripId: newTrip.id,
            name: activity.name,
            description: activity.description,
            category: activity.category,
            allDay: activity.allDay,
            startTime: null,
            endTime: null,
            timezone: activity.timezone,
            cost: activity.cost,
            currency: activity.currency,
            bookingUrl: activity.bookingUrl,
            bookingReference: activity.bookingReference,
            notes: activity.notes,
            manualOrder: activity.manualOrder,
          },
        });
        activityIdMap.set(activity.id, newActivity.id);
      }

      // Second pass: child activities need sequential creation due to parent FK
      const activitiesWithParent = activities.filter((act) => act.parentId !== null);
      for (const activity of activitiesWithParent) {
        const newParentId = activity.parentId !== null ? activityIdMap.get(activity.parentId) : undefined;
        const newActivity = await tx.activity.create({
          data: {
            tripId: newTrip.id,
            parentId: newParentId || null,
            name: activity.name,
            description: activity.description,
            category: activity.category,
            allDay: activity.allDay,
            startTime: null,
            endTime: null,
            timezone: activity.timezone,
            cost: activity.cost,
            currency: activity.currency,
            bookingUrl: activity.bookingUrl,
            bookingReference: activity.bookingReference,
            notes: activity.notes,
            manualOrder: activity.manualOrder,
          },
        });
        activityIdMap.set(activity.id, newActivity.id);
      }
    }

    // Copy transportation using bulk insert
    if (data.copyEntities?.transportation && sourceTrip.transportation && Array.isArray(sourceTrip.transportation)) {
      const transportations = sourceTrip.transportation;
      if (transportations.length > 0) {
        await tx.transportation.createMany({
          data: transportations.map((transport) => ({
            tripId: newTrip.id,
            type: transport.type,
            startLocationId: transport.startLocationId ? locationIdMap.get(transport.startLocationId) || null : null,
            startLocationText: transport.startLocationText,
            endLocationId: transport.endLocationId ? locationIdMap.get(transport.endLocationId) || null : null,
            endLocationText: transport.endLocationText,
            scheduledStart: null,
            scheduledEnd: null,
            startTimezone: transport.startTimezone,
            endTimezone: transport.endTimezone,
            actualStart: null,
            actualEnd: null,
            company: transport.company,
            referenceNumber: transport.referenceNumber,
            seatNumber: transport.seatNumber,
            bookingReference: transport.bookingReference,
            bookingUrl: transport.bookingUrl,
            cost: transport.cost,
            currency: transport.currency,
            status: 'on_time',
            delayMinutes: null,
            notes: transport.notes,
            connectionGroupId: transport.connectionGroupId,
            isAutoGenerated: transport.isAutoGenerated,
            calculatedDistance: transport.calculatedDistance,
            calculatedDuration: transport.calculatedDuration,
            distanceSource: transport.distanceSource,
          })),
        });
        // Query back and build ID map using type + referenceNumber + company as identifier
        const newTransports = await tx.transportation.findMany({
          where: { tripId: newTrip.id },
          select: { id: true, type: true, referenceNumber: true, company: true, startLocationText: true },
        });
        // JSON.stringify keeps null distinct from '' (the previous strict-equality match did)
        const buildTransportKey = (t: {
          type: string;
          referenceNumber: string | null;
          company: string | null;
          startLocationText: string | null;
        }) => JSON.stringify([t.type, t.referenceNumber, t.company, t.startLocationText]);
        mapCopiesByCompositeKey(transportationIdMap, transportations, newTransports, buildTransportKey);
      }
    }

    // Copy lodging using bulk insert
    if (data.copyEntities?.lodging && sourceTrip.lodging && Array.isArray(sourceTrip.lodging)) {
      const lodgings = sourceTrip.lodging;
      if (lodgings.length > 0) {
        await tx.lodging.createMany({
          data: lodgings.map((lodging) => ({
            tripId: newTrip.id,
            type: lodging.type,
            name: lodging.name,
            address: lodging.address,
            checkInDate: new Date(),
            checkOutDate: new Date(),
            timezone: lodging.timezone,
            confirmationNumber: lodging.confirmationNumber,
            bookingUrl: lodging.bookingUrl,
            cost: lodging.cost,
            currency: lodging.currency,
            notes: lodging.notes,
          })),
        });
        // Query back and build ID map using composite key for uniqueness
        // Note: Using name + address + confirmationNumber to handle duplicate names
        // (e.g., staying at same hotel chain in different cities)
        const newLodgings = await tx.lodging.findMany({
          where: { tripId: newTrip.id },
          select: { id: true, name: true, address: true, confirmationNumber: true },
        });
        const buildLodgingKey = (l: { name: string; address: string | null; confirmationNumber: string | null }) =>
          `${l.name}|${l.address ?? ''}|${l.confirmationNumber ?? ''}`;
        mapCopiesByCompositeKey(lodgingIdMap, lodgings, newLodgings, buildLodgingKey);
      }
    }

    // Copy journal entries using bulk insert
    if (data.copyEntities?.journalEntries && sourceTrip.journalEntries && Array.isArray(sourceTrip.journalEntries)) {
      const journals = sourceTrip.journalEntries;
      if (journals.length > 0) {
        await tx.journalEntry.createMany({
          data: journals.map((journal) => ({
            tripId: newTrip.id,
            date: null,
            title: journal.title,
            content: journal.content,
            entryType: journal.entryType,
            mood: journal.mood,
            weatherNotes: journal.weatherNotes,
          })),
        });
        // Query back and build ID map using composite key for uniqueness
        // Note: Using title + entryType + content prefix to handle duplicate titles
        // (e.g., multiple journal entries titled "Day 1" with different content)
        const newJournals = await tx.journalEntry.findMany({
          where: { tripId: newTrip.id },
          select: { id: true, title: true, entryType: true, content: true },
        });
        const buildJournalKey = (j: { title: string | null; entryType: string; content: string | null }) =>
          `${j.title ?? ''}|${j.entryType}|${(j.content ?? '').slice(0, 50)}`;
        mapCopiesByCompositeKey(journalIdMap, journals, newJournals, buildJournalKey);
      }
    }

    // Copy photo albums (need to process individually for photo assignments, but bulk insert assignments)
    if (data.copyEntities?.photoAlbums) {
      const albums = sourceAlbums;
      if (albums.length > 0) {
        // Create albums without cover photos first
        await tx.photoAlbum.createMany({
          data: albums.map((album) => ({
            tripId: newTrip.id,
            name: album.name,
            description: album.description,
            coverPhotoId: null, // Set later after we have the mapping
          })),
        });
        // Query back and build ID map using composite key for uniqueness
        // Note: Using name + description prefix to handle duplicate album names
        const newAlbums = await tx.photoAlbum.findMany({
          where: { tripId: newTrip.id },
          select: { id: true, name: true, description: true },
        });
        const buildAlbumKey = (a: { name: string; description: string | null }) =>
          `${a.name}|${(a.description ?? '').slice(0, 50)}`;
        mapCopiesByCompositeKey(albumIdMap, albums, newAlbums, buildAlbumKey);

        // Update cover photos now that we have mappings
        const coverPhotoUpdates = albums
          .filter((album) => album.coverPhotoId !== null && photoIdMap.get(album.coverPhotoId))
          .map((album) => {
            const newAlbumId = albumIdMap.get(album.id);
            const newCoverPhotoId = album.coverPhotoId !== null ? photoIdMap.get(album.coverPhotoId) : undefined;
            if (newAlbumId && newCoverPhotoId) {
              return tx.photoAlbum.update({
                where: { id: newAlbumId },
                data: { coverPhotoId: newCoverPhotoId },
              });
            }
            return null;
          })
          .filter((update): update is NonNullable<typeof update> => update !== null);
        if (coverPhotoUpdates.length > 0) {
          await Promise.all(coverPhotoUpdates);
        }

        // Bulk insert photo album assignments
        const allAssignments: Prisma.PhotoAlbumAssignmentCreateManyInput[] = [];
        for (const album of albums) {
          const newAlbumId = albumIdMap.get(album.id);
          if (newAlbumId && album.photoAssignments && Array.isArray(album.photoAssignments)) {
            for (const assignment of album.photoAssignments) {
              const newPhotoId = photoIdMap.get(assignment.photoId);
              if (newPhotoId) {
                allAssignments.push({
                  albumId: newAlbumId,
                  photoId: newPhotoId,
                  sortOrder: assignment.sortOrder,
                });
              }
            }
          }
        }
        if (allAssignments.length > 0) {
          await tx.photoAlbumAssignment.createMany({ data: allAssignments });
        }
      }
    }

    // Copy tags using bulk insert
    if (data.copyEntities?.tags && sourceTrip.tagAssignments && Array.isArray(sourceTrip.tagAssignments)) {
      const tagAssignments = sourceTrip.tagAssignments;
      if (tagAssignments.length > 0) {
        await tx.tripTagAssignment.createMany({
          data: tagAssignments.map((ta) => ({
            tripId: newTrip.id,
            tagId: ta.tagId,
          })),
        });
      }
    }

    // Copy companions using bulk insert
    if (data.copyEntities?.companions && sourceTrip.companionAssignments && Array.isArray(sourceTrip.companionAssignments)) {
      const companionAssignments = sourceTrip.companionAssignments;
      if (companionAssignments.length > 0) {
        await tx.tripCompanion.createMany({
          data: companionAssignments.map((ca) => ({
            tripId: newTrip.id,
            companionId: ca.companionId,
          })),
        });
      }
    } else {
      // If not copying companions, add "Myself" companion by default (pre-fetched above)
      if (myselfCompanion) {
        await tx.tripCompanion.create({
          data: {
            tripId: newTrip.id,
            companionId: myselfCompanion.id,
          },
        });
      }
    }

    // Copy checklists (need sequential for parent-child relationship with items)
    if (data.copyEntities?.checklists) {
      const checklists = sourceChecklists;
      if (checklists.length > 0) {
        // Create all checklists first
        await tx.checklist.createMany({
          data: checklists.map((checklist) => ({
            userId,
            tripId: newTrip.id,
            name: checklist.name,
            description: checklist.description,
            type: checklist.type,
            isDefault: checklist.isDefault,
            sortOrder: checklist.sortOrder,
          })),
        });
        // Query back new checklists using composite key for uniqueness
        // Note: Using name + type + description prefix to handle duplicate checklist names
        const newChecklists = await tx.checklist.findMany({
          where: { tripId: newTrip.id },
          select: { id: true, name: true, type: true, description: true },
        });
        const buildChecklistKey = (c: { name: string; type: string; description: string | null }) =>
          `${c.name}|${c.type}|${(c.description ?? '').slice(0, 50)}`;
        const checklistIdMap = new Map<number, number>();
        mapCopiesByCompositeKey(checklistIdMap, checklists, newChecklists, buildChecklistKey);

        // Bulk insert all checklist items
        const allItems: Prisma.ChecklistItemCreateManyInput[] = [];
        for (const checklist of checklists) {
          const newChecklistId = checklistIdMap.get(checklist.id);
          if (newChecklistId && checklist.items && Array.isArray(checklist.items)) {
            for (const item of checklist.items) {
              allItems.push({
                checklistId: newChecklistId,
                name: item.name,
                description: item.description,
                isChecked: false,
                isDefault: item.isDefault,
                sortOrder: item.sortOrder,
                // metadata is a nullable Json column: Prisma needs DbNull to write SQL
                // NULL, so a plain null from the source row cannot be passed through
                metadata: item.metadata ?? Prisma.DbNull,
              });
            }
          }
        }
        if (allItems.length > 0) {
          await tx.checklistItem.createMany({ data: allItems });
        }
      }
    }

    // Copy saved links (must run before entity links so SAVED_LINK refs remap)
    const savedLinkIdMap = new Map<number, number>();
    const sourceSavedLinks = await tx.savedLink.findMany({
      where: { tripId: sourceTripId },
    });
    for (const savedLink of sourceSavedLinks) {
      const copy = await tx.savedLink.create({
        data: {
          userId: savedLink.userId,
          tripId: newTrip.id,
          url: savedLink.url,
          title: savedLink.title,
          description: savedLink.description,
          siteName: savedLink.siteName,
          imageUrl: savedLink.imageUrl,
          notes: savedLink.notes,
          source: savedLink.source,
          metadataStatus: savedLink.metadataStatus,
          metadataFetchedAt: savedLink.metadataFetchedAt,
        },
      });
      savedLinkIdMap.set(savedLink.id, copy.id);
    }

    // Copy custom items (must run before entity links so CUSTOM_ITEM refs remap).
    // typeId points at a user-owned CustomItemType which is NOT trip-scoped, so it
    // carries over unchanged; locationId is remapped into the copied trip.
    const customItemIdMap = new Map<number, number>();
    const sourceCustomItems = await tx.customItem.findMany({
      where: { tripId: sourceTripId },
    });
    for (const item of sourceCustomItems) {
      const copy = await tx.customItem.create({
        data: {
          tripId: newTrip.id,
          typeId: item.typeId,
          name: item.name,
          notes: item.notes,
          allDay: item.allDay,
          startTime: item.startTime,
          endTime: item.endTime,
          timezone: item.timezone,
          locationId: item.locationId ? locationIdMap.get(item.locationId) || null : null,
          cost: item.cost,
          currency: item.currency,
          exchangeRate: item.exchangeRate,
          baseAmount: item.baseAmount,
          baseCurrency: item.baseCurrency,
          url: item.url,
          confirmationNumber: item.confirmationNumber,
        },
      });
      customItemIdMap.set(item.id, copy.id);
    }

    // Copy entity links using bulk insert (must be done after all entities are copied)
    const entityLinks = await tx.entityLink.findMany({
      where: { tripId: sourceTripId },
    });

    // Helper function to map old IDs to new IDs based on entity type
    const getNewId = (entityType: string, oldId: number): number | null => {
      switch (entityType) {
        case 'LOCATION':
          return locationIdMap.get(oldId) || null;
        case 'PHOTO':
          return photoIdMap.get(oldId) || null;
        case 'ACTIVITY':
          return activityIdMap.get(oldId) || null;
        case 'TRANSPORTATION':
          return transportationIdMap.get(oldId) || null;
        case 'LODGING':
          return lodgingIdMap.get(oldId) || null;
        case 'JOURNAL_ENTRY':
          return journalIdMap.get(oldId) || null;
        case 'PHOTO_ALBUM':
          return albumIdMap.get(oldId) || null;
        case 'SAVED_LINK':
          return savedLinkIdMap.get(oldId) || null;
        case 'CUSTOM_ITEM':
          return customItemIdMap.get(oldId) || null;
        default:
          return null;
      }
    };

    // Build array of valid entity links for bulk insert
    const validLinks = entityLinks
      .map((link) => {
        const newSourceId = getNewId(link.sourceType, link.sourceId);
        const newTargetId = getNewId(link.targetType, link.targetId);
        if (newSourceId && newTargetId) {
          return {
            tripId: newTrip.id,
            sourceType: link.sourceType,
            sourceId: newSourceId,
            targetType: link.targetType,
            targetId: newTargetId,
            relationship: link.relationship,
            sortOrder: link.sortOrder,
            notes: link.notes,
          };
        }
        return null;
      })
      .filter((link): link is NonNullable<typeof link> => link !== null);

    if (validLinks.length > 0) {
      await tx.entityLink.createMany({ data: validLinks });
    }

    return newTrip.id;
    }); // End of transaction

    // Return the new trip with basic includes (read outside transaction)
    const duplicatedTrip = await prisma.trip.findUnique({
      where: { id: newTripId },
      include: {
        coverPhoto: true,
        bannerPhoto: true,
        tagAssignments: {
          include: {
            tag: true,
          },
        },
        companionAssignments: {
          include: {
            companion: true,
          },
        },
      },
    });

    return convertDecimals(duplicatedTrip);
  }
}

export default new TripService();
