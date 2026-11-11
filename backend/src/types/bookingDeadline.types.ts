import { z } from 'zod';
import { optionalNullable, requiredStringWithMax } from '../validation/zodHelpers';

export const DEADLINE_KINDS = ['cancellation', 'check_in', 'payment', 'other'] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export const DEADLINE_ENTITY_TYPES = ['lodging', 'transportation', 'activity'] as const;
export type DeadlineEntityType = (typeof DEADLINE_ENTITY_TYPES)[number];

const kindSchema = z.enum(DEADLINE_KINDS);
const dueAtSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'dueAt must be a valid ISO date-time' });

export const createBookingDeadlineSchema = z.object({
  entityType: z.enum(DEADLINE_ENTITY_TYPES),
  entityId: z.number().int().positive(),
  kind: kindSchema,
  dueAt: dueAtSchema,
  note: optionalNullable(requiredStringWithMax(500)),
});

export const updateBookingDeadlineSchema = z.object({
  kind: kindSchema.optional(),
  dueAt: dueAtSchema.optional(),
  note: optionalNullable(requiredStringWithMax(500)),
  /** true dismisses the deadline, false restores it. */
  dismissed: z.boolean().optional(),
});

export type CreateBookingDeadlineInput = z.infer<typeof createBookingDeadlineSchema>;
export type UpdateBookingDeadlineInput = z.infer<typeof updateBookingDeadlineSchema>;
