/**
 * EntityLink cascade-cleanup tests
 *
 * `Activity.parentId` cascades at the DATABASE level, so deleting a parent
 * activity silently removes its whole subtree in Postgres. `EntityLink` is
 * polymorphic with no foreign key to `activities`, so those descendants' links
 * are orphaned unless the delete helpers clean them up explicitly.
 *
 * These tests pin `collectActivityDescendantIds` (crudHelpers.ts) via the two
 * public entry points that use it:
 * - deleteEntity('activity', ...)
 * - bulkDeleteEntities('activity', ...)
 *
 * and assert the cleanup happens INSIDE the $transaction, so a failed delete
 * cannot leave links removed (or vice versa).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) {
        this.value = String(value);
      }
      toString(): string { return this.value; }
      toNumber(): number { return parseFloat(this.value); }
    },
  },
  EntityType: {
    PHOTO: 'PHOTO',
    LOCATION: 'LOCATION',
    ACTIVITY: 'ACTIVITY',
    LODGING: 'LODGING',
    TRANSPORTATION: 'TRANSPORTATION',
    JOURNAL_ENTRY: 'JOURNAL_ENTRY',
    PHOTO_ALBUM: 'PHOTO_ALBUM',
  },
}));

import { mockPrismaClient, resetPrismaMocks } from '../../__tests__/mocks/prisma';

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrismaClient,
}));

const mockVerifyTripAccessWithPermission = jest.fn();
const mockVerifyEntityAccessWithPermission = jest.fn();

jest.mock('../../services/_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) =>
    mockVerifyTripAccessWithPermission(...args),
  verifyEntityAccessWithPermission: (...args: unknown[]) =>
    mockVerifyEntityAccessWithPermission(...args),
}));

import { deleteEntity, bulkDeleteEntities } from '../crudHelpers';

// ---------------------------------------------------------------------------
// Fixture: an activity tree three levels deep
//
//   10 ── 11 ── 13 ── 15
//     └── 12 ── 14
//   20 ── 21           (a second, independent root)
//   30                 (unrelated leaf, must never be touched)
// ---------------------------------------------------------------------------

const TRIP_ID = 5;
const USER_ID = 1;

const CHILDREN: Record<number, number[]> = {
  10: [11, 12],
  11: [13],
  12: [14],
  13: [15],
  20: [21],
};

/** Records whether we are currently inside the $transaction callback. */
let insideTransaction = false;
/** Call-time transaction state, captured per mocked write. */
let entityLinkDeleteInsideTx: boolean[] = [];
let activityDeleteInsideTx: boolean[] = [];

interface FindManyArgs {
  where?: {
    parentId?: { in: number[] };
    id?: { in: number[] };
    tripId?: number;
  };
}

/**
 * One findMany mock serving both callers:
 * - `where.parentId.in`  -> descendant walk (collectActivityDescendantIds)
 * - `where.id.in`        -> ownership verification in bulkDeleteEntities
 */
type ActivityFindMany = (args: unknown) => Promise<Array<{ id: number; tripId?: number }>>;

function makeActivityFindMany(children: Record<number, number[]>): ActivityFindMany {
  return (args: unknown) => {
    const where = (args as FindManyArgs).where ?? {};

    if (where.parentId?.in) {
      const rows: Array<{ id: number }> = [];
      for (const parentId of where.parentId.in) {
        for (const childId of children[parentId] ?? []) {
          rows.push({ id: childId });
        }
      }
      return Promise.resolve(rows);
    }

    if (where.id?.in) {
      return Promise.resolve(where.id.in.map((id) => ({ id, tripId: TRIP_ID })));
    }

    return Promise.resolve([]);
  };
}

/** The resolver currently installed, so a test can wrap rather than replace it. */
let activityFindMany: ActivityFindMany = makeActivityFindMany(CHILDREN);

function installActivityFindMany(children: Record<number, number[]> = CHILDREN): void {
  activityFindMany = makeActivityFindMany(children);
  mockPrismaClient.activity.findMany.mockImplementation((args: unknown) =>
    activityFindMany(args)
  );
}

/** Pull the ID set the entityLink cleanup was scoped to. */
function linkedIdsFromCleanup(callIndex = 0): { sourceIds: number[]; targetIds: number[]; tripId: number } {
  const args = mockPrismaClient.entityLink.deleteMany.mock.calls[callIndex][0] as {
    where: {
      tripId: number;
      OR: [
        { sourceType: string; sourceId: { in: number[] } },
        { targetType: string; targetId: { in: number[] } },
      ];
    };
  };
  return {
    tripId: args.where.tripId,
    sourceIds: args.where.OR[0].sourceId.in,
    targetIds: args.where.OR[1].targetId.in,
  };
}

beforeEach(() => {
  resetPrismaMocks();
  mockVerifyTripAccessWithPermission.mockReset();
  mockVerifyEntityAccessWithPermission.mockReset();

  insideTransaction = false;
  entityLinkDeleteInsideTx = [];
  activityDeleteInsideTx = [];

  // Track transaction boundaries so we can prove the cleanup runs inside them.
  mockPrismaClient.$transaction.mockImplementation(async (callback: unknown) => {
    if (typeof callback !== 'function') return callback;
    insideTransaction = true;
    try {
      return await (callback as (tx: unknown) => Promise<unknown>)(mockPrismaClient);
    } finally {
      insideTransaction = false;
    }
  });

  mockPrismaClient.entityLink.deleteMany.mockImplementation(() => {
    entityLinkDeleteInsideTx.push(insideTransaction);
    return Promise.resolve({ count: 0 });
  });
  mockPrismaClient.activity.delete.mockImplementation(() => {
    activityDeleteInsideTx.push(insideTransaction);
    return Promise.resolve({ id: 10 });
  });
  mockPrismaClient.activity.deleteMany.mockImplementation(() => {
    activityDeleteInsideTx.push(insideTransaction);
    return Promise.resolve({ count: 2 });
  });

  mockVerifyEntityAccessWithPermission.mockResolvedValue({
    entity: { id: 10, tripId: TRIP_ID },
    tripAccess: { trip: { id: TRIP_ID, userId: USER_ID }, isOwner: true, permissionLevel: 'admin' },
  });
  mockVerifyTripAccessWithPermission.mockResolvedValue({
    trip: { id: TRIP_ID, userId: USER_ID },
    isOwner: true,
    permissionLevel: 'admin',
  });

  installActivityFindMany();
});

// ===========================================================================
// deleteEntity — single activity
// ===========================================================================

describe('deleteEntity(activity) — descendant EntityLink cleanup', () => {
  it('cleans up links for the parent AND every descendant, three levels deep', async () => {
    await deleteEntity('activity', 10, USER_ID);

    const { sourceIds, targetIds, tripId } = linkedIdsFromCleanup();

    expect(tripId).toBe(TRIP_ID);
    // Parent + children (11, 12) + grandchildren (13, 14) + great-grandchild (15)
    expect([...sourceIds].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15]);
    expect(targetIds).toEqual(sourceIds);
  });

  it('never includes an unrelated activity', async () => {
    await deleteEntity('activity', 10, USER_ID);

    const { sourceIds } = linkedIdsFromCleanup();
    expect(sourceIds).not.toContain(30);
    expect(sourceIds).not.toContain(20);
    expect(sourceIds).not.toContain(21);
  });

  it('collects the whole subtree of a mid-tree node, not the root', async () => {
    mockVerifyEntityAccessWithPermission.mockResolvedValue({
      entity: { id: 11, tripId: TRIP_ID },
      tripAccess: { trip: { id: TRIP_ID, userId: USER_ID }, isOwner: true, permissionLevel: 'admin' },
    });

    await deleteEntity('activity', 11, USER_ID);

    const { sourceIds } = linkedIdsFromCleanup();
    expect([...sourceIds].sort((a, b) => a - b)).toEqual([11, 13, 15]);
    expect(sourceIds).not.toContain(10);
    expect(sourceIds).not.toContain(12);
  });

  it('handles a leaf activity with no children', async () => {
    mockVerifyEntityAccessWithPermission.mockResolvedValue({
      entity: { id: 30, tripId: TRIP_ID },
      tripAccess: { trip: { id: TRIP_ID, userId: USER_ID }, isOwner: true, permissionLevel: 'admin' },
    });

    await deleteEntity('activity', 30, USER_ID);

    expect(linkedIdsFromCleanup().sourceIds).toEqual([30]);
  });

  it('walks one level at a time (breadth-first), so depth is not bounded by a fixed number of queries', async () => {
    await deleteEntity('activity', 10, USER_ID);

    const parentQueries = mockPrismaClient.activity.findMany.mock.calls
      .map((call) => (call[0] as FindManyArgs).where?.parentId?.in)
      .filter((ids): ids is number[] => Array.isArray(ids));

    // Root -> {11,12} -> {13,14} -> {15} -> {} : one query per level plus the
    // terminating empty frontier is skipped by the while-loop guard.
    expect(parentQueries).toEqual([[10], [11, 12], [13, 14], [15]]);
  });

  it('terminates on a parent cycle instead of looping forever', async () => {
    // Corrupt data: 11 claims 10 as a child, forming 10 -> 11 -> 10.
    installActivityFindMany({ 10: [11], 11: [10] });

    await deleteEntity('activity', 10, USER_ID);

    expect([...linkedIdsFromCleanup().sourceIds].sort((a, b) => a - b)).toEqual([10, 11]);
  });

  it('deletes only the parent row — the database cascade removes the children', async () => {
    await deleteEntity('activity', 10, USER_ID);

    expect(mockPrismaClient.activity.delete).toHaveBeenCalledTimes(1);
    expect(mockPrismaClient.activity.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it('runs both the link cleanup and the row delete inside the transaction', async () => {
    await deleteEntity('activity', 10, USER_ID);

    expect(mockPrismaClient.$transaction).toHaveBeenCalledTimes(1);
    expect(entityLinkDeleteInsideTx).toEqual([true]);
    expect(activityDeleteInsideTx).toEqual([true]);
  });

  it('runs the descendant walk inside the transaction too (uses the tx client)', async () => {
    const walkInsideTx: boolean[] = [];
    const resolver = activityFindMany;
    mockPrismaClient.activity.findMany.mockImplementation((args: unknown) => {
      walkInsideTx.push(insideTransaction);
      return resolver(args);
    });

    await deleteEntity('activity', 10, USER_ID);

    expect(walkInsideTx.length).toBeGreaterThan(0);
    expect(walkInsideTx.every(Boolean)).toBe(true);
  });

  it('does not delete the activity row if the link cleanup fails', async () => {
    mockPrismaClient.entityLink.deleteMany.mockImplementation(() => {
      entityLinkDeleteInsideTx.push(insideTransaction);
      return Promise.reject(new Error('link cleanup exploded'));
    });

    await expect(deleteEntity('activity', 10, USER_ID)).rejects.toThrow('link cleanup exploded');
    expect(mockPrismaClient.activity.delete).not.toHaveBeenCalled();
  });

  it('does NOT walk descendants for non-activity entity types', async () => {
    mockVerifyEntityAccessWithPermission.mockResolvedValue({
      entity: { id: 41, tripId: TRIP_ID },
      tripAccess: { trip: { id: TRIP_ID, userId: USER_ID }, isOwner: true, permissionLevel: 'admin' },
    });
    mockPrismaClient.lodging.delete.mockResolvedValue({ id: 41 });

    await deleteEntity('lodging', 41, USER_ID);

    expect(mockPrismaClient.activity.findMany).not.toHaveBeenCalled();
    expect(linkedIdsFromCleanup().sourceIds).toEqual([41]);
  });
});

// ===========================================================================
// bulkDeleteEntities — many activities
// ===========================================================================

describe('bulkDeleteEntities(activity) — descendant EntityLink cleanup', () => {
  it('collects descendants for every root in the batch in a single walk', async () => {
    await bulkDeleteEntities('activity', USER_ID, TRIP_ID, [10, 20]);

    const { sourceIds } = linkedIdsFromCleanup();
    expect([...sourceIds].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 20, 21]);
  });

  it('seeds the walk with all roots at once rather than once per root', async () => {
    await bulkDeleteEntities('activity', USER_ID, TRIP_ID, [10, 20]);

    const parentQueries = mockPrismaClient.activity.findMany.mock.calls
      .map((call) => (call[0] as FindManyArgs).where?.parentId?.in)
      .filter((ids): ids is number[] => Array.isArray(ids));

    expect(parentQueries[0]).toEqual([10, 20]);
  });

  it('does not double-count an ID that is both a listed root and a descendant', async () => {
    // Caller passes the parent AND one of its children.
    await bulkDeleteEntities('activity', USER_ID, TRIP_ID, [10, 11]);

    const { sourceIds } = linkedIdsFromCleanup();
    expect(sourceIds).toEqual([...new Set(sourceIds)]);
    expect([...sourceIds].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('issues the deleteMany against only the explicitly listed IDs', async () => {
    await bulkDeleteEntities('activity', USER_ID, TRIP_ID, [10, 20]);

    expect(mockPrismaClient.activity.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 20] }, tripId: TRIP_ID },
    });
  });

  it('runs the cleanup and the batch delete inside one transaction', async () => {
    await bulkDeleteEntities('activity', USER_ID, TRIP_ID, [10, 20]);

    expect(mockPrismaClient.$transaction).toHaveBeenCalledTimes(1);
    expect(entityLinkDeleteInsideTx).toEqual([true]);
    expect(activityDeleteInsideTx).toEqual([true]);
  });

  it('does NOT walk descendants for non-activity entity types', async () => {
    mockPrismaClient.lodging.findMany.mockResolvedValue([
      { id: 41, tripId: TRIP_ID },
      { id: 42, tripId: TRIP_ID },
    ]);
    mockPrismaClient.lodging.deleteMany.mockResolvedValue({ count: 2 });

    await bulkDeleteEntities('lodging', USER_ID, TRIP_ID, [41, 42]);

    expect(mockPrismaClient.activity.findMany).not.toHaveBeenCalled();
    expect(linkedIdsFromCleanup().sourceIds).toEqual([41, 42]);
  });

  it('never cleans up links before ownership has been verified', async () => {
    mockPrismaClient.activity.findMany.mockResolvedValue([{ id: 10, tripId: TRIP_ID }]); // only 1 of 2

    await expect(
      bulkDeleteEntities('activity', USER_ID, TRIP_ID, [10, 20])
    ).rejects.toThrow("Some of those activities aren't on this trip.");

    expect(mockPrismaClient.entityLink.deleteMany).not.toHaveBeenCalled();
    expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
  });
});
