import { z } from 'zod';
import {
  optionalNumericId,
  requiredStringWithMax,
  optionalStringWithMax,
  optionalBoolean,
  optionalDatetime,
  optionalDatetimeCreate,
  optionalTimezone,
  optionalPositiveNumber,
  optionalCurrencyCode,
  optionalUrlOrEmpty,
  optionalNotes,
  httpUrl,
} from '../validation/zodHelpers';

// =============================================================================
// Custom item types (the user-level registry)
// =============================================================================

// Hex colour, matching the VarChar(7) column. Kept permissive on case.
const hexColor = () =>
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #4F46E5')
    .optional()
    .nullable();

export const createCustomItemTypeSchema = z.object({
  name: requiredStringWithMax(255),
  icon: optionalStringWithMax(100),
  color: hexColor(),
});

export const updateCustomItemTypeSchema = z.object({
  // name is NOT NULL in the database, so it may be omitted but never cleared
  name: requiredStringWithMax(255).optional(),
  icon: optionalStringWithMax(100),
  color: hexColor(),
});

export type CreateCustomItemTypeInput = z.infer<typeof createCustomItemTypeSchema>;
export type UpdateCustomItemTypeInput = z.infer<typeof updateCustomItemTypeSchema>;

// =============================================================================
// Custom items
// =============================================================================

// Unlike Activity, the location association IS a direct FK — it means "the item
// is at this place" and drives the map marker. See the schema comment.
export const createCustomItemSchema = z.object({
  tripId: z.number(),
  typeId: optionalNumericId(),
  name: requiredStringWithMax(500),
  notes: z.string().optional(),
  allDay: optionalBoolean(),
  startTime: optionalDatetimeCreate(),
  endTime: optionalDatetimeCreate(),
  timezone: optionalStringWithMax(100),
  locationId: optionalNumericId(),
  cost: optionalPositiveNumber(),
  currency: z.string().length(3).optional(),
  // No max: the column is Text because real booking URLs exceed 500 chars.
  url: httpUrl().optional().or(z.literal('')),
  confirmationNumber: optionalStringWithMax(255),
});

export const updateCustomItemSchema = z.object({
  typeId: optionalNumericId(),
  // name is NOT NULL in the database, so it may be omitted but never cleared
  name: requiredStringWithMax(500).optional(),
  notes: optionalNotes(),
  allDay: optionalBoolean(),
  startTime: optionalDatetime(),
  endTime: optionalDatetime(),
  timezone: optionalTimezone(),
  locationId: optionalNumericId(),
  cost: optionalPositiveNumber(),
  currency: optionalCurrencyCode(),
  url: optionalUrlOrEmpty(2048),
  confirmationNumber: optionalStringWithMax(255),
});

export type CreateCustomItemInput = z.infer<typeof createCustomItemSchema>;
export type UpdateCustomItemInput = z.infer<typeof updateCustomItemSchema>;

// Bulk operation schemas
export const bulkDeleteCustomItemsSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
});

export const bulkUpdateCustomItemsSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
  updates: z.object({
    typeId: optionalNumericId(),
    notes: optionalNotes(),
    timezone: optionalTimezone(),
  }),
});

export type BulkDeleteCustomItemsInput = z.infer<typeof bulkDeleteCustomItemsSchema>;
export type BulkUpdateCustomItemsInput = z.infer<typeof bulkUpdateCustomItemsSchema>;
