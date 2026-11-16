import type {
  ParticipantKey,
  SetExpenseSplitInput,
  SplitMethod,
  TripExpense,
} from '../types/expense';

/** Form state for the "paid by / split between" section of the expense form. */
export interface SplitFormState {
  /** Participant key of the payer; '' = not recorded. */
  paidBy: ParticipantKey | '';
  method: SplitMethod;
  /** Who shares the expense. */
  included: Record<ParticipantKey, boolean>;
  /** Custom amounts, as typed (method 'amount'). */
  amounts: Record<ParticipantKey, string>;
  /** Percentages, as typed (method 'percentage'). */
  percentages: Record<ParticipantKey, string>;
}

export function emptySplitState(): SplitFormState {
  return { paidBy: '', method: 'equal', included: {}, amounts: {}, percentages: {} };
}

/** Loads an existing expense's payer and split back into the form. */
export function splitStateFromExpense(expense: TripExpense): SplitFormState {
  const state = emptySplitState();
  state.paidBy = expense.paidBy ?? '';
  state.method = expense.splitMethod ?? 'equal';
  for (const share of expense.splits) {
    state.included[share.participant] = true;
    state.amounts[share.participant] = String(share.amount);
    if (share.percentage !== null) {
      state.percentages[share.participant] = String(share.percentage);
    }
  }
  return state;
}

/** Whole cents, so sums are compared exactly rather than as floats. */
const toCents = (value: number): number => Math.round(value * 100);

export function parseDecimal(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** How far the typed custom amounts are from the expense total, in currency units. */
export function amountDifference(
  state: SplitFormState,
  participants: readonly ParticipantKey[],
  total: number
): number {
  const typed = participants
    .filter((key) => state.included[key])
    .reduce((sum, key) => sum + toCents(parseDecimal(state.amounts[key]) ?? 0), 0);
  return (toCents(total) - typed) / 100;
}

/** How far the typed percentages are from 100. */
export function percentageDifference(
  state: SplitFormState,
  participants: readonly ParticipantKey[]
): number {
  const typed = participants
    .filter((key) => state.included[key])
    .reduce((sum, key) => sum + Math.round((parseDecimal(state.percentages[key]) ?? 0) * 10000), 0);
  return (1000000 - typed) / 10000;
}

export type BuildSplitResult =
  | { ok: true; input: SetExpenseSplitInput | null }
  | { ok: false; error: string };

/**
 * Turns form state into the API payload. `input` is null when there is nothing
 * to send (no payer chosen and the expense had no split before).
 */
export function buildSplitInput(
  state: SplitFormState,
  participants: readonly ParticipantKey[],
  total: number,
  hadSplit: boolean
): BuildSplitResult {
  if (state.paidBy === '') {
    return { ok: true, input: hadSplit ? { paidBy: null } : null };
  }

  const included = participants.filter((key) => state.included[key]);
  if (included.length === 0) {
    return { ok: false, error: 'Choose who shares this expense' };
  }

  if (state.method === 'equal') {
    return {
      ok: true,
      input: {
        paidBy: state.paidBy,
        method: 'equal',
        participants: included.map((participant) => ({ participant })),
      },
    };
  }

  if (state.method === 'amount') {
    if (included.some((key) => parseDecimal(state.amounts[key]) === null)) {
      return { ok: false, error: 'Enter an amount for everyone sharing the expense' };
    }
    if (amountDifference(state, participants, total) !== 0) {
      return { ok: false, error: 'The amounts must add up to the expense total' };
    }
    return {
      ok: true,
      input: {
        paidBy: state.paidBy,
        method: 'amount',
        participants: included.map((participant) => ({
          participant,
          amount: parseDecimal(state.amounts[participant]) ?? 0,
        })),
      },
    };
  }

  if (included.some((key) => parseDecimal(state.percentages[key]) === null)) {
    return { ok: false, error: 'Enter a percentage for everyone sharing the expense' };
  }
  if (percentageDifference(state, participants) !== 0) {
    return { ok: false, error: 'The percentages must add up to 100' };
  }
  return {
    ok: true,
    input: {
      paidBy: state.paidBy,
      method: 'percentage',
      participants: included.map((participant) => ({
        participant,
        percentage: parseDecimal(state.percentages[participant]) ?? 0,
      })),
    },
  };
}
