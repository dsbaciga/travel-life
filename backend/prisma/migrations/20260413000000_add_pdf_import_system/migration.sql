-- Add PDF_IMPORT value to existing EntityType enum
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'PDF_IMPORT';

-- CreateEnum PdfImportStatus (new)
DO $$ BEGIN
    CREATE TYPE "PdfImportStatus" AS ENUM ('UPLOADED', 'PARSING', 'PARSED', 'PARSE_FAILED', 'NO_ENTITIES');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- PendingEntityType and PendingEntityStatus were created in the email import migration
-- and NOT dropped in the remove migration — create them only if they don't already exist.
DO $$ BEGIN
  CREATE TYPE "PendingEntityType" AS ENUM ('TRANSPORTATION', 'LODGING', 'ACTIVITY', 'LOCATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PendingEntityStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable pdf_imports
CREATE TABLE IF NOT EXISTS "pdf_imports" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "original_name" VARCHAR(500) NOT NULL,
    "stored_path" VARCHAR(500) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "status" "PdfImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable pending_entities
CREATE TABLE IF NOT EXISTS "pending_entities" (
    "id" SERIAL NOT NULL,
    "pdf_import_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "entity_type" "PendingEntityType" NOT NULL,
    "parsed_data" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "matched_trip_id" INTEGER,
    "status" "PendingEntityStatus" NOT NULL DEFAULT 'PENDING',
    "created_entity_id" INTEGER,
    "created_entity_type" "PendingEntityType",
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pdf_imports_user_id_idx" ON "pdf_imports"("user_id");
CREATE INDEX IF NOT EXISTS "pdf_imports_user_id_status_idx" ON "pdf_imports"("user_id", "status");
CREATE INDEX IF NOT EXISTS "pending_entities_user_id_status_idx" ON "pending_entities"("user_id", "status");
CREATE INDEX IF NOT EXISTS "pending_entities_pdf_import_id_idx" ON "pending_entities"("pdf_import_id");
CREATE INDEX IF NOT EXISTS "pending_entities_matched_trip_id_idx" ON "pending_entities"("matched_trip_id");

-- AddForeignKey pdf_imports -> users
ALTER TABLE "pdf_imports" DROP CONSTRAINT IF EXISTS "pdf_imports_user_id_fkey";
ALTER TABLE "pdf_imports" ADD CONSTRAINT "pdf_imports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey pending_entities -> pdf_imports
ALTER TABLE "pending_entities" DROP CONSTRAINT IF EXISTS "pending_entities_pdf_import_id_fkey";
ALTER TABLE "pending_entities" ADD CONSTRAINT "pending_entities_pdf_import_id_fkey"
    FOREIGN KEY ("pdf_import_id") REFERENCES "pdf_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey pending_entities -> users
ALTER TABLE "pending_entities" DROP CONSTRAINT IF EXISTS "pending_entities_user_id_fkey";
ALTER TABLE "pending_entities" ADD CONSTRAINT "pending_entities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey pending_entities -> trips
ALTER TABLE "pending_entities" DROP CONSTRAINT IF EXISTS "pending_entities_matched_trip_id_fkey";
ALTER TABLE "pending_entities" ADD CONSTRAINT "pending_entities_matched_trip_id_fkey"
    FOREIGN KEY ("matched_trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
