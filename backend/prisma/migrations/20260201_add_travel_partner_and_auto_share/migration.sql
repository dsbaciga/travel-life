-- Add travel partner settings to users table
-- Enables bidirectional travel partner relationships for automatic trip sharing

-- AlterTable: Add travel partner fields to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "travel_partner_id" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "default_partner_permission" VARCHAR(50) NOT NULL DEFAULT 'edit';

-- AlterTable: Add auto-share exclusion to trips
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "exclude_from_auto_share" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey: Self-referential travel partner relationship
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_travel_partner_id_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_travel_partner_id_fkey" FOREIGN KEY ("travel_partner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
