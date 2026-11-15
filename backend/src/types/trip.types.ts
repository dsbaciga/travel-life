import { z } from 'zod';
import {
  nullableOptional,
  optionalTimezone,
} from '../validation/zodHelpers';

/**
 * ISO 3166-1 alpha-2, upper-cased on the way in so lookups never have to care
 * about the casing a client sent.
 *
 * The trip's country is stored rather than derived because the only other
 * country signal in the schema is the free text in `Location.address`. The
 * client infers a country from that, but the inference can be wrong, ambiguous
 * (a trip crossing three borders) or impossible (no locations added yet), and
 * every feature that needs a country reads this one column so a correction made
 * anywhere holds everywhere.
 */
const isoCountryCode = () =>
  z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/, 'Must be a two-letter ISO country code')
    .transform((value) => value.toUpperCase());

// Trip status enum
export const TripStatus = {
  DREAM: 'Dream',
  PLANNING: 'Planning',
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
} as const;

export const TripStatusValues = Object.values(TripStatus);

// Privacy level enum
export const PrivacyLevel = {
  PRIVATE: 'Private',
  SHARED: 'Shared',
  PUBLIC: 'Public',
} as const;

export const PrivacyLevelValues = Object.values(PrivacyLevel);

// Validation schemas
/**
 * @openapi
 * components:
 *   schemas:
 *     CreateTripInput:
 *       type: object
 *       required: [title]
 *       properties:
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         startDate:
 *           type: string
 *           format: date
 *         endDate:
 *           type: string
 *           format: date
 *         timezone:
 *           type: string
 *         status:
 *           type: string
 *           enum: [Dream, Planning, Planned, In Progress, Completed, Cancelled]
 *         privacyLevel:
 *           type: string
 *           enum: [Private, Shared, Public]
 *         addToPlacesVisited:
 *           type: boolean
 */
export const createTripSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(), // ISO date string
  timezone: z.string().max(100).optional(),
  status: z.enum([
    TripStatus.DREAM,
    TripStatus.PLANNING,
    TripStatus.PLANNED,
    TripStatus.IN_PROGRESS,
    TripStatus.COMPLETED,
    TripStatus.CANCELLED,
  ]).default(TripStatus.PLANNING),
  privacyLevel: z.enum([
    PrivacyLevel.PRIVATE,
    PrivacyLevel.SHARED,
    PrivacyLevel.PUBLIC,
  ]).default(PrivacyLevel.PRIVATE),
  addToPlacesVisited: z.boolean().optional(),
  excludeFromAutoShare: z.boolean().optional(),
  seriesId: z.number().nullable().optional(),
  tripType: z.string().nullable().optional(),
  tripTypeEmoji: z.string().nullable().optional(),
  countryCode: isoCountryCode().nullable().optional(),
});

export const updateTripSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: nullableOptional(z.string()),
  startDate: nullableOptional(z.string()),
  endDate: nullableOptional(z.string()),
  timezone: optionalTimezone(100),
  status: z.enum([
    TripStatus.DREAM,
    TripStatus.PLANNING,
    TripStatus.PLANNED,
    TripStatus.IN_PROGRESS,
    TripStatus.COMPLETED,
    TripStatus.CANCELLED,
  ]).optional(),
  privacyLevel: z.enum([
    PrivacyLevel.PRIVATE,
    PrivacyLevel.SHARED,
    PrivacyLevel.PUBLIC,
  ]).optional(),
  addToPlacesVisited: z.boolean().optional(),
  excludeFromAutoShare: z.boolean().optional(),
  archived: z.boolean().optional(),
  seriesId: z.number().nullable().optional(),
  tripType: z.string().nullable().optional(),
  tripTypeEmoji: z.string().nullable().optional(),
  budget: z.number().min(0).nullable().optional(),
  budgetCurrency: z.string().length(3).nullable().optional(),
  countryCode: isoCountryCode().nullable().optional(),
});

export const getTripQuerySchema = z.object({
  status: z.string().optional(), // Single status or comma-separated statuses
  archived: z.enum(['true', 'false', 'all']).optional(), // Default (omitted/'false') excludes archived trips
  search: z.string().optional(),
  // Coerced and bounded so `?limit=1000000` cannot request an unbounded page and
  // `?page=abc` is a 400 rather than a `skip: NaN` 500 (see photoQuerySchema).
  page: z.coerce.number().int().min(1).optional(),
  // Max 1000 matches photoQuerySchema and the largest limit the frontend actually asks for
  // (ChecklistsPage, TripCalendarWidget and others request 1000).
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  sort: z.enum(['startDate-desc', 'startDate-asc', 'title-asc', 'title-desc', 'status']).optional(),
  startDateFrom: z.string().optional(),
  startDateTo: z.string().optional(),
  tags: z.string().optional(), // Comma-separated tag IDs
  tripType: z.string().optional(), // Single type or comma-separated types
  seriesId: z.coerce.number().int().positive().optional(), // Filter by series ID
});

// Types
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type GetTripQuery = z.infer<typeof getTripQuerySchema>;

// Note: TripResponse/TripListResponse used to be declared here. They were imported nowhere
// and had drifted from what trip.service actually returns (no coverImagePath, shareToken,
// coverPhoto, tagAssignments, _count, ...), so they were removed rather than left as a
// second, wrong description of the API contract.

// Trip duplication schema
export const duplicateTripSchema = z.object({
  title: z.string().min(1).max(500),
  copyEntities: z.object({
    locations: z.boolean().optional().default(false),
    photos: z.boolean().optional().default(false),
    activities: z.boolean().optional().default(false),
    transportation: z.boolean().optional().default(false),
    lodging: z.boolean().optional().default(false),
    journalEntries: z.boolean().optional().default(false),
    photoAlbums: z.boolean().optional().default(false),
    tags: z.boolean().optional().default(false),
    companions: z.boolean().optional().default(false),
    checklists: z.boolean().optional().default(false),
  }).optional().prefault({}),
});

export type DuplicateTripInput = z.infer<typeof duplicateTripSchema>;
