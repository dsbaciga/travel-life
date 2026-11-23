import type { IconName } from '../components/ui/Icon';

// Loyalty program types matching the backend enum
export const LOYALTY_PROGRAM_TYPES = ['AIRLINE', 'HOTEL', 'RAIL', 'CAR_RENTAL', 'OTHER'] as const;

export type LoyaltyProgramType = typeof LOYALTY_PROGRAM_TYPES[number];

export const LOYALTY_PROGRAM_TYPE_LABELS: Record<LoyaltyProgramType, string> = {
  AIRLINE: 'Airline',
  HOTEL: 'Hotel',
  RAIL: 'Rail',
  CAR_RENTAL: 'Car Rental',
  OTHER: 'Other',
};

export function getLoyaltyProgramTypeIcon(type: LoyaltyProgramType): IconName {
  switch (type) {
    case 'AIRLINE':
      return 'flight';
    case 'HOTEL':
      return 'hotel';
    case 'RAIL':
      return 'train';
    case 'CAR_RENTAL':
      return 'car';
    default:
      return 'ticket';
  }
}

/**
 * A membership program. The membership number is returned in full, but only ever to its
 * owner: trip, collaborator and public-share responses never carry it.
 */
export interface LoyaltyProgram {
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

export interface CreateLoyaltyProgramInput {
  name: string;
  type: LoyaltyProgramType;
  providerName: string;
  providerCode?: string | null;
  alliance?: string | null;
  aliases?: string[];
  membershipNumber: string;
  tier?: string | null;
  pointsBalance?: number | null;
  notes?: string | null;
}

export interface UpdateLoyaltyProgramInput {
  // name / type / providerName / membershipNumber / aliases reject null with a 400
  // backend-side: omit them to leave them unchanged.
  name?: string;
  type?: LoyaltyProgramType;
  providerName?: string;
  providerCode?: string | null;
  alliance?: string | null;
  aliases?: string[];
  membershipNumber?: string;
  tier?: string | null;
  pointsBalance?: number | null;
  notes?: string | null;
}

/** Shows only the last four characters, for list views where the full number is not needed. */
export function maskMembershipNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return `***${trimmed.slice(-4)}`;
}
