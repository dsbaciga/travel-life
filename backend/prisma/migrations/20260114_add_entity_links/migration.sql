-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "EntityType" AS ENUM ('PHOTO', 'LOCATION', 'ACTIVITY', 'LODGING', 'TRANSPORTATION', 'JOURNAL_ENTRY', 'PHOTO_ALBUM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "LinkRelationship" AS ENUM ('RELATED', 'TAKEN_AT', 'OCCURRED_AT', 'PART_OF', 'DOCUMENTS', 'FEATURED_IN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "entity_links" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "source_type" "EntityType" NOT NULL,
    "source_id" INTEGER NOT NULL,
    "target_type" "EntityType" NOT NULL,
    "target_id" INTEGER NOT NULL,
    "relationship" "LinkRelationship" NOT NULL DEFAULT 'RELATED',
    "sort_order" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Prevent duplicate links
CREATE UNIQUE INDEX IF NOT EXISTS "entity_links_trip_id_source_type_source_id_target_type_targ_key" ON "entity_links"("trip_id", "source_type", "source_id", "target_type", "target_id");

-- CreateIndex: Query what is linked FROM an entity
CREATE INDEX IF NOT EXISTS "entity_links_trip_id_source_type_source_id_idx" ON "entity_links"("trip_id", "source_type", "source_id");

-- CreateIndex: Query what is linked TO an entity
CREATE INDEX IF NOT EXISTS "entity_links_trip_id_target_type_target_id_idx" ON "entity_links"("trip_id", "target_type", "target_id");

-- AddForeignKey
ALTER TABLE "entity_links" DROP CONSTRAINT IF EXISTS "entity_links_trip_id_fkey";
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
