-- CreateIndex: Add unique constraint to prevent duplicate route cache entries
-- The existing non-unique index on the same columns is dropped since the unique
-- index serves as both a uniqueness constraint and a lookup index.
DROP INDEX IF EXISTS "route_cache_from_lat_from_lon_to_lat_to_lon_profile_idx";

-- CreateIndex
-- Skipped when the 00000000000000_init baseline already created the same unique index
-- under Prisma's default name (a second identical index would just double the write cost).
DO $$ BEGIN
    IF to_regclass('route_cache_from_lat_from_lon_to_lat_to_lon_profile_key') IS NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS "route_cache_coords_profile_unique" ON "route_cache"("from_lat", "from_lon", "to_lat", "to_lon", "profile");
    END IF;
END $$;
