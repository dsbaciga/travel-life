import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TodaysItinerary from './TodaysItinerary';
import { getNextEvent, getTodaysEvents } from '../../utils/tripDashboardUtils';
import type { Activity } from '../../types/activity';
import type { Lodging } from '../../types/lodging';

const TOKYO = 'Asia/Tokyo';
// 15:00 in Tokyo on 10 June 2026.
const NOW = '2026-06-10T06:00:00Z';

const activity = (over: Partial<Activity> & { id: number; name: string }): Activity =>
  ({
    tripId: 1,
    parentId: null,
    locationId: null,
    description: null,
    category: null,
    allDay: false,
    startTime: null,
    endTime: null,
    timezone: TOKYO,
    ...over,
  }) as Activity;

const stay = (over: Partial<Lodging> & { id: number; name: string }): Lodging =>
  ({
    tripId: 1,
    locationId: null,
    type: 'hotel',
    address: null,
    checkInDate: null,
    checkOutDate: null,
    timezone: TOKYO,
    ...over,
  }) as Lodging;

// A middle night: checked in on the 8th, checking out on the 12th.
const midStay = stay({
  id: 7,
  name: 'Hotel Kanra Kyoto',
  checkInDate: '2026-06-08T06:00:00Z',
  checkOutDate: '2026-06-12T01:00:00Z',
});

const morningWalk = activity({
  id: 1,
  name: 'Morning walk',
  category: 'sightseeing',
  startTime: '2026-06-10T00:00:00Z', // 09:00 Tokyo, past
  endTime: '2026-06-10T01:00:00Z',
});
const dinner = activity({
  id: 2,
  name: 'Dinner at Gion',
  category: 'dining',
  startTime: '2026-06-10T09:00:00Z', // 18:00 Tokyo, upcoming
  location: {
    id: 9,
    name: 'Gion Nanba',
    address: '1 Hanamikoji',
    latitude: null,
    longitude: null,
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getTodaysEvents with an ongoing stay', () => {
  it('flags the stay all-day, lists it first and never makes it the next event', () => {
    const events = getTodaysEvents([morningWalk, dinner], [], [midStay], TOKYO);

    expect(events.map((e) => e.name)).toEqual([
      'Staying at: Hotel Kanra Kyoto',
      'Morning walk',
      'Dinner at Gion',
    ]);
    expect(events[0].allDay).toBe(true);
    expect(getNextEvent(events)?.name).toBe('Dinner at Gion');
  });

  it('has no next event when only the stay remains', () => {
    expect(getNextEvent(getTodaysEvents([], [], [midStay], TOKYO))).toBeNull();
  });

  it('puts the place in location and the category in the subtitle', () => {
    const events = getTodaysEvents([morningWalk, dinner], [], [], TOKYO);
    const walk = events.find((e) => e.name === 'Morning walk')!;
    const meal = events.find((e) => e.name === 'Dinner at Gion')!;
    expect(walk.location).toBeUndefined();
    expect(walk.subtitle).toBe('sightseeing');
    expect(meal.location).toBe('Gion Nanba');
  });
});

describe('TodaysItinerary', () => {
  const renderIt = () =>
    render(
      <TodaysItinerary
        activities={[morningWalk, dinner]}
        transportation={[]}
        lodging={[midStay]}
        tripTimezone={TOKYO}
        onEventClick={vi.fn()}
      />
    );

  it('shows an ongoing stay as "All day", not as a midnight clock time', () => {
    renderIt();
    const row = screen.getByText('Staying at: Hotel Kanra Kyoto').closest('[data-route-stop]')!;
    expect(row.textContent).toContain('All day');
    expect(row.textContent).not.toMatch(/12:00\s?AM/);
    expect(row.getAttribute('data-all-day')).toBe('true');
  });

  it('lists the all-day stay above the timed items and above the Now marker', () => {
    renderIt();
    const stayRow = screen.getByText('Staying at: Hotel Kanra Kyoto');
    const walkRow = screen.getByText('Morning walk');
    const now = screen.getByText('Now');
    const before = (a: Node, b: Node) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(stayRow, walkRow)).toBe(true);
    expect(before(stayRow, now)).toBe(true);
  });

  it('gives the gold next marker only to the next timed event', () => {
    const { container } = renderIt();
    const next = container.querySelectorAll('[data-route-stop="next"]');
    expect(next).toHaveLength(1);
    expect(next[0].textContent).toContain('Dinner at Gion');
    const stayRow = screen.getByText('Staying at: Hotel Kanra Kyoto').closest('[data-route-stop]')!;
    expect(stayRow.getAttribute('data-route-stop')).toBe('future');
  });

  it('uses place-name only for real locations, not categories', () => {
    const { container } = renderIt();
    const placeNames = Array.from(container.querySelectorAll('.place-name')).map(
      (el) => el.textContent
    );
    expect(placeNames).toContain('Gion Nanba');
    expect(placeNames).not.toContain('sightseeing');
    expect(placeNames).not.toContain('dining');
  });
});
