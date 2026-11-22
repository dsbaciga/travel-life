/**
 * Settle-up arithmetic tests (pure functions, no mocks).
 *
 * Test cases:
 * - SPL-001: splitEqually sums exactly and puts odd cents on the first participant
 * - SPL-002: splitByPercentage sums exactly and puts the remainder on the largest share
 * - SPL-003: allocateProRata is exact, deterministic and handles zero weights
 * - SET-001: single payer, equal split
 * - SET-002: already settled (no transfers)
 * - SET-003: unconverted expenses are excluded and reported
 * - SET-004: unsplit / inconsistent expenses are excluded and reported
 * - SET-005: rounding across converted amounts keeps balances summing to zero
 * - SET-006: transfers minimise payments and actually settle everyone
 * - SET-007: recorded settlements reduce what is still owed
 */

import { describe, it, expect } from '@jest/globals';
import { Prisma } from '@prisma/client';
import {
  OWNER_KEY,
  allocateProRata,
  companionKey,
  computeSettleUp,
  minimizeTransfers,
  splitByPercentage,
  splitEqually,
  type Balance,
  type SettleUpExpense,
} from '../settleUp';

const D = (value: string | number) => new Prisma.Decimal(value);
const A = companionKey(1);
const B = companionKey(2);
const C = companionKey(3);

const sum = (amounts: Prisma.Decimal[]) => amounts.reduce((s, a) => s.add(a), D(0));

function expense(overrides: Partial<SettleUpExpense> & Pick<SettleUpExpense, 'id'>): SettleUpExpense {
  return {
    amount: D(100),
    currency: 'USD',
    baseAmount: D(100),
    paidBy: OWNER_KEY,
    shares: [],
    ...overrides,
  };
}

describe('splitEqually (SPL-001)', () => {
  it('splits evenly when divisible', () => {
    const shares = splitEqually(D('90.00'), [OWNER_KEY, A, B]);
    expect(shares.map((s) => s.amount.toString())).toEqual(['30', '30', '30']);
  });

  it('puts odd cents on the first participant and sums exactly', () => {
    const shares = splitEqually(D('100.00'), [B, A, OWNER_KEY]);
    // Sorted: owner, A, B. 10000 cents / 3 = 3333 r 1.
    expect(shares.map((s) => s.participant)).toEqual([OWNER_KEY, A, B]);
    expect(shares.map((s) => s.amount.toString())).toEqual(['33.34', '33.33', '33.33']);
    expect(sum(shares.map((s) => s.amount)).eq(D(100))).toBe(true);
  });

  it('handles a single participant', () => {
    const shares = splitEqually(D('12.34'), [A]);
    expect(shares).toHaveLength(1);
    expect(shares[0].amount.eq(D('12.34'))).toBe(true);
  });

  it('handles a one-cent amount across three people', () => {
    const shares = splitEqually(D('0.01'), [OWNER_KEY, A, B]);
    expect(shares.map((s) => s.amount.toString())).toEqual(['0.01', '0', '0']);
  });

  it('is deterministic regardless of input order', () => {
    const one = splitEqually(D('10.01'), [A, B, OWNER_KEY]);
    const two = splitEqually(D('10.01'), [OWNER_KEY, B, A]);
    expect(one.map((s) => [s.participant, s.amount.toString()])).toEqual(
      two.map((s) => [s.participant, s.amount.toString()])
    );
  });
});

describe('splitByPercentage (SPL-002)', () => {
  it('splits by percentage and sums exactly', () => {
    const shares = splitByPercentage(D('100.00'), [
      { participant: OWNER_KEY, percentage: D(50) },
      { participant: A, percentage: D(30) },
      { participant: B, percentage: D(20) },
    ]);
    expect(shares.map((s) => s.amount.toString())).toEqual(['50', '30', '20']);
  });

  it('gives the rounding remainder to the largest percentage', () => {
    // 33.33% of 100.01 etc. - three equal thirds of 100.00 -> remainder to lowest key on tie.
    const shares = splitByPercentage(D('100.00'), [
      { participant: OWNER_KEY, percentage: D('33.3333') },
      { participant: A, percentage: D('33.3333') },
      { participant: B, percentage: D('33.3334') },
    ]);
    expect(sum(shares.map((s) => s.amount)).eq(D(100))).toBe(true);
    const byKey = new Map(shares.map((s) => [s.participant, s.amount.toString()]));
    // B has the largest percentage, so it absorbs the leftover cent.
    expect(byKey.get(OWNER_KEY)).toBe('33.33');
    expect(byKey.get(A)).toBe('33.33');
    expect(byKey.get(B)).toBe('33.34');
  });

  it('rejects percentages that do not total 100', () => {
    expect(() =>
      splitByPercentage(D(100), [
        { participant: OWNER_KEY, percentage: D(60) },
        { participant: A, percentage: D(30) },
      ])
    ).toThrow(RangeError);
  });
});

describe('allocateProRata (SPL-003)', () => {
  it('splits proportionally to weights', () => {
    const shares = allocateProRata(D('60.00'), [
      { participant: A, weight: D(1) },
      { participant: B, weight: D(2) },
    ]);
    expect(shares.map((s) => s.amount.toString())).toEqual(['20', '40']);
  });

  it('always sums to the total', () => {
    const shares = allocateProRata(D('0.07'), [
      { participant: OWNER_KEY, weight: D('10.01') },
      { participant: A, weight: D('3.33') },
      { participant: B, weight: D('7.77') },
    ]);
    expect(sum(shares.map((s) => s.amount)).eq(D('0.07'))).toBe(true);
  });

  it('falls back to an equal split when every weight is zero', () => {
    const shares = allocateProRata(D('10.00'), [
      { participant: A, weight: D(0) },
      { participant: B, weight: D(0) },
    ]);
    expect(shares.map((s) => s.amount.toString())).toEqual(['5', '5']);
  });

  it('returns nothing for no participants', () => {
    expect(allocateProRata(D(10), [])).toEqual([]);
  });
});

describe('computeSettleUp', () => {
  describe('SET-001: single payer, equal split', () => {
    it('makes everyone else pay the payer back their share', () => {
      const result = computeSettleUp([
        expense({
          id: 1,
          amount: D('90.00'),
          baseAmount: D('90.00'),
          paidBy: OWNER_KEY,
          shares: splitEqually(D('90.00'), [OWNER_KEY, A, B]),
        }),
      ]);

      const net = new Map(result.balances.map((b) => [b.participant, b.net.toString()]));
      expect(net.get(OWNER_KEY)).toBe('60');
      expect(net.get(A)).toBe('-30');
      expect(net.get(B)).toBe('-30');
      expect(result.transfers).toHaveLength(2);
      expect(result.transfers.every((t) => t.to === OWNER_KEY && t.amount.eq(D(30)))).toBe(true);
      expect(result.unconverted).toEqual([]);
      expect(result.unsplitExpenseIds).toEqual([]);
    });
  });

  describe('SET-002: already settled', () => {
    it('produces no transfers when everyone paid their own share', () => {
      const result = computeSettleUp([
        expense({
          id: 1,
          amount: D('50.00'),
          baseAmount: D('50.00'),
          paidBy: OWNER_KEY,
          shares: splitEqually(D('50.00'), [OWNER_KEY, A]),
        }),
        expense({
          id: 2,
          amount: D('50.00'),
          baseAmount: D('50.00'),
          paidBy: A,
          shares: splitEqually(D('50.00'), [OWNER_KEY, A]),
        }),
      ]);

      expect(result.transfers).toEqual([]);
      expect(result.balances.every((b) => b.net.isZero())).toBe(true);
    });

    it('produces nothing at all for no expenses', () => {
      const result = computeSettleUp([]);
      expect(result.balances).toEqual([]);
      expect(result.transfers).toEqual([]);
    });

    it('treats a payer who only paid for themselves as settled', () => {
      const result = computeSettleUp([
        expense({ id: 1, paidBy: A, shares: [{ participant: A, amount: D(100) }] }),
      ]);
      expect(result.transfers).toEqual([]);
    });
  });

  describe('SET-003: unconverted expenses', () => {
    it('excludes them from balances and reports them', () => {
      const result = computeSettleUp([
        expense({
          id: 1,
          amount: D('100.00'),
          baseAmount: D('100.00'),
          paidBy: OWNER_KEY,
          shares: splitEqually(D('100.00'), [OWNER_KEY, A]),
        }),
        expense({
          id: 2,
          amount: D('5000.00'),
          currency: 'XYZ',
          baseAmount: null,
          paidBy: A,
          shares: splitEqually(D('5000.00'), [OWNER_KEY, A]),
        }),
      ]);

      expect(result.unconverted).toHaveLength(1);
      expect(result.unconverted[0]).toMatchObject({ expenseId: 2, currency: 'XYZ' });
      expect(result.unconverted[0].amount.eq(D(5000))).toBe(true);

      // Only expense 1 counted: A owes the owner 50.
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0]).toMatchObject({ from: A, to: OWNER_KEY });
      expect(result.transfers[0].amount.eq(D(50))).toBe(true);
    });
  });

  describe('SET-004: unsplit and inconsistent expenses', () => {
    it('excludes expenses with no payer or no shares', () => {
      const result = computeSettleUp([
        expense({ id: 1, paidBy: null, shares: [{ participant: A, amount: D(100) }] }),
        expense({ id: 2, paidBy: OWNER_KEY, shares: [] }),
      ]);
      expect(result.unsplitExpenseIds).toEqual([1, 2]);
      expect(result.balances).toEqual([]);
    });

    it('excludes expenses whose shares no longer add up to the amount', () => {
      // e.g. a companion was deleted and took their share row with them
      const result = computeSettleUp([
        expense({
          id: 7,
          amount: D(100),
          paidBy: OWNER_KEY,
          shares: [{ participant: OWNER_KEY, amount: D(50) }],
        }),
      ]);
      expect(result.unsplitExpenseIds).toEqual([7]);
      expect(result.transfers).toEqual([]);
    });

    it('does not report an unsplit expense as unconverted', () => {
      const result = computeSettleUp([expense({ id: 3, baseAmount: null, shares: [] })]);
      expect(result.unsplitExpenseIds).toEqual([3]);
      expect(result.unconverted).toEqual([]);
    });
  });

  describe('SET-005: rounding with currency conversion', () => {
    it('keeps balances summing to exactly zero when base amounts do not divide evenly', () => {
      const result = computeSettleUp([
        expense({
          id: 1,
          amount: D('100.00'),
          currency: 'EUR',
          baseAmount: D('108.37'),
          paidBy: B,
          shares: splitEqually(D('100.00'), [OWNER_KEY, A, B]),
        }),
        expense({
          id: 2,
          amount: D('33.33'),
          currency: 'EUR',
          baseAmount: D('36.11'),
          paidBy: OWNER_KEY,
          shares: splitEqually(D('33.33'), [OWNER_KEY, A, B]),
        }),
      ]);

      expect(sum(result.balances.map((b) => b.net)).isZero()).toBe(true);
      expect(sum(result.balances.map((b) => b.paid)).eq(D('144.48'))).toBe(true);
      expect(sum(result.balances.map((b) => b.owed)).eq(D('144.48'))).toBe(true);
    });

    it('preserves unequal share proportions when converting', () => {
      const result = computeSettleUp([
        expense({
          id: 1,
          amount: D('100.00'),
          baseAmount: D('200.00'), // rate 2.0
          paidBy: OWNER_KEY,
          shares: [
            { participant: OWNER_KEY, amount: D('25.00') },
            { participant: A, amount: D('75.00') },
          ],
        }),
      ]);
      const a = result.balances.find((b) => b.participant === A);
      expect(a?.owed.eq(D('150.00'))).toBe(true);
      expect(result.transfers[0].amount.eq(D('150.00'))).toBe(true);
    });

    it('is deterministic for tied remainders', () => {
      const build = () =>
        computeSettleUp([
          expense({
            id: 1,
            amount: D('0.02'),
            baseAmount: D('0.03'),
            paidBy: A,
            shares: [
              { participant: OWNER_KEY, amount: D('0.01') },
              { participant: B, amount: D('0.01') },
            ],
          }),
        ]);
      const first = build().balances.map((b) => [b.participant, b.owed.toString()]);
      expect(build().balances.map((b) => [b.participant, b.owed.toString()])).toEqual(first);
      // The odd cent lands on the lowest key (owner) on a tie.
      expect(first).toContainEqual([OWNER_KEY, '0.02']);
    });
  });
});

describe('minimizeTransfers (SET-006)', () => {
  const balance = (participant: string, net: string): Balance => ({
    participant,
    paid: D(0),
    owed: D(0),
    settledOut: D(0),
    settledIn: D(0),
    net: D(net),
  });

  /** Applies transfers to the balances and returns what is left over. */
  function residual(balances: Balance[], transfers: ReturnType<typeof minimizeTransfers>) {
    const left = new Map(balances.map((b) => [b.participant, b.net]));
    for (const t of transfers) {
      left.set(t.from, (left.get(t.from) ?? D(0)).add(t.amount));
      left.set(t.to, (left.get(t.to) ?? D(0)).sub(t.amount));
    }
    return [...left.values()];
  }

  it('settles a chain with fewer payments than naive pairwise debts', () => {
    // A owes B 10, B owes C 10: net A -10, B 0, C +10 -> a single A->C payment.
    const balances = [balance(A, '-10'), balance(B, '0'), balance(C, '10')];
    const transfers = minimizeTransfers(balances);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ from: A, to: C });
  });

  it('uses at most n-1 transfers and leaves nothing outstanding', () => {
    const balances = [
      balance(OWNER_KEY, '70'),
      balance(A, '-20'),
      balance(B, '-30'),
      balance(C, '-20'),
    ];
    const transfers = minimizeTransfers(balances);
    expect(transfers.length).toBeLessThanOrEqual(3);
    expect(residual(balances, transfers).every((r) => r.isZero())).toBe(true);
  });

  it('matches exact opposite pairs directly', () => {
    const balances = [
      balance(OWNER_KEY, '40'),
      balance(A, '25'),
      balance(B, '-25'),
      balance(C, '-40'),
    ];
    const transfers = minimizeTransfers(balances);
    expect(transfers).toHaveLength(2);
    expect(residual(balances, transfers).every((r) => r.isZero())).toBe(true);
  });

  it('returns nothing when all balances are zero', () => {
    expect(minimizeTransfers([balance(A, '0'), balance(B, '0')])).toEqual([]);
  });
});

describe('computeSettleUp with recorded settlements (SET-007)', () => {
  // The owner fronted 90 split three ways: A and B each owe the owner 30.
  const dinner = expense({
    id: 1,
    amount: D(90),
    baseAmount: D(90),
    paidBy: OWNER_KEY,
    shares: [
      { participant: OWNER_KEY, amount: D(30) },
      { participant: A, amount: D(30) },
      { participant: B, amount: D(30) },
    ],
  });
  const payment = (id: number, from: string, to: string, baseAmount: string | null) => ({
    id,
    from,
    to,
    baseAmount: baseAmount === null ? null : D(baseAmount),
  });

  it('leaves the result alone when there are no settlements', () => {
    const result = computeSettleUp([dinner]);
    expect(result.transfers.map((t) => [t.from, t.to, t.amount.toString()])).toEqual([
      [A, OWNER_KEY, '30'],
      [B, OWNER_KEY, '30'],
    ]);
    expect(result.unconvertedSettlementIds).toEqual([]);
  });

  it('subtracts a part payment from what is still owed', () => {
    const result = computeSettleUp([dinner], [payment(1, A, OWNER_KEY, '10')]);
    const a = result.balances.find((b) => b.participant === A)!;
    expect(a.settledOut.toString()).toBe('10');
    expect(a.net.toString()).toBe('-20');
    expect(result.balances.find((b) => b.participant === OWNER_KEY)!.settledIn.toString()).toBe('10');
    expect(result.transfers.map((t) => [t.from, t.to, t.amount.toString()])).toEqual([
      [B, OWNER_KEY, '30'],
      [A, OWNER_KEY, '20'],
    ]);
  });

  it('settles fully when the payment covers the debt, and balances still sum to zero', () => {
    const result = computeSettleUp([dinner], [payment(1, A, OWNER_KEY, '30'), payment(2, B, OWNER_KEY, '30')]);
    expect(result.transfers).toEqual([]);
    expect(sum(result.balances.map((b) => b.net)).isZero()).toBe(true);
    expect(result.balances.every((b) => b.net.isZero())).toBe(true);
  });

  it('flips the direction when someone overpays', () => {
    const result = computeSettleUp([dinner], [payment(1, A, OWNER_KEY, '40')]);
    // A now holds a credit of 10 and the owner's is down to 20: B covers both.
    expect(result.transfers.map((t) => [t.from, t.to, t.amount.toString()])).toEqual([
      [B, OWNER_KEY, '20'],
      [B, A, '10'],
    ]);
  });

  it('lists a payment that could not be converted instead of guessing', () => {
    const result = computeSettleUp([dinner], [payment(7, A, OWNER_KEY, null)]);
    expect(result.unconvertedSettlementIds).toEqual([7]);
    expect(result.balances.find((b) => b.participant === A)!.net.toString()).toBe('-30');
  });

  it('includes people who only appear in a settlement', () => {
    const result = computeSettleUp([], [payment(1, A, B, '5')]);
    expect(result.balances.map((b) => [b.participant, b.net.toString()])).toEqual([
      [A, '5'],
      [B, '-5'],
    ]);
    expect(result.transfers.map((t) => [t.from, t.to, t.amount.toString()])).toEqual([[B, A, '5']]);
  });
});
