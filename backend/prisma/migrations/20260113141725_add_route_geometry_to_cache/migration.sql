-- AlterTable
ALTER TABLE "route_cache" ADD COLUMN IF NOT EXISTS "route_geometry" JSONB;
