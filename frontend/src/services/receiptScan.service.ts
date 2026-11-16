import axios from '../lib/axios';
import type { ExpenseCategory } from '../types/expense';

/** Fields read from a receipt photo. null means the receipt did not show it. */
export interface ReceiptScanResult {
  merchant: string | null;
  /** Positive decimal string such as "42.50". */
  amount: string | null;
  /** ISO 4217 code that CurrencySelect offers. */
  currency: string | null;
  /** Calendar date, YYYY-MM-DD. */
  date: string | null;
  category: ExpenseCategory | null;
}

export const receiptScanService = {
  /** Extract fields only; nothing is saved until the user submits the expense form. */
  async scanReceipt(tripId: number, image: File): Promise<ReceiptScanResult> {
    const formData = new FormData();
    formData.append('image', image);
    const response = await axios.post<ReceiptScanResult>(
      `/trips/${tripId}/expenses/scan-receipt`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 }
    );
    return response.data;
  },
};

export default receiptScanService;
