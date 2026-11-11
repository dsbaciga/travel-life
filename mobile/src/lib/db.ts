/**
 * The app's single SQLite connection, exposed through the SqlDriver interface.
 */
import * as SQLite from 'expo-sqlite';
import { createSerializedDriver, type SqlDriver, type SqlValue } from '../db/driver';
import { migrate } from '../db/schema';

const DATABASE_NAME = 'travel-life.db';

let ready: Promise<SqlDriver> | null = null;

async function open(): Promise<SqlDriver> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // WAL lets the background location task append track points while the UI reads.
  await database.execAsync('PRAGMA journal_mode = WAL;');
  const driver = createSerializedDriver({
    exec: (sql) => database.execAsync(sql),
    run: async (sql, params: readonly SqlValue[]) => {
      await database.runAsync(sql, [...params]);
    },
    all: <T>(sql: string, params: readonly SqlValue[]) => database.getAllAsync<T>(sql, [...params]),
  });
  await migrate(driver);
  return driver;
}

/** Resolves to the migrated database; opens it on first use. */
export function getDb(): Promise<SqlDriver> {
  if (!ready) {
    ready = open().catch((error) => {
      // Let the next caller retry instead of caching the failure forever.
      ready = null;
      throw error;
    });
  }
  return ready;
}
