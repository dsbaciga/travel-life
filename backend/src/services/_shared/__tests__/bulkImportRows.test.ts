/**
 * Bulk Import Row Helper Tests
 *
 * Test cases:
 * - BIR-001: Cell cleaning trims, strips BOM/NBSP, and maps blank to undefined
 * - BIR-002: Coordinates accept plain decimals and reject commas and out-of-range values
 * - BIR-003: Amounts normalise to a 2-place decimal string
 * - BIR-004: Ambiguous or malformed amounts are rejected with a clear message
 * - BIR-005: Currency must be a supported ISO code
 * - BIR-006: Wall-clock date-times are read in the supplied zone, never as UTC
 * - BIR-007: ISO 8601 with an offset or Z is taken as given
 * - BIR-008: Ambiguous and invalid dates are rejected naming the accepted formats
 * - BIR-009: A bare date needs all-day
 * - BIR-010: Timezone cells are validated
 * - BIR-011: Names and categories match case-insensitively; ambiguous matches are reported
 * - BIR-012: Duplicate locations need the same name and the same place
 * - BIR-013: Duplicate activities need the same name and start instant
 */

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
} from '../bulkImportRows';

describe('bulkImportRows', () => {
  describe('cleanCell', () => {
    it('BIR-001: trims, strips BOM and NBSP, blank becomes undefined', () => {
      expect(cleanCell('  Louvre  ')).toBe('Louvre');
      expect(cleanCell(String.fromCharCode(0xfeff) + 'Name')).toBe('Name');
      expect(cleanCell(String.fromCharCode(0xa0) + 'x' + String.fromCharCode(0xa0))).toBe('x');
      expect(cleanCell('a\u0000b')).toBe('ab');
      expect(cleanCell('\u0000')).toBeUndefined();
      expect(cleanCell('   ')).toBeUndefined();
      expect(cleanCell('')).toBeUndefined();
      expect(cleanCell(undefined)).toBeUndefined();
      expect(cleanCell(null)).toBeUndefined();
    });
  });

  describe('parseCoordinate', () => {
    it('BIR-002: accepts plain decimals', () => {
      expect(parseCoordinate('48.8584', 'latitude')).toEqual({ ok: true, value: 48.8584 });
      expect(parseCoordinate('-122.4', 'longitude')).toEqual({ ok: true, value: -122.4 });
      expect(parseCoordinate('90', 'latitude')).toEqual({ ok: true, value: 90 });
      expect(parseCoordinate('-180', 'longitude')).toEqual({ ok: true, value: -180 });
      expect(parseCoordinate(undefined, 'latitude')).toEqual({ ok: true, value: undefined });
    });

    it('BIR-002: rejects comma decimals, junk and out-of-range values', () => {
      expect(parseCoordinate('48,8584', 'latitude').ok).toBe(false);
      expect(parseCoordinate('abc', 'latitude').ok).toBe(false);
      expect(parseCoordinate('90.0001', 'latitude')).toEqual({ ok: false, error: 'Latitude must be between -90 and 90' });
      expect(parseCoordinate('181', 'longitude')).toEqual({ ok: false, error: 'Longitude must be between -180 and 180' });
      expect(parseCoordinate('-91', 'latitude').ok).toBe(false);
    });
  });

  describe('parseAmount', () => {
    it('BIR-003: normalises to two decimal places as a string', () => {
      expect(parseAmount('1234.50')).toEqual({ ok: true, value: '1234.50' });
      expect(parseAmount('1234.5')).toEqual({ ok: true, value: '1234.50' });
      expect(parseAmount('1234')).toEqual({ ok: true, value: '1234.00' });
      expect(parseAmount('0')).toEqual({ ok: true, value: '0.00' });
      expect(parseAmount('007.10')).toEqual({ ok: true, value: '7.10' });
      expect(parseAmount('0.1')).toEqual({ ok: true, value: '0.10' });
      expect(parseAmount(undefined)).toEqual({ ok: true, value: undefined });
    });

    it('BIR-004: rejects ambiguous separators, negatives, junk and too many places', () => {
      const comma = parseAmount('1.234,50');
      expect(comma.ok).toBe(false);
      expect(comma.ok === false && comma.error).toMatch(/ambiguous/);
      expect(parseAmount('1,234.50').ok).toBe(false);
      expect(parseAmount('12,5').ok).toBe(false);
      expect(parseAmount('-5').ok).toBe(false);
      expect(parseAmount('$10').ok).toBe(false);
      expect(parseAmount('1.234').ok).toBe(false);
      expect(parseAmount('10.999')).toEqual({ ok: false, error: 'Cost can have at most 2 decimal places' });
      expect(parseAmount('100000000').ok).toBe(false);
      expect(parseAmount('99999999.99')).toEqual({ ok: true, value: '99999999.99' });
    });
  });

  describe('parseCurrency / parseBooleanCell', () => {
    it('BIR-005: upper-cases supported codes and rejects the rest', () => {
      expect(parseCurrency('eur')).toEqual({ ok: true, value: 'EUR' });
      expect(parseCurrency(undefined)).toEqual({ ok: true, value: undefined });
      expect(parseCurrency('EU').ok).toBe(false);
      expect(parseCurrency('XXX').ok).toBe(false);
      expect(parseCurrency('€').ok).toBe(false);
    });

    it('parses yes/no values', () => {
      expect(parseBooleanCell('Yes')).toEqual({ ok: true, value: true });
      expect(parseBooleanCell('0')).toEqual({ ok: true, value: false });
      expect(parseBooleanCell(undefined)).toEqual({ ok: true, value: undefined });
      expect(parseBooleanCell('maybe').ok).toBe(false);
    });
  });

  describe('parseDateTimeCell', () => {
    it('BIR-006: reads a wall-clock time in the given zone, not as UTC', () => {
      // Paris is UTC+2 in April (CEST): 10:30 local is 08:30Z
      expect(parseDateTimeCell('2026-04-03 10:30', 'Europe/Paris')).toEqual({
        ok: true,
        value: { iso: '2026-04-03T08:30:00.000Z', kind: 'wall' },
      });
      // Same wall clock in New York (EDT, UTC-4) is a different instant
      expect(parseDateTimeCell('2026-04-03T10:30', 'America/New_York')).toEqual({
        ok: true,
        value: { iso: '2026-04-03T14:30:00.000Z', kind: 'wall' },
      });
      // Winter: Paris is UTC+1
      expect(parseDateTimeCell('2026-01-15 10:30:15', 'Europe/Paris')).toEqual({
        ok: true,
        value: { iso: '2026-01-15T09:30:15.000Z', kind: 'wall' },
      });
    });

    it('BIR-007: takes ISO 8601 with an offset or Z as given, ignoring the zone', () => {
      expect(parseDateTimeCell('2026-04-03T10:30:00+02:00', 'America/New_York')).toEqual({
        ok: true,
        value: { iso: '2026-04-03T08:30:00.000Z', kind: 'offset' },
      });
      expect(parseDateTimeCell('2026-04-03T08:30:00Z', 'Asia/Tokyo')).toEqual({
        ok: true,
        value: { iso: '2026-04-03T08:30:00.000Z', kind: 'offset' },
      });
      expect(parseDateTimeCell('2026-04-03T08:30:00.123-0530', 'UTC')).toEqual({
        ok: true,
        value: { iso: '2026-04-03T14:00:00.000Z', kind: 'offset' },
      });
    });

    it('BIR-008: rejects ambiguous formats naming the accepted ones', () => {
      for (const bad of ['03/04/2026', '3/4/26', '4 Mar 2026', '2026/04/03 10:00', '10:30', 'tomorrow']) {
        const result = parseDateTimeCell(bad, 'UTC');
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toContain('YYYY-MM-DD HH:mm');
      }
    });

    it('BIR-008: rejects impossible dates and times', () => {
      expect(parseDateTimeCell('2026-02-30 10:00', 'UTC').ok).toBe(false);
      expect(parseDateTimeCell('2026-13-01 10:00', 'UTC').ok).toBe(false);
      expect(parseDateTimeCell('2026-04-03 24:00', 'UTC').ok).toBe(false);
      expect(parseDateTimeCell('2026-04-03 10:60', 'UTC').ok).toBe(false);
      expect(parseDateTimeCell('2026-04-03T10:00:00+25:00', 'UTC').ok).toBe(false);
      expect(parseDateTimeCell('2028-02-29 10:00', 'UTC').ok).toBe(true);
      expect(parseDateTimeCell('2026-02-29 10:00', 'UTC').ok).toBe(false);
    });

    it('BIR-009: a bare date is only accepted for all-day items', () => {
      const rejected = parseDateTimeCell('2026-04-03', 'Europe/Paris');
      expect(rejected.ok).toBe(false);
      expect(rejected.ok === false && rejected.error).toMatch(/all_day/);
      expect(parseDateTimeCell('2026-04-03', 'Europe/Paris', { allDay: true })).toEqual({
        ok: true,
        value: { iso: '2026-04-02T22:00:00.000Z', kind: 'date' },
      });
    });

    it('treats blank as not provided', () => {
      expect(parseDateTimeCell(undefined, 'UTC')).toEqual({ ok: true, value: undefined });
    });
  });

  describe('parseTimezoneCell', () => {
    it('BIR-010: accepts IANA names and rejects others', () => {
      expect(parseTimezoneCell('Europe/Paris')).toEqual({ ok: true, value: 'Europe/Paris' });
      expect(parseTimezoneCell(undefined)).toEqual({ ok: true, value: undefined });
      expect(parseTimezoneCell('Mars/Olympus').ok).toBe(false);
      expect(parseTimezoneCell('PST8PDT-ish').ok).toBe(false);
    });
  });

  describe('matching', () => {
    it('BIR-011: matches categories case- and spacing-insensitively and returns the canonical name', () => {
      expect(matchCategoryName('  sight  seeing ', ['Dining', 'Sight seeing'])).toBe('Sight seeing');
      expect(matchCategoryName('DINING', ['Dining'])).toBe('Dining');
      expect(matchCategoryName('Nightlife', ['Dining'])).toBeUndefined();
    });

    it('BIR-011: matchByName reports none, one and many', () => {
      const items = [
        { id: 1, name: 'Louvre' },
        { id: 2, name: 'Cafe' },
        { id: 3, name: 'cafe' },
      ];
      expect(matchByName('LOUVRE', items)).toEqual({ kind: 'one', id: 1 });
      expect(matchByName('Cafe', items)).toEqual({ kind: 'many', count: 2 });
      expect(matchByName('Eiffel', items)).toEqual({ kind: 'none' });
    });
  });

  describe('duplicates', () => {
    it('BIR-012: locations duplicate on name plus near-identical coordinates', () => {
      const base = { name: 'Louvre', latitude: 48.8606, longitude: 2.3376 };
      expect(isDuplicateLocation(base, { name: ' louvre ', latitude: 48.8607, longitude: 2.3377 })).toBe(true);
      expect(isDuplicateLocation(base, { name: 'Louvre', latitude: 48.9, longitude: 2.3376 })).toBe(false);
      expect(isDuplicateLocation(base, { name: 'Orsay', latitude: 48.8606, longitude: 2.3376 })).toBe(false);
    });

    it('BIR-012: a location without coordinates duplicates on name alone', () => {
      expect(isDuplicateLocation({ name: 'Louvre' }, { name: 'LOUVRE', latitude: 1, longitude: 2 })).toBe(true);
      expect(isDuplicateLocation({ name: 'A', latitude: null, longitude: null }, { name: 'A' })).toBe(true);
    });

    it('BIR-013: activities duplicate on name and the same start instant', () => {
      const a = { name: 'Tour', startTime: '2026-04-03T08:30:00.000Z' };
      expect(isDuplicateActivity(a, { name: 'tour', startTime: new Date('2026-04-03T08:30:00Z') })).toBe(true);
      expect(isDuplicateActivity(a, { name: 'Tour', startTime: '2026-04-03T09:30:00.000Z' })).toBe(false);
      expect(isDuplicateActivity(a, { name: 'Tour', startTime: null })).toBe(false);
      expect(isDuplicateActivity({ name: 'Tour' }, { name: 'Tour', startTime: null })).toBe(true);
    });

    it('findDuplicateIndex returns the first match or -1', () => {
      const pool = [{ name: 'a' }, { name: 'b' }, { name: 'b' }];
      expect(findDuplicateIndex({ name: 'b' }, pool, (x, y) => x.name === y.name)).toBe(1);
      expect(findDuplicateIndex({ name: 'z' }, pool, (x, y) => x.name === y.name)).toBe(-1);
    });
  });
});
