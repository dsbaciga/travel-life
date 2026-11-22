-- AlterTable
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "manual_order" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activities_trip_id_manual_order_idx" ON "activities"("trip_id", "manual_order");
