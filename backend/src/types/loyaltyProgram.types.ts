import { z } from 'zod';
import {
  requiredStringWithMax,
  optionalStringWithMax,
  optionalNotes,
} from '../validation/zodHelpers';

export const LOYALTY_PROGRAM_TYPES = ['AIRLINE', 'HOTEL', 'RAIL', 'CAR_RENTAL', 'OTHER'] as const;

export type LoyaltyProgramType = typeof LOYALTY_PROGRAM_TYPES[number];

const aliasesSchema = z.array(requiredStringWithMax(255)).max(20);
const pointsBalanceSchema = z.number().int().min(0).max(2_000_000_000).optional().nullable();

// Create schema
export const createLoyaltyProgramSchema = z.object({
  name: requiredStringWithMax(255),
  type: z.enum(LOYALTY_PROGRAM_TYPES),
  providerName: requiredStringWithMax(255),
  providerCode: optionalStringWithMax(10),
  alliance: optionalStringWithMax(100),
  aliases: aliasesSchema.optional(),
  membershipNumber: requiredStringWithMax(100),
  tier: optionalStringWithMax(100),
  pointsBalance: pointsBalanceSchema,
  notes: optionalNotes(),
});

// Update schema. name, type, providerName, membershipNumber and aliases are NOT NULL in the
// database: omit to leave unchanged, but they can never be cleared.
export const updateLoyaltyProgramSchema = z.object({
  name: requiredStringWithMax(255).optional(),
  type: z.enum(LOYALTY_PROGRAM_TYPES).optional(),
  providerName: requiredStringWithMax(255).optional(),
  providerCode: optionalStringWithMax(10),
  alliance: optionalStringWithMax(100),
  aliases: aliasesSchema.optional(),
  membershipNumber: requiredStringWithMax(100).optional(),
  tier: optionalStringWithMax(100),
  pointsBalance: pointsBalanceSchema,
  notes: optionalNotes(),
});

export type CreateLoyaltyProgramInput = z.infer<typeof createLoyaltyProgramSchema>;
export type UpdateLoyaltyProgramInput = z.infer<typeof updateLoyaltyProgramSchema>;

/**
 * Response type. Unlike travel-document numbers (masked to the last four characters in every
 * response), the membership number is returned in full: it is only ever served to the user
 * who owns the program, and the auto-fill suggestion and the "show my number at check-in"
 * use case both need the whole value. It is not returned by any trip, collaborator or
 * public-share endpoint.
 */
export interface LoyaltyProgramResponse {
  id: number;
  userId: number;
  name: string;
  type: LoyaltyProgramType;
  providerName: string;
  providerCode: string | null;
  alliance: string | null;
  aliases: string[];
  membershipNumber: string;
  tier: string | null;
  pointsBalance: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
