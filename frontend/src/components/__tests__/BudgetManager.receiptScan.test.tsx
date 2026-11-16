import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BudgetManager from '../BudgetManager';
import { receiptToExpenseForm } from '../../utils/receiptPrefill';

const { scanReceipt, createExpense } = vi.hoisted(() => ({
  scanReceipt: vi.fn(),
  createExpense: vi.fn(),
}));

vi.mock('../../services/receiptScan.service', () => ({
  default: { scanReceipt },
  receiptScanService: { scanReceipt },
}));

vi.mock('../../services/expense.service', () => ({
  default: {
    getExpensesByTrip: vi.fn().mockResolvedValue([]),
    getBudgetSummary: vi.fn().mockRejectedValue(new Error('no summary in this test')),
    createExpense,
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
  },
}));

vi.mock('../../services/trip.service', () => ({ default: { updateTrip: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

function renderBudget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BudgetManager tripId={7} budget={null} budgetCurrency="EUR" />
    </QueryClientProvider>
  );
}

const photo = () => new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });

describe('receiptToExpenseForm', () => {
  it('marks only fields that were read and flags a defaulted currency', () => {
    const prefill = receiptToExpenseForm(
      { merchant: 'Cafe', amount: '8.40', currency: null, date: null, category: null },
      { category: 'food', currency: 'EUR' }
    );
    expect(prefill.scanned).toEqual(['description', 'amount']);
    expect(prefill.currency).toBe('EUR');
    expect(prefill.currencyDefaulted).toBe(true);
    expect(prefill.date).toBe('');
  });
});

describe('Scan receipt on the Budget tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createExpense.mockResolvedValue({ id: 1 });
  });

  it('uses a camera-capable image input', () => {
    renderBudget();
    const input = screen.getByTestId('receipt-scan-input');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('capture', 'environment');
  });

  it('opens the expense form pre-filled and marks scanned fields, then saves through createExpense', async () => {
    scanReceipt.mockResolvedValue({
      merchant: 'Trattoria Roma',
      amount: '42.50',
      currency: 'CHF',
      date: '2026-11-10',
      category: 'food',
    });
    renderBudget();

    await userEvent.upload(screen.getByTestId('receipt-scan-input'), photo());

    await waitFor(() => expect(screen.getByLabelText(/Description/)).toHaveValue('Trattoria Roma'));
    expect(scanReceipt).toHaveBeenCalledWith(7, expect.any(File));
    expect(screen.getByLabelText(/Amount/, { selector: '#expense-amount' })).toHaveValue(42.5);
    expect(screen.getByLabelText(/Currency/, { selector: '#expense-currency' })).toHaveValue('CHF');
    expect(screen.getByLabelText(/Date/, { selector: '#expense-date' })).toHaveValue('2026-11-10');
    // description, category, amount, currency, date
    expect(screen.getAllByTestId('scan-badge')).toHaveLength(5);
    // the date badge shows the date-only value without a timezone shift
    expect(screen.getByText(/From receipt: Nov 10, 2026/)).toBeInTheDocument();

    // nothing is saved by scanning
    expect(createExpense).not.toHaveBeenCalled();

    const form = screen.getByLabelText(/Description/).closest('form') as HTMLElement;
    await userEvent.click(within(form).getByRole('button', { name: 'Add Expense' }));
    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    expect(createExpense).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        description: 'Trattoria Roma',
        amount: 42.5,
        currency: 'CHF',
        date: '2026-11-10',
        category: 'food',
      })
    );
  });

  it('does not invent a currency: falls back to the visible form default and says so', async () => {
    scanReceipt.mockResolvedValue({ merchant: 'Kiosk', amount: '3.00', currency: null, date: null, category: null });
    renderBudget();
    await userEvent.upload(screen.getByTestId('receipt-scan-input'), photo());

    await waitFor(() => expect(screen.getByLabelText(/Description/)).toHaveValue('Kiosk'));
    expect(screen.getByLabelText(/Currency/, { selector: '#expense-currency' })).toHaveValue('EUR');
    expect(screen.getByText(/The receipt showed no currency/)).toBeInTheDocument();
    expect(screen.getAllByTestId('scan-badge')).toHaveLength(2); // description + amount only
  });

  it('keeps the manual form usable when the scan fails', async () => {
    scanReceipt.mockRejectedValue(new Error('boom'));
    renderBudget();
    await userEvent.upload(screen.getByTestId('receipt-scan-input'), photo());

    await waitFor(() => expect(scanReceipt).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scan Receipt' })).toBeEnabled());
    expect(screen.queryByLabelText(/Description/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Add Expense' }));
    expect(screen.getByLabelText(/Description/)).toHaveValue('');
  });

  it('ignores a second selection while a scan is in flight (no duplicate request)', async () => {
    let resolve: (v: unknown) => void = () => {};
    scanReceipt.mockReturnValue(new Promise((r) => (resolve = r)));
    renderBudget();
    const input = screen.getByTestId('receipt-scan-input');

    fireEvent.change(input, { target: { files: [photo()] } });
    fireEvent.change(input, { target: { files: [photo()] } });

    expect(scanReceipt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Reading receipt/ })).toBeDisabled();
    resolve({ merchant: 'A', amount: null, currency: null, date: null, category: null });
    await waitFor(() => expect(screen.getByLabelText(/Description/)).toHaveValue('A'));
  });
});
