import { dayKeyInTimezone } from './dayDraft';
import { resolveTimezone } from './timezoneResolution';

/**
 * Pure matching behind "auto-link photos to activities": given when each photo
 * was taken and when each activity happened, decide which activity (if any) a
 * photo belongs to.
 *
 * Nothing here touches the database, so the matching rules can be unit tested
 * directly. The service (`photoAutoLink.service.ts`) supplies the rows.
 */

// =============================================================================
// SHAPES
// =============================================================================

/** The minimum the matcher needs to know about an activity. */
export interface MatchableActivity {
  id: number;
  allDay: boolean;
  startTime: Date | null;
  endTime: Date | null;
  timezone: string | null;
}

/** The minimum the matcher needs to know about a photo. */
export interface MatchablePhoto {
  id: number;
  takenAt: Date | null;
}

/**
 * How a photo relates to the activity it was matched with, strongest first:
 * - `during`: taken between the activity's start and end
 * - `same_day`: taken on the calendar day of an all-day activity
 */
export const PHOTO_MATCH_KINDS = ['during', 'same_day'] as const;
export type PhotoMatchKind = (typeof PHOTO_MATCH_KINDS)[number];

export interface PhotoActivityMatch {
  photoId: number;
  activityId: number;
  kind: PhotoMatchKind;
}

export const PHOTO_MATCH_RULES = {
  /**
   * How long an activity with a start but no end is assumed to last. Most
   * activities are entered with just a start time; without a window they could
   * only ever match a photo taken in that exact second.
   */
  defaultDurationMs: 2 * 60 * 60 * 1000,
} as const;

// =============================================================================
// MATCHING
// =============================================================================

interface TimedWindow {
  id: number;
  start: number;
  end: number;
}

interface AllDayWindow {
  id: number;
  timezone: string;
  startDay: string;
  endDay: string;
}

/** Whole days between two `YYYY-MM-DD` keys; only used to rank all-day spans. */
function daySpan(startDay: string, endDay: string): number {
  return Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`);
}

/**
 * Matches each photo to at most one activity by capture time.
 *
 * The times have to line up: a photo matches a timed activity only when it was
 * taken between that activity's start and end. There is deliberately no "closest
 * activity" fallback, because a photo taken between two activities belongs to
 * neither and a guess would have to be found and undone by hand.
 *
 * A timed activity beats an all-day activity on the same date. When several
 * timed activities overlap (a guided tour inside a "Day in Kyoto" block), the
 * shortest wins, because it says the most about the photo.
 *
 * Timed activities are compared as instants, so no timezone is involved. All-day
 * activities are calendar dates, so the photo is bucketed onto a day on the
 * activity's own clock (`activity.timezone → fallbackTimezone`).
 *
 * @param photos - Photos to place; those without `takenAt` are never matched
 * @param activities - The trip's activities; those without `startTime` are ignored
 * @param fallbackTimezone - Zone for all-day activities with none of their own
 *   (the trip's, then the user's)
 * @returns One match per photo that fits an activity, in input photo order
 *
 * @example
 * ```typescript
 * const matches = matchPhotosToActivities(photos, activities, 'Europe/Rome');
 * // [{ photoId: 12, activityId: 3, kind: 'during' }, ...]
 * ```
 */
export function matchPhotosToActivities(
  photos: readonly MatchablePhoto[],
  activities: readonly MatchableActivity[],
  fallbackTimezone: string
): PhotoActivityMatch[] {
  const timed: TimedWindow[] = [];
  const allDay: AllDayWindow[] = [];

  for (const activity of activities) {
    if (!activity.startTime || Number.isNaN(activity.startTime.getTime())) continue;

    if (activity.allDay) {
      const timezone = resolveTimezone(activity.timezone, fallbackTimezone);
      const startDay = dayKeyInTimezone(activity.startTime, timezone);
      if (!startDay) continue;
      const endDay = dayKeyInTimezone(activity.endTime, timezone);
      allDay.push({
        id: activity.id,
        timezone,
        startDay,
        // An end before the start is bad data: treat it as a single day.
        endDay: endDay && endDay > startDay ? endDay : startDay,
      });
      continue;
    }

    const start = activity.startTime.getTime();
    const end = activity.endTime?.getTime();
    timed.push({
      id: activity.id,
      start,
      end:
        end !== undefined && !Number.isNaN(end) && end > start
          ? end
          : start + PHOTO_MATCH_RULES.defaultDurationMs,
    });
  }

  const matches: PhotoActivityMatch[] = [];
  if (timed.length === 0 && allDay.length === 0) return matches;

  for (const photo of photos) {
    if (!photo.takenAt) continue;
    const at = photo.takenAt.getTime();
    if (Number.isNaN(at)) continue;

    let during: TimedWindow | null = null;

    for (const window of timed) {
      if (at >= window.start && at <= window.end) {
        // Shortest window wins; among equals the one that started most recently.
        if (
          !during ||
          window.end - window.start < during.end - during.start ||
          (window.end - window.start === during.end - during.start && window.start > during.start)
        ) {
          during = window;
        }
      }
    }

    if (during) {
      matches.push({ photoId: photo.id, activityId: during.id, kind: 'during' });
      continue;
    }

    // The same photo falls on different dates in different zones, so the day
    // key is worked out per zone (a trip rarely has more than a couple).
    const dayByZone = new Map<string, string | null>();
    let sameDay: AllDayWindow | null = null;
    for (const window of allDay) {
      let day = dayByZone.get(window.timezone);
      if (day === undefined) {
        day = dayKeyInTimezone(photo.takenAt, window.timezone);
        dayByZone.set(window.timezone, day);
      }
      if (!day || day < window.startDay || day > window.endDay) continue;
      if (
        !sameDay ||
        daySpan(window.startDay, window.endDay) < daySpan(sameDay.startDay, sameDay.endDay)
      ) {
        sameDay = window;
      }
    }
    if (sameDay) {
      matches.push({ photoId: photo.id, activityId: sameDay.id, kind: 'same_day' });
    }
  }

  return matches;
}
