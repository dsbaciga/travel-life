import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { participantKey } from './expenseSplitFields';
import { allocateProRata, compareKeys } from './settleUp';

type Db = Pick<typeof prisma, 'tripExpenseSplit'>;

/**
 * Re-spreads an expense's stored shares over a new amount, keeping the sum exact (proportional to the
 * old shares; the odd cents land on the largest share). Shares are stored in the expense's own
 * currency and must always add up to the amount. Works inside or outside a transaction (the updates
 * run one after the other, in a fixed participant order).
 *
 * `ownerCompanionId` is the trip OWNER's "myself" companion; it only decides the participant keys the
 * allocation orders by, which keeps the result identical to what settle-up computes.
 */
export async function rescaleExpenseSplits(
  db: Db,
  expenseId: number,
  newAmount: Prisma.Decimal,
  ownerCompanionId: number | null
): Promise<void> {
  const splits = await db.tripExpenseSplit.findMany({ where: { expenseId } });
  if (splits.length === 0) return;

  const keyOf = (s: (typeof splits)[number]) => participantKey(s.companionId, ownerCompanionId);
  const rescaled = allocateProRata(
    newAmount,
    splits.map((s) => ({ participant: keyOf(s), weight: s.amount }))
  );
  const amountByKey = new Map(rescaled.map((r) => [r.participant, r.amount]));

  for (const s of [...splits].sort((a, b) => compareKeys(keyOf(a), keyOf(b)))) {
    await db.tripExpenseSplit.update({
      where: { id: s.id },
      data: { amount: amountByKey.get(keyOf(s)) ?? s.amount },
    });
  }
}
