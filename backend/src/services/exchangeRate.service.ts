import axios from 'axios';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../config/database';

/**
 * Exchange Rate Service
 *
 * Supplies the foreign-exchange rates used to convert costed records
 * (expenses, activity/transportation/lodging costs) into a single reporting
 * currency.
 *
 * Design notes:
 * - **Frozen snapshots.** Callers persist the rate they receive alongside the
 *   converted amount. This service never rewrites an existing snapshot; a past
 *   transaction keeps the rate that applied on its own date forever.
 * - **No API key.** Rates come from Frankfurter (https://frankfurter.dev), a
 *   free ECB-backed endpoint that needs no registration.
 * - **Cached, not hammered.** Every successful lookup is written to the
 *   `exchange_rates` table keyed by (date, from, to), so a given pair/date is
 *   fetched from the network at most once ever. Failures are held in a
 *   short-lived in-process negative cache so a provider outage does not turn
 *   into one outbound request per row.
 * - **Degrades, never throws.** Every public method returns `null` when a rate
 *   cannot be obtained. Callers must report such amounts as unconverted rather
 *   than pretending a rate of 1.
 */

/** Frankfurter's public API. Overridable for self-hosted deployments. */
const API_BASE_URL = process.env.EXCHANGE_RATE_API_URL ?? 'https://api.frankfurter.dev/v1';

/** Frankfurter's ECB series does not go back further than this. */
const EARLIEST_SUPPORTED_DATE = Date.UTC(1999, 0, 4);

/** How long a failed lookup suppresses further network calls for that key. */
const FAILURE_CACHE_MS = 15 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 8000;

/** Rate values are stored with 10 decimal places; keep the math consistent. */
const RATE_DECIMAL_PLACES = 10;

/** Money is stored with 2 decimal places across every costed table. */
const AMOUNT_DECIMAL_PLACES = 2;

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

const frankfurterResponseSchema = z.object({
  base: z.string(),
  date: z.string(),
  rates: z.record(z.string(), z.number()),
});

/**
 * How well the stored rate matches the transaction it was applied to.
 * - `exact`: the record had a date and the rate is that date's rate.
 * - `estimated`: the record had no date, so the most recent rate was used.
 */
export type RatePrecision = 'exact' | 'estimated';

export interface RateLookup {
  /** `toCurrency` units per 1 `fromCurrency`. */
  rate: Prisma.Decimal;
  /** The date the rate was looked up for. */
  rateDate: Date;
  precision: RatePrecision;
}

export interface ConversionResult {
  exchangeRate: Prisma.Decimal;
  baseAmount: Prisma.Decimal;
  baseCurrency: string;
  precision: RatePrecision;
}

/**
 * Type guard for an ISO 4217 alphabetic currency code.
 * Deliberately structural (three letters) rather than an allow-list: the
 * provider is the authority on which codes it supports, and an unsupported
 * code simply yields a null rate.
 */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY_CODE_PATTERN.test(value);
}

/**
 * Uppercases and validates a user-supplied currency code.
 * Returns null for anything that is not a three-letter code.
 */
export function normalizeCurrency(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return isCurrencyCode(upper) ? upper : null;
}

/** Truncates a Date to UTC midnight so it can be used as a stable cache key. */
function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Formats a Date as YYYY-MM-DD for the provider's path segment. */
function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Narrows an unknown value to a finite number.
 * Used on parsed JSON, where a `NaN`/`Infinity` would poison the cache.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

class ExchangeRateService {
  /**
   * Keys of lookups that recently failed, with the timestamp of the failure.
   * In-process only — a restart simply retries, which is the desired behaviour.
   */
  private readonly recentFailures = new Map<string, number>();

  /**
   * Resolves the rate to convert 1 unit of `fromCurrency` into `toCurrency`.
   *
   * @param fromCurrency - Source ISO 4217 code (case-insensitive)
   * @param toCurrency - Target ISO 4217 code (case-insensitive)
   * @param date - The transaction date. Null (or a future date) uses the most
   *   recent published rate and marks the result `estimated`.
   * @returns The rate, or null when it cannot be determined.
   */
  async getRate(
    fromCurrency: string | null | undefined,
    toCurrency: string | null | undefined,
    date: Date | null
  ): Promise<RateLookup | null> {
    const from = normalizeCurrency(fromCurrency);
    const to = normalizeCurrency(toCurrency);

    if (!from || !to) return null;

    const { lookupDate, precision } = this.resolveLookupDate(date);

    // Same currency: rate is exactly 1, no provider call needed.
    if (from === to) {
      return { rate: new Prisma.Decimal(1), rateDate: lookupDate, precision };
    }

    const cached = await this.readCachedRate(from, to, lookupDate);
    if (cached) {
      return { rate: cached, rateDate: lookupDate, precision };
    }

    const failureKey = this.buildKey(from, to, lookupDate);
    if (this.isSuppressedByRecentFailure(failureKey)) {
      return null;
    }

    const fetched = await this.fetchRateFromProvider(from, to, lookupDate);
    if (fetched === null) {
      this.recentFailures.set(failureKey, Date.now());
      return null;
    }

    await this.writeCachedRate(from, to, lookupDate, fetched);
    this.recentFailures.delete(failureKey);

    return { rate: fetched, rateDate: lookupDate, precision };
  }

  /**
   * Converts an amount into `toCurrency`, producing the values a caller should
   * freeze onto the record (`exchangeRate`, `baseAmount`, `baseCurrency`).
   *
   * A null `fromCurrency` means the record never recorded one; it is taken to
   * already be in `toCurrency` (rate 1) — callers surface that assumption
   * separately rather than treating it as a genuine conversion.
   *
   * @returns The conversion, or null when no rate is available.
   */
  async convert(
    amount: Prisma.Decimal | number | string,
    fromCurrency: string | null | undefined,
    toCurrency: string | null | undefined,
    date: Date | null
  ): Promise<ConversionResult | null> {
    const to = normalizeCurrency(toCurrency);
    if (!to) return null;

    // Currency omitted on the record: assume it is already the target currency.
    const from = normalizeCurrency(fromCurrency) ?? to;

    const lookup = await this.getRate(from, to, date);
    if (!lookup) return null;

    // Decimal arithmetic throughout — never floats. A JS float multiply of
    // 0.1-style rates loses cents on large trip totals.
    const decimalAmount = new Prisma.Decimal(amount);
    const baseAmount = decimalAmount.mul(lookup.rate).toDecimalPlaces(AMOUNT_DECIMAL_PLACES);

    return {
      exchangeRate: lookup.rate,
      baseAmount,
      baseCurrency: to,
      precision: lookup.precision,
    };
  }

  /**
   * Clears the in-process negative cache.
   * Exposed for tests and for an operator-triggered retry after an outage.
   */
  clearFailureCache(): void {
    this.recentFailures.clear();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Picks the date to quote against. A missing date, or one in the future or
   * before the provider's earliest data, falls back to today's rate and is
   * flagged `estimated`.
   */
  private resolveLookupDate(date: Date | null): { lookupDate: Date; precision: RatePrecision } {
    const today = toUtcDateOnly(new Date());

    if (!date || Number.isNaN(date.getTime())) {
      return { lookupDate: today, precision: 'estimated' };
    }

    const requested = toUtcDateOnly(date);

    if (requested.getTime() > today.getTime()) {
      return { lookupDate: today, precision: 'estimated' };
    }
    if (requested.getTime() < EARLIEST_SUPPORTED_DATE) {
      return { lookupDate: today, precision: 'estimated' };
    }

    return { lookupDate: requested, precision: 'exact' };
  }

  private buildKey(from: string, to: string, date: Date): string {
    return `${toIsoDateString(date)}:${from}:${to}`;
  }

  private isSuppressedByRecentFailure(key: string): boolean {
    const failedAt = this.recentFailures.get(key);
    if (failedAt === undefined) return false;

    if (Date.now() - failedAt > FAILURE_CACHE_MS) {
      this.recentFailures.delete(key);
      return false;
    }
    return true;
  }

  private async readCachedRate(
    from: string,
    to: string,
    date: Date
  ): Promise<Prisma.Decimal | null> {
    try {
      const row = await prisma.exchangeRate.findUnique({
        where: {
          exchange_rate_date_pair_unique: { date, fromCurrency: from, toCurrency: to },
        },
      });
      return row ? new Prisma.Decimal(row.rate) : null;
    } catch (error) {
      console.warn('[Exchange Rate Service] Cache read failed:', error);
      return null;
    }
  }

  private async writeCachedRate(
    from: string,
    to: string,
    date: Date,
    rate: Prisma.Decimal
  ): Promise<void> {
    try {
      await prisma.exchangeRate.upsert({
        where: {
          exchange_rate_date_pair_unique: { date, fromCurrency: from, toCurrency: to },
        },
        update: { rate },
        create: { date, fromCurrency: from, toCurrency: to, rate },
      });
    } catch (error) {
      // A cache write failure must not fail the conversion.
      console.warn('[Exchange Rate Service] Cache write failed:', error);
    }
  }

  /**
   * Fetches a single rate from Frankfurter.
   * Returns null on any transport, status, shape or value problem — the caller
   * turns that into "unconverted", never into a fabricated rate.
   */
  private async fetchRateFromProvider(
    from: string,
    to: string,
    date: Date
  ): Promise<Prisma.Decimal | null> {
    const today = toUtcDateOnly(new Date());
    // `latest` is the provider's alias for the most recent publication, which
    // is what we want for today — the current day's rate may not exist yet.
    const pathSegment = date.getTime() >= today.getTime() ? 'latest' : toIsoDateString(date);
    const url = `${API_BASE_URL}/${pathSegment}`;

    try {
      const response = await axios.get<unknown>(url, {
        params: { base: from, symbols: to },
        timeout: REQUEST_TIMEOUT_MS,
      });

      const parsed = frankfurterResponseSchema.safeParse(response.data);
      if (!parsed.success) {
        console.warn(
          `[Exchange Rate Service] Unexpected response shape for ${from}->${to} on ${pathSegment}`
        );
        return null;
      }

      const value = parsed.data.rates[to];
      if (!isFiniteNumber(value) || value <= 0) {
        console.warn(
          `[Exchange Rate Service] No usable rate for ${from}->${to} on ${pathSegment}`
        );
        return null;
      }

      return new Prisma.Decimal(value).toDecimalPlaces(RATE_DECIMAL_PLACES);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(
        `[Exchange Rate Service] Lookup failed for ${from}->${to} on ${pathSegment}: ${message}`
      );
      return null;
    }
  }
}

export default new ExchangeRateService();
