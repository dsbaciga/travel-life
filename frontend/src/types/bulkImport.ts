/**
 * Payloads of the CSV bulk import endpoints (`/trips/:tripId/import/...`), unwrapped from the
 * `{ status, data }` envelope. Mirrors backend `types/bulkImport.types.ts`.
 */

export type ImportEntity = 'locations' | 'activities' | 'lodging' | 'transportation';

/** One CSV row after column mapping: raw text keyed by import field name. */
export type ImportRowPayload = Record<string, string>;

export interface ImportRequest {
  rows: ImportRowPayload[];
  dryRun: boolean;
  /** Zero-based indexes of rows to leave out. */
  excludeRows: number[];
}

export type ImportIssueCode =
  | 'invalid'
  | 'duplicate_existing'
  | 'duplicate_in_file'
  | 'unknown_category'
  | 'no_coordinates'
  | 'location_not_found'
  | 'location_ambiguous'
  | 'cost_without_currency'
  | 'timezone_assumed';

export interface ImportIssue {
  field: string | null;
  code: ImportIssueCode;
  message: string;
}

export type ImportRowStatus = 'valid' | 'invalid' | 'excluded' | 'created';

export interface ImportRowResult {
  index: number;
  status: ImportRowStatus;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  normalized: Record<string, string | number | boolean | null>;
}

export interface BulkImportResult {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  excluded: number;
  created: number;
  rows: ImportRowResult[];
  tripTimezoneSet: string | null;
  defaultTimezone: { zone: string; source: 'trip' | 'user' | 'utc' } | null;
}
