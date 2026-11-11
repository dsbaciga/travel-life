
-- CreateTable
CREATE TABLE "booking_deadlines" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "lodging_id" INTEGER,
    "transportation_id" INTEGER,
    "activity_id" INTEGER,
    "kind" VARCHAR(30) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(500),
    "dismissed_at" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_deadlines_trip_id_idx" ON "booking_deadlines"("trip_id");

-- CreateIndex
CREATE INDEX "booking_deadlines_due_at_idx" ON "booking_deadlines"("due_at");

-- CreateIndex
CREATE INDEX "booking_deadlines_lodging_id_idx" ON "booking_deadlines"("lodging_id");

-- CreateIndex
CREATE INDEX "booking_deadlines_transportation_id_idx" ON "booking_deadlines"("transportation_id");

-- CreateIndex
CREATE INDEX "booking_deadlines_activity_id_idx" ON "booking_deadlines"("activity_id");

-- AddForeignKey
ALTER TABLE "booking_deadlines" ADD CONSTRAINT "booking_deadlines_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deadlines" ADD CONSTRAINT "booking_deadlines_lodging_id_fkey" FOREIGN KEY ("lodging_id") REFERENCES "lodging"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deadlines" ADD CONSTRAINT "booking_deadlines_transportation_id_fkey" FOREIGN KEY ("transportation_id") REFERENCES "transportation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deadlines" ADD CONSTRAINT "booking_deadlines_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one booking target per deadline. Prisma cannot represent CHECK constraints.
ALTER TABLE "booking_deadlines" ADD CONSTRAINT "booking_deadlines_one_target"
  CHECK (num_nonnulls("lodging_id", "transportation_id", "activity_id") = 1);
