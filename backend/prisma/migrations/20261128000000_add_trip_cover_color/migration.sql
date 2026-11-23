-- Dominant colour of the trip cover (#rrggbb), derived whenever the cover changes.
-- Existing trips are filled in by: npx tsx scripts/backfill-trip-cover-color.ts
ALTER TABLE "trips" ADD COLUMN "cover_color" VARCHAR(7);
