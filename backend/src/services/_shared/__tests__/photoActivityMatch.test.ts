/**
 * Photo to activity matching by capture time
 *
 * Test cases:
 * - PAM-001: A photo taken between an activity's start and end matches it as `during`
 * - PAM-002: An activity with no end time is assumed to last two hours
 * - PAM-003: A photo taken outside the activity, even by a minute, matches nothing
 * - PAM-005: Of overlapping activities, the shortest one wins
 * - PAM-006: A photo between two activities is not given to the closest one
 * - PAM-007: An all-day activity matches photos on its calendar day in its own zone
 * - PAM-008: An all-day activity falls back to the trip zone, and covers multi-day spans
 * - PAM-009: A timed activity beats an all-day one on the same day
 * - PAM-010: Photos without a capture time and activities without a start are ignored
 * - PAM-011: An end time before the start is treated as no end time
 */
import {
  matchPhotosToActivities,
  PHOTO_MATCH_RULES,
  type MatchableActivity,
  type MatchablePhoto,
} from '../photoActivityMatch';

const activity = (over: Partial<MatchableActivity> = {}): MatchableActivity => ({
  id: 1,
  allDay: false,
  startTime: new Date('2026-06-10T09:00:00Z'),
  endTime: new Date('2026-06-10T11:00:00Z'),
  timezone: null,
  ...over,
});

const photo = (id: number, takenAt: string | null): MatchablePhoto => ({
  id,
  takenAt: takenAt ? new Date(takenAt) : null,
});

describe('matchPhotosToActivities', () => {
  it('PAM-001: matches a photo taken during an activity', () => {
    const matches = matchPhotosToActivities(
      [photo(10, '2026-06-10T09:00:00Z'), photo(11, '2026-06-10T10:15:00Z'), photo(12, '2026-06-10T11:00:00Z')],
      [activity()],
      'UTC'
    );

    expect(matches).toEqual([
      { photoId: 10, activityId: 1, kind: 'during' },
      { photoId: 11, activityId: 1, kind: 'during' },
      { photoId: 12, activityId: 1, kind: 'during' },
    ]);
  });

  it('PAM-002: assumes two hours for an activity with no end time', () => {
    expect(PHOTO_MATCH_RULES.defaultDurationMs).toBe(2 * 60 * 60 * 1000);

    const matches = matchPhotosToActivities(
      [photo(10, '2026-06-10T10:59:00Z'), photo(11, '2026-06-10T11:01:00Z')],
      [activity({ endTime: null })],
      'UTC'
    );

    expect(matches).toEqual([{ photoId: 10, activityId: 1, kind: 'during' }]);
  });

  it('PAM-003: leaves a photo taken outside the activity unmatched', () => {
    const matches = matchPhotosToActivities(
      [
        photo(10, '2026-06-10T08:59:00Z'), // a minute before it starts
        photo(11, '2026-06-10T11:01:00Z'), // a minute after it ends
        photo(12, '2026-06-11T10:00:00Z'), // the next day
      ],
      [activity()],
      'UTC'
    );

    expect(matches).toEqual([]);
  });

  it('PAM-005: prefers the shortest of overlapping activities', () => {
    const dayOut = activity({
      id: 1,
      startTime: new Date('2026-06-10T08:00:00Z'),
      endTime: new Date('2026-06-10T18:00:00Z'),
    });
    const tour = activity({
      id: 2,
      startTime: new Date('2026-06-10T10:00:00Z'),
      endTime: new Date('2026-06-10T11:00:00Z'),
    });

    const matches = matchPhotosToActivities(
      [photo(10, '2026-06-10T10:30:00Z'), photo(11, '2026-06-10T15:00:00Z')],
      [dayOut, tour],
      'UTC'
    );

    expect(matches).toEqual([
      { photoId: 10, activityId: 2, kind: 'during' },
      { photoId: 11, activityId: 1, kind: 'during' },
    ]);
  });

  it('PAM-006: does not give a photo between two activities to the closest one', () => {
    const morning = activity({
      id: 1,
      startTime: new Date('2026-06-10T09:00:00Z'),
      endTime: new Date('2026-06-10T10:00:00Z'),
    });
    const lunch = activity({
      id: 2,
      startTime: new Date('2026-06-10T10:20:00Z'),
      endTime: new Date('2026-06-10T11:00:00Z'),
    });

    const matches = matchPhotosToActivities(
      [
        photo(10, '2026-06-10T09:55:00Z'), // during the morning activity
        photo(11, '2026-06-10T10:05:00Z'), // in the gap, 5 minutes after it
        photo(12, '2026-06-10T10:15:00Z'), // in the gap, 5 minutes before lunch
        photo(13, '2026-06-10T10:25:00Z'), // during lunch
      ],
      [morning, lunch],
      'UTC'
    );

    expect(matches).toEqual([
      { photoId: 10, activityId: 1, kind: 'during' },
      { photoId: 13, activityId: 2, kind: 'during' },
    ]);
  });

  it('PAM-007: matches an all-day activity on its calendar day in its own zone', () => {
    // June 10 in Tokyo runs from June 9 15:00Z to June 10 15:00Z.
    const allDay = activity({
      allDay: true,
      startTime: new Date('2026-06-09T15:00:00Z'),
      endTime: null,
      timezone: 'Asia/Tokyo',
    });

    const matches = matchPhotosToActivities(
      [
        photo(10, '2026-06-09T14:59:00Z'), // June 9, 23:59 in Tokyo
        photo(11, '2026-06-09T23:00:00Z'), // June 10, 08:00 in Tokyo
        photo(12, '2026-06-10T14:59:00Z'), // June 10, 23:59 in Tokyo
        photo(13, '2026-06-10T15:00:00Z'), // June 11, 00:00 in Tokyo
      ],
      [allDay],
      'UTC'
    );

    expect(matches).toEqual([
      { photoId: 11, activityId: 1, kind: 'same_day' },
      { photoId: 12, activityId: 1, kind: 'same_day' },
    ]);
  });

  it('PAM-008: uses the fallback zone and covers every day of a multi-day span', () => {
    // June 10 to June 12 in New York (UTC-4 in June).
    const allDay = activity({
      allDay: true,
      startTime: new Date('2026-06-10T04:00:00Z'),
      endTime: new Date('2026-06-12T04:00:00Z'),
      timezone: null,
    });

    const matches = matchPhotosToActivities(
      [
        photo(10, '2026-06-10T03:00:00Z'), // June 9, 23:00 in New York
        photo(11, '2026-06-11T20:00:00Z'), // June 11
        photo(12, '2026-06-13T03:00:00Z'), // June 12, 23:00 in New York
        photo(13, '2026-06-13T05:00:00Z'), // June 13
      ],
      [allDay],
      'America/New_York'
    );

    expect(matches.map((m) => m.photoId)).toEqual([11, 12]);
  });

  it('PAM-009: prefers a timed activity over an all-day one', () => {
    const allDay = activity({
      id: 1,
      allDay: true,
      startTime: new Date('2026-06-10T00:00:00Z'),
      endTime: null,
    });
    const timed = activity({ id: 2 });

    const matches = matchPhotosToActivities(
      [photo(10, '2026-06-10T10:00:00Z'), photo(11, '2026-06-10T20:00:00Z')],
      [allDay, timed],
      'UTC'
    );

    expect(matches).toEqual([
      { photoId: 10, activityId: 2, kind: 'during' },
      { photoId: 11, activityId: 1, kind: 'same_day' },
    ]);
  });

  it('PAM-010: ignores photos without a capture time and activities without a start', () => {
    const matches = matchPhotosToActivities(
      [photo(10, null), photo(11, '2026-06-10T10:00:00Z')],
      [activity({ id: 1, startTime: null, endTime: null }), activity({ id: 2 })],
      'UTC'
    );

    expect(matches).toEqual([{ photoId: 11, activityId: 2, kind: 'during' }]);
  });

  it('PAM-011: treats an end before the start as no end time', () => {
    const matches = matchPhotosToActivities(
      [photo(10, '2026-06-10T10:30:00Z')],
      [activity({ endTime: new Date('2026-06-10T08:00:00Z') })],
      'UTC'
    );

    expect(matches).toEqual([{ photoId: 10, activityId: 1, kind: 'during' }]);
  });
});
