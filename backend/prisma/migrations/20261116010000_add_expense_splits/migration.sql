-- Expense splitting & settle-up (#97).
-- Who paid an expense (the trip owner OR a companion) and how it is shared out.

ALTER TABLE "trip_expenses" ADD COLUMN "paid_by_owner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trip_expenses" ADD COLUMN "paid_by_companion_id" INTEGER;
ALTER TABLE "trip_expenses" ADD COLUMN "split_method" VARCHAR(20);

-- A companion deleted from the address book leaves the expense in place with no recorded payer.
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_paid_by_companion_id_fkey"
  FOREIGN KEY ("paid_by_companion_id") REFERENCES "travel_companions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "trip_expenses_paid_by_companion_id_idx" ON "trip_expenses"("paid_by_companion_id");

-- At most one payer. Prisma cannot represent CHECK constraints.
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_one_payer"
  CHECK (NOT ("paid_by_owner" AND "paid_by_companion_id" IS NOT NULL));
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_split_method_valid"
  CHECK ("split_method" IS NULL OR "split_method" IN ('equal', 'amount', 'percentage'));

CREATE TABLE "trip_expense_splits" (
    "id" SERIAL NOT NULL,
    "expense_id" INTEGER NOT NULL,
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "companion_id" INTEGER,
    "amount" DECIMAL(10,2) NOT NULL,
    "percentage" DECIMAL(7,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_expense_splits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_expense_splits_expense_id_idx" ON "trip_expense_splits"("expense_id");
CREATE INDEX "trip_expense_splits_companion_id_idx" ON "trip_expense_splits"("companion_id");

ALTER TABLE "trip_expense_splits" ADD CONSTRAINT "trip_expense_splits_expense_id_fkey"
  FOREIGN KEY ("expense_id") REFERENCES "trip_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Removing a companion removes their share; settle-up then treats the expense as unsplit
-- (its shares no longer add up to the amount) instead of silently re-assigning the money.
ALTER TABLE "trip_expense_splits" ADD CONSTRAINT "trip_expense_splits_companion_id_fkey"
  FOREIGN KEY ("companion_id") REFERENCES "travel_companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one participant per row and a non-negative share. A participant appearing once per
-- expense is enforced in expenseSplit.service.ts (a partial unique index would show up as drift
-- in `prisma migrate dev`, since Prisma cannot represent it).
ALTER TABLE "trip_expense_splits" ADD CONSTRAINT "trip_expense_splits_one_participant"
  CHECK (("is_owner" AND "companion_id" IS NULL) OR (NOT "is_owner" AND "companion_id" IS NOT NULL));
ALTER TABLE "trip_expense_splits" ADD CONSTRAINT "trip_expense_splits_amount_non_negative"
  CHECK ("amount" >= 0);
