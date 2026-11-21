import { z } from 'zod';

/**
 * Zod Schema Helper Utilities
 *
 * These helpers reduce duplication across validation schemas by providing
 * commonly used patterns as reusable functions.
 *
 * Pattern conventions:
 * - Create schemas: Fields are optional but not nullable (undefined allowed, null not expected)
 * - Update schemas: Fields are optional AND nullable (can be cleared by sending null)
 */

// ============================================================================
// Core Nullable/Optional Helpers
// ============================================================================

/**
 * Makes any schema optional and nullable.
 * Use for update schemas where fields can be cleared (set to null).
 *
 * @example
 * optionalNullable(z.string()) // equivalent to z.string().optional().nullable()
 */
export const optionalNullable = <T extends z.ZodTypeAny>(schema: T) =>
  schema.optional().nullable();

/**
 * Makes any schema nullable and optional (same as optionalNullable but reversed order).
 * Some codebase patterns use this order - both are functionally equivalent.
 */
export const nullableOptional = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullable().optional();

// ============================================================================
// String Helpers
// ============================================================================

/**
 * Trimmed string - removes leading/trailing whitespace.
 */
export const trimmedString = () => z.string().trim();

/**
 * Optional trimmed string that can also be null.
 * Use in update schemas for optional text fields.
 */
export const optionalString = () => z.string().trim().optional().nullable();

/**
 * Required non-empty trimmed string.
 * Use in create schemas for required text fields.
 */
export const requiredString = (minLength = 1) => z.string().trim().min(minLength);

/**
 * Optional string with max length, nullable.
 * Common pattern for update schemas with length constraints.
 */
export const optionalStringWithMax = (maxLength: number) =>
  z.string().max(maxLength).optional().nullable();

/**
 * Required string with max length.
 * Common pattern for create schemas with length constraints.
 */
export const requiredStringWithMax = (maxLength: number, minLength = 1) =>
  z.string().min(minLength).max(maxLength);

// ============================================================================
// Numeric Helpers
// ============================================================================

/**
 * Positive integer ID (for database primary/foreign keys).
 */
export const numericId = () => z.number().int().positive();

/**
 * Optional numeric ID that can be null.
 * Use for optional foreign key references in update schemas.
 */
export const optionalNumericId = () => z.number().int().positive().optional().nullable();

/**
 * Optional positive number (for costs, durations, etc).
 */
export const optionalPositiveNumber = () => z.number().min(0).optional().nullable();

/**
 * Optional number (can be any value including negative).
 */
export const optionalNumber = () => z.number().optional().nullable();

// ============================================================================
// Coordinate Helpers
// ============================================================================

/**
 * Latitude validation (-90 to 90 degrees).
 */
export const latitude = () => z.number().min(-90).max(90);

/**
 * Longitude validation (-180 to 180 degrees).
 */
export const longitude = () => z.number().min(-180).max(180);

/**
 * Optional latitude that can be null.
 */
export const optionalLatitude = () => z.number().min(-90).max(90).optional().nullable();

/**
 * Optional longitude that can be null.
 */
export const optionalLongitude = () => z.number().min(-180).max(180).optional().nullable();

// ============================================================================
// URL Helpers
// ============================================================================

/**
 * A web link: a well-formed URL whose scheme is http or https.
 *
 * `z.string().url()` on its own accepts any scheme the URL parser does,
 * including `javascript:`, `data:` and `file:`. These values are rendered as
 * link targets in the web app, the mobile app and shared trips, so anything a
 * user (or a collaborator on a shared trip) stores here must be a plain web
 * link. Use this for every URL field that ends up in an `href`.
 */
export const httpUrl = () =>
  z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), {
      message: 'URL must start with http:// or https://',
    });

/**
 * Optional URL with max length, nullable.
 * Common for booking URLs that can be cleared.
 */
export const optionalUrl = (maxLength = 500) =>
  httpUrl().pipe(z.string().max(maxLength)).optional().nullable();

/**
 * Optional URL that also accepts empty string (for form clearing).
 * Use when the frontend sends empty string instead of null.
 */
export const optionalUrlOrEmpty = (maxLength = 500) =>
  httpUrl().pipe(z.string().max(maxLength)).optional().nullable().or(z.literal(''));

// ============================================================================
// Currency Helpers
// ============================================================================

/**
 * Currency code (3-letter ISO code like USD, EUR).
 */
export const currencyCode = () => z.string().length(3);

/**
 * Optional currency code that can be null.
 */
export const optionalCurrencyCode = () => z.string().length(3).optional().nullable();

// ============================================================================
// Timezone Helpers
// ============================================================================

/**
 * Timezone string with reasonable max length.
 */
export const timezone = (maxLength = 100) => z.string().max(maxLength);

/**
 * Optional timezone that can be null.
 */
export const optionalTimezone = (maxLength = 100) =>
  z.string().max(maxLength).optional().nullable();

/**
 * ISO 3166-1 alpha-2 country code. Accepts either case (Nominatim returns lower case) and
 * normalises to upper case, which is what the database CHECK constraints require.
 */
export const countryCode = () =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Country code must be a two-letter ISO 3166-1 alpha-2 code')
    .transform((value) => value.toUpperCase());

/**
 * Optional country code that can be null. Use for update schemas, where null clears the code
 * (the service then re-derives it from the name or address where it can).
 */
export const optionalCountryCode = () => countryCode().optional().nullable();

// ============================================================================
// Date/Time Helpers
// ============================================================================

/**
 * ISO datetime string (optional, nullable).
 * Use for optional date fields in update schemas.
 */
export const optionalDatetime = () => z.string().optional().nullable();

/**
 * ISO datetime string (optional, not nullable).
 * Use for optional date fields in create schemas.
 */
export const optionalDatetimeCreate = () => z.string().optional();

// ============================================================================
// Notes/Description Helpers
// ============================================================================

/**
 * Optional notes field (no max length, nullable).
 */
export const optionalNotes = () => z.string().optional().nullable();

/**
 * Optional notes with max length, nullable.
 */
export const optionalNotesWithMax = (maxLength: number) =>
  z.string().max(maxLength).optional().nullable();

/**
 * Optional description field (same as optionalNotes, semantic alias).
 */
export const optionalDescription = () => z.string().optional().nullable();

// ============================================================================
// Boolean Helpers
// ============================================================================

/**
 * Optional boolean (for flags that can be omitted).
 */
export const optionalBoolean = () => z.boolean().optional();
