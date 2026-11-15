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

/**
 * A deadline is either attached to a booking (entityType + entityId, which go
 * together) or stands alone, tracked against the trip only: something the user
 * wants to keep an eye on without committing it to the plan. A standalone
 * deadline has no booking to name it, so it needs a title.
 */
export const createBookingDeadlineSchema = z
  .object({
    entityType: z.enum(DEADLINE_ENTITY_TYPES).optional(),
    entityId: z.number().int().positive().optional(),
    title: optionalNullable(requiredStringWithMax(200)),
    kind: kindSchema,
    dueAt: dueAtSchema,
    note: optionalNullable(requiredStringWithMax(500)),
  })
  .superRefine((value, ctx) => {
    const hasType = value.entityType !== undefined;
    const hasId = value.entityId !== undefined;
    if (hasType !== hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasType ? 'entityId' : 'entityType'],
        message: 'entityType and entityId must be given together',
      });
    }
    if (!hasType && !hasId && !value.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: 'A title is required for a deadline that is not attached to a booking',
      });
    }
  });

export const updateBookingDeadlineSchema = z.object({
  title: optionalNullable(requiredStringWithMax(200)),
  kind: kindSchema.optional(),
  dueAt: dueAtSchema.optional(),
  note: optionalNullable(requiredStringWithMax(500)),
  /** true dismisses the deadline, false restores it. */
  dismissed: z.boolean().optional(),
});

export type CreateBookingDeadlineInput = z.infer<typeof createBookingDeadlineSchema>;
export type UpdateBookingDeadlineInput = z.infer<typeof updateBookingDeadlineSchema>;
