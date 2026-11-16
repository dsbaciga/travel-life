-- A trip photo album can be linked to one Immich album so a manual "Sync" can pull in
-- assets added to the Immich album, and so "Update album in Immich" knows which album to
-- add to. Both columns are nullable: existing albums are unlinked and unaffected.
ALTER TABLE "photo_albums" ADD COLUMN "immich_album_id" VARCHAR(255);
ALTER TABLE "photo_albums" ADD COLUMN "immich_album_synced_at" TIMESTAMP(3);
