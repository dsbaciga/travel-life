/** What the record-payment form starts with: a suggested payment, or a payment being edited. */
export interface SettlementFormValues {
  from: string;
  to: string;
  amount: string;
  currency: string;
  date: string;
  notes: string;
}

/** Today as a calendar date (YYYY-MM-DD) in the browser's local time. */
export function todayDateOnly(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
