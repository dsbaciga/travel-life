-- AlterTable: Widen trip_type_emoji to support ZWJ emoji sequences (e.g. 👨‍👩‍👧‍👦)
ALTER TABLE "trips" ALTER COLUMN "trip_type_emoji" TYPE VARCHAR(50);
