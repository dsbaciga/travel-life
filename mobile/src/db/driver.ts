/**
 * The narrow SQLite surface the offline engine depends on.
 *
 * Everything in `db/`, `sync/` and `domain/` talks to this interface instead of
 * `expo-sqlite` directly, so the outbox, id remapping and conflict logic run
 * unmodified against Node's built-in SQLite in unit tests.
 */

export type SqlValue = string | number | null;

export interface SqlDriver {
  /** Execute one or more statements with no parameters (DDL, PRAGMA). */
  exec(sql: string): Promise<void>;
  /** Execute a single write statement. */
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  /** Execute a query and return every row. */
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /**
   * Run `task` atomically: every write commits together or none does.
   *
   * The task receives a driver bound to the transaction and must use it for
   * everything it does. Calling `transaction` on that driver joins the same
   * transaction, so helpers compose without knowing whether they are nested.
   */
  transaction<T>(task: (tx: SqlDriver) => Promise<T>): Promise<T>;
}

/** The three primitives a concrete SQLite binding has to supply. */
export interface RawSql {
  exec(sql: string): Promise<void>;
  run(sql: string, params: readonly SqlValue[]): Promise<void>;
  all<T>(sql: string, params: readonly SqlValue[]): Promise<T[]>;
}

/**
 * Wrap a single SQLite connection so that work on it is strictly serialized.
 *
 * One connection has one transaction state. The sync engine and the UI both
 * write concurrently (a flush delivering the outbox while the traveller edits
 * an activity); without serialization the UI's `BEGIN` would land inside the
 * flush's open transaction and one rollback would silently discard the
 * other's writes. Here every top-level operation — a transaction or a lone
 * statement — waits its turn in a FIFO queue, and only code holding the
 * transaction-bound driver may touch the connection in the meantime.
 */
export function createSerializedDriver(raw: RawSql): SqlDriver {
  let tail: Promise<unknown> = Promise.resolve();

  /** Queue `work` behind everything already scheduled. */
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work, work);
    // The queue must keep moving after a failure; the caller still sees it.
    tail = result.catch(() => undefined);
    return result;
  }

  // Bound to an open transaction: runs immediately, because the queue slot is
  // already held by the transaction this driver belongs to.
  const bound: SqlDriver = {
    exec: (sql) => raw.exec(sql),
    run: (sql, params = []) => raw.run(sql, params),
    all: (sql, params = []) => raw.all(sql, params),
    transaction: (task) => task(bound),
  };

  return {
    exec: (sql) => enqueue(() => raw.exec(sql)),
    run: (sql, params = []) => enqueue(() => raw.run(sql, params)),
    all: (sql, params = []) => enqueue(() => raw.all(sql, params)),
    transaction: (task) =>
      enqueue(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await task(bound);
          await raw.exec('COMMIT');
          return result;
        } catch (error) {
          await raw.exec('ROLLBACK');
          throw error;
        }
      }),
  };
}

/** First row or null. */
export async function first<T>(
  db: SqlDriver,
  sql: string,
  params: readonly SqlValue[] = []
): Promise<T | null> {
  const rows = await db.all<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
