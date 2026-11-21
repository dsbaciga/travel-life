-- Step C of the data model reorganization (docs/development/DATA_MODEL_REORG_PLAN.md).
--
-- One representation of "who paid". Until now the trip owner was a boolean
-- (trip_expenses.paid_by_owner, trip_expense_splits.is_owner) while everybody else was a
-- travel_companions id. From now on the payer and every split participant is a companion: the
-- owner is the owner's "myself" companion (is_myself = true), which also learns which account it
-- is (linked_user_id).
--
-- Order: (a) add structure, (b) normalise the "myself" rows, (c) backfill, (d) assert, (e) drop.
-- This is destructive (two columns and two CHECKs are dropped), so the assertions at the end
-- abort the whole migration (it runs in one transaction) when a payer or a split would be lost.
--
-- "Owner" always means the TRIP's owner (trips.user_id), never a collaborator.

-- ---------------------------------------------------------------------------
-- (a) Structure
-- ---------------------------------------------------------------------------
ALTER TABLE "travel_companions" ADD COLUMN "linked_user_id" INTEGER;

ALTER TABLE "travel_companions" ADD CONSTRAINT "travel_companions_linked_user_id_fkey"
  FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "travel_companions_linked_user_id_idx" ON "travel_companions"("linked_user_id");

-- ---------------------------------------------------------------------------
-- (b) One "myself" companion per user
-- ---------------------------------------------------------------------------
-- A user wrongly holding several is_myself rows keeps the LOWEST id as "myself"; the others are
-- un-flagged and become ordinary companions. Nothing is repointed, so every expense that named
-- one of them (as a payer or a participant) keeps naming the same companion row and the same
-- settle-up key: its meaning does not change. They are remembered for the assertions below.
CREATE TEMP TABLE "_step_c_unflagged" AS
SELECT c."id", c."user_id"
FROM "travel_companions" c
WHERE c."is_myself"
  AND c."id" <> (SELECT min(m."id") FROM "travel_companions" m WHERE m."user_id" = c."user_id" AND m."is_myself");

UPDATE "travel_companions" SET "is_myself" = false WHERE "id" IN (SELECT "id" FROM "_step_c_unflagged");

-- Owners that need a "myself" companion: they own a trip with an owner-paid expense or an owner
-- split and have none. It is named after the username (same as invitation sign-up does).
INSERT INTO "travel_companions" ("user_id", "name", "is_myself", "linked_user_id")
SELECT u."id", u."username", true, u."id"
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "travel_companions" m WHERE m."user_id" = u."id" AND m."is_myself")
  AND (
    EXISTS (SELECT 1 FROM "trips" t JOIN "trip_expenses" e ON e."trip_id" = t."id"
            WHERE t."user_id" = u."id" AND e."paid_by_owner")
    OR EXISTS (SELECT 1 FROM "trips" t JOIN "trip_expenses" e ON e."trip_id" = t."id"
               JOIN "trip_expense_splits" s ON s."expense_id" = e."id"
               WHERE t."user_id" = u."id" AND s."is_owner")
  );

UPDATE "travel_companions" SET "linked_user_id" = "user_id" WHERE "is_myself";

-- At most one "myself" per user from now on. Prisma cannot represent a partial unique index
-- (documented in schema.prisma).
CREATE UNIQUE INDEX "travel_companions_user_id_is_myself_key"
  ON "travel_companions"("user_id") WHERE "is_myself";

-- ---------------------------------------------------------------------------
-- (c) Pre-migration facts, then the backfill
-- ---------------------------------------------------------------------------
-- The trip owner's "myself" companion, per trip.
CREATE TEMP TABLE "_step_c_owner" AS
SELECT t."id" AS "trip_id", t."user_id", m."id" AS "companion_id"
FROM "trips" t
LEFT JOIN "travel_companions" m ON m."user_id" = t."user_id" AND m."is_myself";

-- Every split row as it will look afterwards.
CREATE TEMP TABLE "_step_c_split_before" AS
SELECT s."id" AS "split_id", s."expense_id", s."amount", s."is_owner",
       CASE WHEN s."is_owner" THEN o."companion_id" ELSE s."companion_id" END AS "new_companion_id"
FROM "trip_expense_splits" s
JOIN "trip_expenses" e ON e."id" = s."expense_id"
JOIN "_step_c_owner" o ON o."trip_id" = e."trip_id";

CREATE TEMP TABLE "_step_c_expense_before" AS
SELECT e."id" AS "expense_id", e."paid_by_owner", e."paid_by_companion_id",
       (e."paid_by_owner" OR e."paid_by_companion_id" IS NOT NULL) AS "had_payer",
       COALESCE((SELECT sum(s."amount") FROM "trip_expense_splits" s WHERE s."expense_id" = e."id"), 0) AS "split_sum",
       (SELECT count(*) FROM "trip_expense_splits" s WHERE s."expense_id" = e."id") AS "split_count"
FROM "trip_expenses" e;

DO $$
DECLARE
  dup RECORD;
  missing_owner integer;
  total_splits integer;
  mapped_splits integer;
BEGIN
  -- An owner payer/split needs a "myself" companion (step b created every missing one).
  SELECT count(*) INTO missing_owner FROM "_step_c_expense_before" b
    JOIN "trip_expenses" e ON e."id" = b."expense_id"
    JOIN "_step_c_owner" o ON o."trip_id" = e."trip_id"
    WHERE b."paid_by_owner" AND o."companion_id" IS NULL;
  IF missing_owner <> 0 THEN
    RAISE EXCEPTION 'Step C: % owner-paid expenses have no "myself" companion to point at', missing_owner;
  END IF;

  SELECT count(*), count("new_companion_id") INTO total_splits, mapped_splits FROM "_step_c_split_before";
  IF total_splits <> mapped_splits THEN
    RAISE EXCEPTION 'Step C: % of % split rows have no companion to point at', total_splits - mapped_splits, total_splits;
  END IF;

  -- The service promised one row per participant per expense, but nothing enforced it. Refuse to
  -- guess how to combine duplicates (the new unique index would also refuse them).
  SELECT "expense_id", "new_companion_id", count(*) AS n INTO dup
    FROM "_step_c_split_before" GROUP BY "expense_id", "new_companion_id" HAVING count(*) > 1 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Step C: expense % lists companion % % times in its split (the owner counts as their "myself" companion). Fix or delete the duplicate split rows, then re-run the migration.',
      dup."expense_id", dup."new_companion_id", dup.n;
  END IF;
END $$;

-- The either-or CHECKs forbid exactly the state the backfill creates (a flag AND a companion), so
-- they go first; the assertions below stand in for them until the columns are dropped.
ALTER TABLE "trip_expenses" DROP CONSTRAINT "trip_expenses_one_payer";
ALTER TABLE "trip_expense_splits" DROP CONSTRAINT "trip_expense_splits_one_participant";

UPDATE "trip_expenses" e
SET "paid_by_companion_id" = o."companion_id"
FROM "_step_c_owner" o
WHERE o."trip_id" = e."trip_id" AND e."paid_by_owner";

UPDATE "trip_expense_splits" s
SET "companion_id" = b."new_companion_id"
FROM "_step_c_split_before" b
WHERE b."split_id" = s."id" AND b."is_owner";

-- ---------------------------------------------------------------------------
-- (d) Assertions (before anything is dropped)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  before_payers integer;
  after_payers integer;
  before_splits integer;
  after_splits integer;
  null_splits integer;
  bad_sum integer;
  bad_owner_payer integer;
  bad_owner_split integer;
  bad_unflagged integer;
  bad_linked integer;
  bad_payer_changed integer;
  unflagged_count integer;
  unflagged_used integer;
BEGIN
  SELECT count(*) INTO before_payers FROM "_step_c_expense_before" WHERE "had_payer";
  SELECT count(*) INTO after_payers FROM "trip_expenses" WHERE "paid_by_companion_id" IS NOT NULL;
  IF before_payers <> after_payers THEN
    RAISE EXCEPTION 'Step C: % expenses had a payer before, % have one now', before_payers, after_payers;
  END IF;

  SELECT count(*) INTO before_splits FROM "_step_c_split_before";
  SELECT count(*) INTO after_splits FROM "trip_expense_splits";
  IF before_splits <> after_splits THEN
    RAISE EXCEPTION 'Step C: % split rows before, % now', before_splits, after_splits;
  END IF;

  SELECT count(*) INTO null_splits FROM "trip_expense_splits" WHERE "companion_id" IS NULL;
  IF null_splits <> 0 THEN
    RAISE EXCEPTION 'Step C: % split rows still have no companion', null_splits;
  END IF;

  -- Per-expense split total and row count unchanged.
  SELECT count(*) INTO bad_sum FROM "_step_c_expense_before" b
    WHERE b."split_sum" <> COALESCE((SELECT sum(s."amount") FROM "trip_expense_splits" s WHERE s."expense_id" = b."expense_id"), 0)
       OR b."split_count" <> (SELECT count(*) FROM "trip_expense_splits" s WHERE s."expense_id" = b."expense_id");
  IF bad_sum <> 0 THEN
    RAISE EXCEPTION 'Step C: split totals or row counts changed for % expenses', bad_sum;
  END IF;

  -- Companion payers that were not the owner are untouched.
  SELECT count(*) INTO bad_payer_changed FROM "_step_c_expense_before" b
    JOIN "trip_expenses" e ON e."id" = b."expense_id"
    WHERE NOT b."paid_by_owner" AND e."paid_by_companion_id" IS DISTINCT FROM b."paid_by_companion_id";
  IF bad_payer_changed <> 0 THEN
    RAISE EXCEPTION 'Step C: % non-owner payers changed', bad_payer_changed;
  END IF;

  -- Every former owner payer / owner split is now the TRIP OWNER's "myself" companion.
  SELECT count(*) INTO bad_owner_payer FROM "_step_c_expense_before" b
    JOIN "trip_expenses" e ON e."id" = b."expense_id"
    JOIN "trips" t ON t."id" = e."trip_id"
    LEFT JOIN "travel_companions" c ON c."id" = e."paid_by_companion_id"
    WHERE b."paid_by_owner"
      AND (c."id" IS NULL OR NOT c."is_myself" OR c."user_id" <> t."user_id" OR c."linked_user_id" IS DISTINCT FROM t."user_id");
  IF bad_owner_payer <> 0 THEN
    RAISE EXCEPTION 'Step C: % former owner payers do not point at the trip owner''s "myself" companion', bad_owner_payer;
  END IF;

  SELECT count(*) INTO bad_owner_split FROM "_step_c_split_before" b
    JOIN "trip_expense_splits" s ON s."id" = b."split_id"
    JOIN "trip_expenses" e ON e."id" = s."expense_id"
    JOIN "trips" t ON t."id" = e."trip_id"
    LEFT JOIN "travel_companions" c ON c."id" = s."companion_id"
    WHERE b."is_owner"
      AND (c."id" IS NULL OR NOT c."is_myself" OR c."user_id" <> t."user_id" OR c."linked_user_id" IS DISTINCT FROM t."user_id");
  IF bad_owner_split <> 0 THEN
    RAISE EXCEPTION 'Step C: % former owner splits do not point at the trip owner''s "myself" companion', bad_owner_split;
  END IF;

  -- No user has two "myself" rows, and every "myself" row is linked to its user.
  SELECT count(*) INTO bad_unflagged FROM (
    SELECT "user_id" FROM "travel_companions" WHERE "is_myself" GROUP BY "user_id" HAVING count(*) > 1
  ) x;
  IF bad_unflagged <> 0 THEN
    RAISE EXCEPTION 'Step C: % users still have several "myself" companions', bad_unflagged;
  END IF;
  SELECT count(*) INTO bad_linked FROM "travel_companions"
    WHERE ("is_myself" AND "linked_user_id" IS DISTINCT FROM "user_id") OR (NOT "is_myself" AND "linked_user_id" IS NOT NULL);
  IF bad_linked <> 0 THEN
    RAISE EXCEPTION 'Step C: % companions have a wrong linked_user_id', bad_linked;
  END IF;
  -- Un-flagged duplicates: report them and how many expenses still name one (they keep their meaning).
  SELECT count(*) INTO unflagged_count FROM "_step_c_unflagged";
  SELECT count(*) INTO unflagged_used FROM "trip_expenses" e
    WHERE e."paid_by_companion_id" IN (SELECT "id" FROM "_step_c_unflagged")
       OR EXISTS (SELECT 1 FROM "trip_expense_splits" s WHERE s."expense_id" = e."id" AND s."companion_id" IN (SELECT "id" FROM "_step_c_unflagged"));
  RAISE NOTICE 'Step C: % duplicate "myself" companions un-flagged; % expenses still name one of them (unchanged meaning)', unflagged_count, unflagged_used;
END $$;

-- ---------------------------------------------------------------------------
-- (e) Drop the booleans (their CHECKs went before the backfill), tighten the splits
-- ---------------------------------------------------------------------------
ALTER TABLE "trip_expenses" DROP COLUMN "paid_by_owner";
ALTER TABLE "trip_expense_splits" DROP COLUMN "is_owner";

ALTER TABLE "trip_expense_splits" ALTER COLUMN "companion_id" SET NOT NULL;
CREATE UNIQUE INDEX "trip_expense_splits_expense_id_companion_id_key"
  ON "trip_expense_splits"("expense_id", "companion_id");

DROP TABLE "_step_c_split_before";
DROP TABLE "_step_c_expense_before";
DROP TABLE "_step_c_owner";
DROP TABLE "_step_c_unflagged";
