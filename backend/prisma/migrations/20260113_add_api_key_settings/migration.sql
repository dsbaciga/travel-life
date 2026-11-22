-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aviationstack_api_key" VARCHAR(500);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "openrouteservice_api_key" VARCHAR(500);
