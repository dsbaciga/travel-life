/**
 * Form Data Builder Utility
 *
 * Simplifies building data objects for create vs update operations
 * by handling the different null/undefined semantics required by the API.
 *
 * API Semantics:
 * - CREATE: Use `undefined` to omit optional fields (let server use defaults)
 * - UPDATE: Use `null` to explicitly clear fields (empty string -> null)
 */

/**
 * Builds data object for create operations
 * - Empty strings and null values become `undefined` (omitted from request)
 * - Only includes fields with actual values
 *
 * @template T - The data type
 * @param values - Form values object
 * @returns Data object with empty values omitted
 *
 * @example
 * ```typescript
 * const createData = buildCreateData({
 *   name: "Trip to Paris",
 *   description: "",  // Will be omitted
 *   notes: null,      // Will be omitted
 * });
 * // Result: { name: "Trip to Paris" }
 * ```
 */
export function buildCreateData<T extends Record<string, unknown>>(
  values: Partial<T>
): Partial<T> {
  const data: Partial<T> = {};

  for (const key in values) {
    const value = values[key];

    // Only include non-empty values
    if (value !== '' && value !== null && value !== undefined) {
      data[key] = value;
    }
  }

  return data;
}

/**
 * Builds data object for update operations
 * - Empty strings become `null` (to clear fields in database)
 * - Undefined values are omitted (field not being updated)
 * - Null values are kept as null (explicit clear)
 *
 * @template T - The data type
 * @param values - Form values object
 * @returns Data object with empty strings converted to null
 *
 * @example
 * ```typescript
 * const updateData = buildUpdateData({
 *   name: "Trip to Paris",
 *   description: "",    // Becomes null (clear field)
 *   notes: "Some note", // Kept as-is
 *   cost: undefined,    // Omitted (not being updated)
 * });
 * // Result: { name: "Trip to Paris", description: null, notes: "Some note" }
 * ```
 */
export function buildUpdateData<T extends Record<string, unknown>>(
  values: Partial<T>
): Partial<T> {
  const data: Partial<T> = {};

  for (const key in values) {
    const value = values[key];

    if (value === '') {
      data[key] = null as T[Extract<keyof T, string>];
    } else if (value !== undefined) {
      data[key] = value;
    }
  }

  return data;
}

/**
 * Generic form data builder that chooses create or update semantics
 * based on the mode parameter.
 *
 * @template T - The data type
 * @param values - Form values object
 * @param mode - 'create' or 'update'
 * @returns Data object with appropriate null/undefined handling
 *
 * @example
 * ```typescript
 * const data = buildFormData(values, editingId ? 'update' : 'create');
 * ```
 */
export function buildFormData<T extends Record<string, unknown>>(
  values: Partial<T>,
  mode: 'create' | 'update'
): Partial<T> {
  return mode === 'create'
    ? buildCreateData(values)
    : buildUpdateData(values);
}

/**
 * Builds data object with explicit field overrides
 * Useful when you need to:
 * - Force certain fields to be included
 * - Transform specific fields before including them
 * - Merge form values with computed/required fields
 *
 * @template T - The data type
 * @param values - Form values object
 * @param mode - 'create' or 'update'
 * @param overrides - Fields to override or add
 * @returns Merged data object
 *
 * @example
 * ```typescript
 * const data = buildFormDataWithOverrides(
 *   values,
 *   'create',
 *   {
 *     tripId,                                    // Always required
 *     cost: values.cost ? parseFloat(values.cost) : undefined,  // Transform
 *     startTime: values.startDate ? new Date(values.startDate) : undefined,
 *   }
 * );
 * ```
 */
export function buildFormDataWithOverrides<T extends Record<string, unknown>>(
  values: Partial<T>,
  mode: 'create' | 'update',
  overrides: Partial<T> = {}
): Partial<T> {
  const baseData = buildFormData(values, mode);
  return { ...baseData, ...overrides };
}

/**
 * Converts numeric string fields to numbers
 * Handles empty strings and invalid numbers gracefully
 *
 * @param value - String value to parse
 * @returns Parsed number, null if empty, or undefined if invalid
 *
 * @example
 * ```typescript
 * parseNumericField("123.45")  // 123.45
 * parseNumericField("")        // null
 * parseNumericField("abc")     // undefined
 * ```
 */
export function parseNumericField(value: string | undefined | null): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const parsed = parseFloat(value);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Converts date string to ISO format for API
 * Handles empty strings gracefully
 *
 * @param dateStr - Date string (e.g., "2025-01-15")
 * @param timeStr - Optional time string (e.g., "14:30")
 * @returns ISO date string or null if empty
 *
 * @example
 * ```typescript
 * formatDateForAPI("2025-01-15", "14:30")  // "2025-01-15T14:30:00"
 * formatDateForAPI("2025-01-15")           // "2025-01-15T00:00:00"
 * formatDateForAPI("")                     // null
 * ```
 */
export function formatDateForAPI(
  dateStr: string | undefined | null,
  timeStr?: string | undefined | null
): string | null {
  if (!dateStr || dateStr === '') return null;

  if (timeStr && timeStr !== '') {
    return `${dateStr}T${timeStr}:00`;
  }

  return `${dateStr}T00:00:00`;
}

/**
 * Helper to build a data object with only specified fields
 * Useful for precise control over which fields are included
 *
 * @template T - The data type
 * @param values - Source values
 * @param fields - Array of field names to include
 * @param mode - 'create' or 'update'
 * @returns Data object with only specified fields
 *
 * @example
 * ```typescript
 * const data = pickFields(
 *   formValues,
 *   ['name', 'description', 'cost', 'currency'],
 *   'update'
 * );
 * ```
 */
export function pickFields<T extends Record<string, unknown>>(
  values: Partial<T>,
  fields: (keyof T)[],
  mode: 'create' | 'update'
): Partial<T> {
  const picked: Partial<T> = {};

  for (const field of fields) {
    if (field in values) {
      const value = values[field];

      if (mode === 'create') {
        if (value !== '' && value !== null && value !== undefined) {
          picked[field] = value;
        }
      } else {
        if (value === '') {
          picked[field] = null as T[keyof T];
        } else if (value !== undefined) {
          picked[field] = value;
        }
      }
    }
  }

  return picked;
}
