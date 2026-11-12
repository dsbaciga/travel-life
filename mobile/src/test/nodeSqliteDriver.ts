/**
 * SqlDriver over Node's built-in SQLite, for unit tests only.
 *
 * Same SQL dialect as the SQLite that expo-sqlite ships, so the schema,
 * migrations, outbox and remap statements are exercised for real rather than
 * against a mock. It goes through the same `createSerializedDriver` the app
 * uses, so transaction and queueing behaviour is the production behaviour.
 */
import { DatabaseSync } from 'node:sqlite';
import { createSerializedDriver, type SqlDriver, type SqlValue } from '../db/driver';
import { migrate } from '../db/schema';

export type TestDb = SqlDriver & { close(): void };

export function createNodeSqliteDriver(): TestDb {
  const database = new DatabaseSync(':memory:');
  const driver = createSerializedDriver({
    async exec(sql: string): Promise<void> {
      database.exec(sql);
    },
    async run(sql: string, params: readonly SqlValue[]): Promise<void> {
      database.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: readonly SqlValue[]): Promise<T[]> {
      return database.prepare(sql).all(...params) as T[];
    },
  });
  return { ...driver, close: () => database.close() };
}

/** A migrated, empty in-memory database. */
export async function createTestDb(): Promise<TestDb> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}
