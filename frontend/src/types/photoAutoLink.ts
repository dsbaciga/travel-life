/**
 * How a photo relates to the activity it was matched with:
 * - `during`: taken between the activity's start and end
 * - `near`: taken shortly before it started or after it ended
 * - `same_day`: taken on the calendar day of an all-day activity
 */
export type PhotoMatchKind = 'during' | 'near' | 'same_day';

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
    startTime: string | null;
    endTime: string | null;
    timezone: string | null;
  };
  /** Every matched photo, oldest first. */
  photoIds: number[];
  /** A representative sample of the matched photos. */
  previewPhotos: PhotoActivitySuggestionPreviewPhoto[];
  matchCounts: Record<PhotoMatchKind, number>;
  firstTakenAt: string;
  lastTakenAt: string;
}

export interface PhotoActivitySuggestionsResponse {
  suggestions: PhotoActivitySuggestion[];
  summary: {
    totalPhotos: number;
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

export interface ApplyPhotoActivityLinksInput {
  links: Array<{ activityId: number; photoIds: number[] }>;
}
