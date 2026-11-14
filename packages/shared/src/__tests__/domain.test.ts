/**
 * Shared domain logic tests
 *
 * Test cases:
 * - SH-LINK-001: Default relationships follow the entity-link rules
 * - SH-LINK-002: Type guards reject unknown strings
 * - SH-LINK-003: entityLinkKey mirrors the unique constraint
 * - SH-GEO-001: Haversine distance and nearest-place lookup
 * - SH-GEO-002: Position inference interpolates and refuses large gaps
 * - SH-GEO-003: Stop detection finds dwell periods and filters known places
 * - SH-GEO-004: Track thinning and GeoJSON output
 * - SH-TZ-001: resolveTimezone prefers the most specific zone
 * - SH-TZ-002: dayKeyInTimezone buckets by local day, not UTC day
 * - SH-TZ-003: formatDateOnly pins date-only values to UTC
 * - SH-TZ-004: startOfDayInTimezone handles DST
 * - SH-TZ-005: formatCountdown
 * - SH-SHIFT-001: shiftByMinutes preserves duration
 * - SH-SHIFT-002: moveByDays keeps wall-clock time across DST
 * - SH-SHIFT-003: convertToAllDay / moveToDay
 * - SH-SHIFT-004: reorder helpers and transport delay derivation
 * - SH-RCPT-001: Amount parsing in both decimal conventions
 * - SH-RCPT-002: Total line beats subtotal/tax lines
 * - SH-RCPT-003: Currency detection (symbol, ISO, ambiguous $ with context)
 * - SH-RCPT-004: Date extraction with locale ordering
 * - SH-RCPT-005: Merchant, category and confidence
 * - SH-RCPT-006: Garbage input yields nulls and low confidence
 * - SH-VAL-001: Form schemas accept valid input and reject bad ranges
 * - SH-VAL-002: Pairing QR schema
 * - SH-VAL-003: splitExpense sums exactly
 * - SH-ID-001: Local id detection
 */
import { describe, it, expect } from 'vitest';
import {
  getDefaultRelationship,
  isEntityType,
  isLinkRelationship,
  entityLinkKey,
  haversineMeters,
  findNearest,
  inferPositionAt,
  detectStops,
  filterUnloggedStops,
  thinTrack,
  trackToGeoJsonLineString,
  resolveTimezone,
  dayKeyInTimezone,
  formatDateOnly,
  startOfDayInTimezone,
  formatCountdown,
  formatTimeInTimezone,
  timezoneOffsetMinutes,
  isValidTimezone,
  shiftByMinutes,
  moveByDays,
  moveToDay,
  convertToAllDay,
  reorderManualOrder,
  arrayMove,
  deriveTransportDelay,
  parseAmount,
  parseReceiptText,
  extractDate,
  activityFormSchema,
  locationFormSchema,
  lodgingFormSchema,
  expenseFormSchema,
  foodLogFormSchema,
  pairingQrSchema,
  splitExpense,
  isLocalId,
  isLinkableKind,
  type TrackPoint,
} from '../index';

describe('entity link rules', () => {
  it('SH-LINK-001: default relationships follow the entity-link rules', () => {
    expect(getDefaultRelationship('PHOTO', 'LOCATION')).toBe('TAKEN_AT');
    expect(getDefaultRelationship('PHOTO', 'PHOTO_ALBUM')).toBe('FEATURED_IN');
    expect(getDefaultRelationship('PHOTO', 'JOURNAL_ENTRY')).toBe('FEATURED_IN');
    expect(getDefaultRelationship('ACTIVITY', 'LOCATION')).toBe('OCCURRED_AT');
    expect(getDefaultRelationship('LODGING', 'LOCATION')).toBe('OCCURRED_AT');
    expect(getDefaultRelationship('JOURNAL_ENTRY', 'ACTIVITY')).toBe('DOCUMENTS');
    expect(getDefaultRelationship('SAVED_LINK', 'ACTIVITY')).toBe('RELATED');
    expect(getDefaultRelationship('PHOTO', 'ACTIVITY')).toBe('RELATED');
  });

  it('SH-LINK-002: type guards reject unknown strings', () => {
    expect(isEntityType('CUSTOM_ITEM')).toBe(true);
    expect(isEntityType('EXPENSE')).toBe(false);
    expect(isEntityType(42)).toBe(false);
    expect(isLinkRelationship('TAKEN_AT')).toBe(true);
    expect(isLinkRelationship('taken_at')).toBe(false);
  });

  it('SH-LINK-003: entityLinkKey mirrors the unique constraint', () => {
    expect(
      entityLinkKey({ sourceType: 'ACTIVITY', sourceId: 'local_a', targetType: 'LOCATION', targetId: 7 })
    ).toBe('ACTIVITY:local_a->LOCATION:7');
  });
});

describe('geo', () => {
  const at = (minute: number, latitude: number, longitude: number): TrackPoint => ({
    latitude,
    longitude,
    recordedAt: new Date(Date.UTC(2026, 5, 1, 10, minute)).toISOString(),
  });

  it('SH-GEO-001: haversine distance and nearest-place lookup', () => {
    const d = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(111400);

    const places = [
      { id: 'far', latitude: 45.5, longitude: 12.4 },
      { id: 'near', latitude: 45.4341, longitude: 12.3388 },
      { id: 'none', latitude: null, longitude: null },
    ];
    const hit = findNearest({ latitude: 45.434, longitude: 12.3387 }, places, 150);
    expect(hit?.item.id).toBe('near');
    expect(findNearest({ latitude: 40, longitude: 10 }, places, 150)).toBeNull();
  });

  it('SH-GEO-002: position inference interpolates and refuses large gaps', () => {
    const track = [at(0, 10, 20), at(10, 10.1, 20.1)];
    const mid = inferPositionAt(track, at(5, 0, 0).recordedAt);
    expect(mid?.method).toBe('interpolated');
    expect(mid?.latitude).toBeCloseTo(10.05, 5);
    expect(inferPositionAt(track, at(0, 0, 0).recordedAt)?.method).toBe('exact');
    // 3 minutes after the last fix: nearest, within the default 10-minute gap.
    expect(inferPositionAt(track, at(13, 0, 0).recordedAt)?.method).toBe('nearest');
    // Two hours later: no honest answer.
    expect(inferPositionAt(track, at(130, 0, 0).recordedAt)).toBeNull();
    expect(inferPositionAt([], Date.now())).toBeNull();
  });

  it('SH-GEO-003: stop detection finds dwell periods and filters known places', () => {
    const track: TrackPoint[] = [];
    // Walk, then sit for 50 minutes, then walk on.
    for (let m = 0; m < 5; m++) track.push(at(m, 47.6 + m * 0.002, -122.34));
    for (let m = 5; m <= 55; m += 5) track.push(at(m, 47.6097, -122.3422));
    for (let m = 56; m < 60; m++) track.push(at(m, 47.62 + m * 0.002, -122.35));

    const stops = detectStops(track);
    expect(stops).toHaveLength(1);
    expect(stops[0].durationMinutes).toBe(50);

    expect(filterUnloggedStops(stops, [{ latitude: 47.6097, longitude: -122.3421 }])).toHaveLength(0);
    expect(filterUnloggedStops(stops, [{ latitude: 48, longitude: -122 }])).toHaveLength(1);
  });

  it('SH-GEO-004: track thinning and GeoJSON output', () => {
    const dense = [at(0, 1, 1), at(1, 1.000001, 1), at(2, 1.000002, 1), at(3, 1.01, 1)];
    const thin = thinTrack(dense, 10);
    expect(thin).toHaveLength(2);
    const line = trackToGeoJsonLineString([at(1, 2, 3), at(0, 4, 5)]);
    expect(line.type).toBe('LineString');
    // Sorted chronologically, lng/lat order.
    expect(line.coordinates).toEqual([
      [5, 4],
      [3, 2],
    ]);
  });
});

describe('timezone', () => {
  it('SH-TZ-001: resolveTimezone prefers the most specific zone', () => {
    expect(resolveTimezone('Asia/Tokyo', 'Europe/Rome')).toBe('Asia/Tokyo');
    expect(resolveTimezone(null, '  ', 'Europe/Rome')).toBe('Europe/Rome');
    // Nothing specified: the device zone, which is always a valid zone.
    expect(isValidTimezone(resolveTimezone(undefined, null))).toBe(true);
    expect(isValidTimezone('Not/AZone')).toBe(false);
  });

  it('SH-TZ-002: dayKeyInTimezone buckets by local day, not UTC day', () => {
    const lateEvening = '2026-06-02T03:30:00.000Z'; // 20:30 on June 1 in Los Angeles
    expect(dayKeyInTimezone(lateEvening, 'America/Los_Angeles')).toBe('2026-06-01');
    expect(dayKeyInTimezone(lateEvening, 'Asia/Tokyo')).toBe('2026-06-02');
    expect(dayKeyInTimezone('garbage', 'Asia/Tokyo')).toBe('');
  });

  it('SH-TZ-003: formatDateOnly pins date-only values to UTC', () => {
    expect(formatDateOnly('2026-06-01T00:00:00.000Z')).toBe('Jun 1, 2026');
    expect(formatDateOnly(null)).toBe('');
  });

  it('SH-TZ-004: startOfDayInTimezone handles DST', () => {
    // Rome is UTC+2 in summer, UTC+1 in winter.
    expect(startOfDayInTimezone('2026-06-01', 'Europe/Rome').toISOString()).toBe(
      '2026-05-31T22:00:00.000Z'
    );
    expect(startOfDayInTimezone('2026-12-01', 'Europe/Rome').toISOString()).toBe(
      '2026-11-30T23:00:00.000Z'
    );
    expect(timezoneOffsetMinutes('Asia/Kolkata', new Date('2026-01-01T00:00:00Z'))).toBe(330);
    expect(formatTimeInTimezone('2026-06-01T12:05:00Z', 'Europe/Rome')).toBe('2:05 PM');
    expect(formatTimeInTimezone('2026-06-01T12:05:00Z', 'Europe/Rome', { hour12: false })).toBe('14:05');
    // Midnight and noon are the classic 12-hour mistakes.
    expect(formatTimeInTimezone('2026-06-01T00:00:00Z', 'UTC')).toBe('12:00 AM');
    expect(formatTimeInTimezone('2026-06-01T12:00:00Z', 'UTC')).toBe('12:00 PM');
    expect(formatTimeInTimezone('2026-06-01T23:59:00Z', 'UTC')).toBe('11:59 PM');
    // A plain space, not the narrow no-break space newer ICU emits.
    expect(formatTimeInTimezone('2026-06-01T12:05:00Z', 'UTC')).not.toMatch(/ /);
  });

  it('SH-TZ-005: formatCountdown', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(formatCountdown('2026-06-01T12:00:20Z', now)).toBe('now');
    expect(formatCountdown('2026-06-01T12:45:00Z', now)).toBe('in 45m');
    expect(formatCountdown('2026-06-01T14:05:00Z', now)).toBe('in 2h 05m');
    expect(formatCountdown('2026-06-02T15:00:00Z', now)).toBe('in 1d 3h');
    expect(formatCountdown('2026-06-11T12:00:00Z', now)).toBe('in 10d');
    expect(formatCountdown('2026-06-01T11:48:00Z', now)).toBe('12m ago');
  });
});

describe('time shift', () => {
  const item = { startTime: '2026-06-01T09:00:00.000Z', endTime: '2026-06-01T10:30:00.000Z' };

  it('SH-SHIFT-001: shiftByMinutes preserves duration', () => {
    const patch = shiftByMinutes(item, 30);
    expect(patch.startTime).toBe('2026-06-01T09:30:00.000Z');
    expect(patch.endTime).toBe('2026-06-01T11:00:00.000Z');
    expect(shiftByMinutes(item, -60).startTime).toBe('2026-06-01T08:00:00.000Z');
    // All-day and untimed items are left alone.
    expect(shiftByMinutes({ ...item, allDay: true }, 30).startTime).toBe(item.startTime);
    expect(shiftByMinutes({ startTime: null, endTime: null }, 30).startTime).toBeNull();
  });

  it('SH-SHIFT-002: moveByDays keeps wall-clock time across DST', () => {
    // Europe/Rome leaves DST on 2026-10-25. 09:00 local is 07:00Z before, 08:00Z after.
    const before = { startTime: '2026-10-24T07:00:00.000Z', endTime: '2026-10-24T08:00:00.000Z' };
    const moved = moveByDays(before, 1, 'Europe/Rome');
    expect(moved.startTime).toBe('2026-10-25T08:00:00.000Z');
    expect(moved.endTime).toBe('2026-10-25T09:00:00.000Z');
    expect(formatTimeInTimezone(moved.startTime, 'Europe/Rome')).toBe('9:00 AM');
  });

  it('SH-SHIFT-003: convertToAllDay / moveToDay', () => {
    const allDay = convertToAllDay(item, 'America/New_York', '2026-06-01');
    expect(allDay.allDay).toBe(true);
    expect(allDay.endTime).toBeNull();
    expect(allDay.startTime).toBe('2026-06-01T04:00:00.000Z');

    const moved = moveToDay(item, '2026-06-04', 'America/New_York');
    expect(moved.startTime).toBe('2026-06-04T09:00:00.000Z');
    const pinned = moveToDay({ startTime: null, endTime: null }, '2026-06-04', 'America/New_York');
    expect(pinned.allDay).toBe(true);
  });

  it('SH-SHIFT-004: reorder helpers and transport delay derivation', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(arrayMove(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect([...reorderManualOrder(['x', 'y']).entries()]).toEqual([
      ['x', 0],
      ['y', 1],
    ]);
    expect(deriveTransportDelay('2026-06-01T10:00:00Z', '2026-06-01T10:25:00Z')).toEqual({
      status: 'delayed',
      delayMinutes: 25,
    });
    expect(deriveTransportDelay('2026-06-01T10:00:00Z', '2026-06-01T10:02:00Z').status).toBe('on_time');
    expect(deriveTransportDelay(null, '2026-06-01T10:02:00Z').delayMinutes).toBeNull();
  });
});

describe('receipt parser', () => {
  it('SH-RCPT-001: amount parsing in both decimal conventions', () => {
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('1,500')).toBe(1500);
    expect(parseAmount('abc')).toBeNull();
  });

  it('SH-RCPT-002: total line beats subtotal/tax lines', () => {
    const text = [
      'Trattoria Da Enzo',
      'Via dei Vascellari 29, Roma',
      '04/11/2026 20:41',
      'Cacio e pepe      12,00',
      'Carbonara         13,00',
      'Vino della casa    9,00',
      'Coperto            4,00',
      'SUBTOTALE         38,00',
      'IVA 10%            3,45',
      'TOTALE EUR        38,00',
      'Contanti          50,00',
    ].join('\n');
    const r = parseReceiptText(text);
    expect(r.amount).toBe(38);
    expect(r.currency).toBe('EUR');
    expect(r.date).toBe('2026-11-04');
    expect(r.merchant).toBe('Trattoria Da Enzo');
    expect(r.category).toBe('food');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('SH-RCPT-003: currency detection (symbol, ISO, ambiguous $ with context)', () => {
    expect(parseReceiptText('Museum shop\nTotal £14.99').currency).toBe('GBP');
    expect(parseReceiptText('Taxi\nTotal 23.40 CHF').currency).toBe('CHF');
    expect(parseReceiptText('Coffee\nTotal $4.50').currency).toBe('USD');
    expect(parseReceiptText('Coffee\nTotal $4.50', { defaultCurrency: 'cad' }).currency).toBe('CAD');
    expect(parseReceiptText('ラーメン\n合計 ¥1,200').currency).toBe('JPY');
    expect(parseReceiptText('ラーメン\n合計 ¥1,200').amount).toBe(1200);
    // No currency on the receipt: use the trip's.
    expect(parseReceiptText('Total 10.00', { defaultCurrency: 'THB' }).currency).toBe('THB');
  });

  it('SH-RCPT-004: date extraction with locale ordering', () => {
    expect(extractDate('2026-03-04')).toBe('2026-03-04');
    expect(extractDate('03/04/2026')).toBe('2026-04-03');
    expect(extractDate('03/04/2026', 'MDY')).toBe('2026-03-04');
    expect(extractDate('25/04/26', 'MDY')).toBe('2026-04-25');
    expect(extractDate('4 Nov 2026')).toBe('2026-11-04');
    expect(extractDate('November 4, 2026')).toBe('2026-11-04');
    expect(extractDate('31/02/2026')).toBeNull();
    expect(extractDate('no date here')).toBeNull();
  });

  it('SH-RCPT-005: merchant, category and confidence', () => {
    const r = parseReceiptText('Tel 555-1234\nGRAND HOTEL EUROPA\nRoom charge 2 nights\n240.00\n18.00');
    expect(r.merchant).toBe('GRAND HOTEL EUROPA');
    expect(r.category).toBe('lodging');
    // No total keyword: the largest price-shaped number, with reduced confidence.
    expect(r.amount).toBe(240);
    expect(r.confidence).toBeLessThan(0.6);
  });

  it('SH-RCPT-006: garbage input yields nulls and low confidence', () => {
    const r = parseReceiptText('');
    expect(r).toMatchObject({ amount: null, currency: null, merchant: null, date: null, category: 'other' });
    expect(r.confidence).toBe(0);
  });
});

describe('validation', () => {
  it('SH-VAL-001: form schemas accept valid input and reject bad ranges', () => {
    expect(activityFormSchema.safeParse({ name: '  Gelato stop  ' }).success).toBe(true);
    expect(activityFormSchema.parse({ name: '  Gelato stop  ' }).name).toBe('Gelato stop');
    expect(activityFormSchema.safeParse({ name: '' }).success).toBe(false);
    expect(
      activityFormSchema.safeParse({
        name: 'x',
        startTime: '2026-06-01T10:00:00Z',
        endTime: '2026-06-01T09:00:00Z',
      }).success
    ).toBe(false);
    expect(activityFormSchema.safeParse({ name: 'x', bookingUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(activityFormSchema.parse({ name: 'x', currency: 'eur' }).currency).toBe('EUR');

    expect(locationFormSchema.safeParse({ name: 'Here', latitude: 45, longitude: 12 }).success).toBe(true);
    expect(locationFormSchema.safeParse({ name: 'Here', latitude: 95, longitude: 12 }).success).toBe(false);
    expect(locationFormSchema.safeParse({ name: 'Here', latitude: 45 }).success).toBe(false);
    expect(locationFormSchema.safeParse({ name: 'Here', parentId: 'local_abc' }).success).toBe(true);

    expect(
      lodgingFormSchema.safeParse({
        type: 'hotel',
        name: 'H',
        checkInDate: '2026-06-03T15:00:00Z',
        checkOutDate: '2026-06-01T11:00:00Z',
      }).success
    ).toBe(false);
    expect(expenseFormSchema.safeParse({ description: 'd', category: 'food', amount: -1 }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ description: 'd', category: 'nope', amount: 1 }).success).toBe(false);
    expect(foodLogFormSchema.safeParse({ restaurantName: 'r', dish: 'd', rating: 6 }).success).toBe(false);
  });

  it('SH-VAL-002: pairing QR schema', () => {
    const token = 'a'.repeat(64);
    expect(pairingQrSchema.safeParse({ serverUrl: 'https://travel.example.com', pairingToken: token }).success).toBe(true);
    expect(pairingQrSchema.safeParse({ serverUrl: 'ftp://x', pairingToken: token }).success).toBe(false);
    expect(pairingQrSchema.safeParse({ serverUrl: 'https://x.io', pairingToken: 'short' }).success).toBe(false);
  });

  it('SH-VAL-003: splitExpense sums exactly', () => {
    const equal = splitExpense(100, ['a', 'b', 'c'], 'equal');
    expect(equal).toEqual({ a: 33.34, b: 33.33, c: 33.33 });
    expect(splitExpense(50, ['a', 'b'], 'custom', { a: 20, b: 30 })).toEqual({ a: 20, b: 30 });
    expect(splitExpense(50, ['a', 'b'], 'custom', { a: 20, b: 20 })).toBeNull();
    const pct = splitExpense(10.01, ['a', 'b'], 'percentage', { a: 50, b: 50 });
    expect((pct?.a ?? 0) + (pct?.b ?? 0)).toBeCloseTo(10.01, 2);
    expect(splitExpense(10, ['a', 'b'], 'percentage', { a: 50, b: 40 })).toBeNull();
    expect(splitExpense(10, [], 'equal')).toBeNull();
  });

  it('SH-ID-001: local id detection', () => {
    expect(isLocalId('local_123')).toBe(true);
    expect(isLocalId(123)).toBe(false);
    expect(isLocalId('123')).toBe(false);
    expect(isLinkableKind('ACTIVITY')).toBe(true);
    expect(isLinkableKind('EXPENSE')).toBe(false);
  });
});
