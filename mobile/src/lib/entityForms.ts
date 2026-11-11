/**
 * Declarative form definitions for every entity the phone can create or edit.
 *
 * One generic form component renders these, so adding a field to a kind is a
 * one-line change here rather than a new screen. Validation is the shared Zod
 * schema for the kind — the same limits the server enforces on sync.
 */
import type { SyncEntityKind } from '@travel-life/shared';
import {
  EXPENSE_CATEGORIES,
  LODGING_TYPES,
  TRANSPORTATION_STATUSES,
  TRANSPORTATION_TYPES,
  activityFormSchema,
  customItemFormSchema,
  expenseFormSchema,
  foodLogFormSchema,
  journalFormSchema,
  locationFormSchema,
  lodgingFormSchema,
  savedLinkFormSchema,
  transportationFormSchema,
} from '@travel-life/shared';

/**
 * The slice of a Zod schema this module uses. Declared structurally so the
 * app does not need its own `zod` import alongside the shared package's.
 */
export interface FormSchema {
  safeParse(value: unknown):
    | { success: true; data: unknown }
    | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}

export type FieldType =
  | 'text'
  | 'multiline'
  | 'number'
  | 'datetime'
  | 'date'
  | 'boolean'
  | 'select'
  | 'rating'
  | 'url'
  | 'location';

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  placeholder?: string;
  /** For `datetime`: which field of the same form holds this value's timezone. */
  timezoneKey?: string;
}

export interface EntityFormDefinition {
  title: string;
  /** Name used in "New …" / "Delete …" copy. */
  noun: string;
  fields: readonly FormField[];
  schema: FormSchema;
  /** Values a blank form starts from. */
  defaults: Readonly<Record<string, unknown>>;
  /** Which field is shown as the row title in lists. */
  titleKey: string;
}

export type FormKind = Extract<
  SyncEntityKind,
  | 'ACTIVITY'
  | 'LOCATION'
  | 'TRANSPORTATION'
  | 'LODGING'
  | 'JOURNAL_ENTRY'
  | 'SAVED_LINK'
  | 'CUSTOM_ITEM'
  | 'EXPENSE'
  | 'FOOD_LOG'
>;

const MOODS = ['great', 'good', 'okay', 'tired', 'rough'] as const;

export const ENTITY_FORMS: Readonly<Record<FormKind, EntityFormDefinition>> = {
  ACTIVITY: {
    title: 'Activity',
    noun: 'activity',
    titleKey: 'name',
    schema: activityFormSchema,
    defaults: { name: '', allDay: false },
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'What are you doing?' },
      { key: 'category', label: 'Category', type: 'text', placeholder: 'Dining, Sightseeing…' },
      { key: 'allDay', label: 'All day', type: 'boolean' },
      { key: 'startTime', label: 'Starts', type: 'datetime', timezoneKey: 'timezone' },
      { key: 'endTime', label: 'Ends', type: 'datetime', timezoneKey: 'timezone' },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'text', placeholder: 'EUR' },
      { key: 'bookingReference', label: 'Booking reference', type: 'text' },
      { key: 'bookingUrl', label: 'Booking link', type: 'url' },
      { key: 'notes', label: 'Notes', type: 'multiline' },
    ],
  },
  LOCATION: {
    title: 'Location',
    noun: 'location',
    titleKey: 'name',
    schema: locationFormSchema,
    defaults: { name: '', isFavorite: false },
    fields: [
      { key: 'name', label: 'Name', type: 'text', placeholder: 'Where is this?' },
      { key: 'address', label: 'Address', type: 'multiline' },
      { key: 'latitude', label: 'Latitude', type: 'number' },
      { key: 'longitude', label: 'Longitude', type: 'number' },
      { key: 'isFavorite', label: 'Favourite', type: 'boolean' },
      { key: 'visitDatetime', label: 'Visit time', type: 'datetime', timezoneKey: 'timezone' },
      { key: 'visitDurationMinutes', label: 'Visit length (minutes)', type: 'number' },
      { key: 'openingHours', label: 'Opening hours', type: 'text', placeholder: 'Mo-Fr 09:00-17:00' },
      { key: 'notes', label: 'Notes', type: 'multiline' },
    ],
  },
  TRANSPORTATION: {
    title: 'Transit',
    noun: 'transit leg',
    titleKey: 'endLocationText',
    schema: transportationFormSchema,
    defaults: { type: 'train', status: 'on_time' },
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: TRANSPORTATION_TYPES },
      { key: 'startLocationId', label: 'From (saved location)', type: 'location' },
      { key: 'startLocationText', label: 'From (text)', type: 'text' },
      { key: 'endLocationId', label: 'To (saved location)', type: 'location' },
      { key: 'endLocationText', label: 'To (text)', type: 'text' },
      { key: 'scheduledStart', label: 'Scheduled departure', type: 'datetime', timezoneKey: 'startTimezone' },
      { key: 'scheduledEnd', label: 'Scheduled arrival', type: 'datetime', timezoneKey: 'endTimezone' },
      { key: 'actualStart', label: 'Actual departure', type: 'datetime', timezoneKey: 'startTimezone' },
      { key: 'actualEnd', label: 'Actual arrival', type: 'datetime', timezoneKey: 'endTimezone' },
      { key: 'status', label: 'Status', type: 'select', options: TRANSPORTATION_STATUSES },
      { key: 'delayMinutes', label: 'Delay (minutes)', type: 'number' },
      { key: 'company', label: 'Carrier', type: 'text' },
      { key: 'referenceNumber', label: 'Flight / train number', type: 'text' },
      { key: 'seatNumber', label: 'Seat', type: 'text' },
      { key: 'bookingReference', label: 'Confirmation', type: 'text' },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'text', placeholder: 'EUR' },
      { key: 'notes', label: 'Notes', type: 'multiline' },
    ],
  },
  LODGING: {
    title: 'Lodging',
    noun: 'stay',
    titleKey: 'name',
    schema: lodgingFormSchema,
    defaults: { type: 'hotel', name: '' },
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: LODGING_TYPES },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'address', label: 'Address', type: 'multiline' },
      { key: 'checkInDate', label: 'Check-in', type: 'datetime', timezoneKey: 'timezone' },
      { key: 'checkOutDate', label: 'Check-out', type: 'datetime', timezoneKey: 'timezone' },
      { key: 'confirmationNumber', label: 'Confirmation', type: 'text' },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'text', placeholder: 'EUR' },
      { key: 'bookingUrl', label: 'Booking link', type: 'url' },
      { key: 'notes', label: 'Notes', type: 'multiline' },
    ],
  },
  JOURNAL_ENTRY: {
    title: 'Journal',
    noun: 'journal entry',
    titleKey: 'title',
    schema: journalFormSchema,
    defaults: { title: '', content: '', entryType: 'daily' },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'content', label: 'Entry', type: 'multiline', placeholder: 'Markdown is supported' },
      { key: 'mood', label: 'Mood', type: 'select', options: MOODS },
      { key: 'weatherNotes', label: 'Weather', type: 'text' },
    ],
  },
  SAVED_LINK: {
    title: 'Saved link',
    noun: 'saved link',
    titleKey: 'title',
    schema: savedLinkFormSchema,
    defaults: { url: '' },
    fields: [
      { key: 'url', label: 'URL', type: 'url', placeholder: 'https://' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'multiline' },
    ],
  },
  CUSTOM_ITEM: {
    title: 'Custom item',
    noun: 'item',
    titleKey: 'name',
    schema: customItemFormSchema,
    defaults: { name: '', allDay: false },
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'allDay', label: 'All day', type: 'boolean' },
      { key: 'startTime', label: 'Starts', type: 'datetime', timezoneKey: 'timezone' },
      { key: 'endTime', label: 'Ends', type: 'datetime', timezoneKey: 'timezone' },
      { key: 'locationId', label: 'Location', type: 'location' },
      { key: 'cost', label: 'Cost', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'text', placeholder: 'EUR' },
      { key: 'confirmationNumber', label: 'Confirmation', type: 'text' },
      { key: 'url', label: 'Link', type: 'url' },
      { key: 'notes', label: 'Notes', type: 'multiline' },
    ],
  },
  EXPENSE: {
    title: 'Expense',
    noun: 'expense',
    titleKey: 'description',
    schema: expenseFormSchema,
    defaults: { description: '', category: 'food', amount: 0 },
    fields: [
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'category', label: 'Category', type: 'select', options: EXPENSE_CATEGORIES },
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'text', placeholder: 'EUR' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'multiline' },
    ],
  },
  FOOD_LOG: {
    title: 'Meal',
    noun: 'meal',
    titleKey: 'dish',
    schema: foodLogFormSchema,
    defaults: { restaurantName: '', dish: '', rating: 4, orderAgain: false },
    fields: [
      { key: 'restaurantName', label: 'Restaurant', type: 'text' },
      { key: 'dish', label: 'Dish', type: 'text' },
      { key: 'rating', label: 'Rating', type: 'rating' },
      { key: 'orderAgain', label: 'Order again?', type: 'boolean' },
      { key: 'locationId', label: 'Location', type: 'location' },
      { key: 'notes', label: 'Notes', type: 'multiline' },
    ],
  },
};

export function isFormKind(value: unknown): value is FormKind {
  return typeof value === 'string' && value in ENTITY_FORMS;
}

/**
 * Fill in every column a new row of this kind needs, so the stored entity has
 * the same shape as one that came from the server (nulls, not `undefined`).
 */
export function completeEntity(kind: FormKind, values: Record<string, unknown>): Record<string, unknown> {
  const blank: Record<string, unknown> = {};
  for (const field of ENTITY_FORMS[kind].fields) {
    blank[field.key] = field.type === 'boolean' ? false : null;
  }
  const extras: Partial<Record<FormKind, Record<string, unknown>>> = {
    ACTIVITY: { parentId: null, description: null, timezone: null, manualOrder: null },
    LOCATION: { parentId: null, categoryId: null, timezone: null },
    TRANSPORTATION: { startTimezone: null, endTimezone: null },
    LODGING: { timezone: null },
    CUSTOM_ITEM: { typeId: null, timezone: null },
    FOOD_LOG: { activityId: null },
    SAVED_LINK: { description: null, siteName: null, imageUrl: null },
    EXPENSE: { exchangeRate: null, baseAmount: null, baseCurrency: null },
  };
  const merged = { ...blank, ...extras[kind], ...ENTITY_FORMS[kind].defaults, ...values };
  // Date-only kinds store UTC midnight, matching what the server returns.
  if ((kind === 'EXPENSE' || kind === 'JOURNAL_ENTRY') && typeof merged.date === 'string') {
    merged.date = `${merged.date.slice(0, 10)}T00:00:00.000Z`;
  }
  return merged;
}

/** Field name -> first message, from a failed Zod parse. */
export function validationErrors(
  kind: FormKind,
  values: Record<string, unknown>
): { ok: true; data: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const result = ENTITY_FORMS[kind].schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data as Record<string, unknown> };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
