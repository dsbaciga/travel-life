/**
 * Bulk Import Evaluator Tests
 *
 * Test cases:
 * - BIE-001: A valid location row produces schema-valid data
 * - BIE-002: Missing name, bad and half coordinates are per-field errors
 * - BIE-003: Address without coordinates is a no_coordinates warning, not an error
 * - BIE-004: Unknown location category is a warning and leaves it uncategorised
 * - BIE-005: Duplicate locations are flagged against existing items and earlier rows
 * - BIE-006: Over-long location fields are rejected with the form limit
 * - BIE-007: Activity wall-clock times use the row zone, else the default zone
 * - BIE-008: Activity end before start is an error
 * - BIE-009: Cost stays a decimal string; ambiguous cost and bad currency are errors
 * - BIE-010: Cost without currency is a warning
 * - BIE-011: Activity location links match by name; missing/ambiguous are warnings
 * - BIE-012: Unknown activity category is a warning
 * - BIE-013: Duplicate activities are flagged against existing items and earlier rows
 * - BIE-014: Invalid rows carry no data; later rows still evaluate
 */

import { evaluateActivityRows, evaluateLocationRows } from '../bulkImportEvaluators';

const locationCtx = {
  tripId: 7,
  categories: [{ id: 3, name: 'Museum' }],
  existing: [{ name: 'Louvre', latitude: 48.8606, longitude: 2.3376 }],
};

const activityCtx = {
  tripId: 7,
  defaultTimezone: 'Europe/Paris',
  categories: ['Dining', 'Sightseeing'],
  locations: [
    { id: 11, name: 'Louvre' },
    { id: 12, name: 'Cafe' },
    { id: 13, name: 'cafe' },
  ],
  existing: [{ name: 'Seine cruise', startTime: new Date('2026-04-03T17:00:00Z') }],
};

describe('evaluateLocationRows', () => {
  it('BIE-001: valid row yields data', () => {
    const [row] = evaluateLocationRows(
      [{ name: ' Orsay ', latitude: '48.86', longitude: '2.32', category: 'museum', notes: 'n' }],
      locationCtx
    );
    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({ tripId: 7, name: 'Orsay', latitude: 48.86, longitude: 2.32, categoryId: 3, notes: 'n' });
    expect(row.normalized.category).toBe('Museum');
  });

  it('BIE-002: name required, coordinates validated and paired', () => {
    const rows = evaluateLocationRows(
      [
        { name: '', latitude: '1', longitude: '2' },
        { name: 'A', latitude: '95', longitude: '2' },
        { name: 'B', latitude: '12', longitude: '' },
        { name: 'C', latitude: '', longitude: '12' },
        { name: 'D', latitude: '1,5', longitude: '2' },
      ],
      locationCtx
    );
    expect(rows[0].errors).toEqual([{ field: 'name', code: 'invalid', message: 'Name is required' }]);
    expect(rows[1].errors[0]).toMatchObject({ field: 'latitude', message: 'Latitude must be between -90 and 90' });
    expect(rows[2].errors[0]).toMatchObject({ field: 'longitude' });
    expect(rows[3].errors[0]).toMatchObject({ field: 'latitude' });
    expect(rows[4].errors[0]).toMatchObject({ field: 'latitude' });
    expect(rows.every((r) => r.data === undefined)).toBe(true);
  });

  it('BIE-003: address without coordinates warns and still imports', () => {
    const [row] = evaluateLocationRows([{ name: 'Cafe X', address: '1 Rue de Rivoli, Paris' }], locationCtx);
    expect(row.errors).toEqual([]);
    expect(row.data?.latitude).toBeUndefined();
    expect(row.warnings.map((w) => w.code)).toEqual(['no_coordinates']);
    expect(row.warnings[0].message).toMatch(/not geocoded/);
  });

  it('BIE-004: unknown category warns', () => {
    const [row] = evaluateLocationRows([{ name: 'X', latitude: '1', longitude: '1', category: 'Spaceport' }], locationCtx);
    expect(row.errors).toEqual([]);
    expect(row.data?.categoryId).toBeUndefined();
    expect(row.warnings).toEqual([expect.objectContaining({ code: 'unknown_category', field: 'category' })]);
  });

  it('BIE-005: flags duplicates of existing locations and of earlier rows', () => {
    const rows = evaluateLocationRows(
      [
        { name: 'louvre', latitude: '48.8607', longitude: '2.3377' },
        { name: 'New Place', latitude: '10', longitude: '10' },
        { name: 'new place', latitude: '10.0001', longitude: '10.0001' },
        { name: 'New Place', latitude: '50', longitude: '50' },
      ],
      locationCtx
    );
    expect(rows[0].warnings.map((w) => w.code)).toEqual(['duplicate_existing']);
    expect(rows[1].warnings).toEqual([]);
    expect(rows[2].warnings).toEqual([expect.objectContaining({ code: 'duplicate_in_file', message: expect.stringContaining('row 2') })]);
    expect(rows[3].warnings).toEqual([]);
  });

  it('BIE-006: enforces the 500 character name limit from the form schema', () => {
    const [row] = evaluateLocationRows([{ name: 'x'.repeat(501), latitude: '1', longitude: '1' }], locationCtx);
    expect(row.errors).toEqual([{ field: 'name', code: 'invalid', message: 'Must be at most 500 characters' }]);
  });
});

describe('evaluateActivityRows', () => {
  it('BIE-007: wall-clock times use the row timezone, else the default zone', () => {
    const rows = evaluateActivityRows(
      [
        { name: 'A', startTime: '2026-04-03 10:00' },
        { name: 'B', startTime: '2026-04-03 10:00', timezone: 'Asia/Tokyo' },
        { name: 'C', startTime: '2026-04-03T10:00:00Z' },
      ],
      activityCtx
    );
    expect(rows[0].data?.activity.startTime).toBe('2026-04-03T08:00:00.000Z');
    expect(rows[0].data?.activity.timezone).toBe('Europe/Paris');
    expect(rows[1].data?.activity.startTime).toBe('2026-04-03T01:00:00.000Z');
    expect(rows[1].data?.activity.timezone).toBe('Asia/Tokyo');
    expect(rows[2].data?.activity.startTime).toBe('2026-04-03T10:00:00.000Z');
    expect(rows[2].data?.activity.timezone).toBeUndefined();
  });

  it('rejects ambiguous dates with the accepted formats', () => {
    const [row] = evaluateActivityRows([{ name: 'A', startTime: '03/04/2026' }], activityCtx);
    expect(row.errors).toEqual([expect.objectContaining({ field: 'startTime', message: expect.stringContaining('Accepted formats') })]);
  });

  it('BIE-008: end before start is an error', () => {
    const [row] = evaluateActivityRows([{ name: 'A', startTime: '2026-04-03 10:00', endTime: '2026-04-03 09:00' }], activityCtx);
    expect(row.errors).toEqual([expect.objectContaining({ field: 'endTime' })]);
  });

  it('BIE-009: cost stays a decimal string and bad costs/currencies are errors', () => {
    const rows = evaluateActivityRows(
      [
        { name: 'A', cost: '1234.5', currency: 'eur' },
        { name: 'B', cost: '1.234,50', currency: 'EUR' },
        { name: 'C', cost: '5', currency: 'ZZZ' },
      ],
      activityCtx
    );
    expect(rows[0].data?.costDecimal).toBe('1234.50');
    expect(rows[0].data?.activity.currency).toBe('EUR');
    expect(rows[1].errors).toEqual([expect.objectContaining({ field: 'cost' })]);
    expect(rows[2].errors).toEqual([expect.objectContaining({ field: 'currency' })]);
  });

  it('BIE-010: cost without currency warns', () => {
    const [row] = evaluateActivityRows([{ name: 'A', cost: '10' }], activityCtx);
    expect(row.errors).toEqual([]);
    expect(row.warnings.map((w) => w.code)).toEqual(['cost_without_currency']);
  });

  it('BIE-011: links by location name; missing and ambiguous names warn', () => {
    const rows = evaluateActivityRows(
      [
        { name: 'A', location: 'LOUVRE' },
        { name: 'B', location: 'Nowhere' },
        { name: 'C', location: 'Cafe' },
      ],
      activityCtx
    );
    expect(rows[0].data?.locationId).toBe(11);
    expect(rows[1].data?.locationId).toBeUndefined();
    expect(rows[1].warnings.map((w) => w.code)).toEqual(['location_not_found']);
    expect(rows[2].data?.locationId).toBeUndefined();
    expect(rows[2].warnings.map((w) => w.code)).toEqual(['location_ambiguous']);
  });

  it('BIE-012: unknown category warns and matches known ones case-insensitively', () => {
    const rows = evaluateActivityRows([{ name: 'A', category: 'dining' }, { name: 'B', category: 'Karaoke' }], activityCtx);
    expect(rows[0].data?.activity.category).toBe('Dining');
    expect(rows[1].data?.activity.category).toBeUndefined();
    expect(rows[1].warnings.map((w) => w.code)).toEqual(['unknown_category']);
  });

  it('BIE-013: flags duplicates of existing activities and earlier rows', () => {
    const rows = evaluateActivityRows(
      [
        { name: 'seine cruise', startTime: '2026-04-03 19:00' }, // 17:00Z in Paris
        { name: 'Walk', startTime: '2026-04-04 09:00' },
        { name: 'Walk', startTime: '2026-04-04 09:00' },
        { name: 'Walk', startTime: '2026-04-04 10:00' },
      ],
      activityCtx
    );
    expect(rows[0].warnings.map((w) => w.code)).toEqual(['duplicate_existing']);
    expect(rows[1].warnings).toEqual([]);
    expect(rows[2].warnings.map((w) => w.code)).toEqual(['duplicate_in_file']);
    expect(rows[3].warnings).toEqual([]);
  });

  it('BIE-014: invalid rows carry no data and do not stop later rows', () => {
    const rows = evaluateActivityRows([{ name: '' }, { name: 'Fine' }], activityCtx);
    expect(rows[0].data).toBeUndefined();
    expect(rows[1].data?.activity.name).toBe('Fine');
  });

  it('requires https-style booking URLs through the shared schema', () => {
    const [row] = evaluateActivityRows([{ name: 'A', bookingUrl: 'javascript:alert(1)' }], activityCtx);
    expect(row.errors).toEqual([expect.objectContaining({ field: 'bookingUrl' })]);
  });

  it('all-day with a bare date is accepted and stored as all day', () => {
    const [row] = evaluateActivityRows([{ name: 'A', startTime: '2026-04-03', allDay: 'true' }], activityCtx);
    expect(row.errors).toEqual([]);
    expect(row.data?.activity.allDay).toBe(true);
    expect(row.data?.activity.startTime).toBe('2026-04-02T22:00:00.000Z');
  });
});
