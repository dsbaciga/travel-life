/**
 * Serialized driver tests
 *
 * Test cases:
 * - DRV-001: A failed transaction rolls back completely
 * - DRV-002: Concurrent transactions do not share fate (one rollback keeps the other's writes)
 * - DRV-003: A lone statement issued during a transaction waits and is not rolled back with it
 * - DRV-004: Nested transactions join the outer one and roll back together
 * - DRV-005: The queue keeps moving after a failure
 * - DRV-006: A user edit made while a sync flush is in flight is not lost
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeSqliteDriver, createTestDb, type TestDb } from '../../test/nodeSqliteDriver';
import { FakeServer } from '../../test/fakeServer';
import { createEntity, setIdFactory, updateEntity } from '../../domain/mutations';
import { flushOutbox, pullTrip } from '../../sync/engine';
import { listOutbox } from '../../sync/outbox';
import { getEntity } from '../repository';

const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

describe('createSerializedDriver', () => {
  let db: TestDb;
  const values = async (): Promise<string[]> =>
    (await db.all<{ v: string }>('SELECT v FROM t ORDER BY v')).map((row) => row.v);

  beforeEach(async () => {
    db = createNodeSqliteDriver();
    await db.exec('CREATE TABLE t (v TEXT)');
  });
  afterEach(() => db.close());

  it('DRV-001: a failed transaction rolls back completely', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t VALUES (?)', ['a']);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(await values()).toEqual([]);
  });

  it('DRV-002: concurrent transactions do not share fate', async () => {
    const failing = db.transaction(async (tx) => {
      await tx.run('INSERT INTO t VALUES (?)', ['doomed']);
      await tick();
      throw new Error('boom');
    });
    // Starts while the first is still open.
    const succeeding = db.transaction(async (tx) => {
      await tx.run('INSERT INTO t VALUES (?)', ['kept']);
      await tick();
    });

    await expect(failing).rejects.toThrow('boom');
    await succeeding;
    expect(await values()).toEqual(['kept']);
  });

  it('DRV-003: a lone statement issued during a transaction is not rolled back with it', async () => {
    const failing = db.transaction(async (tx) => {
      await tx.run('INSERT INTO t VALUES (?)', ['doomed']);
      await tick();
      throw new Error('boom');
    });
    const lone = db.run('INSERT INTO t VALUES (?)', ['lone']);

    await expect(failing).rejects.toThrow('boom');
    await lone;
    expect(await values()).toEqual(['lone']);
  });

  it('DRV-004: nested transactions join the outer one', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async (inner) => {
          await inner.run('INSERT INTO t VALUES (?)', ['inner']);
        });
        throw new Error('outer fails after inner finished');
      })
    ).rejects.toThrow();
    expect(await values()).toEqual([]);

    await db.transaction(async (tx) => {
      await tx.transaction(async (inner) => {
        await inner.run('INSERT INTO t VALUES (?)', ['inner']);
      });
      await tx.run('INSERT INTO t VALUES (?)', ['outer']);
    });
    expect(await values()).toEqual(['inner', 'outer']);
  });

  it('DRV-005: the queue keeps moving after a failure', async () => {
    await expect(db.run('INSERT INTO missing VALUES (1)')).rejects.toThrow();
    await db.run('INSERT INTO t VALUES (?)', ['after']);
    expect(await values()).toEqual(['after']);
  });
});

describe('concurrent edit during sync', () => {
  it('DRV-006: a user edit made while a flush is in flight is not lost', async () => {
    const db = await createTestDb();
    const server = new FakeServer();
    let n = 0;
    setIdFactory(() => `d${++n}`);
    const seeded = server.seed('ACTIVITY', {
      name: 'Museum',
      notes: null,
      allDay: false,
      startTime: null,
      endTime: null,
      manualOrder: null,
      parentId: null,
    });
    await pullTrip(db, server, 10);
    await createEntity(db, 'LOCATION', 10, {
      parentId: null,
      name: 'Cafe',
      address: null,
      latitude: null,
      longitude: null,
      categoryId: null,
      visitDatetime: null,
      visitDurationMinutes: null,
      notes: null,
      isFavorite: false,
      openingHours: null,
      timezone: null,
    });

    // Fire the flush and an edit at the same moment.
    const [flushed] = await Promise.all([
      flushOutbox(db, server),
      updateEntity(db, 'ACTIVITY', seeded.id as number, { notes: 'typed during sync' }),
    ]);

    expect(flushed.failed).toBe(0);
    expect((await getEntity(db, 'ACTIVITY', seeded.id as number))?.notes).toBe('typed during sync');
    // Whatever the flush did not get to is still queued, then delivered.
    await flushOutbox(db, server);
    expect(await listOutbox(db)).toHaveLength(0);
    expect(server.get('ACTIVITY', seeded.id as number)?.notes).toBe('typed during sync');
    expect(server.all('LOCATION')).toHaveLength(1);
    db.close();
  });
});
