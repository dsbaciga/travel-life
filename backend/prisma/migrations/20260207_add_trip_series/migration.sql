-- CreateTable
CREATE TABLE IF NOT EXISTS "trip_series" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_series_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "series_id" INTEGER,
ADD COLUMN IF NOT EXISTS "series_order" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trip_series_user_id_idx" ON "trip_series"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_series_id_series_order_idx" ON "trips"("series_id", "series_order");

-- AddForeignKey
ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_series_id_fkey";
ALTER TABLE "trips" ADD CONSTRAINT "trips_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "trip_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_series" DROP CONSTRAINT IF EXISTS "trip_series_user_id_fkey";
ALTER TABLE "trip_series" ADD CONSTRAINT "trip_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
