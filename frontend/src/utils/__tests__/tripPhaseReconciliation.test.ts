import { describe, it, expect } from 'vitest';
import {
  getNextUpDisplayState,
  hasEndDatePassed,
  hasTripStarted,
  isTripCompleted,
} from '../tripDashboardUtils';
import { TripStatus } from '../../types/trip';

/**
 * Regression cover for the trip dashboard contradicting itself.
 *
 * A trip stored as "Planning" whose end date had slipped into the past used to
 * render a "Trip Complete!" headline beside a "Planning in progress - Set dates
 * to track countdown" badge, in the same viewport: one card inferred
 * completion from the dates while its sibling read the stored status.
 *
 * The rule these tests pin down: completion is declared by the stored status,
 * never inferred from the dates. When the dates have run out but the status has
 * not caught up, that is its own state.
 */

const daysFromToday = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  // The local calendar day, not the UTC one: `toISOString()` is already
  // tomorrow in the evening west of UTC, which made these tests fail at night.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const PAST_START = daysFromToday(-30);
const PAST_END = daysFromToday(-20);
const FUTURE_START = daysFromToday(20);
const FUTURE_END = daysFromToday(30);

describe('trip phase reconciliation', () => {
  describe('isTripCompleted', () => {
    it('is true only for the stored Completed status', () => {
      expect(isTripCompleted(TripStatus.COMPLETED)).toBe(true);
    });

    it('is false for every other status, whatever the dates say', () => {
      for (const status of [
        TripStatus.DREAM,
        TripStatus.PLANNING,
        TripStatus.PLANNED,
        TripStatus.IN_PROGRESS,
        TripStatus.CANCELLED,
      ]) {
        expect(isTripCompleted(status)).toBe(false);
      }
    });
  });

  describe('hasEndDatePassed', () => {
    it('reports a past end date', () => {
      expect(hasEndDatePassed(PAST_END)).toBe(true);
    });

    it('does not report a future end date', () => {
      expect(hasEndDatePassed(FUTURE_END)).toBe(false);
    });

    it('treats today as not yet passed', () => {
      expect(hasEndDatePassed(daysFromToday(0))).toBe(false);
    });

    it('returns false when there is no end date', () => {
      expect(hasEndDatePassed(null)).toBe(false);
    });

    it('returns false for an unparseable date rather than throwing', () => {
      expect(hasEndDatePassed('not-a-date')).toBe(false);
    });
  });

  describe('getNextUpDisplayState', () => {
    it('does not call a Planning trip complete just because its dates passed', () => {
      const state = getNextUpDisplayState(TripStatus.PLANNING, true, PAST_START, PAST_END);

      expect(state).toBe('dates_passed');
      expect(state).not.toBe('completed');
    });

    it('flags a Planned trip whose dates have passed', () => {
      expect(getNextUpDisplayState(TripStatus.PLANNED, true, PAST_START, PAST_END)).toBe(
        'dates_passed'
      );
    });

    it('flags an In Progress trip whose dates have passed', () => {
      expect(getNextUpDisplayState(TripStatus.IN_PROGRESS, true, PAST_START, PAST_END)).toBe(
        'dates_passed'
      );
    });

    it('reports completed when the status actually says so', () => {
      expect(getNextUpDisplayState(TripStatus.COMPLETED, true, PAST_START, PAST_END)).toBe(
        'completed'
      );
    });

    it('keeps a cancelled trip cancelled rather than reading it off the calendar', () => {
      expect(getNextUpDisplayState(TripStatus.CANCELLED, true, PAST_START, PAST_END)).toBe(
        'cancelled'
      );
      expect(getNextUpDisplayState(TripStatus.CANCELLED, true, FUTURE_START, FUTURE_END)).toBe(
        'cancelled'
      );
    });

    it('still reports an in-progress trip that is genuinely underway', () => {
      expect(
        getNextUpDisplayState(TripStatus.IN_PROGRESS, true, PAST_START, FUTURE_END)
      ).toBe('in_progress');
    });

    it('still reports an upcoming trip', () => {
      expect(getNextUpDisplayState(TripStatus.PLANNED, true, FUTURE_START, FUTURE_END)).toBe(
        'upcoming'
      );
    });

    it('keeps dream trips as dream, past dates or not', () => {
      expect(getNextUpDisplayState(TripStatus.DREAM, true, PAST_START, PAST_END)).toBe('dream');
    });

    it('reports no events before anything else', () => {
      expect(getNextUpDisplayState(TripStatus.PLANNING, false, PAST_START, PAST_END)).toBe(
        'no_events'
      );
    });

    it('does not flag a dateless Planning trip', () => {
      expect(getNextUpDisplayState(TripStatus.PLANNING, true, null, null)).toBe('upcoming');
    });
  });

  describe('hasTripStarted', () => {
    it('parses a date-only start as a local calendar day', () => {
      // Stored at UTC midnight; a naive `new Date(...)` reads back as the
      // previous day west of UTC, which would start the trip a day early.
      expect(hasTripStarted(TripStatus.PLANNED, daysFromToday(0))).toBe(true);
      expect(hasTripStarted(TripStatus.PLANNED, daysFromToday(1))).toBe(false);
    });

    it('trusts the status over the dates for In Progress and Completed', () => {
      expect(hasTripStarted(TripStatus.IN_PROGRESS, FUTURE_START)).toBe(true);
      expect(hasTripStarted(TripStatus.COMPLETED, FUTURE_START)).toBe(true);
    });

    it('returns false with no start date', () => {
      expect(hasTripStarted(TripStatus.PLANNING, null)).toBe(false);
    });
  });
});
