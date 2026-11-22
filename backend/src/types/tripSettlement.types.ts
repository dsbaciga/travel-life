import { z } from 'zod';

/** `owner` for the trip owner, `companion:<id>` for a TravelCompanion (the same keys expense splits use). */
const participantKeySchema = z.string().regex(/^(owner|companion:\d+)$/, 'Invalid participant');

const currencySchema = z.string().length(3);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/** Records that `from` paid `to` an amount. */
export const createSettlementSchema = z.object({
  from: participantKeySchema,
  to: participantKeySchema,
  amount: z.number().positive().max(99999999.99),
  currency: currencySchema,
  date: dateOnlySchema,
  notes: z.string().max(2000).nullable().optional(),
});

export const updateSettlementSchema = z.object({
  from: participantKeySchema.optional(),
  to: participantKeySchema.optional(),
  amount: z.number().positive().max(99999999.99).optional(),
  currency: currencySchema.optional(),
  date: dateOnlySchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
export type UpdateSettlementInput = z.infer<typeof updateSettlementSchema>;

/** A recorded settlement as the API returns it. */
export interface TripSettlementDto {
  id: number;
  tripId: number;
  from: string;
  fromLabel: string;
  to: string;
  toLabel: string;
  amount: number;
  currency: string;
  /** YYYY-MM-DD */
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

