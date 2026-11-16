import type { ZodError } from 'zod';
import { createLocationSchema, type CreateLocationInput } from '../../types/location.types';
import { createActivitySchema, type CreateActivityInput } from '../../types/activity.types';
import type {
  ActivityImportRow,
  ImportIssue,
  ImportIssueCode,
  LocationImportRow,
} from '../../types/bulkImport.types';
import {
  cleanCell,
  findDuplicateIndex,
  isDuplicateActivity,
  isDuplicateLocation,
  matchByName,
  matchCategoryName,
  parseAmount,
  parseBooleanCell,
  parseCoordinate,
  parseCurrency,
  parseDateTimeCell,
  parseTimezoneCell,
  type ActivityKey,
  type CellResult,
  type LocationKey,
} from './bulkImportRows';

/**
 * Applies the import rules to whole rows. Pure: everything it needs from the database arrives
 * in the context object, so the dry run and the real run evaluate rows with the same code and
 * the preview cannot disagree with what is written.
 *
 * Row values are run through the *same* Zod schemas as single-create
 * (`createLocationSchema`, `createActivitySchema`); this file only turns CSV text into the
 * values those schemas expect and adds the checks that only make sense for an import.
 */

type NormalizedValue = string | number | boolean | null;

export interface EvaluatedRow<TData> {
  errors: ImportIssue[];
  warnings: ImportIssue[];
  normalized: Record<string, NormalizedValue>;
  /** Present only when the row has no errors. */
  data?: TData;
}

// =============================================================================
// SHARED
// =============================================================================

class IssueCollector {
  readonly errors: ImportIssue[] = [];
  readonly warnings: ImportIssue[] = [];

  error(field: string | null, message: string): void {
    this.errors.push({ field, code: 'invalid', message });
  }

  warn(field: string | null, code: ImportIssueCode, message: string): void {
    this.warnings.push({ field, code, message });
  }

  hasError(field: string): boolean {
    return this.errors.some((issue) => issue.field === field);
  }

  /** Unwraps a cell parse: records the error and yields `undefined` on failure. */
  take<T>(field: string, result: CellResult<T>): T | undefined {
    if (result.ok) return result.value;
    this.error(field, result.error);
    return undefined;
  }
}

/** Schema field name -> import field name, where they differ. */
const SCHEMA_TO_IMPORT_FIELD: Record<string, string> = { categoryId: 'category' };

function readableSchemaMessage(issue: ZodError['issues'][number]): string {
  if (issue.code === 'too_big' && issue.origin === 'string') {
    return `Must be at most ${String(issue.maximum)} characters`;
  }
  if (issue.code === 'too_small' && issue.origin === 'string') {
    return 'This field is required';
  }
  return issue.message;
}

/** Copies schema failures onto the collector, without duplicating fields that already failed. */
function addSchemaIssues(collector: IssueCollector, error: ZodError): void {
  for (const issue of error.issues) {
    const schemaField = typeof issue.path[0] === 'string' ? issue.path[0] : null;
    const field = schemaField ? (SCHEMA_TO_IMPORT_FIELD[schemaField] ?? schemaField) : null;
    if (field && collector.hasError(field)) continue;
    collector.error(field, readableSchemaMessage(issue));
  }
}

function finish<TData>(
  collector: IssueCollector,
  normalized: Record<string, NormalizedValue>,
  data: TData | undefined
): EvaluatedRow<TData> {
  return {
    errors: collector.errors,
    warnings: collector.warnings,
    normalized,
    data: collector.errors.length === 0 ? data : undefined,
  };
}

// =============================================================================
// LOCATIONS
// =============================================================================

export interface LocationEvalContext {
  tripId: number;
  /** Categories the user may assign: their own plus the defaults. */
  categories: ReadonlyArray<{ id: number; name: string }>;
  /** Locations already in the trip. */
  existing: ReadonlyArray<LocationKey>;
}

export type LocationRowData = CreateLocationInput;

export function evaluateLocationRows(
  rows: readonly LocationImportRow[],
  ctx: LocationEvalContext
): EvaluatedRow<LocationRowData>[] {
  const seen: LocationKey[] = [];
  const seenRowIndex: number[] = [];

  return rows.map((row, index) => {
    const issues = new IssueCollector();

    const name = cleanCell(row.name);
    if (!name) issues.error('name', 'Name is required');

    const latitude = issues.take('latitude', parseCoordinate(cleanCell(row.latitude), 'latitude'));
    const longitude = issues.take('longitude', parseCoordinate(cleanCell(row.longitude), 'longitude'));
    if ((latitude === undefined) !== (longitude === undefined)
      && !issues.hasError('latitude') && !issues.hasError('longitude')) {
      issues.error(
        latitude === undefined ? 'latitude' : 'longitude',
        'Latitude and longitude must be given together, or both left empty'
      );
    }

    const timezone = issues.take('timezone', parseTimezoneCell(cleanCell(row.timezone)));

    const categoryName = cleanCell(row.category);
    let categoryId: number | undefined;
    let categoryLabel: string | null = null;
    if (categoryName) {
      const canonical = matchCategoryName(categoryName, ctx.categories.map((c) => c.name));
      if (canonical) {
        categoryId = ctx.categories.find((c) => c.name === canonical)?.id;
        categoryLabel = canonical;
      } else {
        issues.warn(
          'category',
          'unknown_category',
          `Category "${categoryName}" does not exist; the location will be left uncategorised`
        );
      }
    }

    const address = cleanCell(row.address);
    if (latitude === undefined && longitude === undefined && !issues.hasError('latitude') && !issues.hasError('longitude')) {
      issues.warn(
        'latitude',
        'no_coordinates',
        address
          ? 'No coordinates: the address is kept as text and is not geocoded during import, so the location will not appear on the map'
          : 'No coordinates: the location will not appear on the map'
      );
    }

    const candidate = {
      tripId: ctx.tripId,
      name,
      address,
      latitude,
      longitude,
      categoryId,
      notes: cleanCell(row.notes),
      openingHours: cleanCell(row.openingHours),
      timezone,
    };
    const parsed = createLocationSchema.safeParse(candidate);
    if (!parsed.success) addSchemaIssues(issues, parsed.error);

    if (parsed.success && issues.errors.length === 0) {
      const key: LocationKey = { name: parsed.data.name, latitude, longitude };
      const existingIndex = findDuplicateIndex(key, ctx.existing, isDuplicateLocation);
      if (existingIndex >= 0) {
        issues.warn('name', 'duplicate_existing', `Looks like a duplicate of the existing location "${ctx.existing[existingIndex].name}"`);
      } else {
        const earlier = findDuplicateIndex(key, seen, isDuplicateLocation);
        if (earlier >= 0) {
          issues.warn('name', 'duplicate_in_file', `Looks like a duplicate of row ${seenRowIndex[earlier] + 1} in this file`);
        }
      }
      seen.push(key);
      seenRowIndex.push(index);
    }

    return finish(
      issues,
      {
        name: name ?? null,
        address: address ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        category: categoryLabel,
        notes: cleanCell(row.notes) ?? null,
        openingHours: cleanCell(row.openingHours) ?? null,
        timezone: timezone ?? null,
      },
      parsed.success ? parsed.data : undefined
    );
  });
}

// =============================================================================
// ACTIVITIES
// =============================================================================

export interface ActivityEvalContext {
  tripId: number;
  /**
   * Zone for wall-clock times with no `timezone` cell: the caller resolves it with
   * `resolveTimezone(trip.timezone, userTimezone)`. Never UTC unless nothing else is known.
   */
  defaultTimezone: string;
  /** The user's configured activity category names. */
  categories: readonly string[];
  /** Locations in the trip, for linking by name. */
  locations: ReadonlyArray<{ id: number; name: string }>;
  /** Activities already in the trip. */
  existing: ReadonlyArray<ActivityKey>;
}

export interface ActivityRowData {
  activity: CreateActivityInput;
  /** Canonical cost string for `Prisma.Decimal`; the schema only ever sees a number. */
  costDecimal?: string;
  locationId?: number;
}

export function evaluateActivityRows(
  rows: readonly ActivityImportRow[],
  ctx: ActivityEvalContext
): EvaluatedRow<ActivityRowData>[] {
  const seen: ActivityKey[] = [];
  const seenRowIndex: number[] = [];

  return rows.map((row, index) => {
    const issues = new IssueCollector();

    const name = cleanCell(row.name);
    if (!name) issues.error('name', 'Name is required');

    const allDay = issues.take('allDay', parseBooleanCell(cleanCell(row.allDay)));
    const rowTimezone = issues.take('timezone', parseTimezoneCell(cleanCell(row.timezone)));
    const zone = rowTimezone ?? ctx.defaultTimezone;

    const start = issues.take('startTime', parseDateTimeCell(cleanCell(row.startTime), zone, { allDay: allDay === true }));
    const end = issues.take('endTime', parseDateTimeCell(cleanCell(row.endTime), zone, { allDay: allDay === true }));
    if (start && end && new Date(end.iso).getTime() < new Date(start.iso).getTime()
      && !issues.hasError('startTime') && !issues.hasError('endTime')) {
      issues.error('endTime', 'End time is before the start time');
    }

    const costDecimal = issues.take('cost', parseAmount(cleanCell(row.cost)));
    const currency = issues.take('currency', parseCurrency(cleanCell(row.currency)));
    if (costDecimal !== undefined && currency === undefined && !issues.hasError('currency')) {
      issues.warn('currency', 'cost_without_currency', 'Cost has no currency, so it will not count toward the trip budget');
    }

    const categoryName = cleanCell(row.category);
    let category: string | undefined;
    if (categoryName) {
      category = matchCategoryName(categoryName, ctx.categories);
      if (!category) {
        issues.warn(
          'category',
          'unknown_category',
          `Category "${categoryName}" is not one of your activity categories; the activity will be left uncategorised`
        );
      }
    }

    const locationName = cleanCell(row.location);
    let locationId: number | undefined;
    if (locationName) {
      const match = matchByName(locationName, ctx.locations);
      if (match.kind === 'one') {
        locationId = match.id;
      } else if (match.kind === 'many') {
        issues.warn('location', 'location_ambiguous', `${match.count} trip locations are named "${locationName}"; the activity will not be linked to any of them`);
      } else {
        issues.warn('location', 'location_not_found', `No location named "${locationName}" in this trip; the activity will not be linked`);
      }
    }

    // A wall-clock time was read in `zone`; remember that zone on the activity so the time
    // keeps its meaning. Offset-bearing times only record a zone the row asked for.
    const usedWallClock = start?.kind === 'wall' || start?.kind === 'date' || end?.kind === 'wall' || end?.kind === 'date';
    const storedTimezone = rowTimezone ?? (usedWallClock ? zone : undefined);

    const candidate = {
      tripId: ctx.tripId,
      name,
      description: cleanCell(row.description),
      category,
      allDay,
      startTime: start?.iso,
      endTime: end?.iso,
      timezone: storedTimezone,
      cost: costDecimal === undefined ? undefined : Number(costDecimal),
      currency,
      bookingUrl: cleanCell(row.bookingUrl),
      bookingReference: cleanCell(row.bookingReference),
      notes: cleanCell(row.notes),
    };
    const parsed = createActivitySchema.safeParse(candidate);
    if (!parsed.success) addSchemaIssues(issues, parsed.error);

    if (parsed.success && issues.errors.length === 0) {
      const key: ActivityKey = { name: parsed.data.name, startTime: start?.iso ?? null };
      const existingIndex = findDuplicateIndex(key, ctx.existing, isDuplicateActivity);
      if (existingIndex >= 0) {
        issues.warn('name', 'duplicate_existing', `Looks like a duplicate of the existing activity "${ctx.existing[existingIndex].name}" (same name and start time)`);
      } else {
        const earlier = findDuplicateIndex(key, seen, isDuplicateActivity);
        if (earlier >= 0) {
          issues.warn('name', 'duplicate_in_file', `Looks like a duplicate of row ${seenRowIndex[earlier] + 1} in this file (same name and start time)`);
        }
      }
      seen.push(key);
      seenRowIndex.push(index);
    }

    return finish(
      issues,
      {
        name: name ?? null,
        description: cleanCell(row.description) ?? null,
        category: category ?? null,
        location: locationId === undefined ? null : (locationName ?? null),
        startTime: start?.iso ?? null,
        endTime: end?.iso ?? null,
        timezone: storedTimezone ?? null,
        allDay: allDay ?? false,
        cost: costDecimal ?? null,
        currency: currency ?? null,
        bookingUrl: cleanCell(row.bookingUrl) ?? null,
        bookingReference: cleanCell(row.bookingReference) ?? null,
        notes: cleanCell(row.notes) ?? null,
      },
      parsed.success ? { activity: parsed.data, costDecimal, locationId } : undefined
    );
  });
}
