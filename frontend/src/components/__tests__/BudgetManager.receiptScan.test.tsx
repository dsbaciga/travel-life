import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BudgetManager from '../BudgetManager';
import { receiptToExpenseForm } from '../../utils/receiptPrefill';

const { scanReceipt, createExpense, uploadReceipt, deleteReceipt, updateExpense, getExpenses, toastError } = vi.hoisted(() => ({
  scanReceipt: vi.fn(),
  createExpense: vi.fn(),
  uploadReceipt: vi.fn(),
  deleteReceipt: vi.fn(),
  updateExpense: vi.fn(),
  getExpenses: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../services/receiptScan.service', () => ({
  default: { scanReceipt },
  receiptScanService: { scanReceipt },
}));

vi.mock('../../services/expense.service', () => ({
  default: {
    getExpensesByTrip: getExpenses,
    getBudgetSummary: vi.fn().mockRejectedValue(new Error('no summary in this test')),
    createExpense,
    updateExpense,
    uploadReceipt,
    deleteReceipt,
    deleteExpense: vi.fn(),
  },
}));

vi.mock('../../services/trip.service', () => ({ default: { updateTrip: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: toastError, success: vi.fn() } }));

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
    uploadReceipt.mockResolvedValue({ id: 1 });
    deleteReceipt.mockResolvedValue({ id: 1 });
    updateExpense.mockResolvedValue({ id: 3 });
    getExpenses.mockResolvedValue([]);
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
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

    // nothing is saved or uploaded by scanning
    expect(createExpense).not.toHaveBeenCalled();
    expect(uploadReceipt).not.toHaveBeenCalled();

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));
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
    // the scanned photo is attached to the expense that was just created
    await waitFor(() => expect(uploadReceipt).toHaveBeenCalledTimes(1));
    expect(uploadReceipt).toHaveBeenCalledWith(7, 1, expect.any(File));
    expect(createExpense.mock.invocationCallOrder[0]).toBeLessThan(uploadReceipt.mock.invocationCallOrder[0]);
  });

  it('keeps the expense and says the receipt was not attached when the upload fails', async () => {
    scanReceipt.mockResolvedValue({ merchant: 'Cafe', amount: '5.00', currency: 'EUR', date: null, category: null });
    uploadReceipt.mockRejectedValue(new Error('network'));
    renderBudget();
    await userEvent.upload(screen.getByTestId('receipt-scan-input'), photo());
    await waitFor(() => expect(screen.getByLabelText(/Description/)).toHaveValue('Cafe'));

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/expense was saved, but the receipt photo was not attached.*try again/i);
    expect(createExpense).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByLabelText(/Description/)).not.toBeInTheDocument());
  });

  it('does not carry a receipt over to the next expense', async () => {
    scanReceipt.mockResolvedValue({ merchant: 'One', amount: '1.00', currency: 'EUR', date: null, category: null });
    renderBudget();
    await userEvent.upload(screen.getByTestId('receipt-scan-input'), photo());
    await waitFor(() => expect(screen.getByLabelText(/Description/)).toHaveValue('One'));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(uploadReceipt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByLabelText(/Description/)).not.toBeInTheDocument());

    createExpense.mockResolvedValue({ id: 2 });
    await userEvent.click(screen.getByRole('button', { name: '+ Add expense' }));
    expect(screen.queryByAltText('Receipt thumbnail')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Description/), 'Two');
    await userEvent.type(screen.getByLabelText(/Amount/, { selector: '#expense-amount' }), '2');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(2));
    expect(uploadReceipt).toHaveBeenCalledTimes(1);
  });

  it('a double submit saves and uploads once', async () => {
    scanReceipt.mockResolvedValue({ merchant: 'Dbl', amount: '1.00', currency: 'EUR', date: null, category: null });
    let finish: (v: unknown) => void = () => {};
    createExpense.mockReturnValue(new Promise((r) => (finish = r)));
    renderBudget();
    await userEvent.upload(screen.getByTestId('receipt-scan-input'), photo());
    await waitFor(() => expect(screen.getByLabelText(/Description/)).toHaveValue('Dbl'));
    const form = screen.getByLabelText(/Description/).closest('form') as HTMLElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    finish({ id: 9 });
    await waitFor(() => expect(uploadReceipt).toHaveBeenCalledTimes(1));
    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(uploadReceipt).toHaveBeenCalledWith(7, 9, expect.any(File));
  });

  describe('existing expenses', () => {
    const existing = {
      id: 3, tripId: 7, description: 'Taxi', category: 'transportation', amount: 20, currency: 'EUR',
      exchangeRate: null, baseAmount: null, baseCurrency: null, date: null, notes: null,
      paidBy: null, splitMethod: null, splits: [],
      receiptPath: '/uploads/receipts/abc.jpg', createdAt: '', updatedAt: '',
    };

    it('shows a receipt indicator that opens the image, only when one is attached', async () => {
      getExpenses.mockResolvedValue([existing, { ...existing, id: 4, description: 'Bus', receiptPath: null }]);
      renderBudget();
      expect(await screen.findByLabelText('View receipt for Taxi')).toBeInTheDocument();
      expect(screen.queryByLabelText('View receipt for Bus')).not.toBeInTheDocument();
      await userEvent.click(screen.getByLabelText('View receipt for Taxi'));
      expect(screen.getByRole('img', { name: 'Receipt for Taxi' })).toHaveAttribute(
        'src',
        expect.stringContaining('/uploads/receipts/abc.jpg')
      );
    });

    it('replaces the receipt from the edit form', async () => {
      getExpenses.mockResolvedValue([existing]);
      renderBudget();
      await userEvent.click(await screen.findByLabelText('Edit Taxi'));
      expect(screen.getByAltText('Receipt thumbnail')).toBeInTheDocument();
      await userEvent.upload(screen.getByTestId('expense-receipt-input'), photo());
      await userEvent.click(screen.getByRole('button', { name: 'Update expense' }));
      await waitFor(() => expect(uploadReceipt).toHaveBeenCalledWith(7, 3, expect.any(File)));
      expect(deleteReceipt).not.toHaveBeenCalled();
    });

    it('removes the receipt from the edit form', async () => {
      getExpenses.mockResolvedValue([existing]);
      renderBudget();
      await userEvent.click(await screen.findByLabelText('Edit Taxi'));
      await userEvent.click(screen.getByRole('button', { name: 'Remove receipt' }));
      expect(screen.queryByAltText('Receipt thumbnail')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Update expense' }));
      await waitFor(() => expect(deleteReceipt).toHaveBeenCalledWith(7, 3));
      expect(uploadReceipt).not.toHaveBeenCalled();
    });
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
    await userEvent.click(screen.getByRole('button', { name: '+ Add expense' }));
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
