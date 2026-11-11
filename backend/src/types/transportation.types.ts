import { z } from 'zod';
import {
  optionalNumber,
  optionalStringWithMax,
  optionalDatetime,
  optionalTimezone,
  optionalPositiveNumber,
  optionalCurrencyCode,
  optionalNotesWithMax,
} from '../validation/zodHelpers';

export const TransportationType = {
  FLIGHT: 'flight',
  TRAIN: 'train',
  BUS: 'bus',
  CAR: 'car',
  FERRY: 'ferry',
  BICYCLE: 'bicycle',
  WALK: 'walk',
  OTHER: 'other',
} as const;

export type TransportationTypeEnum = typeof TransportationType[keyof typeof TransportationType];

export interface Transportation {
  id: number;
  tripId: number;
  type: TransportationTypeEnum;
  fromLocationId: number | null;
  toLocationId: number | null;
  fromLocationName: string | null;
  toLocationName: string | null;
  departureTime: Date | null;
  arrivalTime: Date | null;
  startTimezone: string | null;
  endTimezone: string | null;
  carrier: string | null;
  vehicleNumber: string | null;
  confirmationNumber: string | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransportationWithLocations extends Transportation {
  fromLocation?: {
    id: number;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  toLocation?: {
    id: number;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
  };
}

export interface TransportationWithRoute extends TransportationWithLocations {
  route?: {
    from: {
      name: string;
      latitude: number;
      longitude: number;
    };
    to: {
      name: string;
      latitude: number;
      longitude: number;
    };
  } | null;
  durationMinutes?: number | null;
  isUpcoming?: boolean;
  isInProgress?: boolean;
}

// Validation schemas
export const createTransportationSchema = z.object({
  tripId: z.number(),
  type: z.enum([
    TransportationType.FLIGHT,
    TransportationType.TRAIN,
    TransportationType.BUS,
    TransportationType.CAR,
    TransportationType.FERRY,
    TransportationType.BICYCLE,
    TransportationType.WALK,
    TransportationType.OTHER,
  ]),
  fromLocationId: z.number().nullable().optional(),
  toLocationId: z.number().nullable().optional(),
  fromLocationName: z.string().max(500).nullable().optional(),
  toLocationName: z.string().max(500).nullable().optional(),
  departureTime: z.string().nullable().optional(),
  arrivalTime: z.string().nullable().optional(),
  startTimezone: z.string().max(100).nullable().optional(),
  endTimezone: z.string().max(100).nullable().optional(),
  carrier: z.string().max(200).nullable().optional(),
  vehicleNumber: z.string().max(100).nullable().optional(),
  confirmationNumber: z.string().max(100).nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateTransportationSchema = z.object({
  type: z.enum([
    TransportationType.FLIGHT,
    TransportationType.TRAIN,
    TransportationType.BUS,
    TransportationType.CAR,
    TransportationType.FERRY,
    TransportationType.BICYCLE,
    TransportationType.WALK,
    TransportationType.OTHER,
  ]).optional(),
  fromLocationId: optionalNumber(),
  toLocationId: optionalNumber(),
  fromLocationName: optionalStringWithMax(500),
  toLocationName: optionalStringWithMax(500),
  departureTime: optionalDatetime(),
  arrivalTime: optionalDatetime(),
  startTimezone: optionalTimezone(100),
  endTimezone: optionalTimezone(100),
  carrier: optionalStringWithMax(200),
  vehicleNumber: optionalStringWithMax(100),
  confirmationNumber: optionalStringWithMax(100),
  cost: optionalPositiveNumber(),
  currency: optionalCurrencyCode(),
  notes: optionalNotesWithMax(2000),
  // Day-of-travel reality, logged from the companion app: when the leg really
  // left/arrived and whether it ran late. Distinct from the scheduled times.
  actualDepartureTime: optionalDatetime(),
  actualArrivalTime: optionalDatetime(),
  status: z.enum(['on_time', 'delayed', 'cancelled']).optional(),
  delayMinutes: z.number().int().min(0).max(100000).optional().nullable(),
  seatNumber: optionalStringWithMax(50),
});

export type CreateTransportationInput = z.infer<typeof createTransportationSchema>;
export type UpdateTransportationInput = z.infer<typeof updateTransportationSchema>;

// Bulk operation schemas
export const bulkDeleteTransportationSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
});

export const bulkUpdateTransportationSchema = z.object({
  ids: z.array(z.number()).min(1, 'At least one ID is required'),
  updates: z.object({
    type: z.enum([
      TransportationType.FLIGHT,
      TransportationType.TRAIN,
      TransportationType.BUS,
      TransportationType.CAR,
      TransportationType.FERRY,
      TransportationType.BICYCLE,
      TransportationType.WALK,
      TransportationType.OTHER,
    ]).optional(),
    carrier: optionalStringWithMax(200),
    notes: optionalNotesWithMax(2000),
  }),
});

export type BulkDeleteTransportationInput = z.infer<typeof bulkDeleteTransportationSchema>;
export type BulkUpdateTransportationInput = z.infer<typeof bulkUpdateTransportationSchema>;
