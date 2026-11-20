import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showToast, TOAST_MS, TOAST_WITH_ACTION_MS, useToast } from '../toast';

describe('toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToast.getState().dismiss();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a message and hides it after the short timeout', () => {
    showToast('Copied ABC123');
    expect(useToast.getState().toast?.message).toBe('Copied ABC123');
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(useToast.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(useToast.getState().toast).toBeNull();
  });

  it('stays up longer when it offers an action', () => {
    showToast('Moved 30 min later', { label: 'Undo', onPress: () => undefined });
    vi.advanceTimersByTime(TOAST_MS);
    expect(useToast.getState().toast?.action?.label).toBe('Undo');
    vi.advanceTimersByTime(TOAST_WITH_ACTION_MS - TOAST_MS);
    expect(useToast.getState().toast).toBeNull();
  });

  it('replaces the current toast, and the old timer does not close the new one', () => {
    showToast('First');
    vi.advanceTimersByTime(TOAST_MS - 100);
    showToast('Second');
    vi.advanceTimersByTime(200);
    expect(useToast.getState().toast?.message).toBe('Second');
    vi.advanceTimersByTime(TOAST_MS);
    expect(useToast.getState().toast).toBeNull();
  });

  it('ignores a dismiss aimed at a toast that was already replaced', () => {
    showToast('First');
    const firstId = useToast.getState().toast?.id;
    showToast('Second');
    useToast.getState().dismiss(firstId);
    expect(useToast.getState().toast?.message).toBe('Second');
  });
});
