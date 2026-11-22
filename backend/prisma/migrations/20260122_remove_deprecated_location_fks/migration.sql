-- Remove deprecated location FK columns
-- These columns have been replaced by the unified EntityLink system (added in 20260114_add_entity_links)
-- This migration:
--   1. Migrates existing FK data to EntityLinks (preserving relationships)
--   2. Drops the FK constraints
--   3. Drops the deprecated columns

-- =============================================================================
-- STEP 1: Migrate existing Activity.locationId to EntityLinks
-- =============================================================================
DO $$ BEGIN
    -- Skipped when the column is already gone (e.g. a database built from the 00000000000000_init baseline).
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'activities' AND column_name = 'location_id') THEN
        INSERT INTO "entity_links" ("trip_id", "source_type", "source_id", "target_type", "target_id", "relationship", "created_at")
        SELECT
            a."trip_id",
            'ACTIVITY'::"EntityType",
            a."id",
            'LOCATION'::"EntityType",
            a."location_id",
            'OCCURRED_AT'::"LinkRelationship",
            CURRENT_TIMESTAMP
        FROM "activities" a
        WHERE a."location_id" IS NOT NULL
        ON CONFLICT ("trip_id", "source_type", "source_id", "target_type", "target_id") DO NOTHING;
    END IF;
END $$;

-- =============================================================================
-- STEP 2: Migrate existing Lodging.locationId to EntityLinks
-- =============================================================================
DO $$ BEGIN
    -- Skipped when the column is already gone (e.g. a database built from the 00000000000000_init baseline).
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'lodging' AND column_name = 'location_id') THEN
        INSERT INTO "entity_links" ("trip_id", "source_type", "source_id", "target_type", "target_id", "relationship", "created_at")
        SELECT
            l."trip_id",
            'LODGING'::"EntityType",
            l."id",
            'LOCATION'::"EntityType",
            l."location_id",
            'OCCURRED_AT'::"LinkRelationship",
            CURRENT_TIMESTAMP
        FROM "lodging" l
        WHERE l."location_id" IS NOT NULL
        ON CONFLICT ("trip_id", "source_type", "source_id", "target_type", "target_id") DO NOTHING;
    END IF;
END $$;

-- =============================================================================
-- STEP 3: Migrate existing PhotoAlbum.locationId to EntityLinks
-- =============================================================================
DO $$ BEGIN
    -- Skipped when the column is already gone (e.g. a database built from the 00000000000000_init baseline).
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'photo_albums' AND column_name = 'location_id') THEN
        INSERT INTO "entity_links" ("trip_id", "source_type", "source_id", "target_type", "target_id", "relationship", "created_at")
        SELECT
            pa."trip_id",
            'PHOTO_ALBUM'::"EntityType",
            pa."id",
            'LOCATION'::"EntityType",
            pa."location_id",
            'FEATURED_IN'::"LinkRelationship",
            CURRENT_TIMESTAMP
        FROM "photo_albums" pa
        WHERE pa."location_id" IS NOT NULL
        ON CONFLICT ("trip_id", "source_type", "source_id", "target_type", "target_id") DO NOTHING;
    END IF;
END $$;

-- =============================================================================
-- STEP 4: Migrate existing PhotoAlbum.activityId to EntityLinks
-- =============================================================================
DO $$ BEGIN
    -- Skipped when the column is already gone (e.g. a database built from the 00000000000000_init baseline).
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'photo_albums' AND column_name = 'activity_id') THEN
        INSERT INTO "entity_links" ("trip_id", "source_type", "source_id", "target_type", "target_id", "relationship", "created_at")
        SELECT
            pa."trip_id",
            'PHOTO_ALBUM'::"EntityType",
            pa."id",
            'ACTIVITY'::"EntityType",
            pa."activity_id",
            'FEATURED_IN'::"LinkRelationship",
            CURRENT_TIMESTAMP
        FROM "photo_albums" pa
        WHERE pa."activity_id" IS NOT NULL
        ON CONFLICT ("trip_id", "source_type", "source_id", "target_type", "target_id") DO NOTHING;
    END IF;
END $$;

-- =============================================================================
-- STEP 5: Migrate existing PhotoAlbum.lodgingId to EntityLinks
-- =============================================================================
DO $$ BEGIN
    -- Skipped when the column is already gone (e.g. a database built from the 00000000000000_init baseline).
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'photo_albums' AND column_name = 'lodging_id') THEN
        INSERT INTO "entity_links" ("trip_id", "source_type", "source_id", "target_type", "target_id", "relationship", "created_at")
        SELECT
            pa."trip_id",
            'PHOTO_ALBUM'::"EntityType",
            pa."id",
            'LODGING'::"EntityType",
            pa."lodging_id",
            'FEATURED_IN'::"LinkRelationship",
            CURRENT_TIMESTAMP
        FROM "photo_albums" pa
        WHERE pa."lodging_id" IS NOT NULL
        ON CONFLICT ("trip_id", "source_type", "source_id", "target_type", "target_id") DO NOTHING;
    END IF;
END $$;

-- =============================================================================
-- STEP 6: Drop FK constraints
-- =============================================================================
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_location_id_fkey";
ALTER TABLE "lodging" DROP CONSTRAINT IF EXISTS "lodging_location_id_fkey";
ALTER TABLE "photo_albums" DROP CONSTRAINT IF EXISTS "photo_albums_location_id_fkey";
ALTER TABLE "photo_albums" DROP CONSTRAINT IF EXISTS "photo_albums_activity_id_fkey";
ALTER TABLE "photo_albums" DROP CONSTRAINT IF EXISTS "photo_albums_lodging_id_fkey";

-- =============================================================================
-- STEP 7: Drop indexes on deprecated columns
-- =============================================================================
DROP INDEX IF EXISTS "activities_location_id_idx";

-- =============================================================================
-- STEP 8: Drop deprecated columns
-- =============================================================================
ALTER TABLE "activities" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "lodging" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "photo_albums" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "photo_albums" DROP COLUMN IF EXISTS "activity_id";
ALTER TABLE "photo_albums" DROP COLUMN IF EXISTS "lodging_id";
