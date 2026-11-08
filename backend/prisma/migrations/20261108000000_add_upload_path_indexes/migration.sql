-- Add indexes for /uploads static file authorization lookups
CREATE INDEX IF NOT EXISTS "photos_local_path_idx" ON "photos"("local_path");
CREATE INDEX IF NOT EXISTS "photos_thumbnail_path_idx" ON "photos"("thumbnail_path");
CREATE INDEX IF NOT EXISTS "trips_cover_image_path_idx" ON "trips"("cover_image_path");
CREATE INDEX IF NOT EXISTS "trips_cover_image_thumbnail_path_idx" ON "trips"("cover_image_thumbnail_path");
CREATE INDEX IF NOT EXISTS "travel_companions_user_id_idx" ON "travel_companions"("user_id");
CREATE INDEX IF NOT EXISTS "travel_companions_avatar_url_idx" ON "travel_companions"("avatar_url");
