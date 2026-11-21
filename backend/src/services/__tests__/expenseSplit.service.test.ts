/**
 * Expense Split Service Tests
 *
 * Test cases:
 * - ESP-001: setSplit stores an equal split whose shares sum exactly to the amount
 * - ESP-002: setSplit validates custom amounts and percentages
 * - ESP-003: setSplit rejects people who are not on the trip, and duplicates
 * - ESP-004: setSplit with paidBy null clears the payer and shares
 * - ESP-005: getSettleUp computes balances/transfers in the budget-summary currency
 * - ESP-006: getSettleUp excludes unconverted and unsplit expenses and reports them
 * - ESP-007: getParticipants lists the owner and non-self companions
 * - ESP-008: access control - edit permission is required to set a split
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  trip: { findFirst: jest.fn() },
  user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  tripExpense: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  tripExpenseSplit: { deleteMany: jest.fn() },
  tripCompanion: { findMany: jest.fn() },
  travelCompanion: { findMany: jest.fn(), findFirst: jest.fn() },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

jest.mock('../expense.service', () => ({
  __esModule: true,
  default: {
    getBudgetSummary: jest.fn(),
    resolveExpenseBaseAmount: jest.fn(),
  },
}));

import { Prisma } from '@prisma/client';
import expenseService from '../expense.service';
import expenseSplitService from '../expenseSplit.service';

const mockSummary = expenseService.getBudgetSummary as jest.MockedFunction<
  typeof expenseService.getBudgetSummary
>;
const mockBase = expenseService.resolveExpenseBaseAmount as jest.MockedFunction<
  typeof expenseService.resolveExpenseBaseAmount
>;

/** Id of the trip owner's "myself" companion in these tests. */
const OWNER_COMPANION = 90;

const D = (v: string | number) => new Prisma.Decimal(v);

function stubTrip(overrides: Record<string, unknown> = {}) {
  mockPrisma.trip.findFirst.mockResolvedValue({
    id: 10,
    userId: 1,
    title: 'Trip',
    privacyLevel: 'private',
    collaborators: [],
    ...overrides,
  });
}

function stubParticipants() {
  mockPrisma.user.findUnique.mockResolvedValue({ username: 'dana' });
  mockPrisma.tripCompanion.findMany.mockResolvedValue([
    { companion: { id: 5, name: 'Alex' } },
    { companion: { id: 6, name: 'Sam' } },
  ]);
}

/** The data passed to the (single) tripExpense.update call. */
function lastUpdateData() {
  const call = mockPrisma.tripExpense.update.mock.calls[0][0] as {
    data: {
      paidByCompanionId: number | null;
      splitMethod: string | null;
      splits?: { create: Array<{ companionId: number; amount: Prisma.Decimal; percentage: Prisma.Decimal | null }> };
    };
  };
  return call.data;
}

describe('ExpenseSplitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubTrip();
    stubParticipants();
    mockPrisma.tripExpense.findFirst.mockResolvedValue({ id: 1, tripId: 10, amount: D('100.00') });
    mockPrisma.tripExpense.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      amount: D('100.00'),
      paidByCompanionId: OWNER_COMPANION,
      splits: [],
    });
    // The trip owner's "myself" companion; interactive transactions run against the same mock.
    mockPrisma.travelCompanion.findFirst.mockResolvedValue({ id: OWNER_COMPANION });
    mockPrisma.$transaction.mockImplementation((async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(mockPrisma) : []) as never);
  });

  describe('ESP-001: equal split', () => {
    it('stores shares that sum exactly, odd cent on the first participant', async () => {
      await expenseSplitService.setSplit(1, 10, 1, {
        paidBy: 'owner',
        method: 'equal',
        participants: [{ participant: 'companion:5' }, { participant: 'owner' }, { participant: 'companion:6' }],
      });

      const data = lastUpdateData();
      expect(data.paidByCompanionId).toBe(OWNER_COMPANION);
      expect(data.splitMethod).toBe('equal');
      const rows = data.splits?.create ?? [];
      expect(rows.map((r) => r.amount.toString())).toEqual(['33.34', '33.33', '33.33']);
      expect(rows.map((r) => r.companionId)).toEqual([OWNER_COMPANION, 5, 6]);
      expect(rows.reduce((s, r) => s.add(r.amount), D(0)).eq(D(100))).toBe(true);
    });

    it('records a companion payer', async () => {
      await expenseSplitService.setSplit(1, 10, 1, {
        paidBy: 'companion:5',
        method: 'equal',
        participants: [{ participant: 'owner' }, { participant: 'companion:5' }],
      });
      const data = lastUpdateData();
      expect(data.paidByCompanionId).toBe(5);
    });
  });

  describe('ESP-001b: the owner is the owner of the trip, as their myself companion', () => {
    it('creates it on demand (named after the trip owner) in the same transaction', async () => {
      // A collaborator (user 2) edits a trip owned by user 1 that has no "myself" companion yet.
      stubTrip({ userId: 1, collaborators: [{ userId: 2, permissionLevel: 'edit' }] });
      mockPrisma.travelCompanion.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 123 });
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ username: 'dana' });

      await expenseSplitService.setSplit(2, 10, 1, {
        paidBy: 'owner',
        method: 'equal',
        participants: [{ participant: 'owner' }, { participant: 'companion:5' }],
      });

      expect(mockPrisma.travelCompanion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1, isMyself: true } })
      );
      expect(mockPrisma.user.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } })
      );
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      const data = lastUpdateData();
      expect(data.paidByCompanionId).toBe(123);
      expect(data.splits?.create.map((r) => r.companionId)).toEqual([123, 5]);
    });
  });

  describe('ESP-002: custom amounts and percentages', () => {
    it('accepts amounts that add up', async () => {
      await expenseSplitService.setSplit(1, 10, 1, {
        paidBy: 'owner',
        method: 'amount',
        participants: [
          { participant: 'owner', amount: 70 },
          { participant: 'companion:5', amount: 30 },
        ],
      });
      expect(lastUpdateData().splits?.create.map((r) => r.amount.toString())).toEqual(['70', '30']);
    });

    it('rejects amounts that do not add up', async () => {
      await expect(
        expenseSplitService.setSplit(1, 10, 1, {
          paidBy: 'owner',
          method: 'amount',
          participants: [
            { participant: 'owner', amount: 70 },
            { participant: 'companion:5', amount: 20 },
          ],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('splits by percentage and keeps the percentage', async () => {
      await expenseSplitService.setSplit(1, 10, 1, {
        paidBy: 'owner',
        method: 'percentage',
        participants: [
          { participant: 'owner', percentage: 60 },
          { participant: 'companion:5', percentage: 40 },
        ],
      });
      const rows = lastUpdateData().splits?.create ?? [];
      expect(rows.map((r) => r.amount.toString())).toEqual(['60', '40']);
      expect(rows.map((r) => r.percentage?.toString())).toEqual(['60', '40']);
    });

    it('rejects percentages that do not total 100', async () => {
      await expect(
        expenseSplitService.setSplit(1, 10, 1, {
          paidBy: 'owner',
          method: 'percentage',
          participants: [
            { participant: 'owner', percentage: 60 },
            { participant: 'companion:5', percentage: 30 },
          ],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('requires a method and participants when a payer is set', async () => {
      await expect(
        expenseSplitService.setSplit(1, 10, 1, { paidBy: 'owner', participants: [{ participant: 'owner' }] })
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        expenseSplitService.setSplit(1, 10, 1, { paidBy: 'owner', method: 'equal', participants: [] })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('ESP-003: participants must be on the trip', () => {
    it('rejects a companion who is not linked to the trip', async () => {
      await expect(
        expenseSplitService.setSplit(1, 10, 1, {
          paidBy: 'owner',
          method: 'equal',
          participants: [{ participant: 'owner' }, { participant: 'companion:99' }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a payer who is not on the trip', async () => {
      await expect(
        expenseSplitService.setSplit(1, 10, 1, {
          paidBy: 'companion:99',
          method: 'equal',
          participants: [{ participant: 'owner' }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects the same person twice', async () => {
      await expect(
        expenseSplitService.setSplit(1, 10, 1, {
          paidBy: 'owner',
          method: 'equal',
          participants: [{ participant: 'owner' }, { participant: 'owner' }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('404s for an expense that is not on this trip', async () => {
      mockPrisma.tripExpense.findFirst.mockResolvedValue(null);
      await expect(
        expenseSplitService.setSplit(1, 10, 1, { paidBy: null })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('ESP-004: clearing', () => {
    it('removes shares and the payer when paidBy is null', async () => {
      await expenseSplitService.setSplit(1, 10, 1, { paidBy: null });
      expect(mockPrisma.tripExpenseSplit.deleteMany).toHaveBeenCalledWith({ where: { expenseId: 1 } });
      expect(lastUpdateData()).toEqual({ paidByCompanionId: null, splitMethod: null });
    });
  });

  describe('ESP-005/006: settle-up', () => {
    const row = (overrides: Record<string, unknown>) => ({
      id: 1,
      description: 'Dinner',
      category: 'food',
      amount: D('90.00'),
      currency: 'USD',
      exchangeRate: null,
      baseAmount: null,
      baseCurrency: null,
      date: null,
      paidByCompanionId: OWNER_COMPANION,
      splits: [
        { companionId: OWNER_COMPANION, amount: D('30.00'), percentage: null },
        { companionId: 5, amount: D('30.00'), percentage: null },
        { companionId: 6, amount: D('30.00'), percentage: null },
      ],
      ...overrides,
    });

    beforeEach(() => {
      mockSummary.mockResolvedValue({ currency: 'USD' } as Awaited<ReturnType<typeof expenseService.getBudgetSummary>>);
      mockBase.mockImplementation(async (expense) => expense.amount);
    });

    it('computes balances and transfers', async () => {
      mockPrisma.tripExpense.findMany.mockResolvedValue([row({})]);

      const result = await expenseSplitService.getSettleUp(1, 10);

      expect(result.currency).toBe('USD');
      expect(result.isComplete).toBe(true);
      expect(result.balances.find((b) => b.participant === 'owner')).toMatchObject({
        label: 'dana',
        paid: 90,
        owed: 30,
        net: 60,
      });
      expect(result.transfers).toEqual([
        { from: 'companion:5', fromLabel: 'Alex', to: 'owner', toLabel: 'dana', amount: 30 },
        { from: 'companion:6', fromLabel: 'Sam', to: 'owner', toLabel: 'dana', amount: 30 },
      ]);
    });

    it('excludes unconverted and unsplit expenses and reports them', async () => {
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        row({}),
        row({ id: 2, description: 'Taxi', currency: 'XYZ', amount: D('50.00'), splits: [
          { companionId: OWNER_COMPANION, amount: D('25.00'), percentage: null },
          { companionId: 5, amount: D('25.00'), percentage: null },
        ] }),
        row({ id: 3, description: 'Museum', paidByCompanionId: null, splits: [] }),
      ]);
      mockBase.mockImplementation(async (expense) => (expense.currency === 'XYZ' ? null : expense.amount));

      const result = await expenseSplitService.getSettleUp(1, 10);

      expect(result.isComplete).toBe(false);
      expect(result.unconverted).toEqual([
        { expenseId: 2, description: 'Taxi', currency: 'XYZ', amount: 50 },
      ]);
      expect(result.unsplit).toEqual([{ expenseId: 3, description: 'Museum' }]);
      // Unsplit expenses are never sent to the FX layer.
      expect(mockBase).not.toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), 'USD');
      // Balances come from expense 1 only.
      expect(result.balances.find((b) => b.participant === 'owner')?.paid).toBe(90);
    });

    it('treats a split that no longer adds up as unsplit', async () => {
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        row({ splits: [{ companionId: OWNER_COMPANION, amount: D('30.00'), percentage: null }] }),
      ]);
      const result = await expenseSplitService.getSettleUp(1, 10);
      expect(result.unsplit).toHaveLength(1);
      expect(result.transfers).toEqual([]);
    });

    it('names a companion who was unlinked from the trip after being used', async () => {
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        row({
          splits: [
            { companionId: OWNER_COMPANION, amount: D('45.00'), percentage: null },
            { companionId: 77, amount: D('45.00'), percentage: null },
          ],
        }),
      ]);
      mockPrisma.travelCompanion.findMany.mockResolvedValue([{ id: 77, name: 'Robin' }]);
      const result = await expenseSplitService.getSettleUp(1, 10);
      expect(result.transfers[0]).toMatchObject({ from: 'companion:77', fromLabel: 'Robin' });
    });
  });

  describe('ESP-007: participants', () => {
    it('lists the owner first, then the trip companions', async () => {
      const result = await expenseSplitService.getParticipants(1, 10);
      expect(result).toEqual([
        { key: 'owner', label: 'dana', kind: 'owner' },
        { key: 'companion:5', label: 'Alex', kind: 'companion' },
        { key: 'companion:6', label: 'Sam', kind: 'companion' },
      ]);
      // The owner's own companion record is excluded to avoid listing them twice.
      expect(mockPrisma.tripCompanion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tripId: 10, companion: { isMyself: false } } })
      );
    });
  });

  describe('ESP-008: access control', () => {
    it('requires edit permission to set a split', async () => {
      stubTrip({ userId: 2, collaborators: [{ permissionLevel: 'view' }] });
      await expect(
        expenseSplitService.setSplit(1, 10, 1, { paidBy: null })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lets a viewer read settle-up', async () => {
      stubTrip({ userId: 2, collaborators: [{ permissionLevel: 'view' }] });
      mockSummary.mockResolvedValue({ currency: 'USD' } as Awaited<ReturnType<typeof expenseService.getBudgetSummary>>);
      mockPrisma.tripExpense.findMany.mockResolvedValue([]);
      await expect(expenseSplitService.getSettleUp(1, 10)).resolves.toMatchObject({ transfers: [] });
    });
  });
});
