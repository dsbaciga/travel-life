import { z } from 'zod';
import { numericId } from '../validation/zodHelpers';
import type { PhotoMatchKind } from '../services/_shared/photoActivityMatch';

/**
 * Upper bounds on one apply request. A trip can hold thousands of photos and a
 * reviewed suggestion set is applied in a single call, so the caps are generous;
 * they exist to bound the work, not to page it.
 */
export const PHOTO_AUTO_LINK_LIMITS = {
  activitiesPerRequest: 500,
  photosPerActivity: 5000,
} as const;

// Apply the suggestions the user kept after reviewing them
export const applyPhotoActivityLinksSchema = z.object({
  links: z
    .array(
      z.object({
        activityId: numericId(),
        photoIds: z.array(numericId()).min(1).max(PHOTO_AUTO_LINK_LIMITS.photosPerActivity),
      })
    )
    .min(1)
    .max(PHOTO_AUTO_LINK_LIMITS.activitiesPerRequest),
});

export type ApplyPhotoActivityLinksInput = z.infer<typeof applyPhotoActivityLinksSchema>;

// Response types

/** A thumbnail shown in a suggestion's preview strip. */
export interface PhotoActivitySuggestionPreviewPhoto {
  id: number;
  thumbnailPath: string | null;
  source: string;
  mediaType: string;
  caption: string | null;
}

/** One activity and the unlinked photos whose capture time fits it. */
export interface PhotoActivitySuggestion {
  activity: {
    id: number;
    name: string;
    category: string | null;
    allDay: boolean;
    startTime: Date | null;
    endTime: Date | null;
    timezone: string | null;
  };
  /** Every matched photo, oldest first. */
  photoIds: number[];
  /** A representative sample for the client's preview strip. */
  previewPhotos: PhotoActivitySuggestionPreviewPhoto[];
  /** How many of the photos matched in each way (see `PhotoMatchKind`). */
  matchCounts: Record<PhotoMatchKind, number>;
  /** Capture time of the earliest and latest matched photo. */
  firstTakenAt: Date;
  lastTakenAt: Date;
}

export interface PhotoActivitySuggestionsResponse {
  suggestions: PhotoActivitySuggestion[];
  summary: {
    totalPhotos: number;
    /** Photos in `suggestions`. */
    matchedPhotos: number;
    /** Photos left alone because they are already linked to an activity. */
    alreadyLinkedPhotos: number;
    /** Photos that cannot be matched because they carry no capture time. */
    photosWithoutTime: number;
    /** Photos with a capture time that fits no activity. */
    unmatchedPhotos: number;
    /** Activities that cannot be matched because they have no start time. */
    activitiesWithoutTime: number;
  };
}

export interface ApplyPhotoActivityLinksResult {
  created: number;
  skipped: number;
}
