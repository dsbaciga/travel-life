-- CHECK constraints for free-string columns whose vocabulary is fixed.
--
-- These columns are VARCHAR because Prisma enums were never used for them, so until now
-- raw SQL, bulk imports and scripts could store any string and the application would
-- silently mishandle it (a trip with status 'in-progress' sorts nowhere, a collaborator
-- with permission 'owner' is treated as 'view'). The Zod schemas already reject such
-- values at the API; this makes the database agree.
--
-- The allowed set of each column is the union of every value application code can write
-- (Zod schemas AND the paths that bypass them: duplicate trip, restore, background jobs,
-- column defaults) -- not just what Zod accepts. See docs/architecture/DATABASE_SCHEMA.md
-- ("Vocabulary CHECK constraints") for where each value comes from. Deliberately NOT
-- constrained: journal_entries.entry_type (Zod accepts any string), and the
-- user-extensible transportation.type, lodging.type, activities.category,
-- trips.trip_type and trip_expenses.category.
--
-- SAFE ON A POPULATED DATABASE (same pattern as 20260728020000_add_trip_expense_amount_check):
--   * Each constraint is added NOT VALID, which never scans or rejects existing rows
--     but still checks every INSERT and UPDATE from now on.
--   * It is then VALIDATEd only if no existing row violates it. If some do, it stays
--     NOT VALID and a NOTICE reports how many rows; no data is rewritten and the
--     migration never aborts.
--   * Both steps are guarded by the constraint name, so re-running is a no-op and a
--     constraint that already exists is left alone.
--
-- trips.status / trips.privacy_level also allow the lowercase column defaults
-- ('planning', 'private'): a row inserted without those columns gets them, and the
-- application never rewrites them.
--
-- Nullable columns (locations.opening_hours_source, transportation.distance_source) allow NULL.

DO $$
DECLARE
  spec record;
  cname text;
  allowed text;
  predicate text;
  bad bigint;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('trips',                  'status',                     ARRAY['Dream','Planning','Planned','In Progress','Completed','Cancelled','planning'], false),
      ('trips',                  'privacy_level',              ARRAY['Private','Shared','Public','private'], false),
      ('trip_collaborators',     'permission_level',           ARRAY['view','edit','admin'], false),
      ('trip_invitations',       'permission_level',           ARRAY['view','edit','admin'], false),
      ('trip_invitations',       'status',                     ARRAY['pending','accepted','declined','expired'], false),
      ('user_preferences',       'default_partner_permission', ARRAY['view','edit','admin'], false),
      ('transportation',         'status',                     ARRAY['on_time','delayed','cancelled'], false),
      ('transportation',         'distance_source',            ARRAY['route','haversine'], true),
      ('photos',                 'source',                     ARRAY['local','immich'], false),
      ('photos',                 'media_type',                 ARRAY['image','video'], false),
      ('booking_deadlines',      'kind',                       ARRAY['cancellation','check_in','payment','other'], false),
      ('checklists',             'type',                       ARRAY['custom','airports','countries','cities','us_states','souvenirs'], false),
      ('locations',              'opening_hours_source',       ARRAY['osm','manual'], true),
      ('mobile_push_tokens',     'platform',                   ARRAY['ios','android'], false)
    ) AS v(tbl, col, vals, nullable)
  LOOP
    cname := spec.tbl || '_' || spec.col || '_check';

    SELECT string_agg(quote_literal(x), ', ' ORDER BY x) INTO allowed FROM unnest(spec.vals) AS x;
    predicate := format('%I IN (%s)', spec.col, allowed);
    IF spec.nullable THEN
      predicate := format('%I IS NULL OR %s', spec.col, predicate);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = cname AND conrelid = format('public.%I', spec.tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID', spec.tbl, cname, predicate);
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = cname AND conrelid = format('public.%I', spec.tbl)::regclass AND NOT convalidated
    ) THEN
      EXECUTE format('SELECT count(*) FROM %I WHERE NOT (%s)', spec.tbl, predicate) INTO bad;
      IF bad = 0 THEN
        EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', spec.tbl, cname);
      ELSE
        RAISE NOTICE 'constraint % left NOT VALID: % existing row(s) of %.% hold a value outside (%)',
          cname, bad, spec.tbl, spec.col, allowed;
      END IF;
    END IF;
  END LOOP;
END
$$;

-- MANUAL FOLLOW-UP (only for a constraint a NOTICE reported as left NOT VALID):
--   SELECT id, <column> FROM <table> WHERE NOT (<predicate above>);
-- Correct those rows, then finish with:
--   ALTER TABLE <table> VALIDATE CONSTRAINT <table>_<column>_check;
-- Until then new and updated rows are checked and the historical rows are not.
