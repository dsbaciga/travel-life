-- Add trip archiving flag
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;

-- Add favorite flag to locations
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_favorite" BOOLEAN NOT NULL DEFAULT false;
