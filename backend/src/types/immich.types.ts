import { z } from 'zod';

/** Immich ids are UUIDs; they end up in URL paths, so keep them to a safe charset. */
const immichIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Invalid Immich id');

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, 'Not a real calendar date');

const timezoneSchema = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone');

/**
 * Filters for browsing the Immich library. Dates are calendar days (the trip's
 * date-only start/end) interpreted in `timezone`, so "the whole local days" of a
 * trip is what gets searched rather than a UTC window.
 */
export const immichFiltersSchema = z
  .object({
    dateFrom: calendarDateSchema.optional(),
    dateTo: calendarDateSchema.optional(),
    timezone: timezoneSchema.optional(),
    isFavorite: z.boolean().optional(),
    type: z.enum(['IMAGE', 'VIDEO']).optional(),
    albumId: immichIdSchema.optional(),
    text: z.string().trim().max(200).optional(),
  })
  .refine((f) => !f.dateFrom || !f.dateTo || f.dateFrom <= f.dateTo, {
    message: 'dateFrom must not be after dateTo',
    path: ['dateTo'],
  });

export const immichBrowseSchema = z.object({
  filters: immichFiltersSchema.default({}),
  page: z.number().int().min(1).max(10000).default(1),
  size: z.number().int().min(1).max(200).default(50),
  /** When set, each returned asset is flagged if it is already linked to this trip. */
  tripId: z.number().int().positive().optional(),
});

export const immichBulkPreviewSchema = z.object({
  tripId: z.number().int().positive(),
  filters: immichFiltersSchema,
});

export const immichBulkLinkPageSchema = z.object({
  tripId: z.number().int().positive(),
  filters: immichFiltersSchema,
  page: z.number().int().min(1).max(10000).default(1),
});

export const immichAlbumLinkSchema = z.object({
  immichAlbumId: immichIdSchema.nullable(),
});

/** The export writes to the user's Immich library, so it must be asked for explicitly. */
export const immichExportSchema = z.object({
  confirm: z.literal(true),
});

export type ImmichFiltersInput = z.infer<typeof immichFiltersSchema>;
export type ImmichBrowseInput = z.infer<typeof immichBrowseSchema>;
export type ImmichBulkPreviewInput = z.infer<typeof immichBulkPreviewSchema>;
export type ImmichBulkLinkPageInput = z.infer<typeof immichBulkLinkPageSchema>;
