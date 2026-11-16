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
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

vi.mock('../../services/expense.service', () => ({
  default: { getSettleUp: vi.fn() },
}));

import SettleUpPanel from '../SettleUpPanel';
import ExpenseSplitFields from '../ExpenseSplitFields';
import expenseService from '../../services/expense.service';
import type { ExpenseParticipant, SettleUpSummary } from '../../types/expense';
import { emptySplitState, type SplitFormState } from '../../utils/expenseSplit';

const mockGetSettleUp = expenseService.getSettleUp as ReturnType<typeof vi.fn>;

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
    { participant: 'owner', label: 'dana', paid: 90, owed: 30, net: 60 },
    { participant: 'companion:5', label: 'Alex', paid: 0, owed: 30, net: -30 },
    { participant: 'companion:6', label: 'Sam', paid: 0, owed: 30, net: -30 },
  ],
  transfers: [
    { from: 'companion:5', fromLabel: 'Alex', to: 'owner', toLabel: 'dana', amount: 30 },
    { from: 'companion:6', fromLabel: 'Sam', to: 'owner', toLabel: 'dana', amount: 30 },
  ],
  unconverted: [],
  unsplit: [],
  isComplete: true,
};

describe('SettleUpPanel', () => {
  beforeEach(() => vi.clearAllMocks());

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
});
