-- DB-7: Add CHECK constraints for non-negative cost fields
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activity_cost_non_negative";
ALTER TABLE "activities" ADD CONSTRAINT "activity_cost_non_negative" CHECK ("cost" >= 0);
ALTER TABLE "lodging" DROP CONSTRAINT IF EXISTS "lodging_cost_non_negative";
ALTER TABLE "lodging" ADD CONSTRAINT "lodging_cost_non_negative" CHECK ("cost" >= 0);
ALTER TABLE "transportation" DROP CONSTRAINT IF EXISTS "transportation_cost_non_negative";
ALTER TABLE "transportation" ADD CONSTRAINT "transportation_cost_non_negative" CHECK ("cost" >= 0);

-- DB-8: Add default values for Trip status and privacyLevel
ALTER TABLE "trips" ALTER COLUMN "status" SET DEFAULT 'planning';
ALTER TABLE "trips" ALTER COLUMN "privacy_level" SET DEFAULT 'private';
