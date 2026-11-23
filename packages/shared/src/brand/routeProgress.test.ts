import { describe, expect, it } from 'vitest';
import { computeRouteProgress } from './routeProgress';

const H = 3_600_000;
const items = [
  { start: 1 * H, end: 2 * H },
  { start: 3 * H },
  { start: 5 * H, end: 6 * H },
];

describe('computeRouteProgress', () => {
  it('marks the first unfinished stop next and draws solid up to it', () => {
    const { stops, segments } = computeRouteProgress(items, 2.5 * H, true);
    expect(stops).toEqual(['past', 'next', 'future']);
    expect(segments).toEqual(['solid', 'dashed']);
  });

  it('keeps a stop current until its end passes', () => {
    const { stops } = computeRouteProgress(items, 5.5 * H, true);
    expect(stops).toEqual(['past', 'past', 'next']);
  });

  it('has no next stop once everything is done', () => {
    const { stops, segments } = computeRouteProgress(items, 9 * H, true);
    expect(stops).toEqual(['past', 'past', 'past']);
    expect(segments).toEqual(['solid', 'solid']);
  });

  it('does not highlight a next stop on another day', () => {
    const { stops, segments } = computeRouteProgress(items, 0, false);
    expect(stops).toEqual(['future', 'future', 'future']);
    expect(segments).toEqual(['dashed', 'dashed']);
  });

  it('handles empty and single-stop days', () => {
    expect(computeRouteProgress([], 0, true)).toEqual({ stops: [], segments: [] });
    expect(computeRouteProgress([items[0]], 0, true).segments).toEqual([]);
  });

  it('never gives an all-day item the next marker or marks it past', () => {
    const withStay = [{ start: 0, allDay: true }, ...items];
    const { stops, segments } = computeRouteProgress(withStay, 2.5 * H, true);
    expect(stops).toEqual(['future', 'past', 'next', 'future']);
    expect(segments).toEqual(['solid', 'solid', 'dashed']);
  });

  it('lets the first timed stop be next when an all-day item precedes it', () => {
    const { stops } = computeRouteProgress([{ start: 0, allDay: true }, ...items], 0, true);
    expect(stops).toEqual(['future', 'next', 'future', 'future']);
  });
});
