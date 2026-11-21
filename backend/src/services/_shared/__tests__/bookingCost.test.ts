/**
 * A booking's cost is a trip expense (Step D)
 *
 * Test cases:
 * - BC-001: The expense date is the start on the entity zone's clock, then trip, then owner, UTC last
 * - BC-002: An unknown stored zone is skipped, not fatal; an unscheduled booking has no date
 * - BC-003: A transportation leg is labelled the way the calendar feed labels it
 * - BC-004: Reads flatten the cost row back into cost / currency / FX fields (null when no cost)
 * - BC-005: A booking is created with its cost row only when it has a cost (0 counts)
 * - BC-006: Clearing the cost deletes the row and hands back its receipt file
 * - BC-007: A changed amount or currency clears the frozen FX snapshot; unchanged leaves it
 * - BC-008: Renaming or re-dating a booking updates the description and date, not the amount
 * - BC-009: A cost sent for a booking without one creates the row; a currency alone does not
 * - BC-010: The booking's updatedAt moves only when its cost row changed
 * - BC-011: An expense reports the booking it belongs to
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('@prisma/client', () => ({
  Prisma: { Decimal: class MockDecimal { constructor(public value: unknown) {} toString() { return String(this.value); } } },
}));
jest.mock('../../../config/database', () => ({ __esModule: true, default: {} }));

import {
  bookingExpenseDate,
  buildBookingCostCreate,
  describeBooking,
  hydrateActivityCost,
  hydrateBookingCost,
  syncBookingCost,
  transportationLabel,
  withLinkedEntity,
} from '../bookingCost';

const d = (iso: string) => new Date(iso);

describe('bookingExpenseDate', () => {
  it('BC-001: an evening event west of UTC stays on its own local day', () => {
    // 04:30Z on the 10th is 20:30 on the 9th in Los Angeles
    expect(bookingExpenseDate(d('2027-01-10T04:30:00Z'), ['America/Los_Angeles', 'Pacific/Auckland', 'UTC'])).toEqual(
      d('2027-01-09T00:00:00Z')
    );
  });

  it('BC-001: entity zone, then trip zone, then owner zone, then UTC', () => {
    const start = d('2027-01-12T12:00:00Z');
    expect(bookingExpenseDate(start, [null, 'Pacific/Auckland', 'America/New_York'])).toEqual(d('2027-01-13T00:00:00Z'));
    expect(bookingExpenseDate(start, [null, null, 'Pacific/Auckland'])).toEqual(d('2027-01-13T00:00:00Z'));
    expect(bookingExpenseDate(d('2027-05-05T23:30:00Z'), [null, null, null])).toEqual(d('2027-05-05T00:00:00Z'));
    expect(bookingExpenseDate(d('2027-03-05T03:30:00Z'), [undefined, '', 'America/New_York'])).toEqual(d('2027-03-04T00:00:00Z'));
  });

  it('BC-002: skips an unknown zone and gives an unscheduled booking no date', () => {
    expect(bookingExpenseDate(d('2027-01-10T04:30:00Z'), ['Not/AZone', 'America/Los_Angeles'])).toEqual(d('2027-01-09T00:00:00Z'));
    expect(bookingExpenseDate(null, ['UTC'])).toBeNull();
    expect(bookingExpenseDate(undefined, ['UTC'])).toBeNull();
  });
});

describe('transportationLabel', () => {
  it('BC-003: type, company, reference, then from and to', () => {
    expect(transportationLabel({ type: 'flight', company: 'Air Test', referenceNumber: 'AT100', startLocationText: 'HND', endLocationText: 'CDG' })).toBe(
      'flight Air Test AT100: HND → CDG'
    );
    expect(transportationLabel({ type: 'train', startLocationText: null, endLocationText: null, startLocation: { name: 'Paris' }, endLocation: null })).toBe(
      'train: Paris'
    );
    expect(transportationLabel({ type: 'bus' })).toBe('bus');
  });

  it('BC-003: describeBooking trims to the description column and falls back for a blank name', () => {
    expect(describeBooking({ kind: 'activity', name: '   ', startTime: null, timezone: null }).description).toBe('Activity');
    expect(describeBooking({ kind: 'lodging', name: 'x'.repeat(600), checkInDate: null, timezone: null }).description).toHaveLength(500);
  });
});

describe('hydrating reads', () => {
  it('BC-004: a booking with a cost row reads cost, currency and the FX snapshot', () => {
    const row = hydrateBookingCost({
      id: 1,
      name: 'Hotel',
      costExpense: { amount: 100, currency: 'USD', exchangeRate: 0.9, baseAmount: 90, baseCurrency: 'EUR' },
    });
    expect(row).toEqual({ id: 1, name: 'Hotel', cost: 100, currency: 'USD', exchangeRate: 0.9, baseAmount: 90, baseCurrency: 'EUR' });
    expect(row).not.toHaveProperty('costExpense');
  });

  it('BC-004: no cost row reads null everywhere, and a null currency stays null with a cost', () => {
    expect(hydrateBookingCost({ id: 1, costExpense: null })).toEqual({
      id: 1, cost: null, currency: null, exchangeRate: null, baseAmount: null, baseCurrency: null,
    });
    expect(hydrateBookingCost({ costExpense: { amount: 0, currency: null } })).toMatchObject({ cost: 0, currency: null });
  });

  it('BC-004: nested child activities carry only cost and currency', () => {
    const row = hydrateActivityCost({
      costExpense: null,
      children: [{ id: 2, costExpense: { amount: 5, currency: 'EUR' } }],
    });
    expect(row.children).toEqual([{ id: 2, cost: 5, currency: 'EUR' }]);
  });
});

describe('buildBookingCostCreate', () => {
  const db = { trip: { findUnique: jest.fn() } };
  beforeEach(() => {
    db.trip.findUnique.mockReset();
    db.trip.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland', user: { timezone: 'America/New_York' } });
  });
  const fields = { kind: 'activity' as const, name: 'Dinner', startTime: d('2027-01-12T12:00:00Z'), timezone: null };

  it('BC-005: no cost, no row (and no queries)', async () => {
    const lazy = jest.fn<() => Promise<string[]>>();
    expect(await buildBookingCostCreate(db as never, 1, fields, {}, lazy)).toBeUndefined();
    expect(await buildBookingCostCreate(db as never, 1, fields, { cost: null, currency: 'EUR' }, lazy)).toBeUndefined();
    expect(lazy).not.toHaveBeenCalled();
    expect(db.trip.findUnique).not.toHaveBeenCalled();
  });

  it('BC-005: a cost of 0 is a real value and gets a dated row', async () => {
    const create = await buildBookingCostCreate(db as never, 7, fields, { cost: 0, currency: '' });
    expect(create).toEqual({
      create: {
        tripId: 7, description: 'Dinner', category: 'activities', amount: 0, currency: null,
        exchangeRate: null, baseAmount: null, baseCurrency: null, date: d('2027-01-13T00:00:00Z'),
      },
    });
  });
});

describe('syncBookingCost', () => {
  const makeDb = (existing: Record<string, unknown> | null) => ({
    tripExpense: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(existing),
      create: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 900, amount: 30 }),
      delete: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
    tripExpenseSplit: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]), update: jest.fn() },
    travelCompanion: { findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
    user: {},
    $executeRaw: jest.fn(),
    trip: { findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ userId: 1, timezone: null, user: { timezone: 'UTC' } }) },
    activity: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({ tripId: 5, name: 'Dinner', startTime: d('2027-02-01T03:30:00Z'), timezone: 'America/Chicago' }),
      update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
    },
    transportation: { update: jest.fn() },
    lodging: { update: jest.fn() },
    customItem: { update: jest.fn() },
  });
  const row = { id: 900, tripId: 5, amount: 20, currency: 'USD', receiptPath: '/uploads/receipts/a.jpg' };

  it('BC-006: cost null deletes the row and returns its receipt path', async () => {
    const db = makeDb(row);
    const result = await syncBookingCost(db as never, 'activity', 3, { cost: null });
    expect(db.tripExpense.delete).toHaveBeenCalledWith({ where: { id: 900 } });
    expect(result.receiptPaths).toEqual(['/uploads/receipts/a.jpg']);
    expect(db.activity.update).toHaveBeenCalledTimes(1); // updatedAt moved: the cost changed
  });

  it('BC-006: cost null on a booking without a cost does nothing', async () => {
    const db = makeDb(null);
    await syncBookingCost(db as never, 'activity', 3, { cost: null });
    expect(db.tripExpense.delete).not.toHaveBeenCalled();
    expect(db.activity.update).not.toHaveBeenCalled();
  });

  it('BC-007: a changed amount or currency clears the FX snapshot; an unchanged one leaves it', async () => {
    const changed = makeDb(row);
    await syncBookingCost(changed as never, 'activity', 3, { cost: 30, currency: 'EUR' });
    expect(changed.tripExpense.update).toHaveBeenCalledWith({
      where: { id: 900 },
      data: { amount: 30, currency: 'EUR', exchangeRate: null, baseAmount: null, baseCurrency: null },
    });

    const same = makeDb(row);
    await syncBookingCost(same as never, 'activity', 3, { cost: 20, currency: 'USD' });
    expect(same.tripExpense.update).not.toHaveBeenCalled();
    expect(same.activity.update).not.toHaveBeenCalled();
  });

  it('BC-008: a rename or re-date updates description and date only', async () => {
    const db = makeDb(row);
    await syncBookingCost(db as never, 'activity', 3, { refresh: true });
    expect(db.tripExpense.update).toHaveBeenCalledWith({
      where: { id: 900 },
      // 03:30Z on Feb 1st is 21:30 on Jan 31st in Chicago
      data: { description: 'Dinner', date: d('2027-01-31T00:00:00Z') },
    });
  });

  it('BC-009: a cost for a booking without one creates the row; a currency alone does not', async () => {
    const db = makeDb(null);
    await syncBookingCost(db as never, 'activity', 3, { cost: 12.5, currency: 'EUR' });
    expect(db.tripExpense.create).toHaveBeenCalledWith({
      data: { tripId: 5, description: 'Dinner', category: 'activities', amount: 12.5, currency: 'EUR', date: d('2027-01-31T00:00:00Z'), activityId: 3 },
    });

    const none = makeDb(null);
    await syncBookingCost(none as never, 'activity', 3, { currency: 'EUR' });
    expect(none.tripExpense.create).not.toHaveBeenCalled();
  });

  it('BC-010: touching a field that is not part of the cost leaves updatedAt alone', async () => {
    const db = makeDb(row);
    await syncBookingCost(db as never, 'activity', 3, {});
    expect(db.tripExpense.findUnique).not.toHaveBeenCalled();
    expect(db.activity.update).not.toHaveBeenCalled();
  });
});

describe('withLinkedEntity', () => {
  it('BC-011: names the booking an expense is the cost of, or null for an ordinary expense', () => {
    expect(withLinkedEntity({ id: 1, activityId: 4, activity: { id: 4, name: 'Dinner' } })).toEqual({
      id: 1, activityId: 4, linkedEntity: { type: 'activity', id: 4, name: 'Dinner' },
    });
    expect(
      withLinkedEntity({ id: 2, transportation: { id: 9, type: 'flight', company: 'AT', startLocationText: 'A', endLocationText: 'B' } }).linkedEntity
    ).toEqual({ type: 'transportation', id: 9, name: 'flight AT: A → B' });
    expect(withLinkedEntity({ id: 3 }).linkedEntity).toBeNull();
    expect(withLinkedEntity({ id: 4, activity: null, lodging: null }).linkedEntity).toBeNull();
  });
});
