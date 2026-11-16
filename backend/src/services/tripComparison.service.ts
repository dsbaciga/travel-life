import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../errors/errors';
import expenseService from './expense.service';
import exchangeRateService, { normalizeCurrency } from './exchangeRate.service';
import { MAX_COMPARE_TRIPS, MIN_COMPARE_TRIPS } from '../types/tripComparison.types';
import type {
  TripComparison,
  TripComparisonCost,
  TripComparisonLocation,
  TripComparisonTrip,
} from '../types/tripComparison.types';
import type { BudgetSummary } from '../types/expense.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toMoneyNumber(value: Prisma.Decimal): number {
  return value.toDecimalPlaces(2).toNumber();
}

/**
 * Inclusive length in days. Trip dates are `@db.Date` values stored at UTC
 * midnight, so plain UTC arithmetic is exact; no timezone conversion applies.
 */
function inclusiveDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const diff = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  return diff >= 0 ? diff + 1 : null;
}

function dateOnlyIso(value: Date | null): string | null {
  return value ? value.toISOString().split('T')[0] : null;
}

class TripComparisonService {
  /**
   * Compares two or more trips the caller can view.
   *
   * Every requested id must be viewable (owner or collaborator). If any is
   * not, the whole request is rejected with 404 naming the ids, instead of
   * quietly dropping them, so a comparison never silently omits a trip.
   *
   * Costs reuse the budget summary, which already converts each costed record
   * with its frozen FX snapshot and excludes what it cannot convert. A trip's
   * summary is expressed in its owner's base currency, so when that differs
   * from the comparison currency the trip total is restated with one rate and
   * Decimal arithmetic. Totals are never summed across currencies.
   */
  async compareTrips(userId: number, tripIds: number[]): Promise<TripComparison> {
    if (tripIds.length < MIN_COMPARE_TRIPS || tripIds.length > MAX_COMPARE_TRIPS) {
      throw new AppError(
        `Compare between ${MIN_COMPARE_TRIPS} and ${MAX_COMPARE_TRIPS} trips`,
        400
      );
    }
    if (new Set(tripIds).size !== tripIds.length) {
      throw new AppError('Trip ids must be distinct', 400);
    }

    const trips = await prisma.trip.findMany({
      where: {
        id: { in: tripIds },
        OR: [{ userId }, { collaborators: { some: { userId } } }],
      },
      select: {
        id: true,
        userId: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        countryCode: true,
      },
    });

    const found = new Set(trips.map((trip) => trip.id));
    const missing = tripIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new AppError(`Trip not found or access denied: ${missing.join(', ')}`, 404);
    }
    const byId = new Map(trips.map((trip) => [trip.id, trip]));

    const [activityCounts, photoCounts, transportCounts, distanceSums, locationRows, viewer] =
      await Promise.all([
        prisma.activity.groupBy({
          by: ['tripId'],
          where: { tripId: { in: tripIds } },
          _count: { _all: true },
        }),
        prisma.photo.groupBy({
          by: ['tripId'],
          where: { tripId: { in: tripIds } },
          _count: { _all: true },
        }),
        prisma.transportation.groupBy({
          by: ['tripId'],
          where: { tripId: { in: tripIds } },
          _count: { _all: true },
        }),
        prisma.transportation.groupBy({
          by: ['tripId'],
          where: { tripId: { in: tripIds }, calculatedDistance: { not: null } },
          _sum: { calculatedDistance: true },
        }),
        prisma.location.findMany({
          where: { tripId: { in: tripIds } },
          select: {
            id: true,
            tripId: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            excludeFromMap: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.user.findUnique({ where: { id: userId }, select: { baseCurrency: true } }),
      ]);

    const countMap = (rows: Array<{ tripId: number; _count: { _all: number } }>) =>
      new Map(rows.map((row) => [row.tripId, row._count._all]));
    const activities = countMap(activityCounts);
    const photos = countMap(photoCounts);
    const transport = countMap(transportCounts);
    const distances = new Map(distanceSums.map((row) => [row.tripId, row._sum.calculatedDistance]));

    const locationCounts = new Map<number, number>();
    const mapLocations: TripComparisonLocation[] = [];
    for (const loc of locationRows) {
      locationCounts.set(loc.tripId, (locationCounts.get(loc.tripId) ?? 0) + 1);
      if (loc.excludeFromMap || loc.latitude === null || loc.longitude === null) continue;
      mapLocations.push({
        id: loc.id,
        tripId: loc.tripId,
        name: loc.name,
        address: loc.address,
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
      });
    }

    // Sequential: summaries warm the FX rate cache and write snapshots back.
    const summaries = new Map<number, BudgetSummary>();
    for (const id of tripIds) {
      summaries.set(id, await expenseService.getBudgetSummary(userId, id));
    }

    const firstSummary = summaries.get(tripIds[0]);
    const currency =
      normalizeCurrency(viewer?.baseCurrency ?? null) ?? firstSummary?.currency ?? 'USD';

    const result: TripComparisonTrip[] = [];
    for (const id of tripIds) {
      const trip = byId.get(id);
      const summary = summaries.get(id);
      if (!trip || !summary) continue;

      const days = inclusiveDays(trip.startDate, trip.endDate);
      const distance = distances.get(id);

      result.push({
        id,
        title: trip.title,
        status: trip.status,
        startDate: dateOnlyIso(trip.startDate),
        endDate: dateOnlyIso(trip.endDate),
        days,
        countryCode: trip.countryCode,
        isOwner: trip.userId === userId,
        locationCount: locationCounts.get(id) ?? 0,
        activityCount: activities.get(id) ?? 0,
        photoCount: photos.get(id) ?? 0,
        transportationCount: transport.get(id) ?? 0,
        totalDistanceKm: distance ? distance.toDecimalPlaces(1).toNumber() : null,
        cost: await this.buildCost(summary, currency, days),
      });
    }

    return { currency, trips: result, locations: mapLocations };
  }

  /** Restates one trip's budget summary in the comparison currency. */
  private async buildCost(
    summary: BudgetSummary,
    currency: string,
    days: number | null
  ): Promise<TripComparisonCost> {
    const base = {
      currency,
      summaryCurrency: summary.currency,
      unconverted: summary.conversion.unconverted,
    };

    const perDay = (spent: Prisma.Decimal): number | null =>
      days && days > 0 ? toMoneyNumber(spent.div(days)) : null;

    if (summary.currency === currency) {
      return {
        ...base,
        spent: summary.spent,
        costPerDay: perDay(new Prisma.Decimal(summary.spent)),
        breakdown: summary.breakdown,
        restated: false,
        excludedTotal: null,
        isComplete: summary.conversion.isComplete,
      };
    }

    // The summary is in another currency (e.g. a collaborator comparing a trip
    // owned by someone with a different base currency). Zero needs no rate.
    const conversion =
      summary.spent === 0
        ? null
        : await exchangeRateService.convert(summary.spent, summary.currency, currency, null);

    if (summary.spent !== 0 && !conversion) {
      return {
        ...base,
        spent: null,
        costPerDay: null,
        breakdown: null,
        restated: false,
        excludedTotal: { currency: summary.currency, amount: summary.spent },
        isComplete: false,
      };
    }

    const rate = conversion?.exchangeRate ?? new Prisma.Decimal(1);
    const restate = (value: number) => toMoneyNumber(new Prisma.Decimal(value).mul(rate));
    const spent = new Prisma.Decimal(summary.spent).mul(rate);

    return {
      ...base,
      spent: toMoneyNumber(spent),
      costPerDay: perDay(spent),
      breakdown: {
        lodging: restate(summary.breakdown.lodging),
        transportation: restate(summary.breakdown.transportation),
        activities: restate(summary.breakdown.activities),
        food: restate(summary.breakdown.food),
        other: restate(summary.breakdown.other),
      },
      restated: true,
      excludedTotal: null,
      // Restating with the latest rate is an approximation by definition.
      isComplete: false,
    };
  }
}

export default new TripComparisonService();
