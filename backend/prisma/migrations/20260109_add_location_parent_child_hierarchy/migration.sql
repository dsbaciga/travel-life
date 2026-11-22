-- AlterTable
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "parent_id" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "locations_parent_id_idx" ON "locations"("parent_id");

-- AddForeignKey
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_parent_id_fkey";
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
