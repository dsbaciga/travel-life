-- CreateTable
CREATE TABLE "food_log_entries" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "activity_id" INTEGER,
    "location_id" INTEGER,
    "restaurant_name" VARCHAR(200) NOT NULL,
    "dish" VARCHAR(200) NOT NULL,
    "rating" INTEGER NOT NULL,
    "notes" VARCHAR(2000),
    "order_again" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_log_entries_trip_id_idx" ON "food_log_entries"("trip_id");

-- CreateIndex
CREATE INDEX "food_log_entries_activity_id_idx" ON "food_log_entries"("activity_id");

-- CreateIndex
CREATE INDEX "food_log_entries_location_id_idx" ON "food_log_entries"("location_id");

-- CreateIndex
CREATE INDEX "food_log_entries_rating_idx" ON "food_log_entries"("rating");

-- AddForeignKey
ALTER TABLE "food_log_entries" ADD CONSTRAINT "food_log_entries_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_log_entries" ADD CONSTRAINT "food_log_entries_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_log_entries" ADD CONSTRAINT "food_log_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ratings are 1 to 5 stars. Prisma cannot represent CHECK constraints.
ALTER TABLE "food_log_entries" ADD CONSTRAINT "food_log_entries_rating_range"
  CHECK ("rating" BETWEEN 1 AND 5);
