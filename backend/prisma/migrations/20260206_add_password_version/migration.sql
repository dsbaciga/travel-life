-- Add password_version column to users table
-- Used to invalidate JWT tokens when a user changes their password.
-- Existing users default to 0; password changes increment this value.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_version" INTEGER NOT NULL DEFAULT 0;
