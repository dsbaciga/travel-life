/**
 * Settle-up UI Tests
 *
 * Test cases:
 * - SUP-001: SettleUpPanel shows per-person totals and the payments that settle them
 * - SUP-002: SettleUpPanel lists excluded (unconverted) expenses instead of hiding them
 * - SUP-003: SettleUpPanel says everyone is settled when there is nothing to pay
 * - SUP-004: SettleUpPanel renders nothing when no expense is split
 * - SUP-005: ExpenseSplitFields hides the split options until a payer is chosen
 * - SUP-006: ExpenseSplitFields defaults to sharing with everyone, and shows the running gap
 * - SUP-007: ExpenseSplitFields warns when a stored share belongs to someone no longer on the trip
 * - SUP-008: "Record payment" opens a form pre-filled from the suggested payment and saves it
 * - SUP-009: recorded payments are listed with their date and can be edited
 * - SUP-010: deleting a recorded payment asks first, then removes it and refreshes
 * - SUP-011: payments with no exchange rate are listed as not counted
 * - SUP-012: the form refuses the same person on both sides without calling the API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

vi.mock('../../services/expense.service', () => ({
  default: {
    getSettleUp: vi.fn(),
    getSettlements: vi.fn(),
    getParticipants: vi.fn(),
    createSettlement: vi.fn(),
    updateSettlement: vi.fn(),
    deleteSettlement: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import SettleUpPanel from '../SettleUpPanel';
import ExpenseSplitFields from '../ExpenseSplitFields';
import expenseService from '../../services/expense.service';
import toast from 'react-hot-toast';
import type { ExpenseParticipant, SettleUpSummary, TripSettlement } from '../../types/expense';
import { emptySplitState, type SplitFormState } from '../../utils/expenseSplit';

const mockGetSettleUp = expenseService.getSettleUp as ReturnType<typeof vi.fn>;
const mockGetSettlements = expenseService.getSettlements as ReturnType<typeof vi.fn>;
const mockGetParticipants = expenseService.getParticipants as ReturnType<typeof vi.fn>;
const mockCreateSettlement = expenseService.createSettlement as ReturnType<typeof vi.fn>;
const mockUpdateSettlement = expenseService.updateSettlement as ReturnType<typeof vi.fn>;
const mockDeleteSettlement = expenseService.deleteSettlement as ReturnType<typeof vi.fn>;

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettleUpPanel tripId={1} />
    </QueryClientProvider>
  );
}

const summary: SettleUpSummary = {
  currency: 'USD',
  balances: [
    { participant: 'owner', label: 'dana', paid: 90, owed: 30, settledOut: 0, settledIn: 0, net: 60 },
    { participant: 'companion:5', label: 'Alex', paid: 0, owed: 30, settledOut: 0, settledIn: 0, net: -30 },
    { participant: 'companion:6', label: 'Sam', paid: 0, owed: 30, settledOut: 0, settledIn: 0, net: -30 },
  ],
  transfers: [
    { from: 'companion:5', fromLabel: 'Alex', to: 'owner', toLabel: 'dana', amount: 30 },
    { from: 'companion:6', fromLabel: 'Sam', to: 'owner', toLabel: 'dana', amount: 30 },
  ],
  unconverted: [],
  unconvertedSettlements: [],
  unsplit: [],
  isComplete: true,
};

const people: ExpenseParticipant[] = [
  { key: 'owner', label: 'dana', kind: 'owner' },
  { key: 'companion:5', label: 'Alex', kind: 'companion' },
  { key: 'companion:6', label: 'Sam', kind: 'companion' },
];

const recorded: TripSettlement = {
  id: 7,
  tripId: 1,
  from: 'companion:5',
  fromLabel: 'Alex',
  to: 'owner',
  toLabel: 'dana',
  amount: 10,
  currency: 'USD',
  date: '2026-05-03',
  notes: 'Cash at the airport',
  createdAt: '2026-05-03T10:00:00.000Z',
  updatedAt: '2026-05-03T10:00:00.000Z',
};

describe('SettleUpPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettlements.mockResolvedValue([]);
    mockGetParticipants.mockResolvedValue(people);
  });

  it('SUP-001: shows per-person totals and the payments that settle them', async () => {
    mockGetSettleUp.mockResolvedValue(summary);
    renderPanel();

    expect(await screen.findByText('Settle Up')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /dana/ })).toHaveTextContent('gets back');
    expect(screen.getByRole('row', { name: /Alex/ })).toHaveTextContent('owes');
    expect(screen.getByText(/2 payments/)).toBeInTheDocument();
    expect(screen.getAllByText(/pays/)).toHaveLength(2);
  });

  it('SUP-002: lists excluded expenses instead of hiding them', async () => {
    mockGetSettleUp.mockResolvedValue({
      ...summary,
      unconverted: [{ expenseId: 2, description: 'Taxi', currency: 'XYZ', amount: 50 }],
      unsplit: [{ expenseId: 3, description: 'Museum' }],
      isComplete: false,
    });
    renderPanel();

    expect(await screen.findByText('Not included in the settlement')).toBeInTheDocument();
    expect(screen.getByText(/Taxi/)).toBeInTheDocument();
    expect(screen.getByText(/1 expense has no payer or split/)).toBeInTheDocument();
  });

  it('SUP-003: says everyone is settled when there are no payments', async () => {
    mockGetSettleUp.mockResolvedValue({
      ...summary,
      balances: summary.balances.map((b) => ({ ...b, net: 0 })),
      transfers: [],
    });
    renderPanel();
    expect(await screen.findByText('Everyone is settled up.')).toBeInTheDocument();
  });

  it('SUP-004: renders nothing when no expense is split', async () => {
    mockGetSettleUp.mockResolvedValue({ ...summary, balances: [], transfers: [] });
    const { container } = renderPanel();
    await vi.waitFor(() => expect(mockGetSettleUp).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SettleUpPanel recorded payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettleUp.mockResolvedValue(summary);
    mockGetSettlements.mockResolvedValue([]);
    mockGetParticipants.mockResolvedValue(people);
  });

  it('SUP-008: Record payment opens a pre-filled form and saves it', async () => {
    mockCreateSettlement.mockResolvedValue(recorded);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Record payment from Alex to dana' }));

    expect(await screen.findByRole('heading', { name: /Record Payment/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Paid by')).toHaveValue('companion:5'));
    expect(screen.getByLabelText('Paid to')).toHaveValue('owner');
    expect(screen.getByLabelText('Amount')).toHaveValue(30);
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-05-04' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '  Venmo ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() =>
      expect(mockCreateSettlement).toHaveBeenCalledWith(1, {
        from: 'companion:5',
        to: 'owner',
        amount: 12.5,
        currency: 'USD',
        date: '2026-05-04',
        notes: 'Venmo',
      })
    );
    // Both queries are refreshed so the suggested payments shrink.
    await waitFor(() => expect(mockGetSettleUp.mock.calls.length).toBeGreaterThan(1));
    expect(mockGetSettlements.mock.calls.length).toBeGreaterThan(1);
    expect(toast.success).toHaveBeenCalledWith('Payment recorded');
  });

  it('SUP-009: lists recorded payments with their date and edits one', async () => {
    mockGetSettlements.mockResolvedValue([recorded]);
    mockUpdateSettlement.mockResolvedValue({ ...recorded, amount: 15 });
    renderPanel();

    expect(await screen.findByText('Payments recorded')).toBeInTheDocument();
    expect(screen.getByText(/May 3, 2026/)).toHaveTextContent('Cash at the airport');

    fireEvent.click(screen.getByRole('button', { name: 'Edit payment from Alex to dana' }));
    expect(await screen.findByRole('heading', { name: /Edit Payment/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Paid by')).toHaveValue('companion:5'));
    expect(screen.getByLabelText('Date')).toHaveValue('2026-05-03');

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Payment' }));

    await waitFor(() =>
      expect(mockUpdateSettlement).toHaveBeenCalledWith(
        1,
        7,
        expect.objectContaining({ amount: 15, from: 'companion:5', to: 'owner', date: '2026-05-03' })
      )
    );
    expect(mockCreateSettlement).not.toHaveBeenCalled();
  });

  it('SUP-010: deleting asks first, then removes the payment', async () => {
    mockGetSettlements.mockResolvedValue([recorded]);
    mockDeleteSettlement.mockResolvedValue(undefined);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete payment from Alex to dana' }));
    expect(mockDeleteSettlement).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockDeleteSettlement).toHaveBeenCalledWith(1, 7));
    await waitFor(() => expect(mockGetSettleUp.mock.calls.length).toBeGreaterThan(1));
  });

  it('SUP-011: lists payments with no exchange rate as not counted', async () => {
    mockGetSettleUp.mockResolvedValue({
      ...summary,
      unconvertedSettlements: [
        {
          settlementId: 7,
          from: 'companion:5',
          fromLabel: 'Alex',
          to: 'owner',
          toLabel: 'dana',
          currency: 'XYZ',
          amount: 20,
        },
      ],
      isComplete: false,
    });
    renderPanel();

    expect(await screen.findByText('Payments not counted')).toBeInTheDocument();
    expect(screen.getByText(/Alex paid dana/)).toHaveTextContent('XYZ');
  });

  it('SUP-012: refuses the same person on both sides without calling the API', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment from Alex to dana' }));
    await waitFor(() => expect(screen.getByLabelText('Paid by')).toHaveValue('companion:5'));

    fireEvent.change(screen.getByLabelText('Paid to'), { target: { value: 'companion:5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Choose two different people'));
    expect(mockCreateSettlement).not.toHaveBeenCalled();
  });
});

const participants: ExpenseParticipant[] = [
  { key: 'owner', label: 'dana', kind: 'owner' },
  { key: 'companion:5', label: 'Alex', kind: 'companion' },
];

function Harness({ initial = emptySplitState(), total = 100 }: { initial?: SplitFormState; total?: number }) {
  const [state, setState] = useState(initial);
  return (
    <ExpenseSplitFields
      participants={participants}
      state={state}
      onChange={setState}
      total={total}
      currency="EUR"
    />
  );
}

describe('ExpenseSplitFields', () => {
  it('SUP-005: hides the split options until a payer is chosen', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Split')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Paid by'), { target: { value: 'companion:5' } });
    expect(screen.getByLabelText('Split')).toBeInTheDocument();
  });

  it('SUP-006: defaults to sharing with everyone and shows the running gap', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Paid by'), { target: { value: 'owner' } });

    expect(screen.getByLabelText('dana')).toBeChecked();
    expect(screen.getByLabelText('Alex')).toBeChecked();

    fireEvent.change(screen.getByLabelText('Split'), { target: { value: 'amount' } });
    fireEvent.change(screen.getByLabelText('Amount for dana'), { target: { value: '60' } });
    expect(screen.getByRole('status')).toHaveTextContent('40.00 EUR left to assign');

    fireEvent.change(screen.getByLabelText('Amount for Alex'), { target: { value: '40' } });
    expect(screen.getByRole('status')).toHaveTextContent('Amounts add up to the total.');
  });

  it('SUP-007: warns, by name, when a stored share belongs to someone no longer on the trip', () => {
    const initial: SplitFormState = {
      paidBy: 'owner',
      method: 'amount',
      included: { owner: true, 'companion:5': true, 'companion:9': true },
      amounts: { owner: '50', 'companion:5': '30', 'companion:9': '20' },
      percentages: {},
    };
    const { rerender } = render(
      <ExpenseSplitFields
        participants={participants}
        state={initial}
        onChange={() => {}}
        total={100}
        currency="EUR"
        formerLabels={new Map([['companion:9', 'Sam']])}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sam is no longer on this trip. When you save, the shares will be recalculated without them'
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Cancel to leave this expense as it is');

    // Without a name it still says so.
    rerender(
      <ExpenseSplitFields
        participants={participants}
        state={initial}
        onChange={() => {}}
        total={100}
        currency="EUR"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('A former travel companion is no longer on this trip');
  });

  it('SUP-007b: no warning when everyone in the split is still a participant', () => {
    render(<Harness initial={{ ...emptySplitState(), paidBy: 'owner', included: { owner: true, 'companion:5': true } }} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
