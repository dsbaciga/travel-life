import { describe, expect, it } from 'vitest';

import { describeBudget, formatMoney, summarizeSync, type SyncSnapshot } from '../summaries';

const calm: SyncSnapshot = {
  offline: false,
  counts: { pending: 0, conflict: 0, failed: 0 },
  blocked: 0,
  lastError: null,
};

describe('summarizeSync', () => {
  it('says nothing when all is synced', () => {
    expect(summarizeSync(calm)).toBeNull();
  });

  it('puts conflicts first, even offline with failures', () => {
    expect(
      summarizeSync({ ...calm, offline: true, counts: { pending: 3, conflict: 2, failed: 1 } })
    ).toEqual({ label: '2 conflicts', tone: 'danger' });
  });

  it('reports failures, then a sync error, before being offline', () => {
    expect(summarizeSync({ ...calm, offline: true, counts: { pending: 0, conflict: 0, failed: 1 } })).toEqual({
      label: '1 change failed',
      tone: 'danger',
    });
    expect(summarizeSync({ ...calm, offline: true, lastError: 'Trip 4: forbidden' })).toEqual({
      label: 'Sync problem',
      tone: 'danger',
    });
  });

  it('folds the pending count into the offline label', () => {
    expect(summarizeSync({ ...calm, offline: true, counts: { pending: 4, conflict: 0, failed: 0 } })).toEqual({
      label: 'Offline · 4 to sync',
      tone: 'warning',
    });
    expect(summarizeSync({ ...calm, offline: true })).toEqual({ label: 'Offline', tone: 'warning' });
  });

  it('shows waiting edits before plain pending ones', () => {
    expect(summarizeSync({ ...calm, blocked: 2, counts: { pending: 5, conflict: 0, failed: 0 } })).toEqual({
      label: '2 waiting',
      tone: 'warning',
    });
    expect(summarizeSync({ ...calm, counts: { pending: 5, conflict: 0, failed: 0 } })).toEqual({
      label: '5 to sync',
      tone: 'info',
    });
  });
});

describe('formatMoney', () => {
  it('rounds and keeps a currency marker', () => {
    expect(formatMoney(1234.6, 'EUR')).toMatch(/1.?235/);
    expect(formatMoney(1234.6, 'EUR')).toMatch(/€|EUR/);
  });

  it('falls back to a plain number for a missing or bad code', () => {
    expect(formatMoney(10, null)).toBe('10');
    expect(formatMoney(10, 'NOT-A-CODE')).toBe('10 NOT-A-CODE');
  });
});

describe('describeBudget', () => {
  it('clamps the bar and marker and words the state', () => {
    const summary = describeBudget(
      { spent: 1300, budget: 1000, spentFraction: 1.3, elapsedFraction: 0.4, state: 'over', unconvertedCount: 0 },
      'USD'
    );
    expect(summary.fill).toBe(1);
    expect(summary.marker).toBe(0.4);
    expect(summary.verdict).toBe('Over pace');
    expect(summary.tone).toBe('danger');
    expect(summary.pace).toBe('40% of the trip gone');
  });
});

describe('formatMoney with decimals', () => {
  it('keeps the currency decimals when not rounding', () => {
    expect(formatMoney(4.5, 'EUR', false)).toMatch(/4[.,]50/);
  });
});
