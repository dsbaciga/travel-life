import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ContourBackdrop from './ContourBackdrop';
import RouteSegment from './RouteSegment';
import EmptyState from '../EmptyState';

describe('ContourBackdrop', () => {
  it('draws the requested paths, hidden from assistive tech and pointer events', () => {
    const { container } = render(<ContourBackdrop seed={42} count={7} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('class')).toContain('pointer-events-none');
    expect(container.querySelectorAll('path')).toHaveLength(7);
  });

  it('renders the same terrain for the same seed and different terrain otherwise', () => {
    const paths = (seed: string) =>
      Array.from(render(<ContourBackdrop seed={seed} />).container.querySelectorAll('path')).map((p) =>
        p.getAttribute('d')
      );
    expect(paths('trip-1')).toEqual(paths('trip-1'));
    expect(paths('trip-1')).not.toEqual(paths('trip-2'));
  });
});

describe('RouteSegment', () => {
  it('marks solid and dashed legs', () => {
    const solid = render(<RouteSegment style="solid" />).container.firstElementChild;
    const dashed = render(<RouteSegment style="dashed" />).container.firstElementChild;
    expect(solid?.getAttribute('data-route-segment')).toBe('solid');
    expect(dashed?.getAttribute('data-route-segment')).toBe('dashed');
    expect(dashed?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('EmptyState', () => {
  it('keeps its message readable with a contour layer behind it', () => {
    const { getByText, container } = render(<EmptyState message="No trips yet" subMessage="Start one" />);
    expect(getByText('No trips yet')).toBeTruthy();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});
