/**
 * The calendar days "Draft with AI" accepts for a trip. Mirrors the server
 * rule in backend `draftDateWindow`: the trip's own days plus one day either
 * side (a departure the evening before, an arrival the morning after). A trip
 * with no dates is not restricted; one with a single date is bounded on that
 * side only.
 *
 * Trip dates are date-only values, so this is `YYYY-MM-DD` string arithmetic
 * pinned to UTC on purpose (see the date-only exception in CLAUDE.md). Do not
 * route them through a local `Date`: west of UTC that shows the previous day.
 */
export const DRAFT_DATE_GRACE_DAYS = 1;

export interface DraftDateWindow {
  /** First allowed day (inclusive), or null when the trip has no start date. */
  from: string | null;
  /** Last allowed day (inclusive), or null when the trip has no end date. */
  to: string | null;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const shiftDay = (day: string, delta: number): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + delta * 86_400_000).toISOString().slice(0, 10);

const toDay = (value: string | null | undefined): string | null => {
  const day = value?.slice(0, 10) ?? '';
  return DAY_PATTERN.test(day) ? day : null;
};

export function draftDateWindow(
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined
): DraftDateWindow {
  const start = toDay(tripStartDate);
  const end = toDay(tripEndDate);
  return {
    from: start ? shiftDay(start, -DRAFT_DATE_GRACE_DAYS) : null,
    to: end ? shiftDay(end, DRAFT_DATE_GRACE_DAYS) : null,
  };
}

export function isDateInDraftWindow(day: string, window: DraftDateWindow): boolean {
  if (window.from && day < window.from) return false;
  if (window.to && day > window.to) return false;
  return true;
}
