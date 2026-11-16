import { z } from 'zod';
import { IMPORT_MAX_ROWS } from '../services/_shared/bulkImportRows';

/**
 * Request and response shapes for the CSV bulk import.
 *
 * Rows arrive as raw strings keyed by field name: the browser has already split the CSV and
 * mapped columns to fields, but every value is parsed and validated again here, against the
 * same Zod schemas the single-create endpoints use. The server is the only authority.
 */

/** A single raw cell. Capped so one cell cannot blow through the JSON body limit. */
const cell = z.string().max(20000).nullish();

export const locationImportRowSchema = z.strictObject({
  name: cell,
  address: cell,
  latitude: cell,
  longitude: cell,
  category: cell,
  notes: cell,
  openingHours: cell,
  timezone: cell,
});

export const activityImportRowSchema = z.strictObject({
  name: cell,
  description: cell,
  category: cell,
  /** Name of an existing trip location to link the activity to. */
  location: cell,
  startTime: cell,
  endTime: cell,
  timezone: cell,
  allDay: cell,
  cost: cell,
  currency: cell,
  bookingUrl: cell,
  bookingReference: cell,
  notes: cell,
});

const importOptions = {
  /** Validate only: nothing is written, and the per-row results are exactly what a real run would produce. */
  dryRun: z.boolean().default(false),
  /** Zero-based indexes of rows the user chose to leave out (e.g. flagged duplicates). */
  excludeRows: z.array(z.number().int().min(0)).max(IMPORT_MAX_ROWS).default([]),
};

export const importLocationsSchema = z.object({
  rows: z.array(locationImportRowSchema).min(1, 'At least one row is required').max(IMPORT_MAX_ROWS, `At most ${IMPORT_MAX_ROWS} rows can be imported at once`),
  ...importOptions,
});

export const importActivitiesSchema = z.object({
  rows: z.array(activityImportRowSchema).min(1, 'At least one row is required').max(IMPORT_MAX_ROWS, `At most ${IMPORT_MAX_ROWS} rows can be imported at once`),
  ...importOptions,
});

export type LocationImportRow = z.infer<typeof locationImportRowSchema>;
export type ActivityImportRow = z.infer<typeof activityImportRowSchema>;
export type ImportLocationsInput = z.infer<typeof importLocationsSchema>;
export type ImportActivitiesInput = z.infer<typeof importActivitiesSchema>;

// =============================================================================
// RESPONSE
// =============================================================================

export type ImportIssueCode =
  | 'invalid'
  | 'duplicate_existing'
  | 'duplicate_in_file'
  | 'unknown_category'
  | 'no_coordinates'
  | 'location_not_found'
  | 'location_ambiguous'
  | 'cost_without_currency';

export interface ImportIssue {
  /** The import field the issue belongs to, or null for a whole-row problem. */
  field: string | null;
  code: ImportIssueCode;
  message: string;
}

/**
 * - `valid`: would be created (dry run)
 * - `invalid`: has at least one error; never created
 * - `excluded`: valid, but the user asked to leave it out
 * - `created`: written to the database (real run)
 */
export type ImportRowStatus = 'valid' | 'invalid' | 'excluded' | 'created';

export interface ImportRowResult {
  index: number;
  status: ImportRowStatus;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** The values as the server understood them, for the preview table. */
  normalized: Record<string, string | number | boolean | null>;
}

export interface BulkImportResult {
  dryRun: boolean;
  total: number;
  /** Rows without errors (created rows count here too on a real run). */
  valid: number;
  invalid: number;
  excluded: number;
  created: number;
  rows: ImportRowResult[];
  /** Set when the trip had no timezone and the first located row supplied one. */
  tripTimezoneSet: string | null;
  /**
   * Activities only: the zone used to read wall-clock times that carry neither an offset nor a
   * `timezone` cell, and where it came from (the trip, else the user's setting, else UTC).
   */
  defaultTimezone: { zone: string; source: 'trip' | 'user' | 'utc' } | null;
}
