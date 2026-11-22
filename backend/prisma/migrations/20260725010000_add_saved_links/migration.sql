-- Add SAVED_LINK to the existing EntityType enum so saved links can participate
-- in the entity-linking system (attachable to activities, lodging, locations, etc.)
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'SAVED_LINK';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SavedLinkSource" AS ENUM ('MANUAL', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "LinkMetadataStatus" AS ENUM ('PENDING', 'FETCHED', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "saved_links" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "trip_id" INTEGER,
    "url" TEXT NOT NULL,
    "title" VARCHAR(1000),
    "description" TEXT,
    "site_name" VARCHAR(255),
    "image_url" TEXT,
    "notes" TEXT,
    "source" "SavedLinkSource" NOT NULL DEFAULT 'MANUAL',
    "metadata_status" "LinkMetadataStatus" NOT NULL DEFAULT 'PENDING',
    "metadata_fetched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "saved_links_user_id_idx" ON "saved_links"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "saved_links_user_id_trip_id_idx" ON "saved_links"("user_id", "trip_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "saved_links_trip_id_idx" ON "saved_links"("trip_id");

-- AddForeignKey
ALTER TABLE "saved_links" DROP CONSTRAINT IF EXISTS "saved_links_user_id_fkey";
ALTER TABLE "saved_links" ADD CONSTRAINT "saved_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_links" DROP CONSTRAINT IF EXISTS "saved_links_trip_id_fkey";
ALTER TABLE "saved_links" ADD CONSTRAINT "saved_links_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
