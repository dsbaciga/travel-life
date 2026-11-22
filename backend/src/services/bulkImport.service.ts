import { Prisma } from '@prisma/client';
import tzlookup from 'tz-lookup';
import prisma from '../config/database';
import logger from '../config/logger';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { getUserTimezone, resolveTimezone } from './_shared/timezoneResolution';
import {
  evaluateActivityRows,
  evaluateLocationRows,
  evaluateLodgingRows,
  evaluateTransportationRows,
  type EvaluatedRow,
} from './_shared/bulkImportEvaluators';
import { deriveLocationCountryCode } from './_shared/countryCodes';
import { buildBookingCostCreate } from './_shared/bookingCost';
import type {
  BulkImportResult,
  ImportActivitiesInput,
  ImportLocationsInput,
  ImportLodgingInput,
  ImportRowResult,
  ImportTransportationInput,
} from '../types/bulkImport.types';
import { findUserPreferences } from './_shared/userSettings';

/** 500 sequential inserts in one transaction can outlast Prisma's 5 s default. */
const IMPORT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

const OPENING_HOURS_SOURCE_MANUAL = 'manual';

interface RowPlan<TData> {
  results: ImportRowResult[];
  /** Rows to write, in file order. */
  toCreate: Array<{ index: number; data: TData }>;
}

/**
 * Turns evaluator output into the per-row response and the list of rows to write.
 * A row is written only when it has no errors and the user did not exclude it.
 */
function planRows<TData>(evaluated: EvaluatedRow<TData>[], excluded: ReadonlySet<number>): RowPlan<TData> {
  const toCreate: Array<{ index: number; data: TData }> = [];
  const results = evaluated.map((row, index): ImportRowResult => {
    let status: ImportRowResult['status'] = 'valid';
    if (row.errors.length > 0 || row.data === undefined) {
      status = 'invalid';
    } else if (excluded.has(index)) {
      status = 'excluded';
    } else {
      toCreate.push({ index, data: row.data });
    }
    return { index, status, errors: row.errors, warnings: row.warnings, normalized: row.normalized };
  });
  return { results, toCreate };
}

function summarize(
  results: ImportRowResult[],
  dryRun: boolean,
  extra: Pick<BulkImportResult, 'tripTimezoneSet' | 'defaultTimezone'>
): BulkImportResult {
  const count = (status: ImportRowResult['status']) => results.filter((r) => r.status === status).length;
  const created = count('created');
  const invalid = count('invalid');
  const excluded = count('excluded');
  return {
    dryRun,
    total: results.length,
    valid: results.length - invalid,
    invalid,
    excluded,
    created,
    rows: results,
    ...extra,
  };
}

/** Reads the `[{ name, emoji }]` JSON the user's activity categories are stored as. */
function categoryNamesFrom(value: Prisma.JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry) && typeof entry.name === 'string') {
      names.push(entry.name);
    }
  }
  return names;
}

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

/** Timezone of a place from its coordinates; same lookup as single-create, null when unknown. */
function timezoneFromCoordinates(latitude?: number | null, longitude?: number | null): string | null {
  if (latitude == null || longitude == null) return null;
  try {
    return tzlookup(latitude, longitude);
  } catch (error) {
    logger.warn(`Timezone lookup failed for ${latitude},${longitude}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

class BulkImportService {
  /**
   * Validates, and unless `dryRun` is set creates, locations from CSV rows.
   *
   * Differences from calling `createLocation` once per row, all deliberate:
   * - One transaction for the whole file, so an unexpected failure leaves nothing behind.
   * - The place's timezone comes from `tz-lookup` (local, no network), as in single-create.
   * - The trip timezone is derived once, from the first row with coordinates, if the trip has none.
   * - **No Nominatim opening-hours lookup.** Single-create makes one HTTP call per location;
   *   500 of those would be slow and would hammer the public instance. Imported places can
   *   have hours edited in or filled by editing the location later.
   * - **No geocoding** of address-only rows; they are imported without coordinates.
   */
  async importLocations(userId: number, tripId: number, input: ImportLocationsInput): Promise<BulkImportResult> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const [trip, categories, existing] = await Promise.all([
      prisma.trip.findUnique({ where: { id: tripId }, select: { timezone: true } }),
      prisma.locationCategory.findMany({
        where: { OR: [{ userId }, { isDefault: true }] },
        select: { id: true, name: true },
      }),
      prisma.location.findMany({ where: { tripId }, select: { name: true, latitude: true, longitude: true } }),
    ]);

    const evaluated = evaluateLocationRows(input.rows, {
      tripId,
      categories,
      existing: existing.map((l) => ({ name: l.name, latitude: toNumber(l.latitude), longitude: toNumber(l.longitude) })),
    });
    const plan = planRows(evaluated, new Set(input.excludeRows));

    if (input.dryRun || plan.toCreate.length === 0) {
      return summarize(plan.results, input.dryRun, { tripTimezoneSet: null, defaultTimezone: null });
    }

    const tripTimezoneSet = await prisma.$transaction(async (tx) => {
      await tx.location.createManyAndReturn({
        data: plan.toCreate.map(({ data }) => ({
          tripId,
          name: data.name,
          address: data.address ?? null,
          countryCode: deriveLocationCountryCode(null, data.address),
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          categoryId: data.categoryId ?? null,
          notes: data.notes ?? null,
          excludeFromMap: false,
          openingHours: data.openingHours ?? null,
          openingHoursSource: data.openingHours ? OPENING_HOURS_SOURCE_MANUAL : null,
          timezone: data.timezone ?? timezoneFromCoordinates(data.latitude, data.longitude),
        })),
        select: { id: true },
      });

      // Same rule as single-create's autoSetTripTimezone, applied once for the batch.
      if (!trip?.timezone) {
        const firstLocated = plan.toCreate.find(({ data }) => data.latitude != null && data.longitude != null);
        const derived = firstLocated ? timezoneFromCoordinates(firstLocated.data.latitude, firstLocated.data.longitude) : null;
        if (derived) {
          const { count } = await tx.trip.updateMany({ where: { id: tripId, timezone: null }, data: { timezone: derived } });
          if (count > 0) return derived;
        }
      }
      return null;
    }, IMPORT_TRANSACTION_OPTIONS);

    const createdIndexes = new Set(plan.toCreate.map((row) => row.index));
    const results = plan.results.map((r) => (createdIndexes.has(r.index) ? { ...r, status: 'created' as const } : r));
    return summarize(results, false, { tripTimezoneSet, defaultTimezone: null });
  }

  /**
   * Validates, and unless `dryRun` is set creates, activities from CSV rows.
   *
   * Written as one transaction. Activities are created with the same fields `createActivity`
   * writes, plus `timezone` and `allDay`, which the single-create endpoint accepts but does not
   * persist today. Like single-create, no exchange-rate snapshot is taken here: activity costs
   * are snapshotted lazily by the trip read path, so there is nothing to do per row.
   */
  async importActivities(userId: number, tripId: number, input: ImportActivitiesInput): Promise<BulkImportResult> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const [trip, user, userTimezone, locations, existing] = await Promise.all([
      prisma.trip.findUnique({ where: { id: tripId }, select: { timezone: true, user: { select: { timezone: true } } } }),
      findUserPreferences(userId),
      getUserTimezone(userId),
      prisma.location.findMany({ where: { tripId }, select: { id: true, name: true } }),
      prisma.activity.findMany({ where: { tripId }, select: { name: true, startTime: true } }),
    ]);

    const defaultZone = resolveTimezone(trip?.timezone, userTimezone);
    const defaultTimezone: BulkImportResult['defaultTimezone'] = {
      zone: defaultZone,
      source: trip?.timezone ? 'trip' : userTimezone ? 'user' : 'utc',
    };

    const evaluated = evaluateActivityRows(input.rows, {
      tripId,
      defaultTimezone: defaultZone,
      categories: categoryNamesFrom(user?.activityCategories),
      locations,
      existing,
    });
    const plan = planRows(evaluated, new Set(input.excludeRows));

    if (input.dryRun || plan.toCreate.length === 0) {
      return summarize(plan.results, input.dryRun, { tripTimezoneSet: null, defaultTimezone });
    }

    await prisma.$transaction(async (tx) => {
      for (const { data } of plan.toCreate) {
        const { activity, costDecimal, locationId } = data;
        const startTime = activity.startTime ? new Date(activity.startTime) : null;
        // The cost is the activity's expense row (a Decimal from the canonical string: a float would
        // round-trip 0.1 + 0.2 style noise).
        const costExpense = await buildBookingCostCreate(
          tx,
          tripId,
          { kind: 'activity', name: activity.name, startTime, timezone: activity.timezone || null },
          { cost: costDecimal === undefined ? null : new Prisma.Decimal(costDecimal), currency: activity.currency },
          [trip?.timezone ?? null, trip?.user?.timezone ?? null]
        );
        await tx.activity.create({
          data: {
            tripId,
            // The place is the activity's own FK (locationId was matched within this trip)
            locationId: locationId ?? null,
            name: activity.name,
            description: activity.description || null,
            category: activity.category || null,
            allDay: activity.allDay ?? false,
            startTime,
            endTime: activity.endTime ? new Date(activity.endTime) : null,
            timezone: activity.timezone || null,
            costExpense,
            bookingUrl: activity.bookingUrl || null,
            bookingReference: activity.bookingReference || null,
            notes: activity.notes || null,
          },
          select: { id: true },
        });
      }
    }, IMPORT_TRANSACTION_OPTIONS);

    const createdIndexes = new Set(plan.toCreate.map((row) => row.index));
    const results = plan.results.map((r) => (createdIndexes.has(r.index) ? { ...r, status: 'created' as const } : r));
    return summarize(results, false, { tripTimezoneSet: null, defaultTimezone });
  }

  /**
   * Validates, and unless `dryRun` is set creates, lodging stays from CSV rows.
   *
   * Same shape as `importActivities`: one transaction, edit permission first, wall-clock times
   * read in the row timezone, else the trip timezone, else the user timezone. Stays are created
   * with the fields `createLodging` writes; the cost is the stay's expense row. Not imported:
   * the place link and the loyalty program (both are set by editing the stay afterwards).
   */
  async importLodging(userId: number, tripId: number, input: ImportLodgingInput): Promise<BulkImportResult> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const [trip, userTimezone, existing] = await Promise.all([
      prisma.trip.findUnique({ where: { id: tripId }, select: { timezone: true, user: { select: { timezone: true } } } }),
      getUserTimezone(userId),
      prisma.lodging.findMany({ where: { tripId }, select: { name: true, checkInDate: true } }),
    ]);

    const defaultZone = resolveTimezone(trip?.timezone, userTimezone);
    const defaultTimezone: BulkImportResult['defaultTimezone'] = {
      zone: defaultZone,
      source: trip?.timezone ? 'trip' : userTimezone ? 'user' : 'utc',
    };

    const evaluated = evaluateLodgingRows(input.rows, { tripId, defaultTimezone: defaultZone, existing });
    const plan = planRows(evaluated, new Set(input.excludeRows));

    if (input.dryRun || plan.toCreate.length === 0) {
      return summarize(plan.results, input.dryRun, { tripTimezoneSet: null, defaultTimezone });
    }

    await prisma.$transaction(async (tx) => {
      for (const { data } of plan.toCreate) {
        const { lodging, costDecimal } = data;
        // The evaluator guarantees both dates, because the columns are NOT NULL.
        const checkInDate = new Date(lodging.checkInDate as string);
        const costExpense = await buildBookingCostCreate(
          tx,
          tripId,
          { kind: 'lodging', name: lodging.name, checkInDate, timezone: lodging.timezone || null },
          { cost: costDecimal === undefined ? null : new Prisma.Decimal(costDecimal), currency: lodging.currency },
          [trip?.timezone ?? null, trip?.user?.timezone ?? null]
        );
        await tx.lodging.create({
          data: {
            tripId,
            type: lodging.type,
            name: lodging.name,
            address: lodging.address || null,
            checkInDate,
            checkOutDate: new Date(lodging.checkOutDate as string),
            timezone: lodging.timezone || null,
            confirmationNumber: lodging.confirmationNumber || null,
            costExpense,
            bookingUrl: lodging.bookingUrl || null,
            notes: lodging.notes || null,
          },
          select: { id: true },
        });
      }
    }, IMPORT_TRANSACTION_OPTIONS);

    const createdIndexes = new Set(plan.toCreate.map((row) => row.index));
    const results = plan.results.map((r) => (createdIndexes.has(r.index) ? { ...r, status: 'created' as const } : r));
    return summarize(results, false, { tripTimezoneSet: null, defaultTimezone });
  }

  /**
   * Validates, and unless `dryRun` is set creates, transportation legs from CSV rows.
   *
   * Same shape as `importActivities`. The departure is read in the start timezone and the arrival
   * in the end timezone (each: the row's cell, else the trip timezone, else the user timezone).
   * From and To are kept as text; they are not matched to trip locations, so no route distance
   * is calculated. The loyalty program is not imported.
   */
  async importTransportation(userId: number, tripId: number, input: ImportTransportationInput): Promise<BulkImportResult> {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const [trip, userTimezone, existing] = await Promise.all([
      prisma.trip.findUnique({ where: { id: tripId }, select: { timezone: true, user: { select: { timezone: true } } } }),
      getUserTimezone(userId),
      prisma.transportation.findMany({
        where: { tripId },
        select: {
          type: true,
          company: true,
          referenceNumber: true,
          startLocationText: true,
          endLocationText: true,
          scheduledStart: true,
        },
      }),
    ]);

    const defaultZone = resolveTimezone(trip?.timezone, userTimezone);
    const defaultTimezone: BulkImportResult['defaultTimezone'] = {
      zone: defaultZone,
      source: trip?.timezone ? 'trip' : userTimezone ? 'user' : 'utc',
    };

    const evaluated = evaluateTransportationRows(input.rows, {
      tripId,
      defaultTimezone: defaultZone,
      existing: existing.map((leg) => ({
        type: leg.type,
        carrier: leg.company,
        vehicleNumber: leg.referenceNumber,
        fromLocationName: leg.startLocationText,
        toLocationName: leg.endLocationText,
        departureTime: leg.scheduledStart,
      })),
    });
    const plan = planRows(evaluated, new Set(input.excludeRows));

    if (input.dryRun || plan.toCreate.length === 0) {
      return summarize(plan.results, input.dryRun, { tripTimezoneSet: null, defaultTimezone });
    }

    await prisma.$transaction(async (tx) => {
      for (const { data } of plan.toCreate) {
        const { transportation: leg, costDecimal } = data;
        const scheduledStart = leg.departureTime ? new Date(leg.departureTime) : null;
        const costExpense = await buildBookingCostCreate(
          tx,
          tripId,
          {
            kind: 'transportation',
            type: leg.type,
            company: leg.carrier || null,
            referenceNumber: leg.vehicleNumber || null,
            startLocationText: leg.fromLocationName || null,
            endLocationText: leg.toLocationName || null,
            scheduledStart,
            startTimezone: leg.startTimezone || null,
          },
          { cost: costDecimal === undefined ? null : new Prisma.Decimal(costDecimal), currency: leg.currency },
          [trip?.timezone ?? null, trip?.user?.timezone ?? null]
        );
        await tx.transportation.create({
          data: {
            tripId,
            type: leg.type,
            startLocationText: leg.fromLocationName || null,
            endLocationText: leg.toLocationName || null,
            scheduledStart,
            scheduledEnd: leg.arrivalTime ? new Date(leg.arrivalTime) : null,
            startTimezone: leg.startTimezone || null,
            endTimezone: leg.endTimezone || null,
            company: leg.carrier || null,
            referenceNumber: leg.vehicleNumber || null,
            bookingReference: leg.confirmationNumber || null,
            costExpense,
            notes: leg.notes || null,
          },
          select: { id: true },
        });
      }
    }, IMPORT_TRANSACTION_OPTIONS);

    const createdIndexes = new Set(plan.toCreate.map((row) => row.index));
    const results = plan.results.map((r) => (createdIndexes.has(r.index) ? { ...r, status: 'created' as const } : r));
    return summarize(results, false, { tripTimezoneSet: null, defaultTimezone });
  }
}

export default new BulkImportService();
