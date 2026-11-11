import { z } from 'zod';
import { latitude, longitude, optionalCurrencyCode } from '../validation/zodHelpers';

// =============================================================================
// MOBILE PUSH TOKENS
// =============================================================================

export const MOBILE_PUSH_PLATFORMS = ['ios', 'android'] as const;
export type MobilePushPlatform = (typeof MOBILE_PUSH_PLATFORMS)[number];

/**
 * An Expo push token as returned by `Notifications.getExpoPushTokenAsync()`:
 * `ExponentPushToken[xxxxxxxx]` (or the older `ExpoPushToken[...]`).
 */
const expoPushToken = z
  .string()
  .max(255)
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, 'Not an Expo push token');

export const registerMobilePushTokenSchema = z.object({
  token: expoPushToken,
  platform: z.enum(MOBILE_PUSH_PLATFORMS),
  deviceName: z.string().trim().max(200).optional(),
});

export const unregisterMobilePushTokenSchema = z.object({
  token: expoPushToken,
});

export type RegisterMobilePushTokenInput = z.infer<typeof registerMobilePushTokenSchema>;

// =============================================================================
// GPS TRACKS
// =============================================================================

/** One phone can buffer a long offline day; cap the batch so a request stays small. */
export const TRACK_BATCH_MAX_POINTS = 2000;

export const trackPointSchema = z.object({
  latitude: latitude(),
  longitude: longitude(),
  recordedAt: z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid timestamp'),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
  altitude: z.number().min(-1000).max(100000).nullable().optional(),
  speed: z.number().min(0).max(2000).nullable().optional(),
});

export const trackBatchSchema = z.object({
  points: z.array(trackPointSchema).min(1).max(TRACK_BATCH_MAX_POINTS),
});

export type TrackPointInput = z.infer<typeof trackPointSchema>;
export type TrackBatchInput = z.infer<typeof trackBatchSchema>;

export const inferPhotoLocationsSchema = z.object({
  /** When true, write the inferred coordinates and create the proposed links. */
  apply: z.boolean().optional(),
  /** Restrict to specific photos; omit to consider every un-geotagged photo. */
  photoIds: z.array(z.number().int().positive()).max(1000).optional(),
});

export type InferPhotoLocationsInput = z.infer<typeof inferPhotoLocationsSchema>;

export interface PhotoLocationProposal {
  photoId: number;
  latitude: number;
  longitude: number;
  /** How the position was derived from the track. */
  method: 'exact' | 'interpolated' | 'nearest';
  /** Milliseconds between the photo and the closest GPS fix used. */
  gapMs: number;
  /** Itinerary location within range, proposed as a TAKEN_AT link target. */
  location: { id: number; name: string; distanceMeters: number } | null;
}

// =============================================================================
// RECEIPT PARSING
// =============================================================================

export const parseReceiptSchema = z.object({
  /** Raw OCR text, recognised on-device. */
  text: z.string().trim().min(1).max(20000),
  /** Currency to assume when the receipt names none. Defaults to the trip's. */
  defaultCurrency: optionalCurrencyCode(),
  dateOrder: z.enum(['DMY', 'MDY']).optional(),
  /** Set false to skip LLM refinement even when an LLM is configured. */
  useLlm: z.boolean().optional(),
});

export type ParseReceiptInput = z.infer<typeof parseReceiptSchema>;
