-- AlterTable
ALTER TABLE "photos" ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "photos_trip_id_is_favorite_idx" ON "photos"("trip_id", "is_favorite");
