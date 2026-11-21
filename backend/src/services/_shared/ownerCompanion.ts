import prisma from '../../config/database';

/**
 * The trip owner as an expense payer / split participant is the owner's "myself" companion
 * (`TravelCompanion.isMyself`, `linkedUserId = userId`; at most one per user, enforced by the
 * partial unique index `travel_companions_user_id_is_myself_key`).
 *
 * "Owner" always means the TRIP's owner (`Trip.userId`), never whoever is signed in: a
 * collaborator editing an expense on someone else's trip still means that trip's owner.
 */
type Db = Pick<typeof prisma, 'travelCompanion' | 'user' | '$executeRaw'>;

/** The id of a user's "myself" companion, or null when they have none. */
export async function findOwnerCompanionId(db: Db, ownerUserId: number): Promise<number | null> {
  const row = await db.travelCompanion.findFirst({
    where: { userId: ownerUserId, isMyself: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return row?.id ?? null;
}

/**
 * The id of a user's "myself" companion, creating it (named after the username) when missing.
 * Safe to call inside a transaction and under concurrency: the insert is `ON CONFLICT DO NOTHING`
 * against the partial unique index, so a racing creator never aborts the transaction.
 */
export async function ensureOwnerCompanionId(db: Db, ownerUserId: number): Promise<number> {
  const existing = await findOwnerCompanionId(db, ownerUserId);
  if (existing !== null) return existing;

  const user = await db.user.findUniqueOrThrow({
    where: { id: ownerUserId },
    select: { username: true },
  });
  await db.$executeRaw`
    INSERT INTO "travel_companions" ("user_id", "name", "is_myself", "linked_user_id")
    VALUES (${ownerUserId}, ${user.username}, true, ${ownerUserId})
    ON CONFLICT DO NOTHING`;

  const created = await findOwnerCompanionId(db, ownerUserId);
  if (created === null) throw new Error(`Could not create the "myself" companion of user ${ownerUserId}`);
  return created;
}
