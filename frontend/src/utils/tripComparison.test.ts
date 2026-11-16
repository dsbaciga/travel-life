/**
 * Trip comparison helper tests
 *
 * Test cases:
 * - TCU-001: parseIdsParam keeps distinct positive ids in order and caps the count
 * - TCU-002: buildTimelineLayout places bars on one axis, inclusive of the end date
 * - TCU-003: overlaps are detected, touching-but-separate trips are not
 * - TCU-004: undated trips are reported, and an all-undated set yields no layout
 * - TCU-005: colours are distinct for the first eight trips
 */
import { describe, it, expect } from 'vitest';
import { buildTimelineLayout, parseIdsParam, TRIP_COLORS, tripColor } from './tripComparison';

describe('parseIdsParam', () => {
  it('TCU-001: drops junk and duplicates, preserves order, caps at 8', () => {
    expect(parseIdsParam(null)).toEqual([]);
    expect(parseIdsParam('3, 1,3,abc,-2,0,2')).toEqual([3, 1, 2]);
    expect(parseIdsParam('1,2,3,4,5,6,7,8,9,10')).toHaveLength(8);
  });
});

describe('buildTimelineLayout', () => {
  it('TCU-002: places bars proportionally with an inclusive end date', () => {
    const layout = buildTimelineLayout([
      { id: 1, startDate: '2025-01-01', endDate: '2025-01-10' },
      { id: 2, startDate: '2025-01-11', endDate: '2025-01-20' },
    ]);
    expect(layout).not.toBeNull();
    expect(layout!.axisStart).toBe('2025-01-01');
    expect(layout!.axisEnd).toBe('2025-01-20');
    expect(layout!.bars[0].left).toBe(0);
    expect(layout!.bars[0].width).toBeCloseTo(50);
    expect(layout!.bars[1].left).toBeCloseTo(50);
    expect(layout!.ticks).toHaveLength(6);
    expect(layout!.ticks[0].date).toBe('2025-01-01');
  });

  it('TCU-003: detects overlaps but not adjacent trips', () => {
    const adjacent = buildTimelineLayout([
      { id: 1, startDate: '2025-01-01', endDate: '2025-01-10' },
      { id: 2, startDate: '2025-01-11', endDate: '2025-01-20' },
    ]);
    expect(adjacent!.overlaps).toEqual([]);

    const overlapping = buildTimelineLayout([
      { id: 1, startDate: '2025-01-01', endDate: '2025-01-10' },
      { id: 2, startDate: '2025-01-10', endDate: '2025-01-20' },
    ]);
    expect(overlapping!.overlaps).toEqual([[1, 2]]);
  });

  it('TCU-004: reports undated trips and returns null when none are dated', () => {
    const layout = buildTimelineLayout([
      { id: 1, startDate: '2025-05-01', endDate: '2025-05-01' },
      { id: 2, startDate: null, endDate: null },
    ]);
    expect(layout!.undated).toEqual([2]);
    expect(layout!.bars).toHaveLength(1);
    expect(layout!.bars[0].width).toBe(100);

    expect(buildTimelineLayout([{ id: 3, startDate: null, endDate: '2025-01-01' }])).toBeNull();
  });
});

describe('tripColor', () => {
  it('TCU-005: gives the first eight trips distinct fills', () => {
    const fills = new Set(Array.from({ length: 8 }, (_, i) => tripColor(i).fill));
    expect(fills.size).toBe(8);
    expect(tripColor(8)).toEqual(TRIP_COLORS[0]);
  });
});
