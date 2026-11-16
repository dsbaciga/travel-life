/**
 * Trip Stop Service Tests (Multi-City Trip Planner)
 *
 * Test cases:
 * - TST-001: Create appends at the next position and requires edit access
 * - TST-002: Create rejects a linked location that is not on the trip
 * - TST-003: Reorder writes every position in one transaction
 * - TST-004: Reorder rejects a partial list, an unknown id, and duplicates (no writes)
 * - TST-005: Update/delete of a stop from another trip is a 404
 * - TST-006: Delete closes the gap in positions
 * - TST-007: List requires only view access and returns stops in order
 * - TST-008: A viewer-only collaborator cannot write (permission error propagates)
 * - TST-009: Zod schemas reject out-of-range coordinates and nights
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { AppError } from '../../errors/errors';

const mockTx = {
  tripStop: {
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockPrisma = {
  location: { findUnique: jest.fn() },
  tripStop: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
};

jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
const mockVerifyEntity = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
  verifyEntityInTrip: (...args: unknown[]) => mockVerifyEntity(...args),
}));

import tripStopService from '../tripStop.service';
import { createTripStopSchema, updateTripStopSchema } from '../../types/tripStop.types';

const stop = (id: number, position: number) => ({
  id,
  tripId: 10,
  name: `Stop ${id}`,
  latitude: 1,
  longitude: 2,
  position,
  nights: null,
  locationId: null,
});

describe('TripStopService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTrip.mockResolvedValue({ trip: { id: 10, userId: 1 } });
    mockVerifyEntity.mockResolvedValue(undefined);
  });

  it('TST-001: create appends at the next position and requires edit access', async () => {
    mockPrisma.tripStop.findFirst.mockResolvedValue({ position: 2 });
    mockPrisma.tripStop.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 9,
      ...args.data,
    }));

    const created = await tripStopService.createStop(1, 10, {
      name: 'Lisbon',
      latitude: 38.7,
      longitude: -9.1,
      nights: 3,
    });

    expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'edit');
    expect(created).toMatchObject({ tripId: 10, name: 'Lisbon', position: 3, nights: 3 });
  });

  it('TST-001: the first stop gets position 0', async () => {
    mockPrisma.tripStop.findFirst.mockResolvedValue(null);
    mockPrisma.tripStop.create.mockImplementation(async (args: { data: Record<string, unknown> }) => args.data);

    const created = await tripStopService.createStop(1, 10, { name: 'A', latitude: 0, longitude: 0 });

    expect(created).toMatchObject({ position: 0, nights: null, locationId: null });
  });

  it('TST-002: create rejects a linked location not on the trip', async () => {
    mockVerifyEntity.mockRejectedValue(new AppError('Location not found or does not belong to trip', 404));

    await expect(
      tripStopService.createStop(1, 10, { name: 'A', latitude: 0, longitude: 0, locationId: 99 })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockVerifyEntity).toHaveBeenCalledWith('location', 99, 10);
    expect(mockPrisma.tripStop.create).not.toHaveBeenCalled();
  });

  it('TST-003: reorder writes every position inside one transaction', async () => {
    mockTx.tripStop.findMany
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])
      .mockResolvedValueOnce([stop(3, 0), stop(1, 1), stop(2, 2)]);

    const result = await tripStopService.reorderStops(1, 10, { stopIds: [3, 1, 2] });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.tripStop.update).toHaveBeenCalledTimes(3);
    expect(mockTx.tripStop.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { position: 0 } });
    expect(mockTx.tripStop.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { position: 1 } });
    expect(mockTx.tripStop.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { position: 2 } });
    expect(result.map((s) => s.id)).toEqual([3, 1, 2]);
  });

  it('TST-004: reorder rejects a partial list, an unknown id, and duplicates without writing', async () => {
    mockTx.tripStop.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    await expect(tripStopService.reorderStops(1, 10, { stopIds: [1, 2] })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(tripStopService.reorderStops(1, 10, { stopIds: [1, 2, 4] })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(tripStopService.reorderStops(1, 10, { stopIds: [1, 1, 2] })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockTx.tripStop.update).not.toHaveBeenCalled();
  });

  it('TST-005: update/delete of a stop from another trip is a 404', async () => {
    mockPrisma.tripStop.findFirst.mockResolvedValue(null);

    await expect(tripStopService.updateStop(1, 10, 5, { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(tripStopService.deleteStop(1, 10, 5)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.tripStop.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('TST-006: delete closes the gap in positions', async () => {
    mockPrisma.tripStop.findFirst.mockResolvedValue(stop(2, 1));
    mockTx.tripStop.findMany.mockResolvedValue([
      { id: 1, position: 0 },
      { id: 3, position: 2 },
      { id: 4, position: 3 },
    ]);

    await tripStopService.deleteStop(1, 10, 2);

    expect(mockTx.tripStop.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(mockTx.tripStop.update).toHaveBeenCalledTimes(2);
    expect(mockTx.tripStop.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { position: 1 } });
    expect(mockTx.tripStop.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { position: 2 } });
  });

  it('TST-007: list requires view access and orders by position', async () => {
    mockPrisma.tripStop.findMany.mockResolvedValue([stop(1, 0)]);

    await tripStopService.getStopsByTrip(1, 10);

    expect(mockVerifyTrip).toHaveBeenCalledWith(1, 10, 'view');
    expect(mockPrisma.tripStop.findMany).toHaveBeenCalledWith({
      where: { tripId: 10 },
      orderBy: { position: 'asc' },
    });
  });

  it('TST-008: a permission failure stops every write', async () => {
    mockVerifyTrip.mockRejectedValue(new AppError('Insufficient permissions', 403));

    await expect(
      tripStopService.createStop(2, 10, { name: 'A', latitude: 0, longitude: 0 })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(tripStopService.reorderStops(2, 10, { stopIds: [] })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.tripStop.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  describe('linked saved places', () => {
    const colosseum = { name: 'Colosseum', latitude: 41.89, longitude: 12.49 };
    const echoCreate = () =>
      mockPrisma.tripStop.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({ id: 9, ...args.data })
      );

    it('TST-010: a stop made from a saved place takes its name and coordinates from it', async () => {
      mockPrisma.location.findUnique.mockResolvedValue({
        name: 'Colosseum',
        latitude: '41.89000000', // Prisma Decimal arrives as a Decimal/string-like value
        longitude: '12.49000000',
      });
      mockPrisma.tripStop.findFirst.mockResolvedValue(null);
      echoCreate();

      const created = await tripStopService.createStop(1, 10, { locationId: 4 });

      expect(mockVerifyEntity).toHaveBeenCalledWith('location', 4, 10);
      expect(created).toMatchObject({ name: 'Colosseum', latitude: 41.89, longitude: 12.49, locationId: 4 });
    });

    it('TST-011: sent coordinates that agree with the place are accepted (and the chosen name kept)', async () => {
      mockPrisma.location.findUnique.mockResolvedValue(colosseum);
      mockPrisma.tripStop.findFirst.mockResolvedValue(null);
      echoCreate();

      const created = await tripStopService.createStop(1, 10, {
        locationId: 4,
        name: 'Rome',
        latitude: 41.9,
        longitude: 12.5,
      });

      expect(created).toMatchObject({ name: 'Rome', latitude: 41.9, longitude: 12.5, locationId: 4 });
    });

    it('TST-012: sent coordinates far from the place are rejected', async () => {
      mockPrisma.location.findUnique.mockResolvedValue(colosseum);

      await expect(
        tripStopService.createStop(1, 10, { locationId: 4, name: 'Rome', latitude: 48.86, longitude: 2.35 })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.tripStop.create).not.toHaveBeenCalled();
    });

    it('TST-013: a place without coordinates cannot become a stop', async () => {
      mockPrisma.location.findUnique.mockResolvedValue({ name: 'Somewhere', latitude: null, longitude: null });

      await expect(tripStopService.createStop(1, 10, { locationId: 4 })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.tripStop.create).not.toHaveBeenCalled();
    });

    it('TST-014: a location from another trip is rejected before it is read', async () => {
      mockVerifyEntity.mockRejectedValue(new AppError('Location not found or does not belong to trip', 404));

      await expect(tripStopService.createStop(1, 10, { locationId: 77 })).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(
        tripStopService.updateStop(1, 10, 5, { locationId: 77 })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.location.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.tripStop.create).not.toHaveBeenCalled();
      expect(mockPrisma.tripStop.update).not.toHaveBeenCalled();
    });

    it('TST-015: linking an existing stop checks its own coordinates against the place', async () => {
      mockPrisma.tripStop.findFirst.mockResolvedValue(stop(5, 0)); // lat 1, lng 2
      mockPrisma.location.findUnique.mockResolvedValue(colosseum);

      await expect(tripStopService.updateStop(1, 10, 5, { locationId: 4 })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.tripStop.update).not.toHaveBeenCalled();
    });

    it('TST-016: the schema needs name and coordinates unless a place is linked', () => {
      expect(createTripStopSchema.safeParse({ locationId: 4 }).success).toBe(true);
      expect(createTripStopSchema.safeParse({}).success).toBe(false);
      expect(createTripStopSchema.safeParse({ name: 'A', latitude: 1 }).success).toBe(false);
    });
  });

  it('TST-009: schemas validate coordinate ranges and nights', () => {
    const ok = { name: 'A', latitude: 90, longitude: -180 };
    expect(createTripStopSchema.safeParse(ok).success).toBe(true);
    expect(createTripStopSchema.safeParse({ ...ok, latitude: 90.1 }).success).toBe(false);
    expect(createTripStopSchema.safeParse({ ...ok, longitude: 180.5 }).success).toBe(false);
    expect(createTripStopSchema.safeParse({ ...ok, nights: -1 }).success).toBe(false);
    expect(createTripStopSchema.safeParse({ ...ok, nights: 366 }).success).toBe(false);
    expect(createTripStopSchema.safeParse({ ...ok, nights: 1.5 }).success).toBe(false);
    expect(createTripStopSchema.safeParse({ ...ok, name: '   ' }).success).toBe(false);
    expect(updateTripStopSchema.safeParse({ nights: null }).success).toBe(true);
    expect(updateTripStopSchema.safeParse({ latitude: -91 }).success).toBe(false);
  });
});
