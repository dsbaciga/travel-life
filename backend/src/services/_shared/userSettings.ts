import { Prisma, type UserIntegrations, type UserPreferences } from '@prisma/client';
import prisma from '../../config/database';
import { AppError } from '../../errors/errors';

/**
 * The single place that reads and writes `user_integrations` and `user_preferences`
 * (split out of `users` by migration 20261124000000_split_user_table). Nothing else touches
 * these two tables, so a secret never travels with an ordinary user query.
 *
 *  - `user_integrations`: Immich, weather, Aviationstack, OpenRouteService, LLM and SMTP
 *    settings. API keys and the SMTP password are stored as ciphertext (`security/encryption.ts`);
 *    these accessors never decrypt or encrypt, callers do that at the edge exactly as before.
 *  - `user_preferences`: categories, trip types, dietary preferences, link ingest senders, map
 *    style, home currency, preferred maps app, measurement system and the default travel partner
 *    permission.
 *
 * Every user always has both rows: user creation includes {@link defaultUserSettingsCreate}, and
 * the migration backfilled the existing users. The accessors still tolerate a missing row (a read
 * creates it with the column defaults, a write upserts it), so a user created by some other path
 * never crashes anything. A user that does not exist at all is a 404.
 *
 * Writes also stamp `users.updated_at`, because the settings used to live on that row and the
 * `/users/me` payload still reports it.
 */

/** A transaction client or the root client. */
type Db = Pick<typeof prisma, 'user' | 'userIntegrations' | 'userPreferences'>;

/**
 * Nested create data for `prisma.user.create({ data: { ..., ...defaultUserSettingsCreate } })`:
 * creates the user's two settings rows (all column defaults) in the same statement.
 */
export const defaultUserSettingsCreate = {
  integrations: { create: {} },
  preferences: { create: {} },
} as const;

export type UserIntegrationsData = Omit<UserIntegrations, 'userId'>;
export type UserPreferencesData = Omit<UserPreferences, 'userId'>;
export type UserIntegrationsInput = Partial<UserIntegrationsData>;
export type UserPreferencesInput = Partial<{
  [K in keyof UserPreferencesData]: UserPreferencesData[K] extends Prisma.JsonValue
    ? UserPreferencesData[K] | Prisma.InputJsonValue
    : UserPreferencesData[K];
}>;

const userNotFound = () => new AppError('User not found', 404);

/**
 * The user's integration settings (ciphertext for the secrets). Creates the row with the
 * defaults (every column null) when it is missing. Null when the user does not exist.
 */
export async function findUserIntegrations(userId: number, db: Db = prisma): Promise<UserIntegrations | null> {
  const row = await db.userIntegrations.findUnique({ where: { userId } });
  if (row) return row;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return null;
  return db.userIntegrations.upsert({ where: { userId }, update: {}, create: { userId } });
}

/**
 * The user's preferences. Creates the row with the column defaults when it is missing. Null when
 * the user does not exist.
 */
export async function findUserPreferences(userId: number, db: Db = prisma): Promise<UserPreferences | null> {
  const row = await db.userPreferences.findUnique({ where: { userId } });
  if (row) return row;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return null;
  return db.userPreferences.upsert({ where: { userId }, update: {}, create: { userId } });
}

/** {@link findUserIntegrations}, but a missing user is a 404. */
export async function getUserIntegrations(userId: number, db: Db = prisma): Promise<UserIntegrations> {
  const row = await findUserIntegrations(userId, db);
  if (!row) throw userNotFound();
  return row;
}

/** {@link findUserPreferences}, but a missing user is a 404. */
export async function getUserPreferences(userId: number, db: Db = prisma): Promise<UserPreferences> {
  const row = await findUserPreferences(userId, db);
  if (!row) throw userNotFound();
  return row;
}

/** Stamp `users.updated_at`; fails with a 404 when the user is gone. */
async function touchUser(db: Db, userId: number): Promise<void> {
  try {
    await db.user.update({ where: { id: userId }, data: { updatedAt: new Date() }, select: { id: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw userNotFound();
    throw error;
  }
}

/**
 * Run `work` on the given client, or in its own transaction when none is given, so the
 * `users.updated_at` stamp and the settings write are atomic.
 */
async function inTransaction<T>(db: Db | undefined, work: (tx: Db) => Promise<T>): Promise<T> {
  if (db) return work(db);
  return prisma.$transaction((tx) => work(tx as unknown as Db));
}

/**
 * Update (creating the row if it is missing) the integration settings of a user. Only the keys present
 * in `data` change. Pass already-encrypted values for the secrets.
 * @returns the row as stored after the write
 */
export async function updateUserIntegrations(
  userId: number,
  data: UserIntegrationsInput,
  db?: Db
): Promise<UserIntegrations> {
  return inTransaction(db, async (tx) => {
    await touchUser(tx, userId);
    return tx.userIntegrations.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  });
}

/**
 * Update (creating the row if it is missing) the preferences of a user. Only the keys present in
 * `data` change.
 * @returns the row as stored after the write
 */
export async function updateUserPreferences(
  userId: number,
  data: UserPreferencesInput,
  db?: Db
): Promise<UserPreferences> {
  return inTransaction(db, async (tx) => {
    await touchUser(tx, userId);
    return tx.userPreferences.upsert({
      where: { userId },
      update: data as Prisma.UserPreferencesUncheckedUpdateInput,
      create: { userId, ...data } as Prisma.UserPreferencesUncheckedCreateInput,
    });
  });
}

/**
 * The first user (lowest id) whose `linkIngestSenders` list contains `fromAddress`, or null. The list is a
 * JSON array filtered in application code, so matching stays case-insensitive on the stored entry; the
 * caller passes the address in the form it wants compared (the ingest service lower-cases it).
 */
export async function findUserIdBySender(fromAddress: string, db: Db = prisma): Promise<number | null> {
  const rows = await db.userPreferences.findMany({
    select: { userId: true, linkIngestSenders: true },
    orderBy: { userId: 'asc' },
  });
  for (const row of rows) {
    const senders = Array.isArray(row.linkIngestSenders) ? row.linkIngestSenders : [];
    if (senders.some((entry) => typeof entry === 'string' && entry.toLowerCase().trim() === fromAddress)) {
      return row.userId;
    }
  }
  return null;
}
