/**
 * Bulk Import Service Tests
 *
 * Test cases:
 * - BIS-001: Edit permission is enforced before anything is read or written
 * - BIS-002: Dry run validates but never opens a transaction
 * - BIS-003: Real location import writes valid rows in one transaction and skips invalid/excluded ones
 * - BIS-004: First located row sets the trip timezone when the trip has none
 * - BIS-005: Activity import stores cost as Prisma.Decimal and sets locationId to the named location
 * - BIS-006: Wall-clock activity times use the trip zone, else the user zone
 * - BIS-007: An unexpected failure inside the transaction propagates (nothing is reported created)
 */

const mockPrisma = {
  trip: { findUnique: jest.fn(), findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  userPreferences: { findUnique: jest.fn() },
  location: { findMany: jest.fn() },
  locationCategory: { findMany: jest.fn() },
  activity: { findMany: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyAccess = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyAccess(...args),
}));

import { Prisma } from '@prisma/client';
import bulkImportService from '../bulkImport.service';
import { AppError } from '../../errors/errors';

const tx = {
  location: { createManyAndReturn: jest.fn() },
  activity: { create: jest.fn() },
  entityLink: { createMany: jest.fn() },
  trip: { updateMany: jest.fn() },
  $executeRaw: jest.fn(),
};

describe('BulkImportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAccess.mockResolvedValue(undefined);
    mockPrisma.trip.findUnique.mockResolvedValue({ timezone: 'Europe/Paris' });
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'America/Chicago' });
    mockPrisma.userPreferences.findUnique.mockResolvedValue({
      userId: 1,
      activityCategories: [{ name: 'Dining', emoji: 'x' }],
    });
    mockPrisma.location.findMany.mockResolvedValue([]);
    mockPrisma.locationCategory.findMany.mockResolvedValue([]);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    tx.location.createManyAndReturn.mockImplementation(async ({ data }: { data: unknown[] }) =>
      data.map((_, i) => ({ id: 100 + i }))
    );
    let nextActivityId = 500;
    tx.activity.create.mockImplementation(async () => ({ id: nextActivityId++ }));
    tx.trip.updateMany.mockResolvedValue({ count: 1 });
  });

  it('BIS-001: enforces edit permission first', async () => {
    mockVerifyAccess.mockRejectedValue(new AppError('Forbidden', 403));
    await expect(
      bulkImportService.importLocations(1, 9, { rows: [{ name: 'A' }], dryRun: true, excludeRows: [] })
    ).rejects.toThrow('Forbidden');
    expect(mockVerifyAccess).toHaveBeenCalledWith(1, 9, 'edit');
    expect(mockPrisma.location.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('BIS-002: dry run reports rows without writing', async () => {
    const result = await bulkImportService.importLocations(1, 9, {
      rows: [{ name: 'A', latitude: '1', longitude: '2' }, { name: '' }],
      dryRun: true,
      excludeRows: [],
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dryRun: true, total: 2, valid: 1, invalid: 1, created: 0 });
    expect(result.rows.map((r) => r.status)).toEqual(['valid', 'invalid']);
  });

  it('BIS-003: real run creates valid rows in one transaction, skipping invalid and excluded', async () => {
    const result = await bulkImportService.importLocations(1, 9, {
      rows: [
        { name: 'A', latitude: '10', longitude: '20' },
        { name: '' },
        { name: 'C', latitude: '11', longitude: '21' },
        { name: 'D', latitude: '12', longitude: '22' },
      ],
      dryRun: false,
      excludeRows: [2],
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const { data } = tx.location.createManyAndReturn.mock.calls[0][0] as { data: Array<{ name: string; tripId: number }> };
    expect(data.map((d) => d.name)).toEqual(['A', 'D']);
    expect(data.every((d) => d.tripId === 9)).toBe(true);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(result.rows.map((r) => r.status)).toEqual(['created', 'invalid', 'excluded', 'created']);
    expect(result).toMatchObject({ created: 2, invalid: 1, excluded: 1 });
  });

  it('BIS-004: sets the trip timezone from the first located row when the trip has none', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({ timezone: null });
    const result = await bulkImportService.importLocations(1, 9, {
      rows: [{ name: 'NoCoords' }, { name: 'Paris', latitude: '48.8584', longitude: '2.2945' }],
      dryRun: false,
      excludeRows: [],
    });
    expect(tx.trip.updateMany).toHaveBeenCalledWith({
      where: { id: 9, timezone: null },
      data: { timezone: 'Europe/Paris' },
    });
    expect(result.tripTimezoneSet).toBe('Europe/Paris');
  });

  it('BIS-005: activity cost is a Prisma.Decimal and the location location FK is set', async () => {
    mockPrisma.location.findMany.mockResolvedValue([{ id: 42, name: 'Louvre' }]);
    const result = await bulkImportService.importActivities(1, 9, {
      rows: [{ name: 'Visit', location: 'louvre', cost: '12.50', currency: 'eur', category: 'dining' }],
      dryRun: false,
      excludeRows: [],
    });
    const created = tx.activity.create.mock.calls[0][0] as {
      data: { category: string; costExpense: { create: { amount: Prisma.Decimal; currency: string; category: string; description: string } } };
    };
    // The cost is the activity's expense row, created with it (an exact Decimal, not a float).
    const cost = created.data.costExpense.create;
    expect(cost.amount).toBeInstanceOf(Prisma.Decimal);
    expect(cost.amount.toString()).toBe('12.5');
    expect(cost.currency).toBe('EUR');
    expect(cost.category).toBe('activities');
    expect(cost.description).toBe('Visit');
    expect(created.data.category).toBe('Dining');
    expect(tx.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tripId: 9, locationId: 42 }) })
    );
    expect(tx.entityLink.createMany).not.toHaveBeenCalled();
    expect(result.created).toBe(1);
    expect(result.defaultTimezone).toEqual({ zone: 'Europe/Paris', source: 'trip' });
  });

  it('BIS-006: falls back to the user timezone, then UTC, for wall-clock times', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({ timezone: null });
    const row = { name: 'A', startTime: '2026-07-01 12:00' };
    const viaUser = await bulkImportService.importActivities(1, 9, { rows: [row], dryRun: true, excludeRows: [] });
    expect(viaUser.defaultTimezone).toEqual({ zone: 'America/Chicago', source: 'user' });
    expect(viaUser.rows[0].normalized.startTime).toBe('2026-07-01T17:00:00.000Z');

    mockPrisma.user.findUnique.mockResolvedValue({ timezone: null });
    mockPrisma.userPreferences.findUnique.mockResolvedValue({ userId: 1, activityCategories: [] });
    const viaUtc = await bulkImportService.importActivities(1, 9, { rows: [row], dryRun: true, excludeRows: [] });
    expect(viaUtc.defaultTimezone).toEqual({ zone: 'UTC', source: 'utc' });
  });

  it('BIS-007: a failure inside the transaction propagates', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('boom'));
    await expect(
      bulkImportService.importActivities(1, 9, { rows: [{ name: 'A' }], dryRun: false, excludeRows: [] })
    ).rejects.toThrow('boom');
  });
});
