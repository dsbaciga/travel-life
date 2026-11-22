-- Standalone uploaded cover image for a trip, stored outside the photos table so it
-- never appears in the trip's photos/memories. Mutually exclusive with cover_photo_id.
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "cover_image_path" VARCHAR(500);
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "cover_image_thumbnail_path" VARCHAR(500);
