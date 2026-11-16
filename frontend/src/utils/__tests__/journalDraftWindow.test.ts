/**
 * Draft date window and display day keys
 *
 * Test cases:
 * - JDW-001: The window is the trip plus one day each side, across month and year boundaries
 * - JDW-002: First day, last day, the day before and the day after are in; two days out is not
 * - JDW-003: A trip with no dates is open; one bound leaves the other side open
 * - JDW-004: Date-only trip dates are read as calendar days, not shifted by the process timezone
 * - JDW-005: Day keys the Timeline groups by are read as calendar days without a Date
 */
import { describe, it, expect } from 'vitest';
import { draftDateWindow, isDateInDraftWindow } from '../journalDraftWindow';
import { displayDayKeyToIso } from '../displayDayKey';

describe('draftDateWindow', () => {
  it('JDW-001: widens by one day each side', () => {
    expect(draftDateWindow('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-28', to: '2026-04-01' });
    expect(draftDateWindow('2026-01-01', '2026-12-31')).toEqual({ from: '2025-12-31', to: '2027-01-01' });
  });

  it('JDW-002: boundaries', () => {
    const w = draftDateWindow('2026-06-03', '2026-06-07');
    expect(isDateInDraftWindow('2026-06-03', w)).toBe(true); // first day
    expect(isDateInDraftWindow('2026-06-07', w)).toBe(true); // last day
    expect(isDateInDraftWindow('2026-06-02', w)).toBe(true); // day before
    expect(isDateInDraftWindow('2026-06-08', w)).toBe(true); // day after
    expect(isDateInDraftWindow('2026-06-01', w)).toBe(false);
    expect(isDateInDraftWindow('2026-06-09', w)).toBe(false);
  });

  it('JDW-003: missing dates leave the window open', () => {
    expect(draftDateWindow(null, null)).toEqual({ from: null, to: null });
    expect(isDateInDraftWindow('1999-01-01', draftDateWindow(null, null))).toBe(true);
    expect(isDateInDraftWindow('2099-01-01', draftDateWindow('2026-06-03', null))).toBe(true);
    expect(isDateInDraftWindow('2026-06-01', draftDateWindow('2026-06-03', null))).toBe(false);
    expect(isDateInDraftWindow('1999-01-01', draftDateWindow(null, '2026-06-07'))).toBe(true);
    expect(isDateInDraftWindow('2026-06-09', draftDateWindow(null, '2026-06-07'))).toBe(false);
  });

  it('JDW-004: an ISO datetime at UTC midnight is the same calendar day', () => {
    expect(draftDateWindow('2026-06-03T00:00:00.000Z', '2026-06-07T00:00:00.000Z')).toEqual({
      from: '2026-06-02',
      to: '2026-06-08',
    });
  });
});

describe('displayDayKeyToIso', () => {
  it('JDW-005: reads the formatted keys', () => {
    expect(displayDayKeyToIso('Mon, Jan 5, 2026')).toBe('2026-01-05');
    expect(displayDayKeyToIso('Sun, Dec 31, 2028')).toBe('2028-12-31');
    // Date.prototype.toDateString, used when no trip timezone is set
    expect(displayDayKeyToIso('Fri Jun 05 2026')).toBe('2026-06-05');
    expect(displayDayKeyToIso('not a day')).toBeNull();
  });
});
