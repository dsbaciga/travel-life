import { describe, it, expect } from 'vitest';
import {
  classifyRelease,
  isDoubleTap,
  pinchZoom,
  clampPan,
  clampZoom,
  distance,
} from './lightboxGestures';

describe('classifyRelease', () => {
  it('detects horizontal swipes', () => {
    expect(classifyRelease(-120, 10, 200)).toBe('swipe-next');
    expect(classifyRelease(120, -10, 200)).toBe('swipe-prev');
  });

  it('ignores mostly vertical or short or slow drags', () => {
    expect(classifyRelease(-80, 90, 200)).toBe('none');
    expect(classifyRelease(-30, 0, 200)).toBe('none');
    expect(classifyRelease(-120, 0, 1200)).toBe('none');
  });

  it('detects taps and rejects long presses', () => {
    expect(classifyRelease(2, 3, 120)).toBe('tap');
    expect(classifyRelease(2, 3, 600)).toBe('none');
  });
});

describe('isDoubleTap', () => {
  it('needs a close previous tap in time and space', () => {
    const first = { x: 100, y: 100, time: 1000 };
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { x: 110, y: 105, time: 1200 })).toBe(true);
    expect(isDoubleTap(first, { x: 110, y: 105, time: 1600 })).toBe(false);
    expect(isDoubleTap(first, { x: 300, y: 100, time: 1200 })).toBe(false);
  });
});

describe('zoom and pan', () => {
  it('scales pinch zoom within limits', () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(2, 100, 400)).toBe(4);
    expect(pinchZoom(1, 100, 50)).toBe(1);
    expect(pinchZoom(2, 0, 50)).toBe(2);
    expect(clampZoom(9)).toBe(4);
  });

  it('clamps panning to the zoomed overflow', () => {
    expect(clampPan({ x: 500, y: -500 }, 2, 300, 200)).toEqual({ x: 150, y: -100 });
    expect(clampPan({ x: 50, y: 50 }, 1, 300, 200)).toEqual({ x: 0, y: 0 });
  });

  it('measures distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
