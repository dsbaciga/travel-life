import { afterEach, describe, expect, it } from 'vitest';
import { dayKeyForDateOnly, listTripDays, utcNoonRange, dayKeyForUtcNoon } from '../tripDays';
import { getDateStringInTimezone } from '../utils';

/**
 * The trip's days come from its date-only start and end, so the list must be the
 * same whatever zone the device is in, including zones far behind or ahead of the
 * trip's own zone.
 */
describe('tripDays', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  const deviceZones = ['America/New_York', 'Pacific/Auckland', 'Asia/Tokyo', 'Pacific/Kiritimati', 'UTC'];

  it.each(deviceZones)('lists Nov 12-22 exactly with the device in %s', (zone) => {
    process.env.TZ = zone;
    const days = listTripDays('2026-11-12', '2026-11-22');

    expect(days).toHaveLength(11);
    expect(days[0]).toMatchObject({ dayNumber: 1, dateKey: 'Thu, Nov 12, 2026', displayDate: 'Thursday, November 12, 2026' });
    expect(days[4]).toMatchObject({ dayNumber: 5, dateKey: 'Mon, Nov 16, 2026' });
    expect(days[10]).toMatchObject({ dayNumber: 11, dateKey: 'Sun, Nov 22, 2026' });
  });

  it.each(deviceZones)('accepts ISO date-only values with the device in %s', (zone) => {
    process.env.TZ = zone;
    const days = listTripDays('2026-11-12T00:00:00.000Z', '2026-11-14T00:00:00.000Z');
    expect(days.map((d) => d.dateKey)).toEqual(['Thu, Nov 12, 2026', 'Fri, Nov 13, 2026', 'Sat, Nov 14, 2026']);
  });

  it('matches the key a timestamp gets in the trip zone', () => {
    process.env.TZ = 'America/New_York';
    // 21:30 on Nov 12 in Tokyo is 07:30 in New York the same morning.
    const key = getDateStringInTimezone(new Date('2026-11-12T12:30:00Z'), 'Asia/Tokyo');
    expect(key).toBe('Thu, Nov 12, 2026');
    expect(listTripDays('2026-11-12', '2026-11-22')[0].dateKey).toBe(key);
  });

  it.each(deviceZones)('keys date-only values and stay ranges with the device in %s', (zone) => {
    process.env.TZ = zone;
    expect(dayKeyForDateOnly('2026-11-12T00:00:00.000Z')).toBe('Thu, Nov 12, 2026');
    expect(utcNoonRange('2026-11-12', '2026-11-15').map(dayKeyForUtcNoon)).toEqual([
      'Thu, Nov 12, 2026',
      'Fri, Nov 13, 2026',
      'Sat, Nov 14, 2026',
      'Sun, Nov 15, 2026',
    ]);
  });

  it('returns nothing for unparseable input', () => {
    expect(listTripDays('', '2026-11-12')).toEqual([]);
    expect(dayKeyForDateOnly('nope')).toBeNull();
  });
});
