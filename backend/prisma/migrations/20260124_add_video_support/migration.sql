-- Add video support to photos table
-- Adds media_type field to distinguish between 'image' and 'video'
-- Adds duration field for video length in seconds

ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "media_type" VARCHAR(20) NOT NULL DEFAULT 'image';
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "duration" INTEGER;
