-- Step A of the data model reorganization (docs/development/DATA_MODEL_REORG_PLAN.md).
--
-- 1. "This activity / lodging is at this place" becomes a real foreign key
--    (activities.location_id, lodging.location_id -> locations.id ON DELETE SET NULL),
--    like transportation.start_location_id and custom_items.location_id already are.
-- 2. The existing entity_links rows that expressed it are moved onto the FK and deleted.
-- 3. entity_links has no referential integrity, so AFTER DELETE triggers on every table an
--    "EntityType" value can name remove the links that reference a deleted row. Prisma cannot
--    represent triggers; application code (cleanupEntityLinks) still runs as well, because a
--    database built with `prisma db push` has no triggers.

-- AlterTable
ALTER TABLE "activities" ADD COLUMN "location_id" INTEGER;

-- AlterTable
ALTER TABLE "lodging" ADD COLUMN "location_id" INTEGER;

-- CreateIndex
CREATE INDEX "activities_location_id_idx" ON "activities"("location_id");

-- CreateIndex
CREATE INDEX "lodging_location_id_idx" ON "lodging"("location_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lodging" ADD CONSTRAINT "lodging_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill from entity_links.
--
-- Candidates: a link joining an ACTIVITY or LODGING to a LOCATION of the SAME trip, in either
-- direction. Per entity, prefer OCCURRED_AT, then the lowest link id. Links to a location of a
-- different trip are never used (and are left alone).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_step_a_candidates" AS
SELECT
  el."id" AS "link_id",
  CASE WHEN el."source_type" IN ('ACTIVITY', 'LODGING') THEN el."source_type" ELSE el."target_type" END AS "entity_type",
  CASE WHEN el."source_type" IN ('ACTIVITY', 'LODGING') THEN el."source_id" ELSE el."target_id" END AS "entity_id",
  CASE WHEN el."source_type" = 'LOCATION' THEN el."source_id" ELSE el."target_id" END AS "location_id",
  (el."relationship" = 'OCCURRED_AT') AS "is_occurred_at"
FROM "entity_links" el
WHERE (el."source_type" IN ('ACTIVITY', 'LODGING') AND el."target_type" = 'LOCATION')
   OR (el."source_type" = 'LOCATION' AND el."target_type" IN ('ACTIVITY', 'LODGING'));

CREATE TEMP TABLE "_step_a_chosen" AS
SELECT ranked."link_id", ranked."entity_type", ranked."entity_id", ranked."location_id"
FROM (
  SELECT
    c."link_id", c."entity_type", c."entity_id", c."location_id",
    ROW_NUMBER() OVER (
      PARTITION BY c."entity_type", c."entity_id"
      ORDER BY c."is_occurred_at" DESC, c."link_id" ASC
    ) AS "rn"
  FROM "_step_a_candidates" c
  JOIN "locations" loc ON loc."id" = c."location_id"
  LEFT JOIN "activities" a ON c."entity_type" = 'ACTIVITY' AND a."id" = c."entity_id"
  LEFT JOIN "lodging" l ON c."entity_type" = 'LODGING' AND l."id" = c."entity_id"
  WHERE loc."trip_id" = COALESCE(a."trip_id", l."trip_id")
) ranked
WHERE ranked."rn" = 1;

UPDATE "activities" a
SET "location_id" = ch."location_id"
FROM "_step_a_chosen" ch
WHERE ch."entity_type" = 'ACTIVITY' AND ch."entity_id" = a."id";

UPDATE "lodging" l
SET "location_id" = ch."location_id"
FROM "_step_a_chosen" ch
WHERE ch."entity_type" = 'LODGING' AND ch."entity_id" = l."id";

-- The FK replaces the chosen link. A second link between the same entity and the same location
-- (the opposite direction) says nothing more than the FK does, so it goes too.
DELETE FROM "entity_links" el
USING "_step_a_candidates" c
WHERE el."id" = c."link_id"
  AND EXISTS (
    SELECT 1 FROM "_step_a_chosen" ch
    WHERE ch."entity_type" = c."entity_type"
      AND ch."entity_id" = c."entity_id"
      AND ch."location_id" = c."location_id"
  );

-- Any other activity/lodging <-> location link stays as a loose association: it must no longer
-- read as "the place", so OCCURRED_AT becomes RELATED.
UPDATE "entity_links"
SET "relationship" = 'RELATED'
WHERE "relationship" = 'OCCURRED_AT'
  AND (("source_type" IN ('ACTIVITY', 'LODGING') AND "target_type" = 'LOCATION')
    OR ("source_type" = 'LOCATION' AND "target_type" IN ('ACTIVITY', 'LODGING')));

-- Verify the backfill; abort the whole migration on any disagreement.
DO $$
DECLARE
  chosen_activities INTEGER;
  chosen_lodgings INTEGER;
  filled_activities INTEGER;
  filled_lodgings INTEGER;
  bad_cross_trip INTEGER;
  leftover_chosen INTEGER;
BEGIN
  SELECT count(*) INTO chosen_activities FROM "_step_a_chosen" WHERE "entity_type" = 'ACTIVITY';
  SELECT count(*) INTO chosen_lodgings FROM "_step_a_chosen" WHERE "entity_type" = 'LODGING';
  SELECT count(*) INTO filled_activities FROM "activities" WHERE "location_id" IS NOT NULL;
  SELECT count(*) INTO filled_lodgings FROM "lodging" WHERE "location_id" IS NOT NULL;

  IF chosen_activities <> filled_activities THEN
    RAISE EXCEPTION 'Step A backfill mismatch: % activities chosen but % have location_id', chosen_activities, filled_activities;
  END IF;
  IF chosen_lodgings <> filled_lodgings THEN
    RAISE EXCEPTION 'Step A backfill mismatch: % lodgings chosen but % have location_id', chosen_lodgings, filled_lodgings;
  END IF;

  SELECT count(*) INTO bad_cross_trip FROM (
    SELECT a."id" FROM "activities" a JOIN "locations" loc ON loc."id" = a."location_id" WHERE loc."trip_id" <> a."trip_id"
    UNION ALL
    SELECT l."id" FROM "lodging" l JOIN "locations" loc ON loc."id" = l."location_id" WHERE loc."trip_id" <> l."trip_id"
  ) x;
  IF bad_cross_trip <> 0 THEN
    RAISE EXCEPTION 'Step A backfill: % rows point at a location of another trip', bad_cross_trip;
  END IF;

  SELECT count(*) INTO leftover_chosen FROM "entity_links" WHERE "id" IN (SELECT "link_id" FROM "_step_a_chosen");
  IF leftover_chosen <> 0 THEN
    RAISE EXCEPTION 'Step A backfill: % chosen links were not deleted', leftover_chosen;
  END IF;
END $$;

DROP TABLE "_step_a_chosen";
DROP TABLE "_step_a_candidates";

-- ---------------------------------------------------------------------------
-- Integrity: remove entity_links rows that point at a deleted row.
-- One row-level AFTER DELETE trigger per table an "EntityType" value can name. The entity type
-- is passed as the trigger argument. Un-assigning a saved link from a trip is an UPDATE, not a
-- delete, so it keeps the old behaviour (its links are swept by cleanupOrphanedEntityLinks).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "entity_links_delete_for_deleted_row"() RETURNS trigger AS $$
BEGIN
  DELETE FROM "entity_links"
  WHERE ("source_type" = TG_ARGV[0]::"EntityType" AND "source_id" = OLD."id")
     OR ("target_type" = TG_ARGV[0]::"EntityType" AND "target_id" = OLD."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "photos_entity_links_cleanup" AFTER DELETE ON "photos"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('PHOTO');
CREATE TRIGGER "locations_entity_links_cleanup" AFTER DELETE ON "locations"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('LOCATION');
CREATE TRIGGER "activities_entity_links_cleanup" AFTER DELETE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('ACTIVITY');
CREATE TRIGGER "lodging_entity_links_cleanup" AFTER DELETE ON "lodging"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('LODGING');
CREATE TRIGGER "transportation_entity_links_cleanup" AFTER DELETE ON "transportation"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('TRANSPORTATION');
CREATE TRIGGER "journal_entries_entity_links_cleanup" AFTER DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('JOURNAL_ENTRY');
CREATE TRIGGER "photo_albums_entity_links_cleanup" AFTER DELETE ON "photo_albums"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('PHOTO_ALBUM');
CREATE TRIGGER "pdf_imports_entity_links_cleanup" AFTER DELETE ON "pdf_imports"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('PDF_IMPORT');
CREATE TRIGGER "saved_links_entity_links_cleanup" AFTER DELETE ON "saved_links"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('SAVED_LINK');
CREATE TRIGGER "custom_items_entity_links_cleanup" AFTER DELETE ON "custom_items"
  FOR EACH ROW EXECUTE FUNCTION "entity_links_delete_for_deleted_row"('CUSTOM_ITEM');
