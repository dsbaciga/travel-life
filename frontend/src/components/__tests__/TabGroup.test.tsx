/**
 * TabGroup: the active sub-tab is scrolled into view inside its own strip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import TabGroup from '../TabGroup';

const tabs = [
  {
    id: 'plan',
    label: 'Plan',
    icon: null,
    subTabs: [
      { id: 'itinerary', label: 'Itinerary' },
      { id: 'transportation', label: 'Transport' },
    ],
  },
  { id: 'photos', label: 'Photos', icon: null },
];

function box(left: number, right: number): DOMRect {
  return { left, right, top: 0, bottom: 44, width: right - left, height: 44, x: left, y: 0, toJSON: () => ({}) };
}

describe('TabGroup sub-tab strip', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.matches('button[data-tab-active="true"]')) return box(500, 640);
      if (this.matches('div.overflow-x-auto')) return box(0, 390);
      return box(0, 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('scrolls the active sub-tab into view on mount', () => {
    const { container } = render(<TabGroup tabs={tabs} activeTab="transportation" onTabChange={vi.fn()} />);
    const strip = container.querySelector<HTMLElement>('div.overflow-x-auto');
    // The pill ends 250px past the strip's right edge.
    expect(strip?.scrollLeft).toBe(250);
  });

  it('scrolls again when the active sub-tab changes', () => {
    const { container, rerender } = render(<TabGroup tabs={tabs} activeTab="itinerary" onTabChange={vi.fn()} />);
    const strip = container.querySelector<HTMLElement>('div.overflow-x-auto');
    expect(strip?.scrollLeft).toBe(250);
    if (strip) strip.scrollLeft = 0;
    rerender(<TabGroup tabs={tabs} activeTab="transportation" onTabChange={vi.fn()} />);
    expect(strip?.scrollLeft).toBe(250);
  });
});
