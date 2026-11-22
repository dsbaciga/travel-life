-- AlterEnum (add DOCUMENTS to ValidationIssueCategory)
ALTER TYPE "ValidationIssueCategory" ADD VALUE IF NOT EXISTS 'DOCUMENTS';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TravelDocumentType" AS ENUM ('PASSPORT', 'VISA', 'ID_CARD', 'GLOBAL_ENTRY', 'VACCINATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "travel_documents" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "TravelDocumentType" NOT NULL,
    "issuing_country" VARCHAR(100) NOT NULL,
    "document_number" VARCHAR(255),
    "issue_date" DATE,
    "expiry_date" DATE,
    "name" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "alert_days_before" INTEGER NOT NULL DEFAULT 180,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "visa_requirements" (
    "id" SERIAL NOT NULL,
    "passport_country" VARCHAR(100) NOT NULL,
    "destination_country" VARCHAR(100) NOT NULL,
    "visa_required" BOOLEAN NOT NULL,
    "visa_type" VARCHAR(50) NOT NULL,
    "max_stay_days" INTEGER,
    "notes" TEXT,
    "source_url" VARCHAR(500),
    "last_verified" DATE,

    CONSTRAINT "visa_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "trip_languages" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "language" VARCHAR(100) NOT NULL,

    CONSTRAINT "trip_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "language_phrases" (
    "id" SERIAL NOT NULL,
    "language" VARCHAR(100) NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "english" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "pronunciation" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "language_phrases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "travel_documents_user_id_idx" ON "travel_documents"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "travel_documents_expiry_date_idx" ON "travel_documents"("expiry_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "visa_requirements_passport_country_idx" ON "visa_requirements"("passport_country");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "visa_requirements_destination_country_idx" ON "visa_requirements"("destination_country");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "visa_requirements_passport_country_destination_country_key" ON "visa_requirements"("passport_country", "destination_country");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trip_languages_trip_id_idx" ON "trip_languages"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "trip_languages_trip_id_language_code_key" ON "trip_languages"("trip_id", "language_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "language_phrases_language_code_idx" ON "language_phrases"("language_code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "language_phrases_category_idx" ON "language_phrases"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "language_phrases_language_code_category_idx" ON "language_phrases"("language_code", "category");

-- AddForeignKey
ALTER TABLE "travel_documents" DROP CONSTRAINT IF EXISTS "travel_documents_user_id_fkey";
ALTER TABLE "travel_documents" ADD CONSTRAINT "travel_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_languages" DROP CONSTRAINT IF EXISTS "trip_languages_trip_id_fkey";
ALTER TABLE "trip_languages" ADD CONSTRAINT "trip_languages_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
