import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from './expense.types';
import { sanitizeForPrompt } from '../security/promptSafety';
import { CONVERTIBLE_CURRENCY_CODES } from '../constants/currencies';

/** Currencies the receipt scan will return: the ones `CurrencySelect` offers, so a code outside it is treated as "not read". */
const CURRENCY_SET: ReadonlySet<string> = new Set(CONVERTIBLE_CURRENCY_CODES);

/** What the scan returns. Every field is nullable: null means "not read". */
export interface ReceiptScanResult {
  merchant: string | null;
  /** Positive decimal as a string, at most 2 fraction digits. Never a float. */
  amount: string | null;
  /** ISO 4217 code from CONVERTIBLE_CURRENCY_CODES. */
  currency: string | null;
  /** Calendar date, YYYY-MM-DD, no timezone. */
  date: string | null;
  category: ExpenseCategory | null;
}

const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;
const MIN_YEAR = 1990;

/** Accepts "12.50" or 12.5; rejects floats with noise (12.3000000004), exponents, negatives, zero. */
function normaliseAmount(value: unknown): string | null {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (typeof value === 'string') {
    // Tolerate thousands separators the model may have copied from the receipt.
    text = value.trim().replace(/,/g, '');
  } else {
    return null;
  }
  if (!AMOUNT_PATTERN.test(text)) return null;
  return new Prisma.Decimal(text).gt(0) ? text : null;
}

function normaliseCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CURRENCY_SET.has(code) ? code : null;
}

/** Real calendar date only (Feb 30 is rejected, not rolled), not before 1990 and not in the future. */
function normaliseDate(value: unknown, now: Date): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) return null;
  if (parsed.getUTCFullYear() < MIN_YEAR) return null;
  // Allow a day of slack for receipts printed in a zone ahead of the server.
  const latest = now.getTime() + 2 * 24 * 60 * 60 * 1000;
  if (parsed.getTime() > latest) return null;
  return text;
}

function normaliseMerchant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = sanitizeForPrompt(value).replace(/\s+/g, ' ').trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : null;
}

function normaliseCategory(value: unknown): ExpenseCategory | null {
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  return EXPENSE_CATEGORIES.find((category) => category === lowered) ?? null;
}

/** Each field is validated on its own, so one bad field never discards the others. */
export function buildReceiptExtractionSchema(now: Date = new Date()) {
  return z
    .object({
      merchant: z.unknown().transform(normaliseMerchant),
      amount: z.unknown().transform(normaliseAmount),
      currency: z.unknown().transform(normaliseCurrency),
      date: z.unknown().transform((v) => normaliseDate(v, now)),
      category: z.unknown().transform(normaliseCategory),
    })
    .transform((v): ReceiptScanResult => v);
}

const EMPTY_RESULT: ReceiptScanResult = {
  merchant: null,
  amount: null,
  currency: null,
  date: null,
  category: null,
};

/**
 * Turn a raw model reply into a validated result. Models wrap JSON in code
 * fences or prose, so the first object found is used. Returns null when no
 * field could be read at all.
 */
export function parseReceiptExtraction(reply: string, now: Date = new Date()): ReceiptScanResult | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  // Only the five known keys are read, and an absent key counts as "not read".
  const source = raw as Record<string, unknown>;
  const parsed = buildReceiptExtractionSchema(now).safeParse({
    merchant: source.merchant ?? null,
    amount: source.amount ?? null,
    currency: source.currency ?? null,
    date: source.date ?? null,
    category: source.category ?? null,
  });
  if (!parsed.success) return null;
  const result = { ...EMPTY_RESULT, ...parsed.data };
  return Object.values(result).every((v) => v === null) ? null : result;
}
