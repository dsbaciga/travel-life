-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ValidationIssueCategory" AS ENUM ('SCHEDULE', 'ACCOMMODATIONS', 'TRANSPORTATION', 'COMPLETENESS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "dismissed_validation_issues" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "issue_type" VARCHAR(100) NOT NULL,
    "issue_key" VARCHAR(500) NOT NULL,
    "category" "ValidationIssueCategory" NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissed_validation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "dismissed_validation_issues_trip_id_idx" ON "dismissed_validation_issues"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "dismissed_validation_issues_trip_id_issue_type_issue_key_key" ON "dismissed_validation_issues"("trip_id", "issue_type", "issue_key");

-- AddForeignKey
ALTER TABLE "dismissed_validation_issues" DROP CONSTRAINT IF EXISTS "dismissed_validation_issues_trip_id_fkey";
ALTER TABLE "dismissed_validation_issues" ADD CONSTRAINT "dismissed_validation_issues_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
