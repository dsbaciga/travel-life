import { fromZonedTime } from 'date-fns-tz';

/**
 * Pure helpers for the CSV bulk import: cell cleaning, number and date-time parsing, name
 * matching and duplicate detection. Nothing in here touches the database, so every rule can
 * be unit tested directly (see __tests__/bulkImportRows.test.ts).
 *
 * The evaluators that apply these rules to whole rows live in bulkImportEvaluators.ts.
 */

// =============================================================================
// LIMITS AND CONSTANTS
// =============================================================================

/** Most rows a single import request may carry. Keeps one transaction and one JSON body small. */
export const IMPORT_MAX_ROWS = 500;

/**
 * Currencies a cost may be entered in: the same list the web app's `CurrencySelect` offers
 * (frontend `CONVERTIBLE_CURRENCIES`), i.e. the currencies exchange rates exist for. A cost in
 * any other currency would silently drop out of the trip budget.
 */
export const IMPORT_CURRENCY_CODES: ReadonlySet<string> = new Set([
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF',
  'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN',
  'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]);

/** Documented in the template and in every date error so the user knows what to type. */
export const ACCEPTED_DATETIME_FORMATS =
  'YYYY-MM-DD HH:mm (local time), YYYY-MM-DDTHH:mm (local time), or ISO 8601 with an offset such as 2026-04-03T10:30:00+02:00 or 2026-04-03T08:30:00Z';

/** Largest value the `Decimal(10, 2)` cost column holds. */
const MAX_COST_INTEGER_DIGITS = 8;

/** Two places are "near identical" within this many degrees (about 50 m at the equator). */
export const NEAR_IDENTICAL_DEGREES = 0.0005;

// =============================================================================
// RESULT TYPE
// =============================================================================

export type CellResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): CellResult<T> => ({ ok: true, value });
const fail = <T = never>(error: string): CellResult<T> => ({ ok: false, error });

// =============================================================================
// CELL CLEANING
// =============================================================================

// Built from char codes so the invisible characters stay visible in the source.
const NUL_BYTES = new RegExp(String.fromCharCode(0), 'g');
const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);
const stripBom = (value: string): string => (value.startsWith(BOM) ? value.slice(1) : value);

/**
 * Trims a raw cell (including non-breaking spaces and a stray BOM) and turns blank into
 * `undefined`, so an empty CSV cell means "not provided".
 */
export function cleanCell(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  // NUL bytes are valid JSON but Postgres refuses them in text, which would fail the whole batch.
  const cleaned = stripBom(raw.replace(NUL_BYTES, '')).split(NBSP).join(' ').trim();
  return cleaned === '' ? undefined : cleaned;
}

// =============================================================================
// NUMBERS
// =============================================================================

/**
 * Parses a latitude or longitude. Only plain dot-decimal numbers are accepted: `12,5` would be
 * read as 12.5 in some locales and 125 in others, so it is rejected rather than guessed.
 */
export function parseCoordinate(
  raw: string | undefined,
  kind: 'latitude' | 'longitude'
): CellResult<number | undefined> {
  if (raw === undefined) return ok(undefined);
  if (!/^[+-]?\d{1,3}(\.\d+)?$/.test(raw)) {
    return fail(`${capitalize(kind)} must be a plain number such as 48.8584 (use a dot, not a comma, as the decimal separator)`);
  }
  const value = Number(raw);
  const limit = kind === 'latitude' ? 90 : 180;
  if (value < -limit || value > limit) {
    return fail(`${capitalize(kind)} must be between -${limit} and ${limit}`);
  }
  return ok(value);
}

/**
 * Parses a cost amount into a canonical decimal *string* (never a float), ready for
 * `new Prisma.Decimal(...)`. Accepts `1234`, `1234.5` and `1234.50`. Anything with a thousands
 * separator or a decimal comma (`1.234,50`, `1,234.50`) is rejected, because the same text means
 * different amounts in different locales.
 */
export function parseAmount(raw: string | undefined): CellResult<string | undefined> {
  if (raw === undefined) return ok(undefined);
  if (raw.startsWith('-')) return fail('Cost cannot be negative');
  if (/,/.test(raw) || /^\d{1,3}(\.\d{3}){2,}$/.test(raw)) {
    return fail(
      `Cost "${raw}" is ambiguous. Use digits with a dot decimal separator and no thousands separator, e.g. 1234.50`
    );
  }
  const match = /^\+?(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) {
    return fail(`Cost "${raw}" is not a number. Use digits with an optional dot decimal, e.g. 1234.50`);
  }
  const integerPart = match[1].replace(/^0+(?=\d)/, '');
  const fraction = match[2] ?? '';
  if (fraction.length > 2) return fail('Cost can have at most 2 decimal places');
  if (integerPart.length > MAX_COST_INTEGER_DIGITS) return fail('Cost is too large (maximum 99,999,999.99)');
  return ok(`${integerPart}.${fraction.padEnd(2, '0')}`);
}

/** Parses a yes/no cell. Returns `undefined` for blank. */
export function parseBooleanCell(raw: string | undefined): CellResult<boolean | undefined> {
  if (raw === undefined) return ok(undefined);
  const value = raw.toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(value)) return ok(true);
  if (['false', 'no', 'n', '0'].includes(value)) return ok(false);
  return fail(`"${raw}" is not a yes/no value. Use true or false`);
}

/** Parses a currency cell: upper-cased, and it must be one the app can convert. */
export function parseCurrency(raw: string | undefined): CellResult<string | undefined> {
  if (raw === undefined) return ok(undefined);
  const code = raw.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return fail(`Currency "${raw}" must be a 3-letter ISO 4217 code such as USD`);
  if (!IMPORT_CURRENCY_CODES.has(code)) {
    return fail(`Currency "${code}" is not supported for conversion. Supported: ${[...IMPORT_CURRENCY_CODES].join(', ')}`);
  }
  return ok(code);
}

// =============================================================================
// TIMEZONES AND DATE-TIMES
// =============================================================================

/** True when `zone` is an IANA timezone name the runtime knows. */
export function isValidTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Parses a timezone cell; blank is `undefined`, an unknown zone is an error. */
export function parseTimezoneCell(raw: string | undefined): CellResult<string | undefined> {
  if (raw === undefined) return ok(undefined);
  if (!isValidTimezone(raw)) {
    return fail(`Timezone "${raw}" is not a valid IANA timezone name (for example Europe/Paris)`);
  }
  return ok(raw);
}

export interface ParsedDateTime {
  /** The instant, as a UTC ISO string. */
  iso: string;
  /**
   * `offset`: the cell carried its own offset or Z. `wall`: a wall-clock time interpreted in the
   * supplied zone. `date`: a bare date, read as midnight in the supplied zone.
   */
  kind: 'offset' | 'wall' | 'date';
}

const OFFSET_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/**
 * Parses an activity date-time cell.
 *
 * Accepted: ISO 8601 with an offset or `Z`, and a wall-clock time without one
 * (`YYYY-MM-DD HH:mm` or `YYYY-MM-DDTHH:mm`, seconds optional). A wall-clock time means that time
 * on the clock in `zone` — it is never read as UTC. A bare `YYYY-MM-DD` is accepted only for
 * all-day items. Anything else (`03/04/2026`, `4 Mar 2026`) is rejected: day-first and
 * month-first are indistinguishable.
 *
 * @param zone - IANA zone used to read wall-clock times (already resolved by the caller)
 */
export function parseDateTimeCell(
  raw: string | undefined,
  zone: string,
  options: { allDay?: boolean } = {}
): CellResult<ParsedDateTime | undefined> {
  if (raw === undefined) return ok(undefined);

  const badFormat = () =>
    fail<ParsedDateTime | undefined>(
      `"${raw}" is not a recognised date/time. Accepted formats: ${ACCEPTED_DATETIME_FORMATS}`
    );

  const offsetMatch = OFFSET_ISO.exec(raw);
  const wallMatch = offsetMatch ? null : WALL_CLOCK.exec(raw);
  const dateMatch = offsetMatch || wallMatch ? null : DATE_ONLY.exec(raw);
  const match = offsetMatch ?? wallMatch ?? dateMatch;
  if (!match) return badFormat();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = dateMatch ? 0 : Number(match[4]);
  const minute = dateMatch ? 0 : Number(match[5]);
  const second = dateMatch ? 0 : Number(match[6] ?? 0);

  if (month < 1 || month > 12 || !isRealDate(year, month, day)) {
    return fail(`"${raw}" is not a real calendar date`);
  }
  if (hour > 23 || minute > 59 || second > 59) return fail(`"${raw}" has an invalid time of day`);

  if (dateMatch) {
    if (!options.allDay) {
      return fail(
        `"${raw}" has no time of day. Add a time (YYYY-MM-DD HH:mm) or set all_day to true for an all-day item`
      );
    }
    return ok({ iso: fromZonedTime(`${raw}T00:00:00`, zone).toISOString(), kind: 'date' });
  }

  if (offsetMatch) {
    const offset = match[7].toUpperCase();
    let offsetMinutes = 0;
    if (offset !== 'Z') {
      const digits = offset.replace(':', '');
      const sign = digits.startsWith('-') ? -1 : 1;
      const offsetHours = Number(digits.slice(1, 3));
      const offsetMins = Number(digits.slice(3, 5) || 0);
      if (offsetHours > 14 || offsetMins > 59) return fail(`"${raw}" has an invalid UTC offset`);
      offsetMinutes = sign * (offsetHours * 60 + offsetMins);
    }
    const utc = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
    return ok({ iso: new Date(utc).toISOString(), kind: 'offset' });
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${match[1]}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  return ok({ iso: fromZonedTime(local, zone).toISOString(), kind: 'wall' });
}

// =============================================================================
// MATCHING
// =============================================================================

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Case-, spacing- and Unicode-form-insensitive key for comparing names. */
export function normalizeNameKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Finds the canonical spelling of a category by case-insensitive name, or `undefined`. */
export function matchCategoryName(value: string, names: readonly string[]): string | undefined {
  const key = normalizeNameKey(value);
  return names.find((name) => normalizeNameKey(name) === key);
}

export type NameMatch =
  | { kind: 'none' }
  | { kind: 'one'; id: number }
  | { kind: 'many'; count: number };

/** Looks an item up by name; more than one hit is reported as ambiguous, never guessed. */
export function matchByName(value: string, items: ReadonlyArray<{ id: number; name: string }>): NameMatch {
  const key = normalizeNameKey(value);
  const hits = items.filter((item) => normalizeNameKey(item.name) === key);
  if (hits.length === 0) return { kind: 'none' };
  if (hits.length === 1) return { kind: 'one', id: hits[0].id };
  return { kind: 'many', count: hits.length };
}

// =============================================================================
// DUPLICATE DETECTION
// =============================================================================

export interface LocationKey {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ActivityKey {
  name: string;
  /** UTC instant; null/undefined for an activity with no start time. */
  startTime?: Date | string | null;
}

/**
 * Two locations are duplicates when their names match and they are in the same place. A
 * location with no coordinates cannot be told apart by position, so a name match alone counts.
 */
export function isDuplicateLocation(a: LocationKey, b: LocationKey): boolean {
  if (normalizeNameKey(a.name) !== normalizeNameKey(b.name)) return false;
  const aHasPoint = a.latitude != null && a.longitude != null;
  const bHasPoint = b.latitude != null && b.longitude != null;
  if (!aHasPoint || !bHasPoint) return true;
  return (
    Math.abs((a.latitude as number) - (b.latitude as number)) <= NEAR_IDENTICAL_DEGREES &&
    Math.abs((a.longitude as number) - (b.longitude as number)) <= NEAR_IDENTICAL_DEGREES
  );
}

function instantOf(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Two activities are duplicates when the name and the start instant both match. */
export function isDuplicateActivity(a: ActivityKey, b: ActivityKey): boolean {
  return normalizeNameKey(a.name) === normalizeNameKey(b.name) && instantOf(a.startTime) === instantOf(b.startTime);
}

/** Index of the first pool entry that `isSame` accepts, or -1. */
export function findDuplicateIndex<T>(candidate: T, pool: readonly T[], isSame: (a: T, b: T) => boolean): number {
  for (let i = 0; i < pool.length; i += 1) {
    if (isSame(candidate, pool[i])) return i;
  }
  return -1;
}
