import type { ReceiptScanResult } from '../services/receiptScan.service';
import type { ExpenseCategory } from '../types/expense';

export type ScannedField = 'description' | 'category' | 'amount' | 'currency' | 'date';

export interface ReceiptPrefill {
  description: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  date: string;
  /** Fields whose value came from the receipt, to be marked for review. */
  scanned: ScannedField[];
  /** True when the receipt showed no currency and the form default was used instead. */
  currencyDefaulted: boolean;
}

/**
 * Map a scan result onto expense form values. A field the scan could not read
 * is left to the form's normal default and is not marked as scanned. The
 * currency is never guessed: with none on the receipt the usual default is put
 * in the picker and flagged, so the user sees it was not read.
 */
export function receiptToExpenseForm(
  result: ReceiptScanResult,
  defaults: { category: ExpenseCategory; currency: string }
): ReceiptPrefill {
  const scanned: ScannedField[] = [];
  if (result.merchant) scanned.push('description');
  if (result.category) scanned.push('category');
  if (result.amount) scanned.push('amount');
  if (result.currency) scanned.push('currency');
  if (result.date) scanned.push('date');

  return {
    description: result.merchant ?? '',
    category: result.category ?? defaults.category,
    amount: result.amount ?? '',
    currency: result.currency ?? defaults.currency,
    date: result.date ?? '',
    scanned,
    currencyDefaulted: !result.currency,
  };
}
