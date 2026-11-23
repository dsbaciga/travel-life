import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../timeline';
import { buildRouteLine } from '../routeLine';

const item = (key: string, start: string | null, extra: Partial<TimelineItem> = {}): TimelineItem => ({
  key,
  type: 'ACTIVITY',
  entityKind: 'ACTIVITY',
  entityId: 1,
  title: key,
  subtitle: null,
  start,
  end: null,
  allDay: false,
  timezone: 'UTC',
  confirmation: null,
  status: null,
  delayMinutes: null,
  manualOrder: null,
  ...extra,
});

describe('buildRouteLine', () => {
  const items = [
    item('a', '2026-06-01T08:00:00Z'),
    item('b', '2026-06-01T12:00:00Z'),
    item('c', '2026-06-01T18:00:00Z'),
  ];

  it('marks the current stop and joins legs solid up to it', () => {
    const route = buildRouteLine(items, new Date('2026-06-01T11:00:00Z'), true);
    expect(route.map((r) => r.stop)).toEqual(['past', 'next', 'future']);
    expect(route.map((r) => r.above)).toEqual([undefined, 'solid', 'dashed']);
    expect(route.map((r) => r.below)).toEqual(['solid', 'dashed', undefined]);
  });

  it('keeps a stop current while it is in progress', () => {
    const route = buildRouteLine(items, new Date('2026-06-01T12:30:00Z'), true);
    expect(route[1].stop).toBe('next');
  });

  it('has no gold marker on a day that is not today', () => {
    const route = buildRouteLine(items, new Date('2026-05-30T09:00:00Z'), false);
    expect(route.map((r) => r.stop)).toEqual(['future', 'future', 'future']);
    expect(route[0].below).toBe('dashed');
  });

  it('never makes an all-day or cancelled item the next stop', () => {
    const mixed = [
      item('all', null, { allDay: true }),
      item('x', '2026-06-01T12:00:00Z', { status: 'cancelled' }),
      item('y', '2026-06-01T15:00:00Z'),
    ];
    const route = buildRouteLine(mixed, new Date('2026-06-01T09:00:00Z'), true);
    expect(route.map((r) => r.stop)).toEqual(['future', 'past', 'next']);
  });

  it('returns nothing for an empty day', () => {
    expect(buildRouteLine([], new Date(), true)).toEqual([]);
  });
});
