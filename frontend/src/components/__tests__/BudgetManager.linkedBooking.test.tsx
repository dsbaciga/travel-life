import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BudgetManager from '../BudgetManager';

const { getExpenses } = vi.hoisted(() => ({ getExpenses: vi.fn() }));

vi.mock('../../services/expense.service', () => ({
  default: {
    getExpensesByTrip: getExpenses,
    getBudgetSummary: vi.fn().mockRejectedValue(new Error('no summary in this test')),
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    uploadReceipt: vi.fn(),
    deleteReceipt: vi.fn(),
    deleteExpense: vi.fn(),
  },
}));
vi.mock('../../services/trip.service', () => ({ default: { updateTrip: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

const expense = (overrides: Record<string, unknown>) => ({
  id: 1,
  tripId: 7,
  description: 'Dinner',
  category: 'food',
  amount: 20,
  currency: 'EUR',
  exchangeRate: null,
  baseAmount: null,
  baseCurrency: null,
  date: '2027-01-11T00:00:00.000Z',
  notes: null,
  paidBy: null,
  splitMethod: null,
  splits: [],
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  linkedEntity: null,
  ...overrides,
});

function renderBudget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BudgetManager tripId={7} budget={null} budgetCurrency="EUR" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Budget tab: expenses that are a booking cost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a booking-linked expense and links to the booking it belongs to', async () => {
    getExpenses.mockResolvedValue([
      expense({ id: 1, description: 'Hotel Paris', category: 'lodging', amount: 640, linkedEntity: { type: 'lodging', id: 68, name: 'Hotel Paris' } }),
      expense({ id: 2, description: 'Taxi', category: 'transportation' }),
    ]);
    renderBudget();

    const badge = await screen.findByTestId('linked-booking-badge');
    expect(badge).toHaveTextContent('Lodging: Hotel Paris');
    expect(badge).toHaveAttribute('href', '/trips/7?tab=lodging&edit=68');
    // an ordinary expense carries no such marker
    expect(screen.getAllByTestId('linked-booking-badge')).toHaveLength(1);
    expect(await screen.findByText('Taxi')).toBeInTheDocument();
  });

  it('sends every kind of booking to its own tab', async () => {
    getExpenses.mockResolvedValue([
      expense({ id: 1, description: 'A', linkedEntity: { type: 'activity', id: 1, name: 'A' } }),
      expense({ id: 2, description: 'T', linkedEntity: { type: 'transportation', id: 2, name: 'T' } }),
      expense({ id: 3, description: 'C', linkedEntity: { type: 'customItem', id: 3, name: 'C' } }),
    ]);
    renderBudget();

    const badges = await screen.findAllByTestId('linked-booking-badge');
    expect(badges.map((b) => b.getAttribute('href'))).toEqual([
      '/trips/7?tab=activities&edit=1',
      '/trips/7?tab=transportation&edit=2',
      '/trips/7?tab=custom&edit=3',
    ]);
  });
});
