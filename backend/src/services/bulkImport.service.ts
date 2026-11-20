import { Prisma } from '@prisma/client';
import tzlookup from 'tz-lookup';
import prisma from '../config/database';
import logger from '../config/logger';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { getUserTimezone, resolveTimezone } from './_shared/timezoneResolution';
import {
  evaluateActivityRows,
  evaluateLocationRows,
  type EvaluatedRow,
} from './_shared/bulkImportEvaluators';
import type {
  BulkImportResult,
  ImportActivitiesInput,
  ImportLocationsInput,
  ImportRowResult,
} from '../types/bulkImport.types';

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
      const created = await tx.location.createManyAndReturn({
        data: plan.toCreate.map(({ data }) => ({
          tripId,
          name: data.name,
          address: data.address ?? null,
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

      // The PostGIS column is kept in step by a Prisma extension on `location.create`, which
      // runs its follow-up UPDATE on a different connection and so cannot see rows this
      // transaction has not committed. createManyAndReturn bypasses that hook anyway, so sync
      // the geography column for the whole batch here, inside the transaction.
      const located = created.map((c) => c.id);
      if (located.length > 0) {
        await tx.$executeRaw`
          UPDATE locations
          SET coordinates = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
          WHERE id IN (${Prisma.join(located)}) AND latitude IS NOT NULL AND longitude IS NOT NULL
        `;
      }

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
      prisma.trip.findUnique({ where: { id: tripId }, select: { timezone: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { activityCategories: true } }),
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
        await tx.activity.create({
          data: {
            tripId,
            // The place is the activity's own FK (locationId was matched within this trip)
            locationId: locationId ?? null,
            name: activity.name,
            description: activity.description || null,
            category: activity.category || null,
            allDay: activity.allDay ?? false,
            startTime: activity.startTime ? new Date(activity.startTime) : null,
            endTime: activity.endTime ? new Date(activity.endTime) : null,
            timezone: activity.timezone || null,
            // Decimal from the canonical string: a float would round-trip 0.1 + 0.2 style noise.
            cost: costDecimal === undefined ? null : new Prisma.Decimal(costDecimal),
            currency: activity.currency || null,
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
}

export default new BulkImportService();
