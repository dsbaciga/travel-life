/**
 * One-line summaries the Today header shows instead of a row of chips. Pure, so
 * the wording and priorities are tested in Node.
 */
import type { BurnRate } from '../domain/smart';
import type { OutboxCounts } from '../sync/outbox';

export type SummaryTone = 'success' | 'warning' | 'danger' | 'info' | 'default';

export interface SyncSummary {
  label: string;
  tone: SummaryTone;
}

export interface SyncSnapshot {
  offline: boolean;
  counts: OutboxCounts;
  blocked: number;
  lastError: string | null;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The single most important thing about sync right now, or null when all is
 * well. Things the user has to act on come first: a conflict needs a choice, a
 * failure needs a look. Being offline only matters when there is something
 * waiting to go up, or as a heads-up that what is shown may be behind.
 */
export function summarizeSync({ offline, counts, blocked, lastError }: SyncSnapshot): SyncSummary | null {
  if (counts.conflict > 0) return { label: plural(counts.conflict, 'conflict', 'conflicts'), tone: 'danger' };
  if (counts.failed > 0) return { label: `${plural(counts.failed, 'change', 'changes')} failed`, tone: 'danger' };
  if (lastError) return { label: 'Sync problem', tone: 'danger' };
  if (offline) {
    return {
      label: counts.pending > 0 ? `Offline · ${counts.pending} to sync` : 'Offline',
      tone: 'warning',
    };
  }
  if (blocked > 0) return { label: `${blocked} waiting`, tone: 'warning' };
  if (counts.pending > 0) return { label: `${counts.pending} to sync`, tone: 'info' };
  return null;
}

/**
 * "€1,234" in the given currency; a bare number if the code is unusable.
 * `whole` rounds to whole units (budgets); otherwise the currency's own
 * decimals are kept (a single expense of €4.50).
 */
export function formatMoney(amount: number, currency: string | null | undefined, whole = true): string {
  const value = whole ? Math.round(amount) : amount;
  if (!currency) return value.toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      ...(whole ? { maximumFractionDigits: 0 } : {}),
    }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

export interface BudgetSummary {
  /** "€420 of €1,000" */
  amounts: string;
  /** "Under budget", "On track", "Over pace" */
  verdict: string;
  /** "40% of the trip gone" */
  pace: string;
  tone: SummaryTone;
  /** Bar fill, clamped to 0–1. */
  fill: number;
  /** Where the "should have spent by now" marker sits, 0–1. */
  marker: number;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export function describeBudget(burn: BurnRate, currency: string | null | undefined): BudgetSummary {
  return {
    amounts: `${formatMoney(burn.spent, currency)} of ${formatMoney(burn.budget, currency)}`,
    verdict: burn.state === 'over' ? 'Over pace' : burn.state === 'under' ? 'Under budget' : 'On track',
    pace: `${Math.round(clamp(burn.elapsedFraction) * 100)}% of the trip gone`,
    tone: burn.state === 'over' ? 'danger' : burn.state === 'under' ? 'success' : 'default',
    fill: clamp(burn.spentFraction),
    marker: clamp(burn.elapsedFraction),
  };
}
