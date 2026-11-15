-- A booking deadline no longer has to hang off a lodging, transportation or activity:
-- the user can track a due date that is not part of the plan ("renew passport"). Such a
-- deadline has no booking to name it, so it carries its own title. Existing rows keep
-- title NULL and are unaffected (each already has exactly one booking).
ALTER TABLE "booking_deadlines" ADD COLUMN "title" VARCHAR(200);

-- Replace "exactly one booking" (booking_deadlines_one_target) with: exactly one booking,
-- OR no booking at all and a non-blank title. Never more than one booking, and never a
-- deadline with nothing to identify it. Prisma cannot represent CHECK constraints.
ALTER TABLE "booking_deadlines" DROP CONSTRAINT IF EXISTS "booking_deadlines_one_target";
ALTER TABLE "booking_deadlines" ADD CONSTRAINT "booking_deadlines_target_or_title"
  CHECK (
    num_nonnulls("lodging_id", "transportation_id", "activity_id") = 1
    OR (
      num_nonnulls("lodging_id", "transportation_id", "activity_id") = 0
      AND "title" IS NOT NULL
      AND btrim("title") <> ''
    )
  );
