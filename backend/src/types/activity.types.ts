import { z } from 'zod';
import {
  optionalNumericId,
  requiredStringWithMax,
  optionalStringWithMax,
  optionalBoolean,
  optionalDatetime,
  optionalTimezone,
  optionalPositiveNumber,
  optionalCurrencyCode,
  optionalUrlOrEmpty,
  optionalNotes,
  httpUrl,
} from '../validation/zodHelpers';

// locationId is the activity's place (a direct FK; validated to be in the same trip by the service)
export const createActivitySchema = z.object({
  tripId: z.number(),
  parentId: optionalNumericId(),
  locationId: optionalNumericId(),
  name: requiredStringWithMax(500),
  description: z.string().optional(),
  category: optionalStringWithMax(100),
  allDay: optionalBoolean(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  timezone: optionalStringWithMax(100),
  cost: optionalPositiveNumber(),
  currency: z.string().length(3).optional(),
  bookingUrl: httpUrl().pipe(z.string().max(500)).optional().or(z.literal('')),
  bookingReference: optionalStringWithMax(255),
  notes: z.string().optional(),
  dietaryTags: z.array(z.string()).nullable().optional(),
});

// locationId is the activity's place; null clears it
export const updateActivitySchema = z.object({
  parentId: optionalNumericId(),
  locationId: optionalNumericId(),
  // name is NOT NULL in the database, so it may be omitted but never cleared
  name: requiredStringWithMax(500).optional(),
  description: optionalNotes(),
  category: optionalStringWithMax(100),
  allDay: optionalBoolean(),
  startTime: optionalDatetime(),
  endTime: optionalDatetime(),
  timezone: optionalTimezone(),
  cost: optionalPositiveNumber(),
  currency: optionalCurrencyCode(),
  bookingUrl: optionalUrlOrEmpty(500),
  bookingReference: optionalStringWithMax(255),
  notes: optionalNotes(),
  dietaryTags: z.array(z.string()).nullable().optional(),
  // Position within the day after a drag-to-reorder; null returns the activity
  // to chronological ordering.
  manualOrder: z.number().int().min(0).max(100000).optional().nullable(),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

// Bulk operation schemas
export const bulkDeleteActivitiesSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
});

export const bulkUpdateActivitiesSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
  updates: z.object({
    category: optionalStringWithMax(100),
    notes: optionalNotes(),
    timezone: optionalTimezone(),
  }),
});

export type BulkDeleteActivitiesInput = z.infer<typeof bulkDeleteActivitiesSchema>;
export type BulkUpdateActivitiesInput = z.infer<typeof bulkUpdateActivitiesSchema>;
