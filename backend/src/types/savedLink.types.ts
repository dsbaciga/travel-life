import { z } from 'zod';
import { LinkMetadataStatus, SavedLinkSource } from '@prisma/client';
import {
  optionalNotes,
  optionalNullable,
  optionalNumericId,
  optionalStringWithMax,
  httpUrl,
} from '../validation/zodHelpers';

/**
 * Max stored URL length. Well beyond the VarChar(500) used elsewhere in the
 * schema because real-world URLs carry tracking params; the column is TEXT.
 */
export const MAX_URL_LENGTH = 2048;

const urlSchema = z.string().trim().pipe(httpUrl()).pipe(z.string().max(MAX_URL_LENGTH));

/**
 * Create: fields are optional but not nullable.
 * `tripId` is omitted or null when the link lands in the unassigned inbox.
 */
export const createSavedLinkSchema = z.object({
  url: urlSchema,
  tripId: optionalNumericId(),
  title: optionalStringWithMax(1000),
  notes: z.string().optional(),
});

/**
 * Update: fields are optional AND nullable so they can be cleared.
 * Setting `tripId` to null returns the link to the inbox.
 */
export const updateSavedLinkSchema = z.object({
  url: urlSchema.optional(),
  tripId: optionalNumericId(),
  title: optionalNullable(optionalStringWithMax(1000)),
  notes: optionalNotes(),
});

/**
 * Bulk delete. Ids are owner-scoped rather than trip-scoped, so a single call
 * may mix inbox links and links belonging to different trips.
 */
export const bulkDeleteSavedLinksSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, 'At least one ID is required'),
});

/**
 * List filter. `tripId` accepts a numeric id, or the literal 'none' to select
 * the inbox (links not yet assigned to a trip). Omitted returns everything.
 */
export const listSavedLinksQuerySchema = z.object({
  tripId: z
    .union([z.literal('none'), z.coerce.number().int().positive()])
    .optional(),
});

export type CreateSavedLinkInput = z.infer<typeof createSavedLinkSchema>;
export type UpdateSavedLinkInput = z.infer<typeof updateSavedLinkSchema>;
export type ListSavedLinksQuery = z.infer<typeof listSavedLinksQuerySchema>;
export type BulkDeleteSavedLinksInput = z.infer<
  typeof bulkDeleteSavedLinksSchema
>;

export interface SavedLinkResponse {
  id: number;
  userId: number;
  tripId: number | null;
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  notes: string | null;
  source: SavedLinkSource;
  metadataStatus: LinkMetadataStatus;
  metadataFetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Metadata scraped from a link's Open Graph / HTML head tags. */
export interface LinkMetadata {
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  /**
   * The URL after redirects were followed, tracking-stripped. Stored in place
   * of the submitted URL so click-wrappers (`click.email.foo/xyz`) and
   * shorteners resolve to the page they point at.
   */
  resolvedUrl: string;
}
