-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "EmailIngestStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'NO_LINKS', 'REJECTED_SENDER', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: extra From addresses trusted to forward links for this user
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "link_ingest_senders" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE IF NOT EXISTS "email_ingests" (
    "id" SERIAL NOT NULL,
    "message_id" VARCHAR(1000) NOT NULL,
    "user_id" INTEGER,
    "from_address" VARCHAR(500),
    "to_address" VARCHAR(500),
    "subject" VARCHAR(1000),
    "received_at" TIMESTAMP(3),
    "status" "EmailIngestStatus" NOT NULL DEFAULT 'PROCESSING',
    "link_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_ingests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the Message-ID doubles as the processing claim, so it must be unique
CREATE UNIQUE INDEX IF NOT EXISTS "email_ingests_message_id_key" ON "email_ingests"("message_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_ingests_user_id_idx" ON "email_ingests"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_ingests_user_id_status_idx" ON "email_ingests"("user_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_ingests_status_idx" ON "email_ingests"("status");

-- AlterTable: provenance link from a saved link back to the email it came from
ALTER TABLE "saved_links" ADD COLUMN IF NOT EXISTS "email_ingest_id" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "saved_links_email_ingest_id_idx" ON "saved_links"("email_ingest_id");

-- AddForeignKey
ALTER TABLE "email_ingests" DROP CONSTRAINT IF EXISTS "email_ingests_user_id_fkey";
ALTER TABLE "email_ingests" ADD CONSTRAINT "email_ingests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SetNull so pruning ingest history never destroys the links it produced
ALTER TABLE "saved_links" DROP CONSTRAINT IF EXISTS "saved_links_email_ingest_id_fkey";
ALTER TABLE "saved_links" ADD CONSTRAINT "saved_links_email_ingest_id_fkey" FOREIGN KEY ("email_ingest_id") REFERENCES "email_ingests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
