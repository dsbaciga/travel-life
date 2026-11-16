/**
 * Expense split form helper tests
 *
 * Test cases:
 * - ESU-001: No payer sends nothing, or clears an existing split
 * - ESU-002: Equal split sends only the chosen people
 * - ESU-003: Custom amounts must add up to the total, compared in whole cents
 * - ESU-004: Percentages must add up to 100
 * - ESU-005: An existing expense round-trips into form state
 */

import { describe, it, expect } from 'vitest';
import {
  amountDifference,
  buildSplitInput,
  emptySplitState,
  percentageDifference,
  splitStateFromExpense,
  type SplitFormState,
} from '../expenseSplit';
import type { TripExpense } from '../../types/expense';

const KEYS = ['owner', 'companion:5', 'companion:6'];

function state(overrides: Partial<SplitFormState>): SplitFormState {
  return { ...emptySplitState(), paidBy: 'owner', ...overrides };
}

describe('buildSplitInput', () => {
  it('ESU-001: sends nothing when no payer is chosen and there was no split', () => {
    expect(buildSplitInput(emptySplitState(), KEYS, 100, false)).toEqual({ ok: true, input: null });
  });

  it('ESU-001: clears the split when the payer is removed from an expense that had one', () => {
    expect(buildSplitInput(emptySplitState(), KEYS, 100, true)).toEqual({
      ok: true,
      input: { paidBy: null },
    });
  });

  it('ESU-002: sends only the people who are included, in participant order', () => {
    const result = buildSplitInput(
      state({ included: { 'companion:6': true, owner: true, 'companion:5': false } }),
      KEYS,
      100,
      false
    );
    expect(result).toEqual({
      ok: true,
      input: {
        paidBy: 'owner',
        method: 'equal',
        participants: [{ participant: 'owner' }, { participant: 'companion:6' }],
      },
    });
  });

  it('ESU-002: refuses a split with nobody in it', () => {
    const result = buildSplitInput(state({}), KEYS, 100, false);
    expect(result.ok).toBe(false);
  });

  it('ESU-003: accepts amounts that add up exactly', () => {
    const result = buildSplitInput(
      state({
        method: 'amount',
        included: { owner: true, 'companion:5': true },
        amounts: { owner: '0.10', 'companion:5': '0.20' },
      }),
      KEYS,
      0.3,
      false
    );
    // 0.1 + 0.2 !== 0.3 in floating point; whole-cent maths must still accept it.
    expect(result.ok).toBe(true);
  });

  it('ESU-003: refuses amounts that do not add up, and missing amounts', () => {
    const base = { method: 'amount' as const, included: { owner: true, 'companion:5': true } };
    expect(
      buildSplitInput(state({ ...base, amounts: { owner: '60', 'companion:5': '30' } }), KEYS, 100, false)
        .ok
    ).toBe(false);
    expect(buildSplitInput(state({ ...base, amounts: { owner: '100' } }), KEYS, 100, false).ok).toBe(
      false
    );
  });

  it('ESU-004: accepts percentages that total 100 and refuses others', () => {
    const base = { method: 'percentage' as const, included: { owner: true, 'companion:5': true } };
    const good = buildSplitInput(
      state({ ...base, percentages: { owner: '33.33', 'companion:5': '66.67' } }),
      KEYS,
      100,
      false
    );
    expect(good.ok).toBe(true);
    const bad = buildSplitInput(
      state({ ...base, percentages: { owner: '50', 'companion:5': '40' } }),
      KEYS,
      100,
      false
    );
    expect(bad).toEqual({ ok: false, error: 'The percentages must add up to 100' });
  });
});

describe('differences', () => {
  it('reports what is left to assign', () => {
    const s = state({
      included: { owner: true, 'companion:5': true },
      amounts: { owner: '40', 'companion:5': '35.5' },
      percentages: { owner: '60', 'companion:5': '25' },
    });
    expect(amountDifference(s, KEYS, 100)).toBe(24.5);
    expect(percentageDifference(s, KEYS)).toBe(15);
  });

  it('ignores people who are not included', () => {
    const s = state({ included: { owner: true }, amounts: { owner: '10', 'companion:5': '90' } });
    expect(amountDifference(s, KEYS, 10)).toBe(0);
  });
});

describe('splitStateFromExpense (ESU-005)', () => {
  it('loads the payer, method and shares', () => {
    const expense = {
      paidBy: 'companion:5',
      splitMethod: 'percentage',
      splits: [
        { participant: 'owner', amount: 60, percentage: 60 },
        { participant: 'companion:5', amount: 40, percentage: 40 },
      ],
    } as TripExpense;

    const loaded = splitStateFromExpense(expense);
    expect(loaded.paidBy).toBe('companion:5');
    expect(loaded.method).toBe('percentage');
    expect(loaded.included).toEqual({ owner: true, 'companion:5': true });
    expect(loaded.percentages).toEqual({ owner: '60', 'companion:5': '40' });
    expect(loaded.amounts).toEqual({ owner: '60', 'companion:5': '40' });
  });

  it('defaults to an empty equal split for an expense with none', () => {
    const loaded = splitStateFromExpense({ paidBy: null, splitMethod: null, splits: [] } as unknown as TripExpense);
    expect(loaded).toEqual(emptySplitState());
  });
});
