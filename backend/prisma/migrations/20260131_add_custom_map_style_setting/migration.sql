-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "use_custom_map_style" BOOLEAN NOT NULL DEFAULT true;
