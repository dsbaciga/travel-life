/**
 * Zod schemas for the mobile create/edit sheets.
 *
 * These validate what a person typed *before* it is written to SQLite and
 * queued in the outbox. The server re-validates on sync with its own schemas
 * (`backend/src/types/*.types.ts`), so the limits here mirror those: a row that
 * passes on the phone must not be rejected hours later when signal returns.
 */

import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  LODGING_TYPES,
  TRANSPORTATION_STATUSES,
  TRANSPORTATION_TYPES,
} from '../types/entities';

const trimmed = (max: number) => z.string().trim().min(1, 'Required').max(max);
const optionalText = (max?: number) =>
  (max ? z.string().max(max) : z.string()).nullable().optional();
const validInstant = (v: string): boolean => !Number.isNaN(new Date(v).getTime());
const isoInstant = z.string().refine(validInstant, 'Invalid date/time').nullable().optional();
const currency = z
  .string()
  .length(3)
  .transform((v) => v.toUpperCase())
  .nullable()
  .optional();
const cost = z.number().min(0).nullable().optional();
const entityId = z.union([z.number().int().positive(), z.string().startsWith('local_')]);
const optionalEntityId = entityId.nullable().optional();
const HTTP_URL = /^https?:\/\/\S+$/i;
const optionalHttpUrl = (max?: number) =>
  z
    .string()
    .refine((v) => v === '' || HTTP_URL.test(v), 'Must be an http(s) URL')
    .refine((v) => !max || v.length <= max, `Must be at most ${max ?? 0} characters`)
    .nullable()
    .optional();
const dayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Expected YYYY-MM-DD')
  .nullable()
  .optional();

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

const endAfterStart = (v: { startTime?: string | null; endTime?: string | null }): boolean =>
  !v.startTime || !v.endTime || new Date(v.endTime).getTime() >= new Date(v.startTime).getTime();

export const activityFormSchema = z
  .object({
    name: trimmed(500),
    description: optionalText(),
    category: optionalText(100),
    allDay: z.boolean().optional(),
    startTime: isoInstant,
    endTime: isoInstant,
    timezone: optionalText(100),
    cost,
    currency,
    bookingUrl: optionalHttpUrl(500),
    bookingReference: optionalText(255),
    notes: optionalText(),
    parentId: optionalEntityId,
  })
  .refine(endAfterStart, { message: 'End must be after start', path: ['endTime'] });
export type ActivityFormInput = z.infer<typeof activityFormSchema>;

export const locationFormSchema = z
  .object({
    name: trimmed(500),
    address: optionalText(),
    latitude: latitudeSchema.nullable().optional(),
    longitude: longitudeSchema.nullable().optional(),
    categoryId: z.number().int().positive().nullable().optional(),
    visitDatetime: isoInstant,
    visitDurationMinutes: z.number().int().min(0).nullable().optional(),
    notes: optionalText(),
    isFavorite: z.boolean().optional(),
    openingHours: optionalText(1000),
    timezone: optionalText(100),
    parentId: optionalEntityId,
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    message: 'Latitude and longitude must be set together',
    path: ['longitude'],
  });
export type LocationFormInput = z.infer<typeof locationFormSchema>;

export const transportationFormSchema = z
  .object({
    type: z.enum(TRANSPORTATION_TYPES),
    startLocationId: optionalEntityId,
    startLocationText: optionalText(500),
    endLocationId: optionalEntityId,
    endLocationText: optionalText(500),
    scheduledStart: isoInstant,
    scheduledEnd: isoInstant,
    startTimezone: optionalText(100),
    endTimezone: optionalText(100),
    actualStart: isoInstant,
    actualEnd: isoInstant,
    company: optionalText(200),
    referenceNumber: optionalText(100),
    seatNumber: optionalText(50),
    bookingReference: optionalText(100),
    cost,
    currency,
    status: z.enum(TRANSPORTATION_STATUSES).optional(),
    delayMinutes: z.number().int().min(0).max(100000).nullable().optional(),
    notes: optionalText(2000),
  })
  .refine(
    (v) =>
      !v.scheduledStart ||
      !v.scheduledEnd ||
      new Date(v.scheduledEnd).getTime() >= new Date(v.scheduledStart).getTime(),
    { message: 'Arrival must be after departure', path: ['scheduledEnd'] }
  );
export type TransportationFormInput = z.infer<typeof transportationFormSchema>;

export const lodgingFormSchema = z
  .object({
    type: z.enum(LODGING_TYPES),
    name: trimmed(500),
    address: optionalText(1000),
    checkInDate: z.string().refine(validInstant, 'Invalid date'),
    checkOutDate: z.string().refine(validInstant, 'Invalid date'),
    timezone: optionalText(100),
    confirmationNumber: optionalText(100),
    bookingUrl: optionalHttpUrl(500),
    cost,
    currency,
    notes: optionalText(2000),
  })
  .refine((v) => new Date(v.checkOutDate).getTime() >= new Date(v.checkInDate).getTime(), {
    message: 'Check-out must be after check-in',
    path: ['checkOutDate'],
  });
export type LodgingFormInput = z.infer<typeof lodgingFormSchema>;

export const journalFormSchema = z.object({
  title: trimmed(500),
  content: z.string().trim().min(1, 'Required'),
  /** `YYYY-MM-DD`; null for a trip-level entry. */
  date: dayKey,
  entryType: z.string().optional(),
  mood: optionalText(50),
  weatherNotes: optionalText(),
});
export type JournalFormInput = z.infer<typeof journalFormSchema>;

export const savedLinkFormSchema = z.object({
  url: z
    .string()
    .trim()
    .refine((v) => HTTP_URL.test(v), 'Must be an http(s) URL'),
  title: optionalText(1000),
  notes: optionalText(),
});
export type SavedLinkFormInput = z.infer<typeof savedLinkFormSchema>;

export const customItemFormSchema = z
  .object({
    name: trimmed(500),
    typeId: z.number().int().positive().nullable().optional(),
    notes: optionalText(),
    allDay: z.boolean().optional(),
    startTime: isoInstant,
    endTime: isoInstant,
    timezone: optionalText(100),
    locationId: optionalEntityId,
    cost,
    currency,
    url: optionalHttpUrl(),
    confirmationNumber: optionalText(255),
  })
  .refine(endAfterStart, { message: 'End must be after start', path: ['endTime'] });
export type CustomItemFormInput = z.infer<typeof customItemFormSchema>;

export const expenseFormSchema = z.object({
  description: trimmed(500),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().min(0),
  currency,
  /** `YYYY-MM-DD` */
  date: dayKey,
  notes: optionalText(),
});
export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;

export const foodLogFormSchema = z.object({
  restaurantName: trimmed(200),
  dish: trimmed(200),
  rating: z.number().int().min(1).max(5),
  notes: optionalText(2000),
  orderAgain: z.boolean().optional(),
  activityId: optionalEntityId,
  locationId: optionalEntityId,
});
export type FoodLogFormInput = z.infer<typeof foodLogFormSchema>;

export const trackPointSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  recordedAt: z.string().refine(validInstant, 'Invalid instant'),
  accuracy: z.number().min(0).nullable().optional(),
  altitude: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
});

/** What the "Pair Mobile App" QR code must decode to. */
export const pairingQrSchema = z.object({
  serverUrl: z.string().refine((v) => /^https?:\/\/[^\s/]+/i.test(v), 'Must be an http(s) URL'),
  pairingToken: z.string().regex(/^[a-f0-9]{64}$/, 'Malformed pairing token'),
});

export type SplitMode = 'equal' | 'custom' | 'percentage';

/**
 * Splits an expense between companions (#97).
 *
 * @returns Per-person shares that sum to `amount` exactly (leftover cents go
 * to the earliest people so nothing is lost to rounding), or null when the
 * custom/percentage inputs do not add up.
 */
export function splitExpense(
  amount: number,
  people: readonly string[],
  mode: SplitMode,
  values: Readonly<Record<string, number>> = {}
): Record<string, number> | null {
  if (people.length === 0 || !(amount >= 0)) return null;
  const cents = Math.round(amount * 100);
  const result: Record<string, number> = {};
  if (mode === 'equal') {
    const base = Math.floor(cents / people.length);
    let remainder = cents - base * people.length;
    for (const person of people) {
      result[person] = (base + (remainder > 0 ? 1 : 0)) / 100;
      remainder -= 1;
    }
    return result;
  }
  if (mode === 'custom') {
    const total = people.reduce((sum, p) => sum + Math.round((values[p] ?? 0) * 100), 0);
    if (total !== cents) return null;
    for (const person of people) result[person] = Math.round((values[person] ?? 0) * 100) / 100;
    return result;
  }
  const pctTotal = people.reduce((sum, p) => sum + (values[p] ?? 0), 0);
  if (Math.abs(pctTotal - 100) > 0.01) return null;
  let allocated = 0;
  people.forEach((person, index) => {
    const share =
      index === people.length - 1
        ? cents - allocated
        : Math.round((cents * (values[person] ?? 0)) / 100);
    allocated += share;
    result[person] = share / 100;
  });
  return result;
}
