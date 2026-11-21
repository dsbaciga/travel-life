import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { dayKeyInTimezone } from './dayDraft';
import { findOwnerCompanionId } from './ownerCompanion';
import { rescaleExpenseSplits } from './expenseRescale';

/**
 * A booking's cost IS a trip expense (Step D of the data model reorganization): activities,
 * transportation legs, lodging stays and custom items no longer carry `cost`, `currency` and the FX
 * snapshot themselves. Each costed booking has exactly one `trip_expenses` row, linked through
 * `activityId` / `transportationId` / `lodgingId` / `customItemId` (ON DELETE CASCADE, unique).
 *
 * Everything that reads or writes a booking's cost goes through this file, so the booking APIs keep
 * accepting and returning `cost`, `currency`, `exchangeRate`, `baseAmount` and `baseCurrency`
 * exactly as before:
 *
 * - reads include `costExpense` ({@link costExpenseInclude}) and flatten it with {@link hydrateBookingCost};
 * - creates nest the expense with {@link buildBookingCostCreate};
 * - updates call {@link syncBookingCost} after the booking row is written.
 */

export type BookingKind = 'activity' | 'transportation' | 'lodging' | 'customItem';

export const BOOKING_KINDS: readonly BookingKind[] = ['activity', 'transportation', 'lodging', 'customItem'];

/** The `trip_expenses` column that links an expense to each kind of booking. */
export const BOOKING_EXPENSE_FK = {
  activity: 'activityId',
  transportation: 'transportationId',
  lodging: 'lodgingId',
  customItem: 'customItemId',
} as const satisfies Record<BookingKind, keyof Prisma.TripExpenseUncheckedCreateInput>;

/**
 * Budget category of a booking's expense: the bucket the booking already landed in, so per-category
 * totals do not move. Custom items were always reported under `other`.
 */
export const BOOKING_EXPENSE_CATEGORY: Record<BookingKind, string> = {
  activity: 'activities',
  transportation: 'transportation',
  lodging: 'lodging',
  customItem: 'other',
};

type Db = Pick<
  typeof prisma,
  'tripExpense' | 'tripExpenseSplit' | 'travelCompanion' | 'user' | '$executeRaw' | 'trip' | 'activity' | 'transportation' | 'lodging' | 'customItem'
>;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** What a booking read needs from its cost row. */
export const costExpenseSelect = {
  id: true,
  amount: true,
  currency: true,
  exchangeRate: true,
  baseAmount: true,
  baseCurrency: true,
} as const;

/** Spread into a booking's `include` (or `select`) to load its cost in the same query. */
export const costExpenseInclude = { costExpense: { select: costExpenseSelect } } as const;

/** The two fields a child activity row carries. */
export const childCostExpenseSelect = { costExpense: { select: { amount: true, currency: true } } } as const;

type CostRow = {
  amount: Prisma.Decimal;
  currency: string | null;
  exchangeRate?: Prisma.Decimal | null;
  baseAmount?: Prisma.Decimal | null;
  baseCurrency?: string | null;
};

/**
 * Flattens `costExpense` into the `cost`, `currency`, `exchangeRate`, `baseAmount` and `baseCurrency`
 * fields a booking row used to have. A booking with no cost reads `null` for all of them.
 */
export function hydrateBookingCost<T extends { costExpense?: CostRow | null }>(row: T) {
  const { costExpense, ...rest } = row;
  return {
    ...rest,
    cost: costExpense?.amount ?? null,
    currency: costExpense?.currency ?? null,
    exchangeRate: costExpense?.exchangeRate ?? null,
    baseAmount: costExpense?.baseAmount ?? null,
    baseCurrency: costExpense?.baseCurrency ?? null,
  };
}

/** Nested child activities only ever carried `cost` and `currency`. */
export function hydrateChildCost<T extends { costExpense?: CostRow | null }>(row: T) {
  const { costExpense, ...rest } = row;
  return { ...rest, cost: costExpense?.amount ?? null, currency: costExpense?.currency ?? null };
}

/** Hydrates an activity and its nested children. */
export function hydrateActivityCost<
  T extends { costExpense?: CostRow | null; children?: Array<{ costExpense?: CostRow | null }> },
>(activity: T) {
  const hydrated = hydrateBookingCost(activity);
  if (!activity.children) return hydrated;
  return { ...hydrated, children: activity.children.map((child) => hydrateChildCost(child)) };
}

// ---------------------------------------------------------------------------
// Describing a booking as an expense
// ---------------------------------------------------------------------------

export interface TransportationLabelFields {
  type: string;
  company?: string | null;
  referenceNumber?: string | null;
  startLocationText?: string | null;
  endLocationText?: string | null;
  startLocation?: { name: string } | null;
  endLocation?: { name: string } | null;
}

/**
 * "<type> <company> <reference>: <from> → <to>", the label the calendar feed gives a leg. The
 * location text wins over the linked location's name.
 */
export function transportationLabel(transport: TransportationLabelFields): string {
  const from = transport.startLocationText ?? transport.startLocation?.name ?? null;
  const to = transport.endLocationText ?? transport.endLocation?.name ?? null;

  const parts: string[] = [transport.type];
  if (transport.company) parts.push(transport.company);
  if (transport.referenceNumber) parts.push(transport.referenceNumber);
  let label = parts.join(' ');
  if (from && to) label += `: ${from} → ${to}`;
  else if (from || to) label += `: ${from ?? to}`;
  return label;
}

interface BookingDescription {
  description: string;
  /** The instant the booking starts, or null when it is unscheduled. */
  startAt: Date | null;
  /** The booking's own timezone, the most specific candidate for its calendar day. */
  entityTimezone: string | null;
}

type BookingFields =
  | { kind: 'activity'; name: string; startTime: Date | null; timezone: string | null }
  | ({ kind: 'transportation'; scheduledStart: Date | null; startTimezone: string | null } & TransportationLabelFields)
  | { kind: 'lodging'; name: string; checkInDate: Date | null; timezone: string | null }
  | { kind: 'customItem'; name: string; startTime: Date | null; timezone: string | null };

const MAX_DESCRIPTION = 500;
const FALLBACK_NAME: Record<BookingKind, string> = {
  activity: 'Activity',
  transportation: 'Transportation',
  lodging: 'Lodging',
  customItem: 'Custom item',
};

export function describeBooking(fields: BookingFields): BookingDescription {
  const clean = (value: string) => (value.trim() === '' ? FALLBACK_NAME[fields.kind] : value).slice(0, MAX_DESCRIPTION);
  switch (fields.kind) {
    case 'transportation':
      return {
        description: clean(transportationLabel(fields)),
        startAt: fields.scheduledStart,
        entityTimezone: fields.startTimezone,
      };
    case 'lodging':
      return { description: clean(fields.name), startAt: fields.checkInDate, entityTimezone: fields.timezone };
    default:
      return { description: clean(fields.name), startAt: fields.startTime, entityTimezone: fields.timezone };
  }
}

function isValidZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The calendar day (UTC midnight, for a `@db.Date` column) a booking's expense falls on: the start
 * instant on the clock of the first specified, valid zone of entity, trip, trip owner; UTC only as the
 * last resort. Never a slice of the ISO string. Null for an unscheduled booking.
 */
export function bookingExpenseDate(
  startAt: Date | null | undefined,
  zones: Array<string | null | undefined>
): Date | null {
  if (!startAt || Number.isNaN(startAt.getTime())) return null;
  const zone = zones.map((z) => z?.trim()).find((z): z is string => !!z && isValidZone(z)) ?? 'UTC';
  const key = dayKeyInTimezone(startAt, zone);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
}

/** The trip's and the trip owner's timezones, the fallbacks behind a booking's own zone. */
async function loadFallbackZones(db: Pick<Db, 'trip'>, tripId: number): Promise<Array<string | null>> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { timezone: true, user: { select: { timezone: true } } },
  });
  return [trip?.timezone ?? null, trip?.user?.timezone ?? null];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** The cost a client sent. `undefined` = not sent (leave as is), `null` = clear. */
export interface BookingCostInput {
  cost?: number | string | Prisma.Decimal | null;
  currency?: string | null;
  /** A frozen FX snapshot to copy verbatim (restore); never recomputed. */
  exchangeRate?: Prisma.Decimal | null;
  baseAmount?: Prisma.Decimal | null;
  baseCurrency?: string | null;
}

const normaliseCurrency = (value: string | null | undefined): string | null => (value ? value : null);

/** The nested create a booking's `costExpense` takes (identical for the four kinds). */
export interface BookingCostCreate {
  create: {
    tripId: number;
    description: string;
    category: string;
    amount: number | string | Prisma.Decimal;
    currency: string | null;
    exchangeRate?: Prisma.Decimal | null;
    baseAmount?: Prisma.Decimal | null;
    baseCurrency?: string | null;
    date: Date | null;
  };
}

/**
 * `costExpense: { create }` for a booking being created, or undefined when it has no cost (a cost
 * of 0 is a real value and gets a row). Pass the result straight into the booking's `create` data;
 * the booking and its expense are then written in one statement.
 */
export async function buildBookingCostCreate(
  db: Pick<Db, 'trip'>,
  tripId: number,
  fields: BookingFields,
  input: BookingCostInput,
  /** The trip and owner zones, when the caller already has them (saves a query per booking); may be lazy. */
  fallbackZones?: Array<string | null | undefined> | (() => Promise<Array<string | null | undefined>>)
): Promise<BookingCostCreate | undefined> {
  if (input.cost === undefined || input.cost === null) return undefined;
  const { description, startAt, entityTimezone } = describeBooking(fields);
  const date = startAt
    ? bookingExpenseDate(startAt, [
        entityTimezone,
        ...(typeof fallbackZones === 'function'
          ? await fallbackZones()
          : (fallbackZones ?? (await loadFallbackZones(db, tripId)))),
      ])
    : null;
  return {
    create: {
      tripId,
      description,
      category: BOOKING_EXPENSE_CATEGORY[fields.kind],
      amount: input.cost,
      currency: normaliseCurrency(input.currency),
      exchangeRate: input.exchangeRate ?? null,
      baseAmount: input.baseAmount ?? null,
      baseCurrency: input.baseCurrency ?? null,
      date,
    },
  };
}

/** Which booking fields feed the expense's description and date. */
export interface BookingCostSyncOptions extends BookingCostInput {
  /** The name, start or timezone changed: recompute the expense's description and date. */
  refresh?: boolean;
}

async function loadBookingFields(db: Db, kind: BookingKind, id: number): Promise<{ tripId: number; fields: BookingFields } | null> {
  switch (kind) {
    case 'activity': {
      const row = await db.activity.findUnique({ where: { id }, select: { tripId: true, name: true, startTime: true, timezone: true } });
      return row && { tripId: row.tripId, fields: { kind, ...row } };
    }
    case 'lodging': {
      const row = await db.lodging.findUnique({ where: { id }, select: { tripId: true, name: true, checkInDate: true, timezone: true } });
      return row && { tripId: row.tripId, fields: { kind, ...row } };
    }
    case 'customItem': {
      const row = await db.customItem.findUnique({ where: { id }, select: { tripId: true, name: true, startTime: true, timezone: true } });
      return row && { tripId: row.tripId, fields: { kind, ...row } };
    }
    case 'transportation': {
      const row = await db.transportation.findUnique({
        where: { id },
        select: {
          tripId: true,
          type: true,
          company: true,
          referenceNumber: true,
          startLocationText: true,
          endLocationText: true,
          scheduledStart: true,
          startTimezone: true,
          startLocation: { select: { name: true } },
          endLocation: { select: { name: true } },
        },
      });
      return row && { tripId: row.tripId, fields: { kind, ...row } };
    }
  }
}

/**
 * Brings a booking's cost row in line after the booking itself was written. Call it inside the same
 * transaction. Returns the receipt paths of an expense that was deleted, for the caller to unlink
 * once the transaction committed.
 *
 * - `cost: null`   deletes the row (with its splits and receipt reference);
 * - `cost: number` creates the row, or changes its amount (and currency when sent);
 * - `cost` unset   keeps the row, but applies a sent `currency` to it;
 * - `refresh`      recomputes description and date from the booking.
 *
 * A changed amount or currency makes the frozen FX snapshot describe another transaction, so it is
 * cleared and the budget summary fills it in again lazily. A changed amount also rescales the row's
 * splits (shares must keep summing to the amount).
 */
export async function syncBookingCost(
  db: Db,
  kind: BookingKind,
  bookingId: number,
  options: BookingCostSyncOptions
): Promise<{ receiptPaths: string[] }> {
  const result = await syncBookingCostRow(db, kind, bookingId, options);
  // A cost-only edit leaves the booking row itself untouched, so its updatedAt would not move and
  // delta sync (mobile) would never see the new cost: move it explicitly.
  if (result.changed) await touchBooking(db, kind, bookingId);
  return { receiptPaths: result.receiptPaths };
}

async function syncBookingCostRow(
  db: Db,
  kind: BookingKind,
  bookingId: number,
  options: BookingCostSyncOptions
): Promise<{ receiptPaths: string[]; changed: boolean }> {
  const fk = BOOKING_EXPENSE_FK[kind];
  const receiptPaths: string[] = [];
  const touchesCost = options.cost !== undefined || options.currency !== undefined;
  if (!touchesCost && !options.refresh) return { receiptPaths, changed: false };

  const existing = await db.tripExpense.findUnique({ where: { [fk]: bookingId } as unknown as Prisma.TripExpenseWhereUniqueInput });

  if (options.cost === null) {
    if (existing) {
      await db.tripExpense.delete({ where: { id: existing.id } });
      if (existing.receiptPath) receiptPaths.push(existing.receiptPath);
    }
    return { receiptPaths, changed: existing !== null };
  }

  const booking = existing || options.refresh || options.cost !== undefined ? await loadBookingFields(db, kind, bookingId) : null;
  if (!booking) return { receiptPaths, changed: false };

  const described = describeBooking(booking.fields);
  const zones = async () => [described.entityTimezone, ...(await loadFallbackZones(db, booking.tripId))];

  if (!existing) {
    if (options.cost === undefined) return { receiptPaths, changed: false }; // a currency alone describes nothing
    await db.tripExpense.create({
      data: {
        tripId: booking.tripId,
        description: described.description,
        category: BOOKING_EXPENSE_CATEGORY[kind],
        amount: options.cost,
        currency: normaliseCurrency(options.currency),
        date: described.startAt ? bookingExpenseDate(described.startAt, await zones()) : null,
        [fk]: bookingId,
      },
    });
    return { receiptPaths, changed: true };
  }

  const data: Prisma.TripExpenseUncheckedUpdateInput = {};
  const amountChanged = options.cost !== undefined && Number(existing.amount) !== Number(options.cost);
  const currencyChanged =
    options.currency !== undefined && normaliseCurrency(options.currency) !== existing.currency;
  if (amountChanged && options.cost !== undefined) data.amount = options.cost;
  if (currencyChanged) data.currency = normaliseCurrency(options.currency);
  if (amountChanged || currencyChanged) {
    data.exchangeRate = null;
    data.baseAmount = null;
    data.baseCurrency = null;
  }
  if (options.refresh) {
    data.description = described.description;
    data.date = described.startAt ? bookingExpenseDate(described.startAt, await zones()) : null;
  }

  const changed = Object.keys(data).length > 0;
  if (changed) {
    const updated = await db.tripExpense.update({ where: { id: existing.id }, data });
    if (amountChanged) {
      const trip = await db.trip.findUnique({ where: { id: existing.tripId }, select: { userId: true } });
      const ownerCompanionId = trip ? await findOwnerCompanionId(db, trip.userId) : null;
      await rescaleExpenseSplits(db, updated.id, updated.amount, ownerCompanionId);
    }
  }
  return { receiptPaths, changed };
}

/**
 * Inserts the cost row of a booking that already exists (trip duplication, restore of an older
 * backup). `fx` copies a frozen snapshot verbatim.
 */
export async function insertBookingCost(
  db: Pick<Db, 'tripExpense' | 'trip'>,
  kind: BookingKind,
  bookingId: number,
  tripId: number,
  fields: BookingFields,
  cost: {
    amount: Prisma.Decimal | number | string;
    currency?: string | null;
    exchangeRate?: Prisma.Decimal | null;
    baseAmount?: Prisma.Decimal | null;
    baseCurrency?: string | null;
  }
) {
  const { description, startAt, entityTimezone } = describeBooking(fields);
  const date = startAt ? bookingExpenseDate(startAt, [entityTimezone, ...(await loadFallbackZones(db, tripId))]) : null;
  return db.tripExpense.create({
    data: {
      tripId,
      description,
      category: BOOKING_EXPENSE_CATEGORY[kind],
      amount: cost.amount,
      currency: normaliseCurrency(cost.currency),
      exchangeRate: cost.exchangeRate ?? null,
      baseAmount: cost.baseAmount ?? null,
      baseCurrency: cost.baseCurrency ?? null,
      date,
      [BOOKING_EXPENSE_FK[kind]]: bookingId,
    },
  });
}

/** Receipt files hanging off the cost rows of bookings that are about to be deleted. */
export async function bookingReceiptPaths(
  db: Pick<Db, 'tripExpense'>,
  kind: BookingKind,
  bookingIds: number[]
): Promise<string[]> {
  if (bookingIds.length === 0) return [];
  const fk = BOOKING_EXPENSE_FK[kind];
  const rows = await db.tripExpense.findMany({
    where: { [fk]: { in: bookingIds }, receiptPath: { not: null } } as Prisma.TripExpenseWhereInput,
    select: { receiptPath: true },
  });
  return rows.map((r) => r.receiptPath).filter((p): p is string => !!p);
}

/** Moves a booking's updatedAt (delta sync keys on it) without changing anything else. */
async function touchBooking(
  db: Pick<Db, 'activity' | 'transportation' | 'lodging' | 'customItem'>,
  kind: BookingKind,
  id: number
): Promise<void> {
  const data = { updatedAt: new Date() };
  if (kind === 'activity') await db.activity.update({ where: { id }, data });
  else if (kind === 'transportation') await db.transportation.update({ where: { id }, data });
  else if (kind === 'lodging') await db.lodging.update({ where: { id }, data });
  else await db.customItem.update({ where: { id }, data });
}

/** The booking an expense is the cost of changes with it when the expense is edited or deleted. */
export async function touchLinkedBooking(
  db: Pick<Db, 'activity' | 'transportation' | 'lodging' | 'customItem'>,
  expense: { activityId: number | null; transportationId: number | null; lodgingId: number | null; customItemId: number | null }
): Promise<void> {
  if (expense.activityId) await touchBooking(db, 'activity', expense.activityId);
  else if (expense.transportationId) await touchBooking(db, 'transportation', expense.transportationId);
  else if (expense.lodgingId) await touchBooking(db, 'lodging', expense.lodgingId);
  else if (expense.customItemId) await touchBooking(db, 'customItem', expense.customItemId);
}

// ---------------------------------------------------------------------------
// The expense side: which booking is this the cost of?
// ---------------------------------------------------------------------------

/** Include for expense reads that expose the booking an expense belongs to. */
export const expenseLinkedEntityInclude = {
  activity: { select: { id: true, name: true } },
  lodging: { select: { id: true, name: true } },
  customItem: { select: { id: true, name: true } },
  transportation: {
    select: {
      id: true,
      type: true,
      company: true,
      referenceNumber: true,
      startLocationText: true,
      endLocationText: true,
      startLocation: { select: { name: true } },
      endLocation: { select: { name: true } },
    },
  },
} as const;

export interface LinkedEntity {
  type: BookingKind;
  id: number;
  name: string;
}

type LinkedRelations = {
  activity?: { id: number; name: string } | null;
  lodging?: { id: number; name: string } | null;
  customItem?: { id: number; name: string } | null;
  transportation?: ({ id: number } & TransportationLabelFields) | null;
};

/**
 * Replaces the booking relation objects of an expense row with a small `linkedEntity`
 * (`{ type, id, name }`, or null for an ordinary expense). The booking id columns stay on the row.
 */
export function withLinkedEntity<T extends object>(
  expense: T
): Omit<T, 'activity' | 'lodging' | 'customItem' | 'transportation'> & { linkedEntity: LinkedEntity | null } {
  const { activity, lodging, customItem, transportation, ...rest } = expense as T & LinkedRelations;
  let linkedEntity: LinkedEntity | null = null;
  if (activity) linkedEntity = { type: 'activity', id: activity.id, name: activity.name };
  else if (transportation) linkedEntity = { type: 'transportation', id: transportation.id, name: transportationLabel(transportation) };
  else if (lodging) linkedEntity = { type: 'lodging', id: lodging.id, name: lodging.name };
  else if (customItem) linkedEntity = { type: 'customItem', id: customItem.id, name: customItem.name };
  return { ...rest, linkedEntity } as Omit<T, 'activity' | 'lodging' | 'customItem' | 'transportation'> & {
    linkedEntity: LinkedEntity | null;
  };
}

/** Prisma filter: expenses that are ordinary (not a booking's cost). */
export const notBookingCost: Prisma.TripExpenseWhereInput = {
  activityId: null,
  transportationId: null,
  lodgingId: null,
  customItemId: null,
};
