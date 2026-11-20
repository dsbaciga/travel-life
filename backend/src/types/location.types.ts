import { z } from 'zod';
import {
  optionalNumericId,
  requiredStringWithMax,
  optionalStringWithMax,
  optionalLatitude,
  optionalLongitude,
  optionalDatetime,
  optionalNotes,
  optionalPositiveNumber,
  optionalBoolean,
  optionalTimezone,
  optionalNotesWithMax,
  countryCode,
  optionalCountryCode,
} from '../validation/zodHelpers';

/**
 * Raw OpenStreetMap `opening_hours` specification, e.g. "Mo-Fr 09:00-17:00; Sa 10:00-14:00".
 * Deliberately not validated against the grammar here: users must be free to record hours in
 * whatever form they have, and openingHours.service reports UNKNOWN for anything it cannot
 * parse rather than the API rejecting the save.
 */
const OPENING_HOURS_MAX_LENGTH = 500;

// Validation schemas
export const createLocationSchema = z.object({
  tripId: z.number(),
  parentId: z.number().optional().nullable(),
  name: requiredStringWithMax(500),
  address: z.string().optional(),
  // ISO 3166-1 alpha-2 (the geocoder's country). Omit or send null and the backend derives it
  // from the address text.
  countryCode: countryCode().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  categoryId: z.number().optional().nullable(),
  visitDatetime: z.string().optional(), // ISO datetime string
  visitDurationMinutes: z.number().min(0).optional(),
  notes: z.string().optional(),
  // Hide this location from trip maps (no marker, excluded from auto-fit bounds/zoom).
  excludeFromMap: optionalBoolean(),
  openingHours: z.string().max(OPENING_HOURS_MAX_LENGTH).optional(),
  // IANA timezone of the place. Omit to have it derived from the coordinates.
  timezone: z.string().max(100).optional(),
});

export const updateLocationSchema = z.object({
  parentId: optionalNumericId(),
  // name is NOT NULL in the database, so it may be omitted but never cleared
  name: requiredStringWithMax(500).optional(),
  address: optionalNotes(), // String, optional, nullable
  // Null clears the code and re-derives it from the address. Changing the address without
  // sending a code re-derives it too.
  countryCode: optionalCountryCode(),
  latitude: optionalLatitude(),
  longitude: optionalLongitude(),
  categoryId: optionalNumericId(),
  visitDatetime: optionalDatetime(),
  visitDurationMinutes: optionalPositiveNumber(),
  notes: optionalNotes(),
  isFavorite: optionalBoolean(),
  excludeFromMap: optionalBoolean(),
  // Nullable so a user can clear hours they entered by mistake, which also re-opens the
  // location to automatic population from OpenStreetMap.
  openingHours: optionalNotesWithMax(OPENING_HOURS_MAX_LENGTH),
  timezone: optionalTimezone(),
});

export const createLocationCategorySchema = z.object({
  name: requiredStringWithMax(255),
  icon: optionalStringWithMax(100),
  color: optionalStringWithMax(7), // Hex color code
});

export const updateLocationCategorySchema = z.object({
  // name is NOT NULL in the database, so it may be omitted but never cleared
  name: requiredStringWithMax(255).optional(),
  icon: optionalStringWithMax(100),
  color: optionalStringWithMax(7),
});

// Bulk operation schemas
export const bulkDeleteLocationsSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
});

export const bulkUpdateLocationsSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
  updates: z.object({
    categoryId: optionalNumericId(),
    notes: optionalNotes(),
  }),
});

// Types
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type CreateLocationCategoryInput = z.infer<typeof createLocationCategorySchema>;
export type UpdateLocationCategoryInput = z.infer<typeof updateLocationCategorySchema>;
export type BulkDeleteLocationsInput = z.infer<typeof bulkDeleteLocationsSchema>;
export type BulkUpdateLocationsInput = z.infer<typeof bulkUpdateLocationsSchema>;

export interface LocationResponse {
  id: number;
  tripId: number;
  parentId: number | null;
  name: string;
  address: string | null;
  /** ISO 3166-1 alpha-2 country, or null when unknown. */
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  categoryId: number | null;
  visitDatetime: string | null;
  visitDurationMinutes: number | null;
  notes: string | null;
  isFavorite: boolean;
  /** When true, the location is hidden from trip maps and excluded from auto-fit bounds/zoom. */
  excludeFromMap: boolean;
  /** Raw OSM `opening_hours` specification, or null when unknown. */
  openingHours: string | null;
  /** 'osm' when auto-populated from Nominatim, 'manual' when entered by the user. */
  openingHoursSource: string | null;
  /** IANA timezone of the place, used to read openingHours as wall-clock times. */
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
  category?: {
    id: number;
    name: string;
    icon: string | null;
    color: string | null;
  } | null;
  parent?: {
    id: number;
    name: string;
  } | null;
  children?: LocationResponse[];
}

export interface LocationCategoryResponse {
  id: number;
  userId: number | null;
  name: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  createdAt: string;
}
