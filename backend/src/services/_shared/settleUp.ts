import { Prisma } from '@prisma/client';

/**
 * Pure expense-splitting and settle-up arithmetic. No I/O, no Prisma client:
 * everything here is `Prisma.Decimal` maths so it can be unit-tested directly.
 *
 * A participant is identified by a string key: `'owner'` for the trip owner, or
 * `companion:<id>` for a TravelCompanion. Keys sort deterministically (owner
 * first, then companions by numeric id) which is what makes every rounding
 * decision below reproducible.
 */

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export const OWNER_KEY = 'owner';

export const companionKey = (companionId: number): string => `companion:${companionId}`;

/** Numeric sort rank of a key: owner first, then companions by id. */
function keyRank(key: string): number {
  if (key === OWNER_KEY) return -1;
  const id = Number(key.slice('companion:'.length));
  return Number.isFinite(id) ? id : Number.MAX_SAFE_INTEGER;
}

export function compareKeys(a: string, b: string): number {
  const diff = keyRank(a) - keyRank(b);
  return diff !== 0 ? diff : a.localeCompare(b);
}

const toCents = (value: Prisma.Decimal): Prisma.Decimal => value.mul(100).toDecimalPlaces(0);
const fromCents = (cents: Prisma.Decimal): Prisma.Decimal => cents.div(100);

export interface ShareEntry {
  participant: string;
  amount: Prisma.Decimal;
}

/**
 * Splits `total` across `weights` in proportion, in whole cents, so the result
 * sums to `total` EXACTLY. Each share is floored to the cent; the leftover cents
 * go to the participant with the largest weight (ties: lowest key), one cent at
 * a time only if the leftover exceeds one — in practice the remainder is placed
 * wholly on that single participant, which keeps the rule easy to explain.
 *
 * When every weight is zero the total is split equally instead.
 */
export function allocateProRata(
  total: Prisma.Decimal,
  weights: ReadonlyArray<{ participant: string; weight: Prisma.Decimal }>
): ShareEntry[] {
  if (weights.length === 0) return [];

  const sorted = [...weights].sort((a, b) => compareKeys(a.participant, b.participant));
  const weightSum = sorted.reduce((sum, w) => sum.add(w.weight), ZERO);
  const totalCents = toCents(total);

  const effective =
    weightSum.isZero() ? sorted.map((w) => ({ ...w, weight: new Prisma.Decimal(1) })) : sorted;
  const effectiveSum = weightSum.isZero() ? new Prisma.Decimal(effective.length) : weightSum;

  const floored = effective.map((w) => ({
    participant: w.participant,
    weight: w.weight,
    cents: totalCents.mul(w.weight).div(effectiveSum).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN),
  }));

  const allocated = floored.reduce((sum, s) => sum.add(s.cents), ZERO);
  const remainder = totalCents.sub(allocated);

  if (!remainder.isZero()) {
    // Largest weight absorbs the remainder; `floored` is key-sorted so a strict
    // `>` comparison keeps the lowest key on ties.
    let target = floored[0];
    for (const entry of floored) {
      if (entry.weight.gt(target.weight)) target = entry;
    }
    target.cents = target.cents.add(remainder);
  }

  return floored.map((s) => ({ participant: s.participant, amount: fromCents(s.cents) }));
}

/** Equal split. Any odd cents land on the first participant (owner, then lowest id). */
export function splitEqually(total: Prisma.Decimal, participants: readonly string[]): ShareEntry[] {
  const sorted = [...new Set(participants)].sort(compareKeys);
  const totalCents = toCents(total);
  const count = new Prisma.Decimal(sorted.length || 1);
  const base = totalCents.div(count).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN);
  const remainder = totalCents.sub(base.mul(sorted.length));

  return sorted.map((participant, index) => ({
    participant,
    amount: fromCents(index === 0 ? base.add(remainder) : base),
  }));
}

/**
 * Percentage split. Percentages must total 100 (to 4 dp). Each share is rounded
 * down to the cent and the remainder goes to the largest percentage (ties:
 * lowest key).
 */
export function splitByPercentage(
  total: Prisma.Decimal,
  percentages: ReadonlyArray<{ participant: string; percentage: Prisma.Decimal }>
): ShareEntry[] {
  const sum = percentages.reduce((acc, p) => acc.add(p.percentage), ZERO);
  if (!sum.sub(HUNDRED).abs().lte(new Prisma.Decimal('0.0001'))) {
    throw new RangeError('Percentages must add up to 100');
  }
  return allocateProRata(
    total,
    percentages.map((p) => ({ participant: p.participant, weight: p.percentage }))
  );
}

/** True when the amounts add up to `total` exactly. */
export function sharesSumTo(total: Prisma.Decimal, shares: ReadonlyArray<ShareEntry>): boolean {
  return shares.reduce((sum, s) => sum.add(s.amount), ZERO).eq(total);
}

// -----------------------------------------------------------------------------
// Settle-up
// -----------------------------------------------------------------------------

export interface SettleUpExpense {
  id: number;
  /** Amount in the expense's own currency. */
  amount: Prisma.Decimal;
  currency: string | null;
  /** The amount in the settlement (base) currency; null = could not be converted. */
  baseAmount: Prisma.Decimal | null;
  /** Participant key of whoever paid; null = not recorded. */
  paidBy: string | null;
  /** Shares in the expense's own currency. Empty = not split. */
  shares: ReadonlyArray<ShareEntry>;
}

export interface Balance {
  participant: string;
  /** Total this participant fronted, in the base currency. */
  paid: Prisma.Decimal;
  /** Total this participant's shares come to, in the base currency. */
  owed: Prisma.Decimal;
  /** Settlement payments this participant has made, in the base currency. */
  settledOut: Prisma.Decimal;
  /** Settlement payments this participant has received, in the base currency. */
  settledIn: Prisma.Decimal;
  /** paid - owed + settledOut - settledIn. Positive = is owed money; negative = owes money. */
  net: Prisma.Decimal;
}

/** A recorded payment between two participants. */
export interface SettlementPayment {
  id: number;
  from: string;
  to: string;
  /** The amount in the settlement (base) currency; null = could not be converted. */
  baseAmount: Prisma.Decimal | null;
}

export interface Transfer {
  from: string;
  to: string;
  amount: Prisma.Decimal;
}

export interface SettleUpUnconverted {
  expenseId: number;
  currency: string | null;
  amount: Prisma.Decimal;
}

export interface SettleUpResult {
  balances: Balance[];
  transfers: Transfer[];
  /** Split expenses that could not be converted; excluded from balances. */
  unconverted: SettleUpUnconverted[];
  /** Recorded settlement payments that could not be converted; excluded from balances. */
  unconvertedSettlementIds: number[];
  /** Expenses with no payer, no shares, or shares that do not add up; excluded. */
  unsplitExpenseIds: number[];
}

/**
 * Reduces net balances to a short list of payments.
 *
 * First cancels exact opposite pairs (a debtor owing exactly what a creditor is
 * owed), then repeatedly pays the largest creditor from the largest debtor. That
 * never needs more than (participants - 1) transfers. Finding the true minimum
 * is NP-hard in general; this matches what apps like Splitwise do and is optimal
 * for the common small-group cases. Ties break by participant key so output is
 * deterministic.
 */
export function minimizeTransfers(balances: ReadonlyArray<Balance>): Transfer[] {
  const creditors = balances
    .filter((b) => b.net.gt(ZERO))
    .map((b) => ({ participant: b.participant, amount: b.net }));
  const debtors = balances
    .filter((b) => b.net.lt(ZERO))
    .map((b) => ({ participant: b.participant, amount: b.net.neg() }));

  const transfers: Transfer[] = [];

  // Pass 1: exact matches settle in a single payment each.
  for (const debtor of debtors) {
    const match = creditors.find((c) => c.amount.eq(debtor.amount) && !c.amount.isZero());
    if (match && !debtor.amount.isZero()) {
      transfers.push({ from: debtor.participant, to: match.participant, amount: debtor.amount });
      match.amount = ZERO;
      debtor.amount = ZERO;
    }
  }

  // Pass 2: largest debtor pays largest creditor.
  const byAmountThenKey = (a: { participant: string; amount: Prisma.Decimal }, b: typeof a) => {
    const diff = b.amount.cmp(a.amount);
    return diff !== 0 ? diff : compareKeys(a.participant, b.participant);
  };

  for (;;) {
    const creditor = creditors.filter((c) => c.amount.gt(ZERO)).sort(byAmountThenKey)[0];
    const debtor = debtors.filter((d) => d.amount.gt(ZERO)).sort(byAmountThenKey)[0];
    if (!creditor || !debtor) break;

    const amount = Prisma.Decimal.min(creditor.amount, debtor.amount);
    transfers.push({ from: debtor.participant, to: creditor.participant, amount });
    creditor.amount = creditor.amount.sub(amount);
    debtor.amount = debtor.amount.sub(amount);
  }

  return transfers;
}

/**
 * Computes who owes whom, in the base currency.
 *
 * For each expense the base amount is distributed over its shares in proportion
 * to the share amounts (so a 50/50 split of an expense converted at some rate is
 * still 50/50), with the cent remainder placed deterministically by
 * `allocateProRata`. The payer is credited the whole base amount. Because each
 * expense's shares sum to its base amount exactly, balances sum to zero exactly.
 *
 * A recorded settlement (A paid B) moves A's net up and B's net down by the same amount, so
 * balances still sum to zero and the suggested payments only cover what is still owed. One that
 * could not be converted is reported and left out rather than guessed at.
 */
export function computeSettleUp(
  expenses: ReadonlyArray<SettleUpExpense>,
  settlements: ReadonlyArray<SettlementPayment> = []
): SettleUpResult {
  const paid = new Map<string, Prisma.Decimal>();
  const owed = new Map<string, Prisma.Decimal>();
  const unconverted: SettleUpUnconverted[] = [];
  const unsplitExpenseIds: number[] = [];
  const settledOut = new Map<string, Prisma.Decimal>();
  const settledIn = new Map<string, Prisma.Decimal>();
  const unconvertedSettlementIds: number[] = [];

  const add = (map: Map<string, Prisma.Decimal>, key: string, amount: Prisma.Decimal) => {
    map.set(key, (map.get(key) ?? ZERO).add(amount));
  };

  for (const expense of expenses) {
    const hasValidShares =
      expense.paidBy !== null &&
      expense.shares.length > 0 &&
      sharesSumTo(expense.amount, expense.shares);

    if (!hasValidShares || expense.paidBy === null) {
      unsplitExpenseIds.push(expense.id);
      continue;
    }

    if (expense.baseAmount === null) {
      unconverted.push({
        expenseId: expense.id,
        currency: expense.currency,
        amount: expense.amount,
      });
      continue;
    }

    const baseShares = allocateProRata(
      expense.baseAmount,
      expense.shares.map((s) => ({ participant: s.participant, weight: s.amount }))
    );

    add(paid, expense.paidBy, expense.baseAmount);
    for (const share of baseShares) add(owed, share.participant, share.amount);
  }

  for (const settlement of settlements) {
    if (settlement.baseAmount === null) {
      unconvertedSettlementIds.push(settlement.id);
      continue;
    }
    add(settledOut, settlement.from, settlement.baseAmount);
    add(settledIn, settlement.to, settlement.baseAmount);
  }

  const participants = [
    ...new Set([...paid.keys(), ...owed.keys(), ...settledOut.keys(), ...settledIn.keys()]),
  ].sort(compareKeys);
  const balances: Balance[] = participants.map((participant) => {
    const p = paid.get(participant) ?? ZERO;
    const o = owed.get(participant) ?? ZERO;
    const out = settledOut.get(participant) ?? ZERO;
    const received = settledIn.get(participant) ?? ZERO;
    return {
      participant,
      paid: p,
      owed: o,
      settledOut: out,
      settledIn: received,
      net: p.sub(o).add(out).sub(received),
    };
  });

  return {
    balances,
    transfers: minimizeTransfers(balances),
    unconverted,
    unconvertedSettlementIds,
    unsplitExpenseIds,
  };
}

/** Rounds to cents (used when serialising). */
export const roundMoney = (value: Prisma.Decimal): Prisma.Decimal => value.toDecimalPlaces(2);
