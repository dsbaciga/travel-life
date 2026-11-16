/**
 * Expense Service Tests
 *
 * Test cases:
 * - EXP-001: Create expense freezes an FX snapshot at the transaction date
 * - EXP-002: Create expense stores null snapshot fields when no rate exists
 * - EXP-003: Update expense re-snapshots only when amount/currency/date change
 * - EXP-004: Budget summary converts mixed currencies instead of naive summing
 * - EXP-005: Budget summary excludes and reports amounts it cannot convert
 * - EXP-006: Budget summary uses a frozen snapshot without re-fetching a rate
 * - EXP-007: Budget summary lazily backfills and persists legacy rows
 * - EXP-008: Budget summary reports records with no currency as assumed-base
 * - EXP-009: Budget summary reporting currency falls back owner -> trip -> common -> USD
 * - EXP-010: Budget summary restates the trip budget in the reporting currency
 * - EXP-011: Budget summary routes each record to the correct breakdown bucket
 * - EXP-012: Access control - view/edit permission is enforced
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the database config
const mockPrisma = {
  trip: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  tripExpense: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  tripExpenseSplit: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
  activity: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  transportation: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  lodging: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  customItem: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock the FX service — no test may reach the network
jest.mock('../exchangeRate.service', () => {
  const actual = jest.requireActual<typeof import('../exchangeRate.service')>(
    '../exchangeRate.service'
  );
  return {
    __esModule: true,
    default: { convert: jest.fn(), getRate: jest.fn(), clearFailureCache: jest.fn() },
    // The pure helpers carry no I/O, so use the real implementations.
    isCurrencyCode: actual.isCurrencyCode,
    normalizeCurrency: actual.normalizeCurrency,
  };
});

import { Prisma } from '@prisma/client';
import expenseService from '../expense.service';
import exchangeRateService from '../exchangeRate.service';

const mockConvert = exchangeRateService.convert as jest.MockedFunction<
  typeof exchangeRateService.convert
>;

/** Builds the shape exchangeRateService.convert resolves to. */
function conversion(rate: string, baseAmount: string, baseCurrency = 'USD') {
  return {
    exchangeRate: new Prisma.Decimal(rate),
    baseAmount: new Prisma.Decimal(baseAmount),
    baseCurrency,
    precision: 'exact' as const,
  };
}

/** A trip owned by user 1, as returned by verifyTripAccessWithPermission. */
function ownedTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: 1,
    title: 'Test Trip',
    privacyLevel: 'private',
    collaborators: [],
    ...overrides,
  };
}

/** Wires up an empty budget-summary dataset that individual tests override. */
function stubEmptyBudgetData() {
  mockPrisma.trip.findUnique.mockResolvedValue({
    userId: 1,
    budget: null,
    budgetCurrency: null,
  });
  mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: null });
  mockPrisma.activity.findMany.mockResolvedValue([]);
  mockPrisma.transportation.findMany.mockResolvedValue([]);
  mockPrisma.lodging.findMany.mockResolvedValue([]);
  mockPrisma.tripExpense.findMany.mockResolvedValue([]);
  mockPrisma.customItem.findMany.mockResolvedValue([]);
}

describe('ExpenseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.tripExpenseSplit.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockResolvedValue([]);
    mockPrisma.trip.findFirst.mockResolvedValue(ownedTrip());
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  // ============================================================
  // EXP-001: Create freezes an FX snapshot
  // ============================================================
  describe('EXP-001: Create expense freezes an FX snapshot', () => {
    it('should persist exchangeRate, baseAmount and baseCurrency', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({ budgetCurrency: 'USD' });
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockConvert.mockResolvedValue(conversion('1.1426', '571.30'));
      mockPrisma.tripExpense.create.mockResolvedValue({ id: 1 });

      await expenseService.createExpense(1, 10, {
        description: 'Hotel',
        category: 'lodging',
        amount: 500,
        currency: 'EUR',
        date: '2026-03-10',
      });

      const created = mockPrisma.tripExpense.create.mock.calls[0][0];
      expect(created).toMatchObject({
        data: expect.objectContaining({ baseCurrency: 'USD' }),
      });
      expect(created.data.exchangeRate.toString()).toBe('1.1426');
      expect(created.data.baseAmount.toString()).toBe('571.3');

      // The rate must be looked up for the expense's own date, not today.
      const [, , , date] = mockConvert.mock.calls[0];
      expect(date).toEqual(new Date('2026-03-10T00:00:00.000Z'));
    });
  });

  // ============================================================
  // EXP-002: Create with no available rate
  // ============================================================
  describe('EXP-002: Create expense with no available rate', () => {
    it('should store null snapshot fields rather than inventing a rate', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({ budgetCurrency: 'USD' });
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockConvert.mockResolvedValue(null);
      mockPrisma.tripExpense.create.mockResolvedValue({ id: 1 });

      await expenseService.createExpense(1, 10, {
        description: 'Dinner',
        category: 'food',
        amount: 500,
        currency: 'XYZ',
      });

      expect(mockPrisma.tripExpense.create.mock.calls[0][0].data).toMatchObject({
        exchangeRate: null,
        baseAmount: null,
        baseCurrency: null,
      });
    });

    it('should defer the snapshot when no reporting currency is configured', async () => {
      mockPrisma.trip.findUnique.mockResolvedValue({ budgetCurrency: null });
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: null });
      mockPrisma.tripExpense.create.mockResolvedValue({ id: 1 });

      await expenseService.createExpense(1, 10, {
        description: 'Coffee',
        category: 'food',
        amount: 4,
        currency: 'EUR',
      });

      // Nothing meaningful to convert INTO yet, so no rate is fetched at all.
      expect(mockConvert).not.toHaveBeenCalled();
      expect(mockPrisma.tripExpense.create.mock.calls[0][0].data).toMatchObject({
        exchangeRate: null,
        baseAmount: null,
        baseCurrency: null,
      });
    });
  });

  // ============================================================
  // EXP-003: Update re-snapshot rules
  // ============================================================
  describe('EXP-003: Update expense re-snapshot rules', () => {
    const existing = {
      id: 5,
      tripId: 10,
      amount: new Prisma.Decimal('500'),
      currency: 'EUR',
      date: new Date('2026-03-10T00:00:00.000Z'),
    };

    beforeEach(() => {
      mockPrisma.tripExpense.findFirst.mockResolvedValue(existing);
      mockPrisma.trip.findUnique.mockResolvedValue({ budgetCurrency: 'USD' });
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockPrisma.tripExpense.update.mockResolvedValue({ id: 5 });
    });

    it('should re-snapshot when the amount changes', async () => {
      mockConvert.mockResolvedValue(conversion('1.1426', '685.56'));

      await expenseService.updateExpense(1, 10, 5, { amount: 600 });

      expect(mockConvert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tripExpense.update.mock.calls[0][0].data.baseAmount.toString()).toBe(
        '685.56'
      );
    });

    it('should re-scale stored splits to the new amount, keeping the sum exact', async () => {
      mockConvert.mockResolvedValue(conversion('1.1426', '685.56'));
      mockPrisma.tripExpense.update.mockResolvedValue({ id: 5, amount: new Prisma.Decimal('100.00') });
      mockPrisma.tripExpenseSplit.findMany.mockResolvedValue([
        { id: 1, isOwner: true, companionId: null, amount: new Prisma.Decimal('250.00') },
        { id: 2, isOwner: false, companionId: 8, amount: new Prisma.Decimal('250.00') },
        { id: 3, isOwner: false, companionId: 9, amount: new Prisma.Decimal('100.00') },
      ]);
      mockPrisma.tripExpenseSplit.update.mockImplementation(((args: unknown) => args) as never);

      await expenseService.updateExpense(1, 10, 5, { amount: 100 });

      const updates = mockPrisma.tripExpenseSplit.update.mock.calls.map(
        (c) => c[0] as { where: { id: number }; data: { amount: Prisma.Decimal } }
      );
      expect(updates.map((u) => [u.where.id, u.data.amount.toString()])).toEqual([
        [1, '41.68'], // odd cents land on the largest share (lowest key on a tie)
        [2, '41.66'],
        [3, '16.66'],
      ]);
      expect(updates.reduce((sum, u) => sum.add(u.data.amount), new Prisma.Decimal(0)).eq(100)).toBe(true);
    });

    it('should return the re-scaled splits in the update response (not an empty list)', async () => {
      mockConvert.mockResolvedValue(conversion('1.1426', '685.56'));
      mockPrisma.tripExpense.update.mockResolvedValue({
        id: 5,
        amount: new Prisma.Decimal('100.00'),
        paidByOwner: true,
        paidByCompanionId: null,
        splits: [],
      });
      const before = [
        { id: 1, isOwner: true, companionId: null, amount: new Prisma.Decimal('250.00'), percentage: null },
        { id: 2, isOwner: false, companionId: 8, amount: new Prisma.Decimal('250.00'), percentage: null },
      ];
      mockPrisma.tripExpenseSplit.findMany
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce([
          { ...before[0], amount: new Prisma.Decimal('50.00') },
          { ...before[1], amount: new Prisma.Decimal('50.00') },
        ]);
      mockPrisma.tripExpenseSplit.update.mockImplementation(((args: unknown) => args) as never);

      const result = await expenseService.updateExpense(1, 10, 5, { amount: 100 });

      expect(result.paidBy).toBe('owner');
      expect(result.splits).toEqual([
        { participant: 'owner', amount: 50, percentage: null },
        { participant: 'companion:8', amount: 50, percentage: null },
      ]);
    });

    it('should not touch splits when the amount did not change', async () => {
      await expenseService.updateExpense(1, 10, 5, { description: 'Renamed' });
      expect(mockPrisma.tripExpenseSplit.findMany).not.toHaveBeenCalled();
    });

    it('should re-snapshot when the currency changes', async () => {
      mockConvert.mockResolvedValue(conversion('0.0067', '3.35'));

      await expenseService.updateExpense(1, 10, 5, { currency: 'JPY' });

      expect(mockConvert).toHaveBeenCalledTimes(1);
      const [, from] = mockConvert.mock.calls[0];
      expect(from).toBe('JPY');
    });

    it('should NOT touch the frozen snapshot when only the description changes', async () => {
      await expenseService.updateExpense(1, 10, 5, { description: 'Renamed' });

      expect(mockConvert).not.toHaveBeenCalled();
      const data = mockPrisma.tripExpense.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('exchangeRate');
      expect(data).not.toHaveProperty('baseAmount');
    });

    it('should NOT re-snapshot when the date is re-sent unchanged', async () => {
      await expenseService.updateExpense(1, 10, 5, { date: '2026-03-10' });

      expect(mockConvert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // EXP-004: Mixed-currency conversion
  // ============================================================
  describe('EXP-004: Budget summary converts mixed currencies', () => {
    it('should NOT add differing currencies at face value', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockPrisma.lodging.findMany.mockResolvedValue([
        {
          id: 1,
          cost: new Prisma.Decimal('500'),
          currency: 'EUR',
          exchangeRate: new Prisma.Decimal('1.1426'),
          baseAmount: new Prisma.Decimal('571.30'),
          baseCurrency: 'USD',
          checkInDate: new Date('2026-03-10T00:00:00.000Z'),
        },
      ]);
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        {
          id: 2,
          amount: new Prisma.Decimal('500'),
          currency: 'JPY',
          exchangeRate: new Prisma.Decimal('0.0067'),
          baseAmount: new Prisma.Decimal('3.35'),
          baseCurrency: 'USD',
          category: 'food',
          date: new Date('2026-03-11T00:00:00.000Z'),
        },
      ]);

      const summary = await expenseService.getBudgetSummary(1, 10);

      // The bug this feature fixes: EUR 500 + JPY 500 used to report 1000.
      expect(summary.spent).not.toBe(1000);
      expect(summary.spent).toBeCloseTo(574.65, 2);
      expect(summary.currency).toBe('USD');
      expect(summary.breakdown.lodging).toBeCloseTo(571.3, 2);
      expect(summary.breakdown.food).toBeCloseTo(3.35, 2);
      expect(summary.conversion.exactCount).toBe(2);
      expect(summary.conversion.isComplete).toBe(true);
    });
  });

  // ============================================================
  // EXP-005: Unconvertible amounts
  // ============================================================
  describe('EXP-005: Budget summary reports unconvertible amounts', () => {
    it('should exclude them from spent and list them separately', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        {
          id: 1,
          amount: new Prisma.Decimal('100'),
          currency: 'USD',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'food',
          date: new Date('2026-03-10T00:00:00.000Z'),
        },
        {
          id: 2,
          amount: new Prisma.Decimal('7500'),
          currency: 'XYZ',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'shopping',
          date: new Date('2026-03-11T00:00:00.000Z'),
        },
        {
          id: 3,
          amount: new Prisma.Decimal('2500'),
          currency: 'XYZ',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'other',
          date: null,
        },
      ]);
      mockConvert.mockResolvedValue(null);

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.spent).toBe(100);
      expect(summary.conversion.unconverted).toEqual([
        { currency: 'XYZ', amount: 10000, count: 2 },
      ]);
      expect(summary.conversion.isComplete).toBe(false);
      // Nothing was written back, because there was nothing to freeze.
      expect(mockPrisma.tripExpense.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // EXP-006: Frozen snapshots are authoritative
  // ============================================================
  describe('EXP-006: Frozen snapshots', () => {
    it('should use the stored rate without re-fetching', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        {
          id: 1,
          amount: new Prisma.Decimal('500'),
          currency: 'EUR',
          exchangeRate: new Prisma.Decimal('1.5000'),
          baseAmount: new Prisma.Decimal('750.00'),
          baseCurrency: 'USD',
          category: 'food',
          date: new Date('2020-01-02T00:00:00.000Z'),
        },
      ]);

      const summary = await expenseService.getBudgetSummary(1, 10);

      // The old, frozen rate wins over anything today's market would say.
      expect(summary.spent).toBe(750);
      expect(mockConvert).not.toHaveBeenCalled();
      expect(mockPrisma.tripExpense.update).not.toHaveBeenCalled();
    });

    it('should ignore a snapshot frozen against a different base currency', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'GBP' });
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        {
          id: 1,
          amount: new Prisma.Decimal('500'),
          currency: 'EUR',
          exchangeRate: new Prisma.Decimal('1.5000'),
          baseAmount: new Prisma.Decimal('750.00'),
          baseCurrency: 'USD',
          category: 'food',
          date: new Date('2026-03-10T00:00:00.000Z'),
        },
      ]);
      mockConvert.mockResolvedValue(conversion('0.84', '420.00', 'GBP'));

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.currency).toBe('GBP');
      expect(summary.spent).toBe(420);
      expect(mockConvert).toHaveBeenCalled();
    });
  });

  // ============================================================
  // EXP-007: Lazy backfill of legacy rows
  // ============================================================
  describe('EXP-007: Lazy backfill', () => {
    it('should convert a dated legacy row at its own date and persist it', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockPrisma.activity.findMany.mockResolvedValue([
        {
          id: 42,
          cost: new Prisma.Decimal('200'),
          currency: 'EUR',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          startTime: new Date('2026-03-10T09:00:00.000Z'),
        },
      ]);
      mockConvert.mockResolvedValue(conversion('1.1426', '228.52'));

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.breakdown.activities).toBeCloseTo(228.52, 2);
      // A dated record is converted at that date's published rate whether the
      // snapshot was taken on create or here, so it counts as exact either way
      // — the reported precision must not depend on which read you are on.
      expect(summary.conversion.exactCount).toBe(1);
      expect(summary.conversion.estimatedCount).toBe(0);
      expect(summary.conversion.isComplete).toBe(true);

      // The rate is looked up for the record's own date, not today.
      expect(mockConvert.mock.calls[0][3]).toEqual(new Date('2026-03-10T09:00:00.000Z'));

      // The filled-in snapshot is written back so the next read is a lookup.
      expect(mockPrisma.activity.update).toHaveBeenCalledTimes(1);
      const write = mockPrisma.activity.update.mock.calls[0][0];
      expect(write.where).toEqual({ id: 42 });
      expect(write.data.baseCurrency).toBe('USD');
    });

    it('should flag an undated legacy row as estimated', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        {
          id: 7,
          amount: new Prisma.Decimal('200'),
          currency: 'EUR',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'food',
          date: null,
        },
      ]);
      mockConvert.mockResolvedValue(conversion('1.1426', '228.52'));
      mockPrisma.tripExpense.update.mockResolvedValue({});

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.conversion.estimatedCount).toBe(1);
      expect(summary.conversion.exactCount).toBe(0);
      expect(summary.conversion.isComplete).toBe(false);
    });

    it('should still report the total when the write-back fails', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        {
          id: 1,
          amount: new Prisma.Decimal('200'),
          currency: 'EUR',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'food',
          date: new Date('2026-03-10T00:00:00.000Z'),
        },
      ]);
      mockConvert.mockResolvedValue(conversion('1.1426', '228.52'));
      mockPrisma.tripExpense.update.mockRejectedValue(new Error('db down'));

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.spent).toBeCloseTo(228.52, 2);
    });
  });

  // ============================================================
  // EXP-008: Records with no currency
  // ============================================================
  describe('EXP-008: Records with no currency', () => {
    it('should count them at face value and report the assumption', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        {
          id: 1,
          amount: new Prisma.Decimal('80'),
          currency: null,
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'food',
          date: null,
        },
      ]);

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.spent).toBe(80);
      expect(summary.conversion.assumedBaseCount).toBe(1);
      expect(mockConvert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // EXP-009: Reporting currency resolution
  // ============================================================
  describe('EXP-009: Reporting currency resolution', () => {
    it("should prefer the trip owner's home currency", async () => {
      stubEmptyBudgetData();
      mockPrisma.trip.findUnique.mockResolvedValue({
        userId: 1,
        budget: null,
        budgetCurrency: 'EUR',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'GBP' });

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.currency).toBe('GBP');
      // Resolved against the OWNER, not the requesting user.
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } })
      );
    });

    it("should fall back to the trip's budget currency", async () => {
      stubEmptyBudgetData();
      mockPrisma.trip.findUnique.mockResolvedValue({
        userId: 1,
        budget: null,
        budgetCurrency: 'EUR',
      });

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.currency).toBe('EUR');
    });

    it('should fall back to the most common currency among the records', async () => {
      stubEmptyBudgetData();
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        {
          id: 1,
          amount: new Prisma.Decimal('10'),
          currency: 'JPY',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'food',
          date: null,
        },
        {
          id: 2,
          amount: new Prisma.Decimal('20'),
          currency: 'JPY',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'food',
          date: null,
        },
        {
          id: 3,
          amount: new Prisma.Decimal('30'),
          currency: 'EUR',
          exchangeRate: null,
          baseAmount: null,
          baseCurrency: null,
          category: 'food',
          date: null,
        },
      ]);
      mockConvert.mockResolvedValue(null);

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.currency).toBe('JPY');
    });

    it('should fall back to USD when nothing else is known', async () => {
      stubEmptyBudgetData();

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.currency).toBe('USD');
      expect(summary.spent).toBe(0);
    });
  });

  // ============================================================
  // EXP-010: Budget restated in the reporting currency
  // ============================================================
  describe('EXP-010: Budget restated in the reporting currency', () => {
    it('should convert the budget so it is comparable with spent', async () => {
      stubEmptyBudgetData();
      mockPrisma.trip.findUnique.mockResolvedValue({
        userId: 1,
        budget: new Prisma.Decimal('1000'),
        budgetCurrency: 'EUR',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockConvert.mockResolvedValue(conversion('1.1426', '1142.60'));

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.currency).toBe('USD');
      expect(summary.budget).toBeCloseTo(1142.6, 2);
      expect(summary.budgetOriginal).toBe(1000);
      expect(summary.budgetCurrency).toBe('EUR');
    });

    it('should null the comparable budget when it cannot be converted', async () => {
      stubEmptyBudgetData();
      mockPrisma.trip.findUnique.mockResolvedValue({
        userId: 1,
        budget: new Prisma.Decimal('1000'),
        budgetCurrency: 'XYZ',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });
      mockConvert.mockResolvedValue(null);

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.budget).toBeNull();
      expect(summary.budgetOriginal).toBe(1000);
      expect(summary.budgetCurrency).toBe('XYZ');
    });

    it('should pass the budget through untouched when currencies already match', async () => {
      stubEmptyBudgetData();
      mockPrisma.trip.findUnique.mockResolvedValue({
        userId: 1,
        budget: new Prisma.Decimal('1000'),
        budgetCurrency: 'USD',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.budget).toBe(1000);
      expect(mockConvert).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // EXP-011: Breakdown bucket routing
  // ============================================================
  describe('EXP-011: Breakdown bucket routing', () => {
    it('should route entity costs and expense categories to the right buckets', async () => {
      stubEmptyBudgetData();
      mockPrisma.user.findUnique.mockResolvedValue({ baseCurrency: 'USD' });

      const base = {
        currency: 'USD',
        exchangeRate: null,
        baseAmount: null,
        baseCurrency: null,
      };

      mockPrisma.lodging.findMany.mockResolvedValue([
        { id: 1, cost: new Prisma.Decimal('100'), ...base, checkInDate: null },
      ]);
      mockPrisma.transportation.findMany.mockResolvedValue([
        { id: 2, cost: new Prisma.Decimal('200'), ...base, scheduledStart: null },
      ]);
      mockPrisma.activity.findMany.mockResolvedValue([
        { id: 3, cost: new Prisma.Decimal('300'), ...base, startTime: null },
      ]);
      mockPrisma.tripExpense.findMany.mockResolvedValue([
        { id: 4, amount: new Prisma.Decimal('10'), ...base, category: 'food', date: null },
        { id: 5, amount: new Prisma.Decimal('20'), ...base, category: 'shopping', date: null },
        { id: 6, amount: new Prisma.Decimal('30'), ...base, category: 'other', date: null },
        { id: 7, amount: new Prisma.Decimal('40'), ...base, category: 'lodging', date: null },
      ]);

      const summary = await expenseService.getBudgetSummary(1, 10);

      expect(summary.breakdown).toEqual({
        lodging: 140,
        transportation: 200,
        activities: 300,
        food: 10,
        other: 50,
      });
      expect(summary.spent).toBe(700);
    });
  });

  // ============================================================
  // EXP-012: Access control
  // ============================================================
  describe('EXP-012: Access control', () => {
    it('should reject a summary request for an inaccessible trip', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);

      await expect(expenseService.getBudgetSummary(99, 10)).rejects.toThrow(
        'Trip not found or access denied'
      );
    });

    it('should reject a create from a view-only collaborator', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(
        ownedTrip({ userId: 2, collaborators: [{ permissionLevel: 'view' }] })
      );

      await expect(
        expenseService.createExpense(1, 10, {
          description: 'Dinner',
          category: 'food',
          amount: 10,
        })
      ).rejects.toThrow('Insufficient permissions');
      expect(mockPrisma.tripExpense.create).not.toHaveBeenCalled();
    });

    it('should reject an update for an expense on another trip', async () => {
      mockPrisma.tripExpense.findFirst.mockResolvedValue(null);

      await expect(expenseService.updateExpense(1, 10, 5, { amount: 1 })).rejects.toThrow(
        'Expense not found or does not belong to trip'
      );
    });
  });
});
