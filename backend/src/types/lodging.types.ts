import { z } from 'zod';
import {
  requiredStringWithMax,
  optionalStringWithMax,
  optionalNumericId,
  optionalDatetime,
  optionalTimezone,
  optionalPositiveNumber,
  optionalCurrencyCode,
  optionalUrl,
  optionalNotesWithMax,
  httpUrl,
} from '../validation/zodHelpers';

export const LodgingType = {
  HOTEL: 'hotel',
  HOSTEL: 'hostel',
  AIRBNB: 'airbnb',
  VACATION_RENTAL: 'vacation_rental',
  CAMPING: 'camping',
  RESORT: 'resort',
  MOTEL: 'motel',
  BED_AND_BREAKFAST: 'bed_and_breakfast',
  APARTMENT: 'apartment',
  FRIENDS_FAMILY: 'friends_family',
  OTHER: 'other',
} as const;

export type LodgingTypeEnum = typeof LodgingType[keyof typeof LodgingType];

// Lodging type enum schema (reusable)
const lodgingTypeEnum = z.enum([
  LodgingType.HOTEL,
  LodgingType.HOSTEL,
  LodgingType.AIRBNB,
  LodgingType.VACATION_RENTAL,
  LodgingType.CAMPING,
  LodgingType.RESORT,
  LodgingType.MOTEL,
  LodgingType.BED_AND_BREAKFAST,
  LodgingType.APARTMENT,
  LodgingType.FRIENDS_FAMILY,
  LodgingType.OTHER,
]);

// Note: Location association is handled via EntityLink system, not direct FK
export interface Lodging {
  id: number;
  tripId: number;
  type: LodgingTypeEnum;
  name: string;
  address: string | null;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  timezone: string | null;
  confirmationNumber: string | null;
  loyaltyProgramId: number | null;
  cost: number | null;
  currency: string | null;
  bookingUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Note: Location association is handled via EntityLink system, not direct FK
// Validation schemas
export const createLodgingSchema = z.object({
  tripId: z.number(),
  type: lodgingTypeEnum,
  name: requiredStringWithMax(500),
  address: z.string().max(1000).optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  timezone: z.string().max(100).optional(),
  confirmationNumber: z.string().max(100).optional(),
  loyaltyProgramId: optionalNumericId(),
  cost: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  bookingUrl: httpUrl().pipe(z.string().max(500)).optional(),
  notes: z.string().max(2000).optional(),
});

// Note: Location association is handled via EntityLink system, not direct FK
export const updateLodgingSchema = z.object({
  type: lodgingTypeEnum.optional(),
  // name is NOT NULL in the database, so it may be omitted but never cleared
  name: requiredStringWithMax(500).optional(),
  address: optionalStringWithMax(1000),
  checkInDate: optionalDatetime(),
  checkOutDate: optionalDatetime(),
  timezone: optionalTimezone(),
  confirmationNumber: optionalStringWithMax(100),
  loyaltyProgramId: optionalNumericId(),
  cost: optionalPositiveNumber(),
  currency: optionalCurrencyCode(),
  bookingUrl: optionalUrl(500),
  notes: optionalNotesWithMax(2000),
});

export type CreateLodgingInput = z.infer<typeof createLodgingSchema>;
export type UpdateLodgingInput = z.infer<typeof updateLodgingSchema>;

// Bulk operation schemas
export const bulkDeleteLodgingSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
});

export const bulkUpdateLodgingSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
  updates: z.object({
    type: lodgingTypeEnum.optional(),
    notes: optionalNotesWithMax(2000),
  }),
});

export type BulkDeleteLodgingInput = z.infer<typeof bulkDeleteLodgingSchema>;
export type BulkUpdateLodgingInput = z.infer<typeof bulkUpdateLodgingSchema>;
