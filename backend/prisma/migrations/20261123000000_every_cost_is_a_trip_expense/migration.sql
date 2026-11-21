-- Step D of the data model reorganization (docs/development/DATA_MODEL_REORG_PLAN.md).
--
-- Every cost is a trip expense. Until now activities, transportation, lodging and custom items each
-- carried their own cost, currency and FX snapshot (cost, currency, exchange_rate, base_amount,
-- base_currency) next to the trip_expenses table, which alone supports a payer, splits and a receipt,
-- and the budget summary had to union five tables. From now on a booking's cost IS a trip_expenses
-- row, linked to the booking by a nullable foreign key, and the five columns are gone.
--
-- Order: (a) add structure, (b) record the facts about the data as it is, (c) backfill one expense per
-- costed booking, (d) assert, (e) drop. This is destructive (twenty columns and four CHECKs go), so the
-- assertions at the end abort the whole migration (it runs in one transaction) when a booking cost
-- would be lost or changed.
--
-- What is NOT carried over, by design: a booking with a currency but no cost (currency set, cost null).
-- "No cost" means no expense row, and a currency alone describes nothing; the number of such rows is
-- reported with a NOTICE below.

-- ---------------------------------------------------------------------------
-- (a) Structure
-- ---------------------------------------------------------------------------
ALTER TABLE "trip_expenses"
  ADD COLUMN "activity_id" INTEGER,
  ADD COLUMN "transportation_id" INTEGER,
  ADD COLUMN "lodging_id" INTEGER,
  ADD COLUMN "custom_item_id" INTEGER;

ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_transportation_id_fkey"
  FOREIGN KEY ("transportation_id") REFERENCES "transportation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_lodging_id_fkey"
  FOREIGN KEY ("lodging_id") REFERENCES "lodging"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_custom_item_id_fkey"
  FOREIGN KEY ("custom_item_id") REFERENCES "custom_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A booking has at most one cost row. Plain unique indexes: NULLs never collide in a unique index, so
-- they behave exactly like partial ones, and Prisma needs a real @unique to model the 1:1 relation.
CREATE UNIQUE INDEX "trip_expenses_activity_id_key" ON "trip_expenses"("activity_id");
CREATE UNIQUE INDEX "trip_expenses_transportation_id_key" ON "trip_expenses"("transportation_id");
CREATE UNIQUE INDEX "trip_expenses_lodging_id_key" ON "trip_expenses"("lodging_id");
CREATE UNIQUE INDEX "trip_expenses_custom_item_id_key" ON "trip_expenses"("custom_item_id");

-- An expense is the cost of one booking at most. Prisma cannot represent CHECK constraints
-- (documented in schema.prisma).
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_at_most_one_booking"
  CHECK (num_nonnulls("activity_id", "transportation_id", "lodging_id", "custom_item_id") <= 1);

-- ---------------------------------------------------------------------------
-- (b) Facts before the backfill
-- ---------------------------------------------------------------------------
-- The first zone that is actually specified AND exists in the database's zone table, else UTC. This is
-- the resolution chain of CLAUDE.md (entity, trip, trip owner) with UTC only as the last resort; an
-- unknown zone name is skipped instead of aborting the migration (the application treats it the same way).
CREATE FUNCTION pg_temp.step_d_zone(VARIADIC "candidates" text[]) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(
    (SELECT c."zone"
       FROM unnest("candidates") WITH ORDINALITY AS c("zone", "ord")
      WHERE btrim(c."zone") <> ''
        AND btrim(c."zone") IN (SELECT "name" FROM pg_timezone_names)
      ORDER BY c."ord" LIMIT 1),
    'UTC')
$fn$;

-- The calendar day of a stored instant (timestamp without time zone holding UTC) on a zone's clock.
CREATE FUNCTION pg_temp.step_d_day("instant" timestamp, "zone" text) RETURNS date
LANGUAGE sql STABLE AS $fn$
  SELECT CASE WHEN "instant" IS NULL THEN NULL
              ELSE (("instant" AT TIME ZONE 'UTC') AT TIME ZONE btrim("zone"))::date END
$fn$;

-- One row per costed booking, as the expense row it will become. The description is the booking's
-- display name; a transportation leg is labelled the way the calendar feed labels it
-- ("<type> <company> <reference>: <from> -> <to>"). The category is the budget bucket the booking
-- already landed in, so the per-category totals do not move: activities, transportation and lodging
-- keep their own, custom items were reported under `other`.
CREATE TEMP TABLE "_step_d_booking" AS
SELECT 'activity'::text AS "kind", a."id" AS "booking_id", a."trip_id",
       left(COALESCE(NULLIF(btrim(a."name"), ''), 'Activity'), 500) AS "description",
       'activities'::text AS "category",
       a."cost" AS "amount", a."currency", a."exchange_rate", a."base_amount", a."base_currency",
       pg_temp.step_d_day(a."start_time", pg_temp.step_d_zone(a."timezone", t."timezone", u."timezone")) AS "date",
       (a."start_time" IS NOT NULL) AS "has_start",
       a."start_time" AS "start_at",
       a."created_at", a."updated_at"
FROM "activities" a
JOIN "trips" t ON t."id" = a."trip_id"
JOIN "users" u ON u."id" = t."user_id"
WHERE a."cost" IS NOT NULL
UNION ALL
SELECT 'transportation', x."id", x."trip_id",
       left(
         concat_ws(' ', x."type", NULLIF(x."company", ''), NULLIF(x."reference_number", ''))
         || CASE
              WHEN NULLIF(COALESCE(x."start_location_text", sl."name"), '') IS NOT NULL
               AND NULLIF(COALESCE(x."end_location_text", el."name"), '') IS NOT NULL
                THEN ': ' || COALESCE(x."start_location_text", sl."name") || ' ' || chr(8594) || ' ' || COALESCE(x."end_location_text", el."name")
              WHEN NULLIF(COALESCE(x."start_location_text", sl."name"), '') IS NOT NULL
                THEN ': ' || COALESCE(x."start_location_text", sl."name")
              WHEN NULLIF(COALESCE(x."end_location_text", el."name"), '') IS NOT NULL
                THEN ': ' || COALESCE(x."end_location_text", el."name")
              ELSE ''
            END,
         500),
       'transportation',
       x."cost", x."currency", x."exchange_rate", x."base_amount", x."base_currency",
       pg_temp.step_d_day(x."scheduled_start", pg_temp.step_d_zone(x."start_timezone", t."timezone", u."timezone")),
       (x."scheduled_start" IS NOT NULL),
       x."scheduled_start",
       x."created_at", x."updated_at"
FROM "transportation" x
JOIN "trips" t ON t."id" = x."trip_id"
JOIN "users" u ON u."id" = t."user_id"
LEFT JOIN "locations" sl ON sl."id" = x."start_location_id"
LEFT JOIN "locations" el ON el."id" = x."end_location_id"
WHERE x."cost" IS NOT NULL
UNION ALL
SELECT 'lodging', l."id", l."trip_id",
       left(COALESCE(NULLIF(btrim(l."name"), ''), 'Lodging'), 500),
       'lodging',
       l."cost", l."currency", l."exchange_rate", l."base_amount", l."base_currency",
       pg_temp.step_d_day(l."check_in_date", pg_temp.step_d_zone(l."timezone", t."timezone", u."timezone")),
       true,
       l."check_in_date",
       l."created_at", l."updated_at"
FROM "lodging" l
JOIN "trips" t ON t."id" = l."trip_id"
JOIN "users" u ON u."id" = t."user_id"
WHERE l."cost" IS NOT NULL
UNION ALL
SELECT 'custom_item', c."id", c."trip_id",
       left(COALESCE(NULLIF(btrim(c."name"), ''), 'Custom item'), 500),
       'other',
       c."cost", c."currency", c."exchange_rate", c."base_amount", c."base_currency",
       pg_temp.step_d_day(c."start_time", pg_temp.step_d_zone(c."timezone", t."timezone", u."timezone")),
       (c."start_time" IS NOT NULL),
       c."start_time",
       c."created_at", c."updated_at"
FROM "custom_items" c
JOIN "trips" t ON t."id" = c."trip_id"
JOIN "users" u ON u."id" = t."user_id"
WHERE c."cost" IS NOT NULL;

-- Every expense that exists before the backfill, as it must still look afterwards.
CREATE TEMP TABLE "_step_d_expense_before" AS
SELECT "id", "trip_id", "description", "category", "amount", "currency", "exchange_rate", "base_amount",
       "base_currency", "date", "notes", "paid_by_companion_id", "split_method", "receipt_path",
       "receipt_mime_type", "receipt_size_bytes", "receipt_uploaded_at", "created_at", "updated_at"
FROM "trip_expenses";

CREATE TEMP TABLE "_step_d_split_before" AS
SELECT "id", "expense_id", "companion_id", "amount", "percentage" FROM "trip_expense_splits";

-- Bookings that carry a currency but no cost: nothing to keep (see the header).
DO $$
DECLARE
  currency_only integer;
BEGIN
  SELECT (SELECT count(*) FROM "activities" WHERE "cost" IS NULL AND "currency" IS NOT NULL)
       + (SELECT count(*) FROM "transportation" WHERE "cost" IS NULL AND "currency" IS NOT NULL)
       + (SELECT count(*) FROM "lodging" WHERE "cost" IS NULL AND "currency" IS NOT NULL)
       + (SELECT count(*) FROM "custom_items" WHERE "cost" IS NULL AND "currency" IS NOT NULL)
  INTO currency_only;
  RAISE NOTICE 'Step D: % booking(s) have a currency but no cost; they get no expense row', currency_only;
END $$;

-- ---------------------------------------------------------------------------
-- (c) Backfill: one expense per costed booking
-- ---------------------------------------------------------------------------
-- Amount, currency and the FX snapshot are copied verbatim: the snapshot is frozen, never recomputed.
-- A booking's own cost carries no payer and no split, so settle-up is unaffected.
INSERT INTO "trip_expenses" ("trip_id", "description", "category", "amount", "currency", "exchange_rate",
                             "base_amount", "base_currency", "date", "activity_id", "created_at", "updated_at")
SELECT "trip_id", "description", "category", "amount", "currency", "exchange_rate", "base_amount",
       "base_currency", "date", "booking_id", "created_at", "updated_at"
FROM "_step_d_booking" WHERE "kind" = 'activity' ORDER BY "booking_id";

INSERT INTO "trip_expenses" ("trip_id", "description", "category", "amount", "currency", "exchange_rate",
                             "base_amount", "base_currency", "date", "transportation_id", "created_at", "updated_at")
SELECT "trip_id", "description", "category", "amount", "currency", "exchange_rate", "base_amount",
       "base_currency", "date", "booking_id", "created_at", "updated_at"
FROM "_step_d_booking" WHERE "kind" = 'transportation' ORDER BY "booking_id";

INSERT INTO "trip_expenses" ("trip_id", "description", "category", "amount", "currency", "exchange_rate",
                             "base_amount", "base_currency", "date", "lodging_id", "created_at", "updated_at")
SELECT "trip_id", "description", "category", "amount", "currency", "exchange_rate", "base_amount",
       "base_currency", "date", "booking_id", "created_at", "updated_at"
FROM "_step_d_booking" WHERE "kind" = 'lodging' ORDER BY "booking_id";

INSERT INTO "trip_expenses" ("trip_id", "description", "category", "amount", "currency", "exchange_rate",
                             "base_amount", "base_currency", "date", "custom_item_id", "created_at", "updated_at")
SELECT "trip_id", "description", "category", "amount", "currency", "exchange_rate", "base_amount",
       "base_currency", "date", "booking_id", "created_at", "updated_at"
FROM "_step_d_booking" WHERE "kind" = 'custom_item' ORDER BY "booking_id";

-- ---------------------------------------------------------------------------
-- (d) Assertions (before anything is dropped)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  before_n integer;
  after_n integer;
  kind_name text;
  bad integer;
BEGIN
  -- 1. Per kind: costed bookings == linked expenses.
  FOREACH kind_name IN ARRAY ARRAY['activity', 'transportation', 'lodging', 'custom_item'] LOOP
    SELECT count(*) INTO before_n FROM "_step_d_booking" WHERE "kind" = kind_name;
    SELECT count(*) INTO after_n FROM "trip_expenses"
      WHERE CASE kind_name
              WHEN 'activity' THEN "activity_id"
              WHEN 'transportation' THEN "transportation_id"
              WHEN 'lodging' THEN "lodging_id"
              ELSE "custom_item_id"
            END IS NOT NULL;
    IF before_n <> after_n THEN
      RAISE EXCEPTION 'Step D: % costed % row(s) but % linked expense(s)', before_n, kind_name, after_n;
    END IF;
  END LOOP;

  -- 2. Per trip and currency, the money is the same. Both sides are compared as full outer joins so a
  --    missing or an extra group is caught as well as a different sum.
  SELECT count(*) INTO bad FROM (
    SELECT "trip_id", COALESCE("currency", '') AS "cur", sum("amount") AS "total", count(*) AS "n"
      FROM "_step_d_booking" GROUP BY 1, 2
  ) b FULL JOIN (
    SELECT "trip_id", COALESCE("currency", '') AS "cur", sum("amount") AS "total", count(*) AS "n"
      FROM "trip_expenses"
     WHERE num_nonnulls("activity_id", "transportation_id", "lodging_id", "custom_item_id") = 1
     GROUP BY 1, 2
  ) a ON a."trip_id" = b."trip_id" AND a."cur" = b."cur"
  WHERE b."total" IS DISTINCT FROM a."total" OR b."n" IS DISTINCT FROM a."n";
  IF bad <> 0 THEN
    RAISE EXCEPTION 'Step D: % (trip, currency) group(s) whose booking cost total changed', bad;
  END IF;

  -- 3. The FX snapshot, currency, amount, description, category and date of every row are exactly the
  --    ones prepared in step (b), matched through the booking link.
  SELECT count(*) INTO bad
  FROM "_step_d_booking" b
  LEFT JOIN "trip_expenses" e ON e."trip_id" = b."trip_id" AND
       CASE b."kind"
         WHEN 'activity' THEN e."activity_id"
         WHEN 'transportation' THEN e."transportation_id"
         WHEN 'lodging' THEN e."lodging_id"
         ELSE e."custom_item_id"
       END = b."booking_id"
  WHERE e."id" IS NULL
     OR e."amount" IS DISTINCT FROM b."amount"
     OR e."currency" IS DISTINCT FROM b."currency"
     OR e."exchange_rate" IS DISTINCT FROM b."exchange_rate"
     OR e."base_amount" IS DISTINCT FROM b."base_amount"
     OR e."base_currency" IS DISTINCT FROM b."base_currency"
     OR e."description" IS DISTINCT FROM b."description"
     OR e."category" IS DISTINCT FROM b."category"
     OR e."date" IS DISTINCT FROM b."date"
     OR e."paid_by_companion_id" IS NOT NULL
     OR e."split_method" IS NOT NULL
     OR e."receipt_path" IS NOT NULL;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'Step D: % linked expense(s) differ from the booking they were made from', bad;
  END IF;

  -- 4. A booking with a start has a date and an unscheduled one has none; a date is never more than a
  --    day away from the UTC day of the instant (zones span at most +-14h).
  SELECT count(*) INTO bad FROM "_step_d_booking"
   WHERE ("date" IS NULL) <> (NOT "has_start")
      OR ("date" IS NOT NULL AND abs("date" - ("start_at" AT TIME ZONE 'UTC')::date) > 1);
  IF bad <> 0 THEN
    RAISE EXCEPTION 'Step D: % linked expense(s) have an implausible date', bad;
  END IF;

  -- 5. Pre-existing expenses (and their splits) are untouched.
  SELECT count(*) INTO bad FROM (
    (SELECT * FROM "_step_d_expense_before"
     EXCEPT
     SELECT "id", "trip_id", "description", "category", "amount", "currency", "exchange_rate", "base_amount",
            "base_currency", "date", "notes", "paid_by_companion_id", "split_method", "receipt_path",
            "receipt_mime_type", "receipt_size_bytes", "receipt_uploaded_at", "created_at", "updated_at"
       FROM "trip_expenses")
  ) d;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'Step D: % pre-existing expense(s) were changed or lost', bad;
  END IF;
  SELECT count(*) INTO before_n FROM "_step_d_expense_before";
  SELECT count(*) INTO after_n FROM "trip_expenses"
    WHERE num_nonnulls("activity_id", "transportation_id", "lodging_id", "custom_item_id") = 0;
  IF before_n <> after_n THEN
    RAISE EXCEPTION 'Step D: % expense(s) before, % unlinked expense(s) after', before_n, after_n;
  END IF;
  SELECT count(*) INTO bad FROM (
    (SELECT * FROM "_step_d_split_before"
     EXCEPT SELECT "id", "expense_id", "companion_id", "amount", "percentage" FROM "trip_expense_splits")
    UNION ALL
    (SELECT "id", "expense_id", "companion_id", "amount", "percentage" FROM "trip_expense_splits"
     EXCEPT SELECT * FROM "_step_d_split_before")
  ) d;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'Step D: % expense split row(s) changed', bad;
  END IF;

  -- 6. No expense belongs to more than one booking (the CHECK says so too).
  SELECT count(*) INTO bad FROM "trip_expenses"
   WHERE num_nonnulls("activity_id", "transportation_id", "lodging_id", "custom_item_id") > 1;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'Step D: % expense(s) are linked to more than one booking', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- (e) Drop the old columns (their non-negative CHECKs go with them)
-- ---------------------------------------------------------------------------
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activity_cost_non_negative";
ALTER TABLE "transportation" DROP CONSTRAINT IF EXISTS "transportation_cost_non_negative";
ALTER TABLE "lodging" DROP CONSTRAINT IF EXISTS "lodging_cost_non_negative";
ALTER TABLE "custom_items" DROP CONSTRAINT IF EXISTS "custom_item_cost_non_negative";

ALTER TABLE "activities"
  DROP COLUMN "cost", DROP COLUMN "currency", DROP COLUMN "exchange_rate", DROP COLUMN "base_amount", DROP COLUMN "base_currency";
ALTER TABLE "transportation"
  DROP COLUMN "cost", DROP COLUMN "currency", DROP COLUMN "exchange_rate", DROP COLUMN "base_amount", DROP COLUMN "base_currency";
ALTER TABLE "lodging"
  DROP COLUMN "cost", DROP COLUMN "currency", DROP COLUMN "exchange_rate", DROP COLUMN "base_amount", DROP COLUMN "base_currency";
ALTER TABLE "custom_items"
  DROP COLUMN "cost", DROP COLUMN "currency", DROP COLUMN "exchange_rate", DROP COLUMN "base_amount", DROP COLUMN "base_currency";
