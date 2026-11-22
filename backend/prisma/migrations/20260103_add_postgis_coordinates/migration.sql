-- AlterTable
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "coordinates" geography(Point, 4326);

-- AlterTable
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "coordinates" geography(Point, 4326);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "locations_coordinates_idx" ON "locations" USING GIST ("coordinates");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "photos_coordinates_idx" ON "photos" USING GIST ("coordinates");

