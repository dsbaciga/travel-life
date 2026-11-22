-- Add per-user secret token for the read-only iCal calendar feed
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "calendar_token" VARCHAR(64);

-- One feed token maps to exactly one user
CREATE UNIQUE INDEX IF NOT EXISTS "users_calendar_token_key" ON "users"("calendar_token");
