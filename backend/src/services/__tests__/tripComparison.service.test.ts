/**
 * Trip Comparison Service Tests
 *
 * Test cases:
 * - CMP-001: Rejects fewer than 2, more than the cap, and duplicate ids
 * - CMP-002: Rejects (does not drop) trips the caller cannot view
 * - CMP-003: Builds counts, inclusive days, distance and cost per day in request order
 * - CMP-004: Mixed currencies are restated with Decimal, never summed naively
 * - CMP-005: A total that cannot be converted is excluded and reported
 * - CMP-006: Locations flagged excludeFromMap or without coordinates are left off the map
 * - CMP-007: Per-trip unconverted amounts from the budget summary are passed through
 * - CMP-008: Query schema parsing
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Prisma } from '@prisma/client';

const mockPrisma = {
  trip: { findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
  activity: { groupBy: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
  photo: { groupBy: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
  transportation: { groupBy: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
  location: { findMany: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
  user: { findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

const mockGetBudgetSummary = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../expense.service', () => ({
  __esModule: true,
  default: { getBudgetSummary: mockGetBudgetSummary },
}));

const mockConvert = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../exchangeRate.service', () => {
  const actual = jest.requireActual<typeof import('../exchangeRate.service')>(
    '../exchangeRate.service'
  );
  return {
    __esModule: true,
    default: { convert: mockConvert },
    normalizeCurrency: actual.normalizeCurrency,
    isCurrencyCode: actual.isCurrencyCode,
  };
});

import tripComparisonService from '../tripComparison.service';
import { compareTripsQuerySchema } from '../../types/tripComparison.types';

function summary(currency: string, spent: number, overrides: Record<string, unknown> = {}) {
  return {
    budget: null,
    budgetOriginal: null,
    budgetCurrency: null,
    currency,
    spent,
    breakdown: { lodging: spent, transportation: 0, activities: 0, food: 0, other: 0 },
    conversion: {
      baseCurrency: currency,
      exactCount: 1,
      estimatedCount: 0,
      assumedBaseCount: 0,
      unconverted: [],
      isComplete: true,
    },
    ...overrides,
  };
}

const tripRow = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  userId: 1,
  title: `Trip ${id}`,
  status: 'Completed',
  startDate: new Date('2025-03-01T00:00:00.000Z'),
  endDate: new Date('2025-03-10T00:00:00.000Z'),
  countryCode: 'JP',
  ...extra,
});

function setupEmptyAggregates() {
  mockPrisma.activity.groupBy.mockResolvedValue([]);
  mockPrisma.photo.groupBy.mockResolvedValue([]);
  mockPrisma.transportation.groupBy.mockResolvedValue([]);
  mockPrisma.location.findMany.mockResolvedValue([]);
}

describe('TripComparisonService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupEmptyAggregates();
    mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
  });

  it('CMP-001: rejects too few, too many and duplicate ids', async () => {
    await expect(tripComparisonService.compareTrips(1, [1])).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      tripComparisonService.compareTrips(1, [1, 2, 3, 4, 5, 6, 7, 8, 9])
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(tripComparisonService.compareTrips(1, [1, 1])).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.trip.findMany).not.toHaveBeenCalled();
  });

  it('CMP-002: rejects the whole request when any trip is not viewable, naming the ids', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([tripRow(1)]);

    await expect(tripComparisonService.compareTrips(1, [1, 2, 3])).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringContaining('2, 3'),
    });
    // The access filter is owner-or-collaborator only.
    expect(mockPrisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [1, 2, 3] },
          OR: [{ userId: 1 }, { collaborators: { some: { userId: 1 } } }],
        },
      })
    );
    expect(mockGetBudgetSummary).not.toHaveBeenCalled();
  });

  it('CMP-003: builds counts, days, distance and cost per day in request order', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([
      tripRow(1),
      tripRow(2, { userId: 9, startDate: null, endDate: null }),
    ]);
    mockPrisma.activity.groupBy.mockResolvedValue([{ tripId: 2, _count: { _all: 4 } }]);
    mockPrisma.photo.groupBy.mockResolvedValue([{ tripId: 1, _count: { _all: 12 } }]);
    mockPrisma.transportation.groupBy
      .mockResolvedValueOnce([{ tripId: 1, _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ tripId: 1, _sum: { calculatedDistance: new Prisma.Decimal('1234.56') } }]);
    mockGetBudgetSummary
      .mockResolvedValueOnce(summary('USD', 1000))
      .mockResolvedValueOnce(summary('USD', 50));

    const result = await tripComparisonService.compareTrips(1, [2, 1]);

    expect(result.currency).toBe('USD');
    expect(result.trips.map((t) => t.id)).toEqual([2, 1]);
    const [second, first] = result.trips;
    expect(first.days).toBe(10);
    expect(first.startDate).toBe('2025-03-01');
    expect(first.photoCount).toBe(12);
    expect(first.transportationCount).toBe(3);
    expect(first.totalDistanceKm).toBe(1234.6);
    expect(first.isOwner).toBe(true);
    expect(first.cost.spent).toBe(50);
    expect(first.cost.costPerDay).toBe(5);
    expect(second.days).toBeNull();
    expect(second.isOwner).toBe(false);
    expect(second.activityCount).toBe(4);
    expect(second.totalDistanceKm).toBeNull();
    expect(second.cost.costPerDay).toBeNull();
  });

  it('CMP-004: restates a trip in another currency with Decimal, not a float sum', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([tripRow(1), tripRow(2, { userId: 9 })]);
    mockGetBudgetSummary
      .mockResolvedValueOnce(summary('USD', 100))
      .mockResolvedValueOnce(summary('EUR', 100));
    mockConvert.mockResolvedValue({
      exchangeRate: new Prisma.Decimal('1.1'),
      baseAmount: new Prisma.Decimal('110'),
      baseCurrency: 'USD',
      precision: 'estimated',
    });

    const result = await tripComparisonService.compareTrips(1, [1, 2]);

    expect(mockConvert).toHaveBeenCalledTimes(1);
    expect(mockConvert).toHaveBeenCalledWith(100, 'EUR', 'USD', null);
    const [usdTrip, eurTrip] = result.trips;
    expect(usdTrip.cost.restated).toBe(false);
    expect(usdTrip.cost.spent).toBe(100);
    expect(eurTrip.cost.restated).toBe(true);
    expect(eurTrip.cost.summaryCurrency).toBe('EUR');
    expect(eurTrip.cost.spent).toBe(110);
    expect(eurTrip.cost.costPerDay).toBe(11);
    expect(eurTrip.cost.breakdown?.lodging).toBe(110);
    expect(eurTrip.cost.isComplete).toBe(false);
  });

  it('CMP-005: excludes and reports a total that cannot be converted', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([tripRow(1), tripRow(2, { userId: 9 })]);
    mockGetBudgetSummary
      .mockResolvedValueOnce(summary('USD', 100))
      .mockResolvedValueOnce(summary('XYZ', 500));
    mockConvert.mockResolvedValue(null);

    const result = await tripComparisonService.compareTrips(1, [1, 2]);

    const bad = result.trips[1];
    expect(bad.cost.spent).toBeNull();
    expect(bad.cost.costPerDay).toBeNull();
    expect(bad.cost.breakdown).toBeNull();
    expect(bad.cost.excludedTotal).toEqual({ currency: 'XYZ', amount: 500 });
    expect(bad.cost.isComplete).toBe(false);
  });

  it('CMP-006: leaves excluded and coordinate-less locations off the map but counts them', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([tripRow(1), tripRow(2)]);
    mockPrisma.location.findMany.mockResolvedValue([
      { id: 10, tripId: 1, name: 'Tokyo', address: null, latitude: new Prisma.Decimal('35.68'), longitude: new Prisma.Decimal('139.69'), excludeFromMap: false },
      { id: 11, tripId: 1, name: 'Home', address: null, latitude: new Prisma.Decimal('40'), longitude: new Prisma.Decimal('-70'), excludeFromMap: true },
      { id: 12, tripId: 2, name: 'Nowhere', address: null, latitude: null, longitude: null, excludeFromMap: false },
    ]);
    mockGetBudgetSummary.mockResolvedValue(summary('USD', 0));

    const result = await tripComparisonService.compareTrips(1, [1, 2]);

    expect(result.locations).toEqual([
      { id: 10, tripId: 1, name: 'Tokyo', address: null, latitude: 35.68, longitude: 139.69 },
    ]);
    expect(result.trips[0].locationCount).toBe(2);
    expect(result.trips[1].locationCount).toBe(1);
    expect(mockConvert).not.toHaveBeenCalled();
  });

  it('CMP-006b: country is the trip override, else the most common location country code', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([tripRow(1, { countryCode: null }), tripRow(2, { countryCode: 'PT' }), tripRow(3, { countryCode: null })]);
    const loc = (id: number, tripId: number, countryCode: string | null) => ({
      id, tripId, name: `L${id}`, address: null, countryCode, latitude: null, longitude: null, excludeFromMap: false,
    });
    mockPrisma.location.findMany.mockResolvedValue([
      loc(1, 1, 'FR'), loc(2, 1, 'IT'), loc(3, 1, 'IT'), loc(4, 2, 'ES'), loc(5, 3, null),
    ]);
    mockGetBudgetSummary.mockResolvedValue(summary('USD', 0));

    const result = await tripComparisonService.compareTrips(1, [1, 2, 3]);

    expect(result.trips.map((t) => t.countryCode)).toEqual(['IT', 'PT', null]);
  });

  it('CMP-007: passes the budget summary unconverted amounts through per trip', async () => {
    mockPrisma.trip.findMany.mockResolvedValue([tripRow(1), tripRow(2)]);
    const unconverted = [{ currency: 'ISK', amount: 9000, count: 2 }];
    mockGetBudgetSummary
      .mockResolvedValueOnce(
        summary('USD', 100, {
          conversion: {
            baseCurrency: 'USD',
            exactCount: 1,
            estimatedCount: 0,
            assumedBaseCount: 0,
            unconverted,
            isComplete: false,
          },
        })
      )
      .mockResolvedValueOnce(summary('USD', 10));

    const result = await tripComparisonService.compareTrips(1, [1, 2]);

    expect(result.trips[0].cost.unconverted).toEqual(unconverted);
    expect(result.trips[0].cost.isComplete).toBe(false);
    expect(result.trips[1].cost.unconverted).toEqual([]);
  });

  it('falls back to the first trip summary currency when the viewer has no base currency', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: null });
    mockPrisma.trip.findMany.mockResolvedValue([tripRow(1), tripRow(2)]);
    mockGetBudgetSummary.mockResolvedValue(summary('GBP', 10));

    const result = await tripComparisonService.compareTrips(1, [1, 2]);

    expect(result.currency).toBe('GBP');
  });
});

describe('compareTripsQuerySchema', () => {
  it('CMP-008: parses ids and rejects bad input', () => {
    expect(compareTripsQuerySchema.parse({ ids: '3, 4,5' }).ids).toEqual([3, 4, 5]);
    expect(compareTripsQuerySchema.safeParse({ ids: '3' }).success).toBe(false);
    expect(compareTripsQuerySchema.safeParse({ ids: '3,3' }).success).toBe(false);
    expect(compareTripsQuerySchema.safeParse({ ids: '3,abc' }).success).toBe(false);
    expect(compareTripsQuerySchema.safeParse({ ids: '0,1' }).success).toBe(false);
    expect(compareTripsQuerySchema.safeParse({ ids: '1,2,3,4,5,6,7,8,9' }).success).toBe(false);
    expect(compareTripsQuerySchema.safeParse({}).success).toBe(false);
  });
});
