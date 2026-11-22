/**
 * CSV import utility tests
 *
 * Test cases:
 * - CSV-001: Quoted fields keep commas, newlines and escaped quotes
 * - CSV-002: BOM, CRLF and trailing blank lines are handled
 * - CSV-003: A semicolon delimiter (Excel in many locales) is detected
 * - CSV-004: Blank and duplicate headers are made unique
 * - CSV-005: Empty files, header-only files and unclosed quotes are reported
 * - CSV-006: Short rows are padded; extra non-empty cells are noted
 * - CSV-007: Headers auto-match case-, spacing- and underscore-insensitively, with synonyms
 * - CSV-008: A column is never mapped to two fields
 * - CSV-009: Required fields are reported when unmapped
 * - CSV-010: Row payloads contain only mapped fields
 * - CSV-011: Formula-looking cells are neutralised in exported CSV, numbers are not
 * - CSV-012: Output quoting round-trips through the parser
 * - CSV-013: The template maps itself automatically and has two example rows
 * - CSV-014: The error report lists rejected and skipped rows with reasons
 * - CSV-015: Lodging headers map automatically and required fields are reported
 * - CSV-016: Transportation headers map automatically
 */

import { describe, it, expect } from 'vitest';
import {
  IMPORT_FIELDS,
  autoMapColumns,
  buildErrorReportCsv,
  buildRowPayloads,
  buildTemplateCsv,
  findOverlongCell,
  missingRequiredFields,
  neutralizeFormula,
  normalizeHeader,
  parseCsv,
  toCsvText,
  uniqueHeaders,
} from '../csvImport';
import type { ImportRowResult } from '../../types/bulkImport';

function parseOk(text: string) {
  const result = parseCsv(text);
  if (!result.ok) throw new Error(result.error);
  return result.csv;
}

describe('parseCsv', () => {
  it('CSV-001: keeps commas, newlines and escaped quotes inside quoted fields', () => {
    const csv = parseOk('name,notes\r\n"Cafe, Paris","line one\nline two"\r\n"He said ""hi""",x');
    expect(csv.headers).toEqual(['name', 'notes']);
    expect(csv.rows).toEqual([
      ['Cafe, Paris', 'line one\nline two'],
      ['He said "hi"', 'x'],
    ]);
  });

  it('CSV-002: strips a BOM, accepts CRLF and ignores trailing blank lines', () => {
    const csv = parseOk(String.fromCharCode(0xfeff) + 'name,lat\r\nA,1\r\nB,2\r\n\r\n\r\n');
    expect(csv.headers).toEqual(['name', 'lat']);
    expect(csv.rows).toEqual([['A', '1'], ['B', '2']]);
  });

  it('CSV-002: skips rows that are only separators', () => {
    const csv = parseOk('name,lat\nA,1\n,\n,,\n');
    expect(csv.rows).toEqual([['A', '1']]);
  });

  it('CSV-003: detects a semicolon delimiter', () => {
    const csv = parseOk('name;lat;lng\nA;1,5;2\nB;3;4');
    expect(csv.delimiter).toBe(';');
    expect(csv.headers).toEqual(['name', 'lat', 'lng']);
    expect(csv.rows[0]).toEqual(['A', '1,5', '2']);
    expect(csv.notes.join(' ')).toMatch(/";"/);
  });

  it('CSV-003: detects tabs', () => {
    const csv = parseOk('name\tlat\nA\t1');
    expect(csv.headers).toEqual(['name', 'lat']);
  });

  it('CSV-004: makes blank and duplicate headers unique', () => {
    expect(uniqueHeaders(['name', '', 'Name', 'name', ' '])).toEqual(['name', 'Column 2', 'Name (2)', 'name (3)', 'Column 5']);
    const csv = parseOk('name,,name\nA,B,C');
    expect(csv.headers).toEqual(['name', 'Column 2', 'name (2)']);
    expect(csv.rows[0]).toEqual(['A', 'B', 'C']);
  });

  it('CSV-005: reports empty, header-only and badly quoted files', () => {
    expect(parseCsv('')).toEqual({ ok: false, error: 'The file is empty.' });
    expect(parseCsv('  \n \n').ok).toBe(false);
    const headerOnly = parseCsv('name,lat\n');
    expect(headerOnly.ok).toBe(false);
    const unclosed = parseCsv('name,notes\nA,"never closed\nB,2');
    expect(unclosed.ok).toBe(false);
    expect(unclosed.ok === false && unclosed.error).toMatch(/quote/);
  });

  it('CSV-006: pads short rows and notes extra cells', () => {
    const csv = parseOk('a,b,c\n1\n1,2,3,4\n1,2,3');
    expect(csv.rows).toEqual([['1', '', ''], ['1', '2', '3'], ['1', '2', '3']]);
    expect(csv.notes.join(' ')).toMatch(/1 row has more cells/);
  });

  it('flags replacement characters as a probable encoding problem', () => {
    const csv = parseOk('name\nCaf�');
    expect(csv.notes.join(' ')).toMatch(/UTF-8/);
  });

  it('finds over-long cells', () => {
    expect(findOverlongCell([['a'], ['x'.repeat(20001)]])).toEqual({ row: 2, length: 20001 });
    expect(findOverlongCell([['a']])).toBeNull();
  });
});

describe('column mapping', () => {
  it('CSV-007: normalises headers', () => {
    expect(normalizeHeader(' Start_Time ')).toBe('starttime');
    expect(normalizeHeader('START-TIME')).toBe('starttime');
    expect(normalizeHeader('Opening Hours')).toBe('openinghours');
  });

  it('CSV-007: matches location headers including synonyms', () => {
    const headers = ['Title', 'Street Address', 'Lat', 'LON', 'Type', 'Comments', 'Opening_Hours', 'TZ'];
    const mapping = autoMapColumns(headers, IMPORT_FIELDS.locations);
    expect(mapping).toEqual({
      name: 0, address: 1, latitude: 2, longitude: 3, category: 4, notes: 5, openingHours: 6, timezone: 7,
    });
  });

  it('CSV-007: matches activity headers', () => {
    const headers = ['Activity', 'Start', 'End', 'Price', 'Curr', 'Venue', 'Confirmation Number', 'URL', 'All Day'];
    const mapping = autoMapColumns(headers, IMPORT_FIELDS.activities);
    expect(mapping.name).toBe(0);
    expect(mapping.startTime).toBe(1);
    expect(mapping.endTime).toBe(2);
    expect(mapping.cost).toBe(3);
    expect(mapping.currency).toBe(4);
    expect(mapping.location).toBe(5);
    expect(mapping.bookingReference).toBe(6);
    expect(mapping.bookingUrl).toBe(7);
    expect(mapping.allDay).toBe(8);
    expect(mapping.description).toBeNull();
  });

  it('CSV-015: matches lodging headers', () => {
    const headers = ['Hotel', 'Accommodation Type', 'Check In', 'Check Out', 'TZ', 'Confirmation', 'Total', 'Currency Code', 'Link'];
    const mapping = autoMapColumns(headers, IMPORT_FIELDS.lodging);
    expect(mapping.name).toBe(0);
    expect(mapping.type).toBe(1);
    expect(mapping.checkInDate).toBe(2);
    expect(mapping.checkOutDate).toBe(3);
    expect(mapping.timezone).toBe(4);
    expect(mapping.confirmationNumber).toBe(5);
    expect(mapping.cost).toBe(6);
    expect(mapping.currency).toBe(7);
    expect(mapping.bookingUrl).toBe(8);
    expect(missingRequiredFields(autoMapColumns(['name'], IMPORT_FIELDS.lodging), IMPORT_FIELDS.lodging).map((f) => f.key)).toEqual([
      'type',
      'checkInDate',
      'checkOutDate',
    ]);
  });

  it('CSV-016: matches transportation headers', () => {
    const headers = ['Mode', 'Origin', 'Destination', 'Departs', 'Arrives', 'Departure Timezone', 'Airline', 'Flight Number', 'Price'];
    const mapping = autoMapColumns(headers, IMPORT_FIELDS.transportation);
    expect(mapping.type).toBe(0);
    expect(mapping.fromLocationName).toBe(1);
    expect(mapping.toLocationName).toBe(2);
    expect(mapping.departureTime).toBe(3);
    expect(mapping.arrivalTime).toBe(4);
    expect(mapping.startTimezone).toBe(5);
    expect(mapping.carrier).toBe(6);
    expect(mapping.vehicleNumber).toBe(7);
    expect(mapping.cost).toBe(8);
    expect(mapping.endTimezone).toBeNull();
  });

  it('CSV-008: never maps one column to two fields, and exact names beat synonyms', () => {
    // "description" is a synonym for location notes, but here a real "notes" column exists.
    const mapping = autoMapColumns(['name', 'description', 'notes'], IMPORT_FIELDS.locations);
    expect(mapping.notes).toBe(2);
    const used = Object.values(mapping).filter((v) => v !== null);
    expect(new Set(used).size).toBe(used.length);
  });

  it('CSV-009: reports unmapped required fields', () => {
    const mapping = autoMapColumns(['foo', 'bar'], IMPORT_FIELDS.locations);
    expect(missingRequiredFields(mapping, IMPORT_FIELDS.locations).map((f) => f.key)).toEqual(['name']);
    const ok = autoMapColumns(['name'], IMPORT_FIELDS.locations);
    expect(missingRequiredFields(ok, IMPORT_FIELDS.locations)).toEqual([]);
  });

  it('CSV-010: payloads contain only mapped fields', () => {
    const payload = buildRowPayloads([['A', 'x', '1']], { name: 0, latitude: 2, address: null });
    expect(payload).toEqual([{ name: 'A', latitude: '1' }]);
  });
});

describe('CSV output', () => {
  it('CSV-011: neutralises formula-looking cells but not plain numbers', () => {
    expect(neutralizeFormula('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(neutralizeFormula('+cmd|calc')).toBe("'+cmd|calc");
    expect(neutralizeFormula('-1+1')).toBe("'-1+1");
    expect(neutralizeFormula('@SUM(1)')).toBe("'@SUM(1)");
    expect(neutralizeFormula('\tx')).toBe("'\tx");
    expect(neutralizeFormula('-33.86')).toBe('-33.86');
    expect(neutralizeFormula('+5')).toBe('+5');
    expect(neutralizeFormula('Normal text')).toBe('Normal text');
    expect(neutralizeFormula('')).toBe('');
  });

  it('CSV-012: quoting survives a round trip', () => {
    const rows = [['name', 'notes'], ['Cafe, Paris', 'He said "hi"\nnext line'], ['=HYPERLINK("x")', 'plain']];
    const parsed = parseOk(toCsvText(rows));
    expect(parsed.rows[0]).toEqual(['Cafe, Paris', 'He said "hi"\nnext line']);
    expect(parsed.rows[1][0]).toBe('\'=HYPERLINK("x")');
  });

  it('CSV-013: templates map themselves automatically and have two example rows', () => {
    for (const entity of ['locations', 'activities', 'lodging', 'transportation'] as const) {
      const csv = parseOk(buildTemplateCsv(entity));
      expect(csv.rows).toHaveLength(2);
      const mapping = autoMapColumns(csv.headers, IMPORT_FIELDS[entity]);
      expect(Object.values(mapping).every((v) => v !== null)).toBe(true);
    }
  });

  it('CSV-014: error report lists rejected and skipped rows only, with reasons', () => {
    const headers = ['name', 'lat'];
    const rows = [['Good', '1'], ['=Bad()', '999'], ['Dup', '2']];
    const results: ImportRowResult[] = [
      { index: 0, status: 'created', errors: [], warnings: [], normalized: {} },
      { index: 1, status: 'invalid', errors: [{ field: 'latitude', code: 'invalid', message: 'Latitude must be between -90 and 90' }], warnings: [], normalized: {} },
      { index: 2, status: 'excluded', errors: [], warnings: [{ field: 'name', code: 'duplicate_existing', message: 'Looks like a duplicate' }], normalized: {} },
    ];
    const report = parseOk(buildErrorReportCsv(headers, rows, results));
    expect(report.headers).toEqual(['Row', 'name', 'lat', 'Status', 'Reason']);
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toEqual(['2', "'=Bad()", '999', 'Rejected', 'latitude: Latitude must be between -90 and 90']);
    expect(report.rows[1][3]).toBe('Skipped');
    expect(report.rows[1][4]).toContain('Looks like a duplicate');
  });
});
