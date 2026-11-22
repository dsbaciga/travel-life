import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import AppToaster from '../AppToaster';

function pointerDown(pointerType: string) {
  const event = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  window.dispatchEvent(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => toast.remove());
  vi.useRealTimers();
});

describe('AppToaster', () => {
  it('ATS-001: a tap does not freeze toasts on screen', () => {
    render(<AppToaster />);
    act(() => {
      toast.success('Location deleted successfully');
    });
    const message = screen.getByText('Location deleted successfully');

    // A phone tap: touch pointerdown, then the browser's emulated mouseenter.
    act(() => pointerDown('touch'));
    fireEvent.mouseEnter(message.closest('[data-rht-toaster]') as Element);

    // Success toasts last 2s. React flushes the dismissal when act() ends, which
    // schedules the 1s removal, so step the clock twice.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Location deleted successfully')).not.toBeInTheDocument();
  });

  it('ATS-002: hovering with a mouse still pauses the toast', () => {
    render(<AppToaster />);
    act(() => {
      toast.success('Saved');
    });
    const message = screen.getByText('Saved');

    act(() => pointerDown('mouse'));
    fireEvent.mouseEnter(message.closest('[data-rht-toaster]') as Element);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('ATS-003: tapping a toast dismisses it', () => {
    render(<AppToaster />);
    act(() => {
      toast.success('Updated');
    });
    fireEvent.click(screen.getByText('Updated'));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText('Updated')).not.toBeInTheDocument();
  });
});
