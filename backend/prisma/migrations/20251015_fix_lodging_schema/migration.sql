-- AlterTable lodging: Rename columns and add missing fields
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'lodging' AND column_name = 'check_in') THEN
        ALTER TABLE "lodging" RENAME COLUMN "check_in" TO "check_in_date";
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'lodging' AND column_name = 'check_out') THEN
        ALTER TABLE "lodging" RENAME COLUMN "check_out" TO "check_out_date";
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'lodging' AND column_name = 'booking_reference') THEN
        ALTER TABLE "lodging" RENAME COLUMN "booking_reference" TO "confirmation_number";
    END IF;
END $$;
ALTER TABLE "lodging" DROP COLUMN IF EXISTS "rating";
ALTER TABLE "lodging" ADD COLUMN IF NOT EXISTS "type" VARCHAR(50) NOT NULL DEFAULT 'hotel';
ALTER TABLE "lodging" ADD COLUMN IF NOT EXISTS "address" VARCHAR(1000);

-- Remove default after adding column
ALTER TABLE "lodging" ALTER COLUMN "type" DROP DEFAULT;
