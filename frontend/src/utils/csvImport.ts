import Papa from 'papaparse';
import type { ImportEntity, ImportRowPayload, ImportRowResult } from '../types/bulkImport';

/**
 * Pure helpers for the CSV bulk import wizard: parsing, column matching, template and
 * error-report generation. The server re-validates everything; this file only gets the CSV into
 * a shape the server can judge (and the user can map and preview).
 */

// =============================================================================
// LIMITS
// =============================================================================

/** Mirrors the server cap; the server enforces it too. */
export const IMPORT_MAX_ROWS = 500;

/** Matches the API's 1 MB JSON body limit with room for the envelope. */
export const IMPORT_MAX_FILE_BYTES = 1024 * 1024;

/** Mirrors the per-cell cap on the server. */
export const IMPORT_MAX_CELL_LENGTH = 20000;

// =============================================================================
// FIELD DEFINITIONS
// =============================================================================

export interface ImportFieldDef {
  /** Key sent to the API. */
  key: string;
  /** Label in the mapping step. */
  label: string;
  /** Header written in the template. */
  templateHeader: string;
  required: boolean;
  /** Short hint shown under the mapping row. */
  hint?: string;
  /** Normalised header names (see `normalizeHeader`) that map to this field. */
  aliases: string[];
}

export const IMPORT_FIELDS: Record<ImportEntity, ImportFieldDef[]> = {
  locations: [
    { key: 'name', label: 'Name', templateHeader: 'name', required: true, aliases: ['name', 'title', 'place', 'placename', 'locationname', 'location'] },
    { key: 'address', label: 'Address', templateHeader: 'address', required: false, hint: 'Imported as text; not geocoded', aliases: ['address', 'streetaddress', 'addr', 'fulladdress'] },
    { key: 'latitude', label: 'Latitude', templateHeader: 'latitude', required: false, hint: '-90 to 90, dot decimal; give both or neither', aliases: ['latitude', 'lat'] },
    { key: 'longitude', label: 'Longitude', templateHeader: 'longitude', required: false, hint: '-180 to 180, dot decimal', aliases: ['longitude', 'lng', 'lon', 'long'] },
    { key: 'category', label: 'Category', templateHeader: 'category', required: false, hint: 'Must match an existing category name', aliases: ['category', 'type', 'categoryname'] },
    { key: 'notes', label: 'Notes', templateHeader: 'notes', required: false, aliases: ['notes', 'note', 'comments', 'comment', 'description'] },
    { key: 'openingHours', label: 'Opening hours', templateHeader: 'opening_hours', required: false, hint: 'OpenStreetMap format, e.g. Mo-Fr 09:00-17:00', aliases: ['openinghours', 'hours', 'openhours'] },
    { key: 'timezone', label: 'Timezone', templateHeader: 'timezone', required: false, hint: 'IANA name, e.g. Europe/Paris; derived from coordinates if blank', aliases: ['timezone', 'tz', 'timezoneid'] },
  ],
  activities: [
    { key: 'name', label: 'Name', templateHeader: 'name', required: true, aliases: ['name', 'title', 'activity', 'activityname', 'event'] },
    { key: 'description', label: 'Description', templateHeader: 'description', required: false, aliases: ['description', 'details', 'summary'] },
    { key: 'category', label: 'Category', templateHeader: 'category', required: false, hint: 'Must match one of your activity categories', aliases: ['category', 'type', 'categoryname'] },
    { key: 'location', label: 'Location', templateHeader: 'location', required: false, hint: 'Name of an existing trip location to link to', aliases: ['location', 'place', 'locationname', 'venue'] },
    { key: 'startTime', label: 'Start', templateHeader: 'start_time', required: false, hint: 'YYYY-MM-DD HH:mm or ISO 8601', aliases: ['starttime', 'start', 'startdate', 'startdatetime', 'begin', 'from', 'date'] },
    { key: 'endTime', label: 'End', templateHeader: 'end_time', required: false, hint: 'YYYY-MM-DD HH:mm or ISO 8601', aliases: ['endtime', 'end', 'enddate', 'enddatetime', 'finish', 'to', 'until'] },
    { key: 'timezone', label: 'Timezone', templateHeader: 'timezone', required: false, hint: 'Zone for times without an offset; defaults to the trip timezone', aliases: ['timezone', 'tz', 'timezoneid'] },
    { key: 'allDay', label: 'All day', templateHeader: 'all_day', required: false, hint: 'true or false', aliases: ['allday', 'fullday'] },
    { key: 'cost', label: 'Cost', templateHeader: 'cost', required: false, hint: 'Plain number such as 1234.50', aliases: ['cost', 'price', 'amount', 'total'] },
    { key: 'currency', label: 'Currency', templateHeader: 'currency', required: false, hint: '3-letter code such as EUR', aliases: ['currency', 'curr', 'currencycode'] },
    { key: 'bookingUrl', label: 'Booking URL', templateHeader: 'booking_url', required: false, aliases: ['bookingurl', 'url', 'link', 'bookinglink', 'website'] },
    { key: 'bookingReference', label: 'Booking reference', templateHeader: 'booking_reference', required: false, aliases: ['bookingreference', 'reference', 'confirmation', 'confirmationnumber', 'confirmationcode', 'bookingref', 'ref'] },
    { key: 'notes', label: 'Notes', templateHeader: 'notes', required: false, aliases: ['notes', 'note', 'comments', 'comment'] },
  ],
};

// =============================================================================
// PARSING
// =============================================================================

export interface ParsedCsv {
  /** Unique, non-blank header labels. */
  headers: string[];
  /** Data rows, each padded to `headers.length`. */
  rows: string[][];
  delimiter: string;
  /** Non-fatal observations to show the user. */
  notes: string[];
}

export type CsvParseOutcome = { ok: true; csv: ParsedCsv } | { ok: false; error: string };

/**
 * Makes header labels usable as mapping keys: blank headers become "Column N" and repeated
 * ones get " (2)", " (3)" so each column can be chosen individually.
 */
export function uniqueHeaders(rawHeaders: readonly string[]): string[] {
  const used = new Set<string>();
  return rawHeaders.map((raw, i) => {
    const base = raw.trim() === '' ? `Column ${i + 1}` : raw.trim();
    let candidate = base;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base} (${n})`;
      n += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/**
 * Parses CSV text with PapaParse. Handles quoted fields with commas/newlines, escaped quotes,
 * CRLF, a leading BOM and trailing blank lines; the delimiter (`,` `;` tab `|`) is detected.
 */
export function parseCsv(text: string): CsvParseOutcome {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (source.trim() === '') return { ok: false, error: 'The file is empty.' };

  const result = Papa.parse<string[]>(source, {
    delimitersToGuess: [',', ';', '\t', '|'],
    skipEmptyLines: 'greedy',
  });

  const quoteError = result.errors.find((e) => e.type === 'Quotes');
  if (quoteError) {
    return {
      ok: false,
      error: `The file has an unclosed or misplaced quote${quoteError.row !== undefined ? ` near line ${quoteError.row + 1}` : ''}. Check the quoting and try again.`,
    };
  }

  const table = result.data;
  if (table.length === 0) return { ok: false, error: 'The file has no rows.' };

  const headers = uniqueHeaders(table[0]);
  const body = table.slice(1);
  if (body.length === 0) return { ok: false, error: 'The file has a header row but no data rows.' };

  const notes: string[] = [];
  let extraCells = 0;
  const rows = body.map((cells) => {
    if (cells.length > headers.length && cells.slice(headers.length).some((c) => c.trim() !== '')) extraCells += 1;
    const row = cells.slice(0, headers.length);
    while (row.length < headers.length) row.push('');
    return row;
  });
  if (extraCells > 0) {
    notes.push(`${extraCells} row${extraCells === 1 ? ' has' : 's have'} more cells than the header row; the extra cells are ignored.`);
  }
  if (source.includes('�')) {
    notes.push('Some characters could not be read. The file is probably not UTF-8: re-save it as "CSV UTF-8" and re-upload to avoid garbled text.');
  }
  if (result.meta.delimiter && result.meta.delimiter !== ',') {
    notes.push(`Detected "${result.meta.delimiter === '\t' ? 'tab' : result.meta.delimiter}" as the column separator.`);
  }

  return { ok: true, csv: { headers, rows, delimiter: result.meta.delimiter ?? ',', notes } };
}

/** First row (1-based, data rows only) holding a cell over the server's limit, or null. */
export function findOverlongCell(rows: readonly string[][]): { row: number; length: number } | null {
  for (let i = 0; i < rows.length; i += 1) {
    for (const cell of rows[i]) {
      if (cell.length > IMPORT_MAX_CELL_LENGTH) return { row: i + 1, length: cell.length };
    }
  }
  return null;
}

// =============================================================================
// COLUMN MAPPING
// =============================================================================

/** Lower-cases and drops everything but letters and digits, so "Start Time", "start_time" and "START-TIME" agree. */
export function normalizeHeader(header: string): string {
  return header.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

/** field key -> index of the CSV column mapped to it, or null for "not imported". */
export type ColumnMapping = Record<string, number | null>;

/**
 * Proposes a mapping by header name. A field's own key and template header win over looser
 * synonyms, and each column is used by at most one field.
 */
export function autoMapColumns(headers: readonly string[], fields: readonly ImportFieldDef[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const taken = new Set<number>();
  const mapping: ColumnMapping = Object.fromEntries(fields.map((f) => [f.key, null]));

  const claim = (field: ImportFieldDef, candidates: readonly string[]): boolean => {
    for (const candidate of candidates) {
      const index = normalized.findIndex((h, i) => h === candidate && !taken.has(i));
      if (index >= 0) {
        mapping[field.key] = index;
        taken.add(index);
        return true;
      }
    }
    return false;
  };

  // Pass 1: exact key / template header, so "notes" is never stolen by another field's alias.
  for (const field of fields) {
    claim(field, [normalizeHeader(field.key), normalizeHeader(field.templateHeader)]);
  }
  // Pass 2: synonyms.
  for (const field of fields) {
    if (mapping[field.key] === null) claim(field, field.aliases);
  }
  return mapping;
}

/** Required fields that no column is mapped to. */
export function missingRequiredFields(mapping: ColumnMapping, fields: readonly ImportFieldDef[]): ImportFieldDef[] {
  return fields.filter((f) => f.required && mapping[f.key] == null);
}

/** Applies the mapping to produce the API payload rows; unmapped fields are omitted. */
export function buildRowPayloads(rows: readonly string[][], mapping: ColumnMapping): ImportRowPayload[] {
  const entries = Object.entries(mapping).filter((entry): entry is [string, number] => entry[1] !== null);
  return rows.map((cells) => {
    const payload: ImportRowPayload = {};
    for (const [key, columnIndex] of entries) payload[key] = cells[columnIndex] ?? '';
    return payload;
  });
}

// =============================================================================
// CSV OUTPUT (template and error report)
// =============================================================================

const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/**
 * Stops spreadsheet apps from running a cell as a formula (CSV injection): a cell starting with
 * `=`, `+`, `-`, `@`, tab or CR gets a leading apostrophe. A plain number such as `-33.86` is
 * left alone, because it cannot be a formula and prefixing would corrupt coordinates.
 */
export function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value) && !PLAIN_NUMBER.test(value)) return `'${value}`;
  return value;
}

/** Serialises rows as RFC 4180 CSV (CRLF), quoting where needed and neutralising formulas. */
export function toCsvText(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const safe = neutralizeFormula(cell);
          return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(',')
    )
    .join('\r\n');
}

const TEMPLATE_ROWS: Record<ImportEntity, Record<string, string>[]> = {
  locations: [
    { name: 'Eiffel Tower', address: 'Champ de Mars, 5 Avenue Anatole France, 75007 Paris', latitude: '48.8584', longitude: '2.2945', notes: 'Go at sunset', opening_hours: 'Mo-Su 09:00-23:00', timezone: 'Europe/Paris' },
    { name: 'Local bakery', address: '12 Rue Cler, 75007 Paris', notes: 'Address only: imported without coordinates' },
  ],
  activities: [
    { name: 'Louvre visit', description: 'Skip-the-line tickets', start_time: '2026-04-03 10:00', end_time: '2026-04-03 12:30', timezone: 'Europe/Paris', all_day: 'false', cost: '45.00', currency: 'EUR', booking_url: 'https://example.com/tickets', booking_reference: 'ABC123', notes: 'Meet at the pyramid' },
    { name: 'Seine cruise', start_time: '2026-04-03T19:00:00+02:00', end_time: '2026-04-03T20:00:00+02:00', cost: '18.5', currency: 'EUR' },
  ],
};

/** Template CSV: a header row and two example rows, in the same shape the importer maps automatically. */
export function buildTemplateCsv(entity: ImportEntity): string {
  const fields = IMPORT_FIELDS[entity];
  const header = fields.map((f) => f.templateHeader);
  const rows = TEMPLATE_ROWS[entity].map((example) => header.map((h) => example[h] ?? ''));
  return toCsvText([header, ...rows]);
}

/**
 * Error report: the original columns plus the original row number, a status and the reasons.
 * Includes every row that was not created (invalid and excluded), so it can be fixed and
 * re-imported on its own.
 */
export function buildErrorReportCsv(
  headers: readonly string[],
  rows: readonly string[][],
  results: readonly ImportRowResult[]
): string {
  const lines: string[][] = [['Row', ...headers, 'Status', 'Reason']];
  for (const result of results) {
    if (result.status === 'created' || result.status === 'valid') continue;
    const original = rows[result.index] ?? [];
    const reasons =
      result.status === 'invalid'
        ? result.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
        : ['Left out at your request', ...result.warnings.map((w) => w.message)];
    lines.push([
      String(result.index + 1),
      ...headers.map((_, i) => original[i] ?? ''),
      result.status === 'invalid' ? 'Rejected' : 'Skipped',
      reasons.join(' | '),
    ]);
  }
  return toCsvText(lines);
}

/** Saves text as a file. A BOM is prefixed so Excel opens it as UTF-8. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
