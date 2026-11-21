/**
 * Backfills the FX snapshot (exchange_rate / base_amount / base_currency) on
 * costed records created before multi-currency support existed.
 *
 * Rates are looked up for each record's OWN date, so the reconstructed figure
 * matches what the money was actually worth at the time. Records whose rate
 * cannot be fetched are left untouched — no rate is ever invented, and the
 * budget summary reports them as unconverted rather than summing them at face
 * value.
 *
 * Safe to re-run: records that already carry a snapshot against the correct
 * base currency are skipped.
 *
 * Run with: npx tsx scripts/backfill-currency-conversion.ts [--dry-run]
 */

import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { findUserPreferences } from '../src/services/_shared/userSettings';
import exchangeRateService, { normalizeCurrency } from '../src/services/exchangeRate.service';

const DRY_RUN = process.argv.includes('--dry-run');

interface Totals {
  converted: number;
  alreadyDone: number;
  noCurrency: number;
  noRate: number;
}

const totals: Totals = { converted: 0, alreadyDone: 0, noCurrency: 0, noRate: 0 };

/**
 * Resolves the reporting currency for a trip, mirroring expense.service:
 * trip owner's home currency, else the trip's budget currency, else null
 * (nothing to convert into, so the trip is skipped).
 */
async function resolveReportingCurrency(tripId: number): Promise<string | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { budgetCurrency: true, userId: true },
  });

  if (!trip) return null;
  const prefs = await findUserPreferences(trip.userId);
  return normalizeCurrency(prefs?.baseCurrency) ?? normalizeCurrency(trip.budgetCurrency);
}

async function backfillRecord(
  label: string,
  id: number,
  tripId: number,
  amount: Prisma.Decimal | null,
  currency: string | null,
  baseAmount: Prisma.Decimal | null,
  baseCurrency: string | null,
  date: Date | null,
  apply: (data: {
    exchangeRate: string;
    baseAmount: string;
    baseCurrency: string;
  }) => Promise<void>
): Promise<void> {
  if (amount === null) return;

  const reporting = await resolveReportingCurrency(tripId);
  if (!reporting) return;

  const recordCurrency = normalizeCurrency(currency);
  if (!recordCurrency) {
    totals.noCurrency += 1;
    return;
  }

  if (baseAmount !== null && normalizeCurrency(baseCurrency) === reporting) {
    totals.alreadyDone += 1;
    return;
  }

  if (recordCurrency === reporting) {
    totals.alreadyDone += 1;
    return;
  }

  const conversion = await exchangeRateService.convert(
    amount,
    recordCurrency,
    reporting,
    date
  );

  if (!conversion) {
    totals.noRate += 1;
    console.warn(`  ! ${label} ${id}: no rate for ${recordCurrency}->${reporting}, left unconverted`);
    return;
  }

  totals.converted += 1;

  if (DRY_RUN) {
    console.log(
      `  ~ ${label} ${id}: ${recordCurrency} -> ${reporting} @ ${conversion.exchangeRate.toString()} (${conversion.precision})`
    );
    return;
  }

  await apply({
    exchangeRate: conversion.exchangeRate.toString(),
    baseAmount: conversion.baseAmount.toString(),
    baseCurrency: conversion.baseCurrency,
  });
}

async function main(): Promise<void> {
  console.log(
    DRY_RUN
      ? 'Backfilling currency conversion (DRY RUN — nothing will be written)\n'
      : 'Backfilling currency conversion\n'
  );

  const expenses = await prisma.tripExpense.findMany({
    where: { baseAmount: null },
    select: {
      id: true,
      tripId: true,
      amount: true,
      currency: true,
      baseAmount: true,
      baseCurrency: true,
      date: true,
    },
  });
  console.log(`trip_expenses: ${expenses.length} record(s) without a snapshot`);
  for (const row of expenses) {
    await backfillRecord(
      'expense',
      row.id,
      row.tripId,
      row.amount,
      row.currency,
      row.baseAmount,
      row.baseCurrency,
      row.date,
      (data) => prisma.tripExpense.update({ where: { id: row.id }, data }).then(() => undefined)
    );
  }

  const activities = await prisma.activity.findMany({
    where: { cost: { not: null }, baseAmount: null },
    select: {
      id: true,
      tripId: true,
      cost: true,
      currency: true,
      baseAmount: true,
      baseCurrency: true,
      startTime: true,
    },
  });
  console.log(`activities: ${activities.length} record(s) without a snapshot`);
  for (const row of activities) {
    await backfillRecord(
      'activity',
      row.id,
      row.tripId,
      row.cost,
      row.currency,
      row.baseAmount,
      row.baseCurrency,
      row.startTime,
      (data) => prisma.activity.update({ where: { id: row.id }, data }).then(() => undefined)
    );
  }

  const transportation = await prisma.transportation.findMany({
    where: { cost: { not: null }, baseAmount: null },
    select: {
      id: true,
      tripId: true,
      cost: true,
      currency: true,
      baseAmount: true,
      baseCurrency: true,
      scheduledStart: true,
    },
  });
  console.log(`transportation: ${transportation.length} record(s) without a snapshot`);
  for (const row of transportation) {
    await backfillRecord(
      'transportation',
      row.id,
      row.tripId,
      row.cost,
      row.currency,
      row.baseAmount,
      row.baseCurrency,
      row.scheduledStart,
      (data) => prisma.transportation.update({ where: { id: row.id }, data }).then(() => undefined)
    );
  }

  const lodging = await prisma.lodging.findMany({
    where: { cost: { not: null }, baseAmount: null },
    select: {
      id: true,
      tripId: true,
      cost: true,
      currency: true,
      baseAmount: true,
      baseCurrency: true,
      checkInDate: true,
    },
  });
  console.log(`lodging: ${lodging.length} record(s) without a snapshot`);
  for (const row of lodging) {
    await backfillRecord(
      'lodging',
      row.id,
      row.tripId,
      row.cost,
      row.currency,
      row.baseAmount,
      row.baseCurrency,
      row.checkInDate,
      (data) => prisma.lodging.update({ where: { id: row.id }, data }).then(() => undefined)
    );
  }

  console.log('\nDone.');
  console.log(`  converted:            ${totals.converted}`);
  console.log(`  already converted:    ${totals.alreadyDone}`);
  console.log(`  no currency recorded: ${totals.noCurrency} (assumed to be the base currency)`);
  console.log(`  no rate available:    ${totals.noRate} (left unconverted, reported as such)`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
