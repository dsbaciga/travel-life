/**
 * Trip Settlement Service Tests (#97, recorded settle-up payments)
 *
 * Test cases:
 * - TSE-001: create stores a payment between the owner and a companion (owner = "myself" companion)
 * - TSE-002: create rejects the same person on both sides and people who are not on the trip
 * - TSE-003: update changes fields, lets a former companion stay, rejects a newly chosen outsider
 * - TSE-004: delete and not-found handling
 * - TSE-005: list returns labelled DTOs, newest first, naming an unlinked companion
 * - TSE-006: access control - edit to write, view to read
 * - TSE-007: loadForSettleUp converts other currencies and reports unconvertible ones as null
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  trip: { findFirst: jest.fn() },
  user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
  tripSettlement: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  tripCompanion: { findMany: jest.fn() },
  travelCompanion: { findMany: jest.fn(), findFirst: jest.fn() },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

jest.mock('../exchangeRate.service', () => {
  const actual = jest.requireActual<typeof import('../exchangeRate.service')>('../exchangeRate.service');
  return {
    __esModule: true,
    ...actual,
    default: { convert: jest.fn() },
  };
});

import { Prisma } from '@prisma/client';
import exchangeRateService from '../exchangeRate.service';
import tripSettlementService from '../tripSettlement.service';

const mockConvert = exchangeRateService.convert as jest.MockedFunction<typeof exchangeRateService.convert>;

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

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  tripId: 10,
  fromCompanionId: 5,
  toCompanionId: OWNER_COMPANION,
  amount: D('25.00'),
  currency: 'EUR',
  date: new Date('2026-05-03T00:00:00.000Z'),
  notes: null,
  createdAt: new Date('2026-05-03T10:00:00.000Z'),
  updatedAt: new Date('2026-05-03T10:00:00.000Z'),
  ...overrides,
});

describe('TripSettlementService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stubTrip();
    mockPrisma.user.findUnique.mockResolvedValue({ username: 'dana' });
    mockPrisma.tripCompanion.findMany.mockResolvedValue([
      { companion: { id: 5, name: 'Alex' } },
      { companion: { id: 6, name: 'Sam' } },
    ]);
    mockPrisma.travelCompanion.findFirst.mockResolvedValue({ id: OWNER_COMPANION });
    mockPrisma.travelCompanion.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation((async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(mockPrisma) : []) as never);
  });

  describe('TSE-001: create', () => {
    it('stores the payment against the companions, with the owner as their myself companion', async () => {
      mockPrisma.tripSettlement.create.mockResolvedValue(row());

      const result = await tripSettlementService.create(1, 10, {
        from: 'companion:5',
        to: 'owner',
        amount: 25,
        currency: 'eur',
        date: '2026-05-03',
        notes: '  Cash  ',
      });

      const data = (mockPrisma.tripSettlement.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(data).toMatchObject({
        tripId: 10,
        fromCompanionId: 5,
        toCompanionId: OWNER_COMPANION,
        currency: 'EUR',
        notes: 'Cash',
      });
      expect(String(data.amount)).toBe('25');
      expect((data.date as Date).toISOString()).toBe('2026-05-03T00:00:00.000Z');
      expect(result).toMatchObject({
        from: 'companion:5',
        fromLabel: 'Alex',
        to: 'owner',
        toLabel: 'dana',
        amount: 25,
        date: '2026-05-03',
      });
    });

    it('creates the owner myself companion when they have none yet', async () => {
      mockPrisma.travelCompanion.findFirst
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce({ id: OWNER_COMPANION } as never);
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ username: 'dana' });
      mockPrisma.tripSettlement.create.mockResolvedValue(row());

      await tripSettlementService.create(1, 10, {
        from: 'companion:5',
        to: 'owner',
        amount: 5,
        currency: 'EUR',
        date: '2026-05-03',
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('TSE-002: validation', () => {
    it('rejects the same person on both sides', async () => {
      await expect(
        tripSettlementService.create(1, 10, {
          from: 'companion:5',
          to: 'companion:5',
          amount: 5,
          currency: 'EUR',
          date: '2026-05-03',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.tripSettlement.create).not.toHaveBeenCalled();
    });

    it('rejects a person who is not on the trip', async () => {
      await expect(
        tripSettlementService.create(1, 10, {
          from: 'companion:99',
          to: 'owner',
          amount: 5,
          currency: 'EUR',
          date: '2026-05-03',
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.tripSettlement.create).not.toHaveBeenCalled();
    });
  });

  describe('TSE-003: update', () => {
    it('changes only the supplied fields', async () => {
      mockPrisma.tripSettlement.findFirst.mockResolvedValue(row());
      mockPrisma.tripSettlement.update.mockResolvedValue(row({ amount: D('30.00'), notes: null }));

      await tripSettlementService.update(1, 10, 1, { amount: 30, notes: null });

      const call = mockPrisma.tripSettlement.update.mock.calls[0][0] as {
        where: { id: number };
        data: Record<string, unknown>;
      };
      expect(call.where).toEqual({ id: 1 });
      expect(Object.keys(call.data).sort()).toEqual(['amount', 'notes']);
      expect(call.data.notes).toBeNull();
    });

    it('lets a companion who has left the trip stay on the payment', async () => {
      // companion 77 is no longer linked to the trip.
      mockPrisma.tripSettlement.findFirst.mockResolvedValue(row({ fromCompanionId: 77 }));
      mockPrisma.travelCompanion.findMany.mockResolvedValue([{ id: 77, name: 'Robin' }]);
      mockPrisma.tripSettlement.update.mockResolvedValue(row({ fromCompanionId: 77, amount: D('9.00') }));

      const result = await tripSettlementService.update(1, 10, 1, { amount: 9, from: 'companion:77' });

      expect(result).toMatchObject({ from: 'companion:77', fromLabel: 'Robin', amount: 9 });
    });

    it('rejects choosing a person who is not on the trip', async () => {
      mockPrisma.tripSettlement.findFirst.mockResolvedValue(row());

      await expect(
        tripSettlementService.update(1, 10, 1, { to: 'companion:99' })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.tripSettlement.update).not.toHaveBeenCalled();
    });

    it('rejects an edit that would make both people the same', async () => {
      mockPrisma.tripSettlement.findFirst.mockResolvedValue(row());

      await expect(
        tripSettlementService.update(1, 10, 1, { to: 'companion:5' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('TSE-004: delete', () => {
    it('deletes a payment of the trip', async () => {
      mockPrisma.tripSettlement.findFirst.mockResolvedValue(row());
      await tripSettlementService.remove(1, 10, 1);
      expect(mockPrisma.tripSettlement.findFirst).toHaveBeenCalledWith({ where: { id: 1, tripId: 10 } });
      expect(mockPrisma.tripSettlement.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('answers 404 for a payment of another trip', async () => {
      mockPrisma.tripSettlement.findFirst.mockResolvedValue(null);
      await expect(tripSettlementService.remove(1, 10, 5)).rejects.toMatchObject({ statusCode: 404 });
      await expect(tripSettlementService.update(1, 10, 5, { amount: 1 })).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(mockPrisma.tripSettlement.delete).not.toHaveBeenCalled();
    });
  });

  describe('TSE-005: list', () => {
    it('returns labelled payments, newest first', async () => {
      mockPrisma.tripSettlement.findMany.mockResolvedValue([row({ id: 2 }), row({ id: 1, notes: 'x' })]);

      const result = await tripSettlementService.list(1, 10);

      expect(mockPrisma.tripSettlement.findMany).toHaveBeenCalledWith({
        where: { tripId: 10 },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      });
      expect(result.map((r) => r.id)).toEqual([2, 1]);
      expect(result[0]).toMatchObject({ fromLabel: 'Alex', toLabel: 'dana', currency: 'EUR' });
    });
  });

  describe('TSE-006: access control', () => {
    it('requires edit permission to record a payment', async () => {
      stubTrip({ userId: 2, collaborators: [{ permissionLevel: 'view' }] });
      await expect(
        tripSettlementService.create(1, 10, {
          from: 'companion:5',
          to: 'owner',
          amount: 5,
          currency: 'EUR',
          date: '2026-05-03',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(tripSettlementService.update(1, 10, 1, { amount: 1 })).rejects.toMatchObject({
        statusCode: 403,
      });
      await expect(tripSettlementService.remove(1, 10, 1)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lets a viewer read the payments', async () => {
      stubTrip({ userId: 2, collaborators: [{ permissionLevel: 'view' }] });
      mockPrisma.tripSettlement.findMany.mockResolvedValue([]);
      await expect(tripSettlementService.list(1, 10)).resolves.toEqual([]);
    });

    it('answers 404 when the trip is not visible to the user', async () => {
      mockPrisma.trip.findFirst.mockResolvedValue(null);
      await expect(tripSettlementService.list(1, 10)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('TSE-007: loadForSettleUp', () => {
    it('keeps the amount in the reporting currency, converts others and nulls the unconvertible', async () => {
      mockPrisma.tripSettlement.findMany.mockResolvedValue([
        row({ id: 1, currency: 'USD', amount: D('10.00') }),
        row({ id: 2, currency: 'EUR', amount: D('10.00') }),
        row({ id: 3, currency: 'XYZ', amount: D('10.00') }),
      ]);
      mockConvert.mockImplementation((async (_amount, from) =>
        from === 'EUR'
          ? { exchangeRate: D('1.1'), baseAmount: D('11.00'), baseCurrency: 'USD', precision: 'exact' }
          : null) as never);

      const result = await tripSettlementService.loadForSettleUp(10, OWNER_COMPANION, 'USD');

      expect(result.map((r) => r.baseAmount?.toString() ?? null)).toEqual(['10', '11', null]);
      expect(result[0]).toMatchObject({ from: 'companion:5', to: 'owner' });
      expect(mockConvert).toHaveBeenCalledTimes(2);
      expect(mockConvert).toHaveBeenCalledWith(
        expect.anything(),
        'EUR',
        'USD',
        new Date('2026-05-03T00:00:00.000Z')
      );
    });
  });
});
