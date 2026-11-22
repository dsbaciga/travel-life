/**
 * Bulk Import Lodging and Transportation Tests
 *
 * Test cases:
 * - BIB-001: parseEnumCell ignores case, spaces and hyphens and rejects unknown values
 * - BIB-002: Lodging duplicates need the same name and check-in instant
 * - BIB-003: Transportation duplicates need the same departure, carrier and vehicle number
 * - BIB-004: A valid lodging row yields schema-valid data
 * - BIB-005: Lodging requires type, name, check-in and check-out and validates the enum
 * - BIB-006: Lodging dates are read in the row zone, else the default zone; bare dates are midnight
 * - BIB-007: Check-out must be after check-in
 * - BIB-008: Lodging cost stays a decimal string; bad currency and missing currency behave as for activities
 * - BIB-009: Lodging duplicates are flagged against existing stays and earlier rows
 * - BIB-010: A valid transportation row yields schema-valid data
 * - BIB-011: Transportation requires a type and a from or to, and validates the enum
 * - BIB-012: Departure uses the start zone, arrival the end zone; a missing end zone warns
 * - BIB-013: Arrival before departure is an error
 * - BIB-014: Transportation duplicates are flagged against existing legs and earlier rows
 */

import {
  isDuplicateLodging,
  isDuplicateTransportation,
  parseEnumCell,
} from '../bulkImportRows';
import { evaluateLodgingRows, evaluateTransportationRows } from '../bulkImportEvaluators';

const lodgingCtx = {
  tripId: 7,
  defaultTimezone: 'Europe/Paris',
  existing: [{ name: 'Hotel Lutetia', checkInDate: new Date('2026-04-03T13:00:00Z') }],
};

const transportCtx = {
  tripId: 7,
  defaultTimezone: 'Europe/Paris',
  existing: [
    { type: 'flight', carrier: 'Air France', vehicleNumber: 'AF123', fromLocationName: 'JFK', toLocationName: 'CDG', departureTime: new Date('2026-04-02T22:00:00Z') },
  ],
};

describe('bulkImportRows booking helpers', () => {
  it('BIB-001: parseEnumCell normalises case and separators', () => {
    const allowed = ['hotel', 'bed_and_breakfast'];
    expect(parseEnumCell(undefined, allowed, 'Type')).toEqual({ ok: true, value: undefined });
    expect(parseEnumCell('Hotel', allowed, 'Type')).toEqual({ ok: true, value: 'hotel' });
    expect(parseEnumCell('Bed and Breakfast', allowed, 'Type')).toEqual({ ok: true, value: 'bed_and_breakfast' });
    expect(parseEnumCell('bed-and-breakfast', allowed, 'Type')).toEqual({ ok: true, value: 'bed_and_breakfast' });
    const bad = parseEnumCell('castle', allowed, 'Type');
    expect(bad).toEqual({ ok: false, error: expect.stringContaining('hotel, bed_and_breakfast') });
  });

  it('BIB-002: lodging duplicates need the same name and check-in instant', () => {
    const a = { name: 'Hotel A', checkInDate: '2026-04-03T13:00:00.000Z' };
    expect(isDuplicateLodging(a, { name: ' hotel a ', checkInDate: new Date('2026-04-03T13:00:00Z') })).toBe(true);
    expect(isDuplicateLodging(a, { name: 'Hotel A', checkInDate: '2026-04-04T13:00:00.000Z' })).toBe(false);
    expect(isDuplicateLodging(a, { name: 'Hotel B', checkInDate: '2026-04-03T13:00:00.000Z' })).toBe(false);
  });

  it('BIB-003: transportation duplicates need departure, carrier and vehicle number', () => {
    const a = { type: 'flight', carrier: 'Air France', vehicleNumber: 'AF123', departureTime: '2026-04-02T22:00:00.000Z' };
    expect(isDuplicateTransportation(a, { ...a, carrier: 'air france', departureTime: new Date('2026-04-02T22:00:00Z') })).toBe(true);
    expect(isDuplicateTransportation(a, { ...a, vehicleNumber: 'AF124' })).toBe(false);
    expect(isDuplicateTransportation(a, { ...a, departureTime: '2026-04-03T22:00:00.000Z' })).toBe(false);
    // No carrier or vehicle number: told apart by type and the from/to names
    const drive = { type: 'car', fromLocationName: 'Paris', toLocationName: 'Lyon', departureTime: '2026-04-05T08:00:00.000Z' };
    expect(isDuplicateTransportation(drive, { ...drive })).toBe(true);
    expect(isDuplicateTransportation(drive, { ...drive, toLocationName: 'Nice' })).toBe(false);
    expect(isDuplicateTransportation(drive, { ...drive, type: 'bus' })).toBe(false);
  });
});

describe('evaluateLodgingRows', () => {
  const base = { type: 'hotel', name: 'Hotel Lutetia', checkInDate: '2026-04-05 15:00', checkOutDate: '2026-04-08 11:00' };

  it('BIB-004: valid row yields data', () => {
    const [row] = evaluateLodgingRows(
      [{ ...base, address: '45 Bd Raspail', confirmationNumber: 'C1', bookingUrl: 'https://example.com/b', cost: '480', currency: 'eur', notes: 'n' }],
      lodgingCtx
    );
    expect(row.errors).toEqual([]);
    expect(row.data?.lodging).toMatchObject({
      tripId: 7,
      type: 'hotel',
      name: 'Hotel Lutetia',
      address: '45 Bd Raspail',
      confirmationNumber: 'C1',
      bookingUrl: 'https://example.com/b',
      cost: 480,
      currency: 'EUR',
      notes: 'n',
    });
    expect(row.data?.costDecimal).toBe('480.00');
  });

  it('BIB-005: type, name and both dates are required; the type must be known', () => {
    const rows = evaluateLodgingRows(
      [
        { name: 'A', checkInDate: '2026-04-05', checkOutDate: '2026-04-06' },
        { ...base, type: 'castle' },
        { ...base, name: '' },
        { ...base, checkInDate: '' },
        { ...base, checkOutDate: '' },
      ],
      lodgingCtx
    );
    expect(rows[0].errors).toEqual([expect.objectContaining({ field: 'type', message: expect.stringContaining('required') })]);
    expect(rows[1].errors).toEqual([expect.objectContaining({ field: 'type', message: expect.stringContaining('hostel') })]);
    expect(rows[2].errors).toEqual([expect.objectContaining({ field: 'name' })]);
    expect(rows[3].errors).toEqual([expect.objectContaining({ field: 'checkInDate', message: 'Check-in is required' })]);
    expect(rows[4].errors).toEqual([expect.objectContaining({ field: 'checkOutDate', message: 'Check-out is required' })]);
    expect(rows.every((r) => r.data === undefined)).toBe(true);
  });

  it('BIB-005: accepts spaced and cased types', () => {
    const [row] = evaluateLodgingRows([{ ...base, type: 'Bed and Breakfast' }], lodgingCtx);
    expect(row.data?.lodging.type).toBe('bed_and_breakfast');
  });

  it('BIB-006: dates use the row zone, else the default zone; offsets are kept; bare dates are midnight', () => {
    const rows = evaluateLodgingRows(
      [
        { ...base, vehicleNumber: 'V1' },
        { ...base, timezone: 'Asia/Tokyo' },
        { ...base, checkInDate: '2026-04-05T15:00:00Z', checkOutDate: '2026-04-08T11:00:00Z' },
        { ...base, checkInDate: '2026-04-05', checkOutDate: '2026-04-08' },
      ],
      lodgingCtx
    );
    // Paris is UTC+2 in April
    expect(rows[0].data?.lodging.checkInDate).toBe('2026-04-05T13:00:00.000Z');
    expect(rows[0].data?.lodging.checkOutDate).toBe('2026-04-08T09:00:00.000Z');
    expect(rows[0].data?.lodging.timezone).toBe('Europe/Paris');
    expect(rows[1].data?.lodging.checkInDate).toBe('2026-04-05T06:00:00.000Z');
    expect(rows[1].data?.lodging.timezone).toBe('Asia/Tokyo');
    expect(rows[2].data?.lodging.checkInDate).toBe('2026-04-05T15:00:00.000Z');
    expect(rows[2].data?.lodging.timezone).toBeUndefined();
    expect(rows[3].data?.lodging.checkInDate).toBe('2026-04-04T22:00:00.000Z');
    expect(rows[3].data?.lodging.timezone).toBe('Europe/Paris');
  });

  it('BIB-007: check-out must be after check-in', () => {
    const rows = evaluateLodgingRows(
      [
        { ...base, checkOutDate: '2026-04-05 14:00' },
        { ...base, checkOutDate: '2026-04-05 15:00' },
        { ...base, checkInDate: '03/04/2026' },
      ],
      lodgingCtx
    );
    expect(rows[0].errors).toEqual([expect.objectContaining({ field: 'checkOutDate', message: 'Check-out must be after check-in' })]);
    expect(rows[1].errors).toEqual([expect.objectContaining({ field: 'checkOutDate' })]);
    expect(rows[2].errors).toEqual([expect.objectContaining({ field: 'checkInDate', message: expect.stringContaining('Accepted formats') })]);
  });

  it('BIB-008: costs stay decimal strings and currencies are restricted', () => {
    const rows = evaluateLodgingRows(
      [
        { ...base, cost: '1234.5', currency: 'USD' },
        { ...base, name: 'B', cost: '1.234,50', currency: 'USD' },
        { ...base, name: 'C', cost: '10', currency: 'ZZZ' },
        { ...base, name: 'D', cost: '10' },
      ],
      lodgingCtx
    );
    expect(rows[0].data?.costDecimal).toBe('1234.50');
    expect(rows[1].errors).toEqual([expect.objectContaining({ field: 'cost' })]);
    expect(rows[2].errors).toEqual([expect.objectContaining({ field: 'currency', message: expect.stringContaining('not supported') })]);
    expect(rows[3].errors).toEqual([]);
    expect(rows[3].warnings).toEqual([expect.objectContaining({ code: 'cost_without_currency' })]);
  });

  it('BIB-009: flags duplicates of existing stays and earlier rows', () => {
    const rows = evaluateLodgingRows(
      [
        { ...base, checkInDate: '2026-04-03 15:00' },
        { ...base, name: 'Other', checkInDate: '2026-04-05 15:00' },
        { ...base, name: 'other', checkInDate: '2026-04-05 15:00' },
      ],
      lodgingCtx
    );
    expect(rows[0].warnings).toEqual([expect.objectContaining({ code: 'duplicate_existing' })]);
    expect(rows[1].warnings).toEqual([]);
    expect(rows[2].warnings).toEqual([expect.objectContaining({ code: 'duplicate_in_file', message: expect.stringContaining('row 2') })]);
  });
});

describe('evaluateTransportationRows', () => {
  const base = { type: 'flight', fromLocationName: 'CDG', toLocationName: 'JFK', departureTime: '2026-04-10 11:00', arrivalTime: '2026-04-10 13:30' };

  it('BIB-010: valid row yields data', () => {
    const [row] = evaluateTransportationRows(
      [{ ...base, carrier: 'Air France', vehicleNumber: 'AF006', confirmationNumber: 'XYZ', cost: '600', currency: 'EUR', notes: 'n' }],
      transportCtx
    );
    expect(row.errors).toEqual([]);
    expect(row.data?.transportation).toMatchObject({
      tripId: 7,
      type: 'flight',
      fromLocationName: 'CDG',
      toLocationName: 'JFK',
      carrier: 'Air France',
      vehicleNumber: 'AF006',
      confirmationNumber: 'XYZ',
      cost: 600,
      currency: 'EUR',
      notes: 'n',
    });
    expect(row.data?.costDecimal).toBe('600.00');
  });

  it('BIB-011: needs a type and a from or to; unknown types are rejected', () => {
    const rows = evaluateTransportationRows(
      [
        { fromLocationName: 'A' },
        { ...base, type: 'rocket' },
        { type: 'train', notes: 'x' },
        { type: 'train', toLocationName: 'B' },
        { ...base, type: 'Ferry' },
      ],
      transportCtx
    );
    expect(rows[0].errors).toEqual([expect.objectContaining({ field: 'type' })]);
    expect(rows[1].errors).toEqual([expect.objectContaining({ field: 'type', message: expect.stringContaining('ferry') })]);
    expect(rows[2].errors).toEqual([expect.objectContaining({ field: 'fromLocationName' })]);
    expect(rows[3].errors).toEqual([]);
    expect(rows[4].data?.transportation.type).toBe('ferry');
  });

  it('BIB-012: departure uses the start zone, arrival the end zone; a missing end zone warns', () => {
    const rows = evaluateTransportationRows(
      [
        { ...base, vehicleNumber: 'V0', startTimezone: 'Europe/Paris', endTimezone: 'America/New_York' },
        { ...base, vehicleNumber: 'V1' },
        { ...base, vehicleNumber: 'V2', startTimezone: 'Europe/Paris' },
        { ...base, vehicleNumber: 'V3', departureTime: '2026-04-10T11:00:00+02:00', arrivalTime: '2026-04-10T13:30:00-04:00' },
      ],
      transportCtx
    );
    expect(rows[0].data?.transportation).toMatchObject({
      departureTime: '2026-04-10T09:00:00.000Z',
      arrivalTime: '2026-04-10T17:30:00.000Z',
      startTimezone: 'Europe/Paris',
      endTimezone: 'America/New_York',
    });
    expect(rows[0].warnings).toEqual([]);
    // No zones at all: both read in the default zone, which is stored on the leg
    expect(rows[1].data?.transportation).toMatchObject({
      departureTime: '2026-04-10T09:00:00.000Z',
      arrivalTime: '2026-04-10T11:30:00.000Z',
      startTimezone: 'Europe/Paris',
      endTimezone: 'Europe/Paris',
    });
    expect(rows[1].warnings).toEqual([]);
    expect(rows[2].warnings).toEqual([expect.objectContaining({ code: 'timezone_assumed', field: 'endTimezone' })]);
    expect(rows[3].data?.transportation).toMatchObject({ departureTime: '2026-04-10T09:00:00.000Z', arrivalTime: '2026-04-10T17:30:00.000Z' });
    expect(rows[3].data?.transportation.startTimezone).toBeUndefined();
  });

  it('BIB-013: arrival before departure is an error; dates without a time of day are rejected', () => {
    const rows = evaluateTransportationRows(
      [
        { ...base, arrivalTime: '2026-04-10 10:00' },
        { ...base, departureTime: '2026-04-10' },
      ],
      transportCtx
    );
    expect(rows[0].errors).toEqual([expect.objectContaining({ field: 'arrivalTime', message: 'Arrival is before the departure' })]);
    expect(rows[1].errors).toEqual([expect.objectContaining({ field: 'departureTime' })]);
  });

  it('BIB-014: flags duplicates of existing legs and earlier rows', () => {
    const rows = evaluateTransportationRows(
      [
        { type: 'flight', fromLocationName: 'JFK', toLocationName: 'CDG', carrier: 'air france', vehicleNumber: 'AF123', departureTime: '2026-04-02T22:00:00Z' },
        { ...base, carrier: 'KLM', vehicleNumber: 'KL1' },
        { ...base, carrier: 'KLM', vehicleNumber: 'KL1' },
      ],
      transportCtx
    );
    expect(rows[0].warnings).toEqual([expect.objectContaining({ code: 'duplicate_existing' })]);
    expect(rows[1].warnings).toEqual([]);
    expect(rows[2].warnings).toEqual([expect.objectContaining({ code: 'duplicate_in_file', message: expect.stringContaining('row 2') })]);
  });
});
