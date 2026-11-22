-- AlterTable
ALTER TABLE "transportation" ADD COLUMN IF NOT EXISTS "calculated_distance" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "calculated_duration" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "distance_source" VARCHAR(20);

-- CreateTable
CREATE TABLE IF NOT EXISTS "route_cache" (
    "id" SERIAL NOT NULL,
    "from_lat" DECIMAL(10,8) NOT NULL,
    "from_lon" DECIMAL(11,8) NOT NULL,
    "to_lat" DECIMAL(10,8) NOT NULL,
    "to_lon" DECIMAL(11,8) NOT NULL,
    "distance" DECIMAL(10,2) NOT NULL,
    "duration" DECIMAL(10,2) NOT NULL,
    "profile" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "route_cache_from_lat_from_lon_to_lat_to_lon_profile_idx" ON "route_cache"("from_lat", "from_lon", "to_lat", "to_lon", "profile");
