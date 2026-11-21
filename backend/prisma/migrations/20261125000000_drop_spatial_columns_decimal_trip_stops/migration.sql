-- Step F of the data model reorganization (docs/development/DATA_MODEL_REORG_PLAN.md).
--
-- 1. Drop the write-only PostGIS columns. "locations"."coordinates" and "photos"."coordinates"
--    (geography(Point, 4326)) were rewritten from latitude/longitude on every change by a Prisma extension
--    and are read by nothing (no query, index scan, service, script or tool). The columns and their GiST
--    indexes go; the plain Decimal latitude/longitude columns they were derived from stay as the only
--    source. The "postgis" extension itself stays installed: schema.prisma still declares it and the
--    database images and the entrypoint script create it.
--
-- 2. "trip_stops"."latitude"/"longitude" become DECIMAL(10,8) / DECIMAL(11,8), like every other coordinate
--    (they were DOUBLE PRECISION). Nullability is unchanged (NOT NULL). The two range CHECK constraints
--    from 20261116080000_add_trip_stops are dropped and re-added around the type change so they are
--    guaranteed to be present afterwards. The API keeps returning plain numbers (the services convert).
--
-- The migration runs in one transaction: a failed assertion leaves everything untouched.

-- ---------------------------------------------------------------------------
-- (a) Snapshot of what must not change
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_step_f_trip_stops_before" AS
SELECT "id", "latitude", "longitude" FROM "trip_stops";

-- ---------------------------------------------------------------------------
-- (b) Precondition: every value fits the new types
-- Decimal(10,8) holds |x| < 100, Decimal(11,8) holds |x| < 1000. Non-finite values cannot be stored.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad INTEGER;
BEGIN
  SELECT count(*) INTO bad FROM "trip_stops"
  WHERE "latitude" IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
     OR "longitude" IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
     OR abs("latitude") >= 100
     OR abs("longitude") >= 1000;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Step F: % trip_stops row(s) have a latitude/longitude outside what DECIMAL(10,8)/(11,8) can hold', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- (c) Convert trip_stops coordinates
-- ---------------------------------------------------------------------------
ALTER TABLE "trip_stops" DROP CONSTRAINT "trip_stops_latitude_range";
ALTER TABLE "trip_stops" DROP CONSTRAINT "trip_stops_longitude_range";

ALTER TABLE "trip_stops"
  ALTER COLUMN "latitude" TYPE DECIMAL(10,8) USING round("latitude"::numeric, 8),
  ALTER COLUMN "longitude" TYPE DECIMAL(11,8) USING round("longitude"::numeric, 8);

ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180);

-- ---------------------------------------------------------------------------
-- (d) Assert: no row lost, nothing moved by more than 1e-8, still NOT NULL, CHECKs present
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  before_count INTEGER;
  after_count INTEGER;
  moved INTEGER;
  checks INTEGER;
  nullable_cols INTEGER;
BEGIN
  SELECT count(*) INTO before_count FROM "_step_f_trip_stops_before";
  SELECT count(*) INTO after_count FROM "trip_stops";
  IF before_count <> after_count THEN
    RAISE EXCEPTION 'Step F: trip_stops row count changed (% before, % after)', before_count, after_count;
  END IF;

  SELECT count(*) INTO moved
  FROM "_step_f_trip_stops_before" b
  JOIN "trip_stops" t ON t."id" = b."id"
  WHERE abs(t."latitude" - b."latitude"::numeric) > 0.00000001
     OR abs(t."longitude" - b."longitude"::numeric) > 0.00000001;
  IF moved > 0 THEN
    RAISE EXCEPTION 'Step F: % trip_stops coordinate(s) moved by more than 1e-8', moved;
  END IF;

  SELECT count(*) INTO nullable_cols
  FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'trip_stops'
    AND column_name IN ('latitude', 'longitude') AND is_nullable = 'YES';
  IF nullable_cols > 0 THEN
    RAISE EXCEPTION 'Step F: trip_stops latitude/longitude lost NOT NULL';
  END IF;

  SELECT count(*) INTO checks
  FROM pg_constraint
  WHERE conrelid = '"trip_stops"'::regclass AND contype = 'c'
    AND conname IN ('trip_stops_latitude_range', 'trip_stops_longitude_range', 'trip_stops_nights_range');
  IF checks <> 3 THEN
    RAISE EXCEPTION 'Step F: expected 3 CHECK constraints on trip_stops, found %', checks;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- (e) Drop the write-only spatial columns (their GiST indexes go with them)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "locations_coordinates_idx";
DROP INDEX IF EXISTS "photos_coordinates_idx";
ALTER TABLE "locations" DROP COLUMN "coordinates";
ALTER TABLE "photos" DROP COLUMN "coordinates";

DO $$
DECLARE
  leftover INTEGER;
  has_postgis INTEGER;
BEGIN
  SELECT count(*) INTO leftover
  FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name IN ('locations', 'photos') AND column_name = 'coordinates';
  IF leftover > 0 THEN
    RAISE EXCEPTION 'Step F: a coordinates column is still present';
  END IF;

  SELECT count(*) INTO has_postgis FROM pg_extension WHERE extname = 'postgis';
  IF has_postgis = 0 THEN
    RAISE EXCEPTION 'Step F: the postgis extension must stay installed';
  END IF;
END $$;
