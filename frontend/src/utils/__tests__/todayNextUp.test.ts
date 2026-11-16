import { describe, it, expect } from 'vitest';
import {
  addDaysToKey,
  daysBetweenKeys,
  formatCountdown,
  selectNextUp,
  type TimedItem,
} from '../todayNextUp';

const PARIS = 'Europe/Paris';
const TOKYO = 'Asia/Tokyo';
const NEW_YORK = 'America/New_York';

const item = (over: Partial<TimedItem> & { key: string }): TimedItem => ({
  start: null,
  end: null,
  timezone: PARIS,
  allDay: false,
  ...over,
});

const at = (iso: string) => new Date(iso);

describe('selectNextUp', () => {
  describe('basics', () => {
    it('returns nothing, in the fallback zone, when there are no items', () => {
      const result = selectNextUp([], at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.current).toBeNull();
      expect(result.next).toBeNull();
      expect(result.nextWhen).toBeNull();
      expect(result.untimedToday).toEqual([]);
      expect(result.timezone).toBe(PARIS);
      // 14:00 in Paris on 10 June.
      expect(result.todayKey).toBe('2026-06-10');
    });

    it('picks the earliest item that has not started, whatever order they arrive in', () => {
      const items = [
        item({ key: 'late', start: '2026-06-10T18:00:00Z' }),
        item({ key: 'soon', start: '2026-06-10T13:20:00Z' }),
        item({ key: 'past', start: '2026-06-10T08:00:00Z' }),
      ];
      const result = selectNextUp(items, at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.next?.key).toBe('soon');
      expect(result.nextWhen).toBe('today');
      expect(result.current).toBeNull();
    });

    it('does not mutate its input', () => {
      const items = [
        item({ key: 'b', start: '2026-06-10T18:00:00Z' }),
        item({ key: 'a', start: '2026-06-10T13:00:00Z' }),
      ];
      selectNextUp(items, at('2026-06-10T12:00:00Z'), PARIS);
      expect(items.map((i) => i.key)).toEqual(['b', 'a']);
    });
  });

  describe('items with no time', () => {
    it('never selects an all-day item, and lists it as an all-day item for today', () => {
      const allDay = item({ key: 'free-day', start: '2026-06-10T00:00:00Z', allDay: true });
      const result = selectNextUp([allDay], at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.next).toBeNull();
      expect(result.current).toBeNull();
      expect(result.untimedToday.map((i) => i.key)).toEqual(['free-day']);
    });

    it('ignores undated items and unparseable times', () => {
      const items = [
        item({ key: 'undated', start: null }),
        item({ key: 'broken', start: 'not a date' }),
        item({ key: 'real', start: '2026-06-10T15:00:00Z' }),
      ];
      const result = selectNextUp(items, at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.next?.key).toBe('real');
    });

    it('still selects the timed item when an all-day one is also today', () => {
      const items = [
        item({ key: 'free-day', start: '2026-06-10T00:00:00Z', allDay: true }),
        item({ key: 'dinner', start: '2026-06-10T18:00:00Z' }),
      ];
      const result = selectNextUp(items, at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.next?.key).toBe('dinner');
      expect(result.untimedToday.map((i) => i.key)).toEqual(['free-day']);
    });

    it('takes a bare date as written instead of shifting it west of UTC', () => {
      // A date-only check-in for 10 June. Run through Los Angeles as an instant
      // it would read 9 June.
      const stay = item({
        key: 'hotel-in',
        start: '2026-06-10',
        allDay: true,
        timezone: 'America/Los_Angeles',
      });
      const result = selectNextUp([stay], at('2026-06-10T20:00:00Z'), 'America/Los_Angeles');
      expect(result.untimedToday.map((i) => i.key)).toEqual(['hotel-in']);
    });

    it('does not list an all-day item that belongs to another day', () => {
      const tomorrow = item({ key: 'tomorrow', start: '2026-06-11', allDay: true });
      const result = selectNextUp([tomorrow], at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.untimedToday).toEqual([]);
    });
  });

  describe('in progress', () => {
    const tour = item({
      key: 'tour',
      start: '2026-06-10T10:00:00Z',
      end: '2026-06-10T13:00:00Z',
    });
    const lunch = item({ key: 'lunch', start: '2026-06-10T14:00:00Z' });

    it('reports the item under way and the one after it', () => {
      const result = selectNextUp([tour, lunch], at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.current?.key).toBe('tour');
      expect(result.next?.key).toBe('lunch');
    });

    it('treats the start as inside and the end as outside', () => {
      expect(selectNextUp([tour], at('2026-06-10T10:00:00Z'), PARIS).current?.key).toBe('tour');
      expect(selectNextUp([tour], at('2026-06-10T13:00:00Z'), PARIS).current).toBeNull();
    });

    it('does not keep an item with no end "in progress" once it has started', () => {
      const result = selectNextUp([lunch], at('2026-06-10T14:00:00Z'), PARIS);
      expect(result.current).toBeNull();
      expect(result.next).toBeNull();
    });

    it('prefers the item that started last when several overlap', () => {
      const long = item({
        key: 'long',
        start: '2026-06-10T08:00:00Z',
        end: '2026-06-10T18:00:00Z',
      });
      const result = selectNextUp([long, tour], at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.current?.key).toBe('tour');
    });

    it('ignores an end that is not after the start', () => {
      const odd = item({
        key: 'odd',
        start: '2026-06-10T10:00:00Z',
        end: '2026-06-10T09:00:00Z',
      });
      expect(selectNextUp([odd], at('2026-06-10T11:00:00Z'), PARIS).current).toBeNull();
    });
  });

  describe('midnight', () => {
    // Night train: 23:00 to 06:00 Paris time (21:00Z to 04:00Z).
    const train = item({
      key: 'night-train',
      start: '2026-06-10T21:00:00Z',
      end: '2026-06-11T04:00:00Z',
    });

    it('keeps an item that crossed midnight as current, on the new day', () => {
      // 01:30 on 11 June in Paris.
      const result = selectNextUp([train], at('2026-06-10T23:30:00Z'), PARIS);
      expect(result.current?.key).toBe('night-train');
      expect(result.todayKey).toBe('2026-06-11');
    });

    it('calls an item just after midnight "tomorrow" while it is still the old day', () => {
      const early = item({ key: 'early', start: '2026-06-10T22:30:00Z' }); // 00:30 on 11th
      const result = selectNextUp([early], at('2026-06-10T21:50:00Z'), PARIS); // 23:50 on 10th
      expect(result.next?.key).toBe('early');
      expect(result.nextWhen).toBe('tomorrow');
    });

    it('calls the same item "today" once midnight has passed', () => {
      const early = item({ key: 'early', start: '2026-06-10T22:30:00Z' });
      const result = selectNextUp([early], at('2026-06-10T22:10:00Z'), PARIS); // 00:10 on 11th
      expect(result.nextWhen).toBe('today');
    });
  });

  describe('end of the day', () => {
    const breakfast = item({ key: 'breakfast', start: '2026-06-11T07:00:00Z' }); // 09:00 tomorrow
    const lateNight = at('2026-06-10T21:59:00Z'); // 23:59 in Paris

    it('shows the first item tomorrow when nothing is left today', () => {
      const result = selectNextUp([breakfast], lateNight, PARIS);
      expect(result.next?.key).toBe('breakfast');
      expect(result.nextWhen).toBe('tomorrow');
    });

    it('says "later" for an item two or more days away', () => {
      const result = selectNextUp(
        [item({ key: 'far', start: '2026-06-13T07:00:00Z' })],
        lateNight,
        PARIS
      );
      expect(result.next?.key).toBe('far');
      expect(result.nextWhen).toBe('later');
    });

    it('has no next item and no label when everything is behind', () => {
      const result = selectNextUp(
        [item({ key: 'done', start: '2026-06-10T08:00:00Z' })],
        lateNight,
        PARIS
      );
      expect(result.next).toBeNull();
      expect(result.nextWhen).toBeNull();
    });

    it('still counts an item on the last minute of today as today', () => {
      const result = selectNextUp(
        [item({ key: 'last', start: '2026-06-10T21:59:30Z' })],
        at('2026-06-10T21:00:00Z'),
        PARIS
      );
      expect(result.nextWhen).toBe('today');
    });
  });

  describe('a timezone change during the day', () => {
    // Paris 09:00 departure (07:00Z), lands in Tokyo 04:00 on 11 June local
    // (19:00Z), hotel check-in there at 05:00 local (20:00Z).
    const flight = item({
      key: 'flight',
      start: '2026-06-10T07:00:00Z',
      end: '2026-06-10T19:00:00Z',
      timezone: PARIS,
      endTimezone: TOKYO,
    });
    const hotel = item({
      key: 'hotel',
      start: '2026-06-10T20:00:00Z',
      timezone: TOKYO,
    });

    it('reads the departure zone before the flight leaves', () => {
      const result = selectNextUp([flight, hotel], at('2026-06-10T05:00:00Z'), PARIS);
      expect(result.timezone).toBe(PARIS);
      expect(result.todayKey).toBe('2026-06-10');
      expect(result.next?.key).toBe('flight');
    });

    it('reads the destination zone while in the air', () => {
      const result = selectNextUp([flight, hotel], at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.current?.key).toBe('flight');
      expect(result.timezone).toBe(TOKYO);
      // 21:00 in Tokyo on the 10th.
      expect(result.todayKey).toBe('2026-06-10');
    });

    it('switches to the new zone, and the new date, after landing', () => {
      const result = selectNextUp([flight, hotel], at('2026-06-10T19:30:00Z'), PARIS);
      expect(result.current).toBeNull();
      expect(result.next?.key).toBe('hotel');
      expect(result.timezone).toBe(TOKYO);
      // 04:30 on 11 June in Tokyo: the check-in at 05:00 is today there, though
      // it would be "tomorrow" on a Paris clock (21:30 on the 10th).
      expect(result.todayKey).toBe('2026-06-11');
      expect(result.nextWhen).toBe('today');
    });

    it('does not let a far-off item in another zone move the clock', () => {
      const faraway = item({
        key: 'later-trip',
        start: '2026-06-20T10:00:00Z',
        timezone: TOKYO,
      });
      const result = selectNextUp([faraway], at('2026-06-10T12:00:00Z'), PARIS);
      expect(result.timezone).toBe(PARIS);
      expect(result.nextWhen).toBe('later');
    });
  });

  describe('daylight saving time', () => {
    it('counts real elapsed time across the spring-forward gap', () => {
      // New York 8 March 2026: 02:00 EST jumps to 03:00 EDT.
      const now = at('2026-03-08T06:30:00Z'); // 01:30 EST
      const start = '2026-03-08T07:30:00Z'; // 03:30 EDT
      const result = selectNextUp([item({ key: 'x', start, timezone: NEW_YORK })], now, NEW_YORK);
      expect(result.nextWhen).toBe('today');
      // The wall clocks differ by two hours, but only one hour really passes.
      expect(formatCountdown(Date.parse(start) - now.getTime())).toBe('in 1h');
    });

    it('counts real elapsed time across the fall-back repeat', () => {
      // New York 1 November 2026: 02:00 EDT falls back to 01:00 EST.
      const now = at('2026-11-01T05:30:00Z'); // 01:30 EDT, first time round
      const start = '2026-11-01T06:30:00Z'; // 01:30 EST, second time round
      const result = selectNextUp([item({ key: 'x', start, timezone: NEW_YORK })], now, NEW_YORK);
      expect(result.nextWhen).toBe('today');
      expect(formatCountdown(Date.parse(start) - now.getTime())).toBe('in 1h');
    });

    it('puts 23:59 on a 25-hour day on the same day, and midnight on the next', () => {
      const now = at('2026-11-01T14:00:00Z'); // 09:00 EST
      const lastMinute = item({ key: 'a', start: '2026-11-02T04:59:00Z', timezone: NEW_YORK });
      const midnight = item({ key: 'b', start: '2026-11-02T05:00:00Z', timezone: NEW_YORK });
      expect(selectNextUp([lastMinute], now, NEW_YORK).nextWhen).toBe('today');
      expect(selectNextUp([midnight], now, NEW_YORK).nextWhen).toBe('tomorrow');
    });

    it('puts midnight on the following day for a 23-hour day', () => {
      const now = at('2026-03-08T15:00:00Z'); // 11:00 EDT
      const midnight = item({ key: 'a', start: '2026-03-09T04:00:00Z', timezone: NEW_YORK });
      const lastMinute = item({ key: 'b', start: '2026-03-09T03:59:00Z', timezone: NEW_YORK });
      expect(selectNextUp([midnight], now, NEW_YORK).nextWhen).toBe('tomorrow');
      expect(selectNextUp([lastMinute], now, NEW_YORK).nextWhen).toBe('today');
    });
  });
});

describe('formatCountdown', () => {
  const minutes = (n: number) => n * 60_000;

  it('says "now" once the moment has arrived or passed', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-5_000)).toBe('now');
  });

  it('never says "in 0m"', () => {
    expect(formatCountdown(1)).toBe('in 1m');
    expect(formatCountdown(59_000)).toBe('in 1m');
  });

  it('formats minutes, hours and days', () => {
    expect(formatCountdown(minutes(45))).toBe('in 45m');
    expect(formatCountdown(minutes(80))).toBe('in 1h 20m');
    expect(formatCountdown(minutes(120))).toBe('in 2h');
    expect(formatCountdown(minutes(60 * 24 + 3 * 60))).toBe('in 1d 3h');
    expect(formatCountdown(minutes(60 * 48))).toBe('in 2d');
  });

  it('rounds a part-minute up so 1h 19m 30s reads as 1h 20m', () => {
    expect(formatCountdown(minutes(79) + 30_000)).toBe('in 1h 20m');
  });
});

describe('calendar key helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDaysToKey('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days between keys', () => {
    expect(daysBetweenKeys('2026-06-10', '2026-06-13')).toBe(3);
    expect(daysBetweenKeys('2026-06-10', '2026-06-10')).toBe(0);
    expect(daysBetweenKeys('2026-06-10', '2026-06-08')).toBe(-2);
  });
});
