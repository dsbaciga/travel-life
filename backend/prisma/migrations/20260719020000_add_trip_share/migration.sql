-- Add public share link support for trips
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "share_token" VARCHAR(64);
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "share_enabled" BOOLEAN NOT NULL DEFAULT false;

-- One share token maps to exactly one trip
CREATE UNIQUE INDEX IF NOT EXISTS "trips_share_token_key" ON "trips"("share_token");
