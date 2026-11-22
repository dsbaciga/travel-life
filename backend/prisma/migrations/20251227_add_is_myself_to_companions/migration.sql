-- AlterTable
ALTER TABLE "travel_companions" ADD COLUMN IF NOT EXISTS "is_myself" BOOLEAN NOT NULL DEFAULT false;
