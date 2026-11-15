import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  nullableOptional,
} from '../validation/zodHelpers';

// Zod Schemas
export const ChecklistItemSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1).max(500),
  description: nullableOptional(z.string()),
  isChecked: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().optional(),
  metadata: nullableOptional(z.record(z.string(), z.unknown())),
  checkedAt: nullableOptional(z.string()),
});

export const CreateChecklistSchema = z.object({
  name: z.string().min(1).max(500),
  description: nullableOptional(z.string()),
  type: z.enum(['custom', 'airports', 'countries', 'cities', 'us_states', 'souvenirs']),
  tripId: nullableOptional(z.number()),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().optional(),
  items: z.array(ChecklistItemSchema).optional(),
});

export const UpdateChecklistSchema = z.object({
  name: nullableOptional(z.string().min(1).max(500)),
  description: nullableOptional(z.string()),
  type: nullableOptional(z.enum(['custom', 'airports', 'countries', 'cities', 'us_states', 'souvenirs'])),
  tripId: nullableOptional(z.number()),
  sortOrder: nullableOptional(z.number()),
});

export const UpdateChecklistItemSchema = z.object({
  name: nullableOptional(z.string().min(1).max(500)),
  description: nullableOptional(z.string()),
  isChecked: nullableOptional(z.boolean()),
  sortOrder: nullableOptional(z.number()),
  metadata: nullableOptional(z.record(z.string(), z.unknown())),
});

export const BulkUpdateChecklistItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      isChecked: z.boolean().optional(),
      sortOrder: z.number().optional(),
    })
  ),
});

export const SelectiveChecklistOperationSchema = z.object({
  types: z.array(z.enum(['airports', 'countries', 'cities', 'us_states'])),
});

// TypeScript Types
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type CreateChecklist = z.infer<typeof CreateChecklistSchema>;
export type UpdateChecklist = z.infer<typeof UpdateChecklistSchema>;
export type UpdateChecklistItem = z.infer<typeof UpdateChecklistItemSchema>;
export type BulkUpdateChecklistItems = z.infer<typeof BulkUpdateChecklistItemsSchema>;
export type SelectiveChecklistOperation = z.infer<typeof SelectiveChecklistOperationSchema>;

export type ChecklistType = 'airports' | 'countries' | 'cities' | 'us_states';

export interface ChecklistWithItems {
  id: number;
  userId: number;
  tripId: number | null;
  name: string;
  description: string | null;
  type: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: number;
    checklistId: number;
    name: string;
    description: string | null;
    isChecked: boolean;
    isDefault: boolean;
    sortOrder: number;
    metadata: Prisma.JsonValue;
    checkedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  stats?: {
    total: number;
    checked: number;
    percentage: number;
  };
}
