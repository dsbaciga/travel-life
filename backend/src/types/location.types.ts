import { z } from 'zod';
import {
  optionalNullable,
  optionalNumericId,
  requiredStringWithMax,
  optionalStringWithMax,
  optionalLatitude,
  optionalLongitude,
  optionalDatetime,
  optionalNotes,
  optionalPositiveNumber,
} from '../utils/zodHelpers';

// Validation schemas
export const createLocationSchema = z.object({
  tripId: z.number(),
  parentId: z.number().optional().nullable(),
  name: requiredStringWithMax(500),
  address: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  categoryId: z.number().optional().nullable(),
  visitDatetime: z.string().optional(), // ISO datetime string
  visitDurationMinutes: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const updateLocationSchema = z.object({
  parentId: optionalNumericId(),
  name: optionalNullable(requiredStringWithMax(500)),
  address: optionalNotes(), // String, optional, nullable
  latitude: optionalLatitude(),
  longitude: optionalLongitude(),
  categoryId: optionalNumericId(),
  visitDatetime: optionalDatetime(),
  visitDurationMinutes: optionalPositiveNumber(),
  notes: optionalNotes(),
});

export const createLocationCategorySchema = z.object({
  name: requiredStringWithMax(255),
  icon: optionalStringWithMax(100),
  color: optionalStringWithMax(7), // Hex color code
});

export const updateLocationCategorySchema = z.object({
  name: optionalNullable(requiredStringWithMax(255)),
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
  latitude: number | null;
  longitude: number | null;
  categoryId: number | null;
  visitDatetime: string | null;
  visitDurationMinutes: number | null;
  notes: string | null;
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
