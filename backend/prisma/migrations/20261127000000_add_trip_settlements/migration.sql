-- Recorded settlement payments (#97). Settle-up subtracts these from the net balances.
-- A person is a companion row (the trip owner is their "myself" companion), like trip_expense_splits.

CREATE TABLE "trip_settlements" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "from_companion_id" INTEGER NOT NULL,
    "to_companion_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_settlements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_settlements_trip_id_date_idx" ON "trip_settlements"("trip_id", "date");
CREATE INDEX "trip_settlements_from_companion_id_idx" ON "trip_settlements"("from_companion_id");
CREATE INDEX "trip_settlements_to_companion_id_idx" ON "trip_settlements"("to_companion_id");

ALTER TABLE "trip_settlements" ADD CONSTRAINT "trip_settlements_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Deleting a companion deletes the payments they were part of, as it deletes their expense shares.
ALTER TABLE "trip_settlements" ADD CONSTRAINT "trip_settlements_from_companion_id_fkey"
  FOREIGN KEY ("from_companion_id") REFERENCES "travel_companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_settlements" ADD CONSTRAINT "trip_settlements_to_companion_id_fkey"
  FOREIGN KEY ("to_companion_id") REFERENCES "travel_companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot represent CHECK constraints.
ALTER TABLE "trip_settlements" ADD CONSTRAINT "trip_settlements_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "trip_settlements" ADD CONSTRAINT "trip_settlements_distinct_people"
  CHECK ("from_companion_id" <> "to_companion_id");
