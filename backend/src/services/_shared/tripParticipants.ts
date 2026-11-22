import prisma from '../../config/database';
import { OWNER_KEY, companionKey } from './settleUp';
import { ExpenseParticipant } from '../../types/expenseSplit.types';

/** Parses `owner` / `companion:<id>` into a companion id (null for the owner). */
export function companionIdOf(key: string): number | null {
  return key === OWNER_KEY ? null : Number(key.slice('companion:'.length));
}

/**
 * Everyone an expense can be paid by or shared with, and who can pay whom in a settlement: the
 * trip owner plus the companions linked to the trip. The owner's own "myself" companion
 * (`isMyself`) is left out: it is the `owner` entry, so it never appears twice (whether or not
 * it is assigned to the trip).
 */
export async function loadTripParticipants(
  tripId: number,
  ownerId: number
): Promise<ExpenseParticipant[]> {
  const [owner, links] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { username: true } }),
    prisma.tripCompanion.findMany({
      where: { tripId, companion: { isMyself: false } },
      select: { companion: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
    }),
  ]);

  return [
    { key: OWNER_KEY, label: owner?.username ?? 'Trip owner', kind: 'owner' },
    ...links.map(
      (link): ExpenseParticipant => ({
        key: companionKey(link.companion.id),
        label: link.companion.name,
        kind: 'companion',
      })
    ),
  ];
}

export function fallbackParticipantLabel(key: string): string {
  return key === OWNER_KEY ? 'Trip owner' : `Former companion #${companionIdOf(key)}`;
}

/**
 * Display names for participant keys. A companion unlinked from the trip after being used in a
 * split or settlement still has a name; one that was deleted outright falls back to a placeholder.
 */
export async function participantLabels(
  tripId: number,
  ownerId: number,
  keys: Iterable<string>
): Promise<(key: string) => string> {
  const labels = new Map((await loadTripParticipants(tripId, ownerId)).map((p) => [p.key, p.label]));
  const unknownIds = [...new Set(keys)]
    .filter((key) => !labels.has(key))
    .map(companionIdOf)
    .filter((id): id is number => id !== null);
  if (unknownIds.length > 0) {
    const named = await prisma.travelCompanion.findMany({
      where: { id: { in: unknownIds } },
      select: { id: true, name: true },
    });
    for (const c of named) labels.set(companionKey(c.id), c.name);
  }
  return (key) => labels.get(key) ?? fallbackParticipantLabel(key);
}
