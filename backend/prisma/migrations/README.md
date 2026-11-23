# Prisma migrations — READ BEFORE DEPLOYING

## STOP — one mandatory manual step on every existing database

A baseline migration, `00000000000000_init`, was added on 2026-07-25. It creates the
**entire schema from empty**.

Every database that already contains data — production, the developer database, any
restored dump — **must have it marked as already applied, exactly once, before the next
`prisma migrate deploy`**:

```bash
npx prisma migrate resolve --applied 00000000000000_init
```

Run that command **once per existing database**, from `backend/`, with `DATABASE_URL`
pointing at that database. It writes a bookkeeping row into `_prisma_migrations`; it
executes **no SQL against your tables**.

If you skip it, `prisma migrate deploy` will try to run the baseline against a database
where those tables already exist. The migration is guarded — its first statement aborts
with `REFUSING TO RUN BASELINE 00000000000000_init: table "users" already exists` and
Prisma rolls the whole file back — so **your schema and data are not damaged**. But the
deploy fails and no subsequent migration is applied.

Only a genuinely empty database should ever let the baseline execute.

## Recovering after the baseline has already failed (`P3009`)

Once the guard has tripped, the baseline is recorded in `_prisma_migrations` as a *failed*
migration, and every later `migrate deploy` refuses immediately:

```text
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied.
The `00000000000000_init` migration started at ... failed
```

**The single `--applied` command above is not enough at this point** — Prisma rejects
`--applied` for a migration already recorded as failed. Clear the failed state first, then
record it as applied:

```bash
npx prisma migrate resolve --rolled-back 00000000000000_init
npx prisma migrate resolve --applied     00000000000000_init
npx prisma migrate deploy
```

`--rolled-back` is truthful here: the guard aborted the very first statement and Prisma
rolled the file back, so nothing from the baseline was ever committed.

If the backend container is crash-looping (its entrypoint runs `migrate deploy` and exits
on failure), you cannot `docker exec` into it. Run the recovery from a one-off container on
the same network instead:

`--entrypoint sh` is required: the image's entrypoint is `migrate-and-start.sh`, so without
it the one-off container just re-runs the same failing `migrate deploy`. Network name and
`DATABASE_URL` are read off the existing container so you do not have to look up credentials
(substitute the real container name from `docker ps -a`):

```bash
NET=$(docker inspect travel-life-backend \
      --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
DBURL=$(docker inspect travel-life-backend \
      --format '{{range .Config.Env}}{{println .}}{{end}}' \
      | grep '^DATABASE_URL=' | cut -d= -f2-)

docker run --rm --network "$NET" -e DATABASE_URL="$DBURL" \
  -w /app --entrypoint sh ghcr.io/dsbaciga/travel-life-backend:vX.Y.Z \
  -c 'npx prisma migrate resolve --rolled-back 00000000000000_init \
   && npx prisma migrate resolve --applied 00000000000000_init \
   && npx prisma migrate deploy'
```

Then start the app normally.

---

## Why the baseline exists

Migration history had no baseline. No migration created the core tables (`users`,
`trips`, `locations`, …) — the oldest one, `20251015_add_user_timezone`, is a bare
`ALTER TABLE "users" ADD COLUMN`, assuming the table already exists. The production
database only works because its schema was created out-of-band. `prisma migrate deploy`
against a genuinely empty database therefore failed on the very first migration.

`00000000000000_init` was generated offline from the current schema with:

```bash
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
```

It contains the tables, the enums, `CREATE EXTENSION postgis`, every index and
foreign key, plus (hand-appended) the four `CHECK` constraints Prisma cannot express.
It reflects the schema as of 2026-07-26, not as of 2025; the migrations dated after it
(starting with `20260728040000_add_travel_partner_requests`) are genuinely applied on top.

## Provisioning a genuinely fresh database

One command, against an empty PostGIS-enabled database:

```bash
npx prisma migrate deploy
```

That is the whole recipe. `00000000000000_init` creates the schema as it stood on 2026-07-26,
every migration after it replays on top, and the result is exactly `schema.prisma` (including
the CHECK constraints). Nothing is marked as applied by hand, and no `db execute` step is needed.

**Do not follow the older recipe** (`db execute` the baseline, then `migrate resolve --applied`
every migration). It marked the migrations dated after the baseline as applied without running
them, which left `trips.country_code`, the `trip_emergency_info` table and the
`travel_partner_requests` table missing.

How to check a fresh database, with a throwaway container on a free port:

```bash
docker run -d --name tl-fresh -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=app -p 55440:5432 postgis/postgis:16-3.4
export DATABASE_URL=postgresql://postgres:pw@localhost:55440/app
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
# expected: "-- This is an empty migration."
docker rm -f tl-fresh
```

### Why the older migrations are idempotent

The baseline already contains everything the 2025-10-15 to 2026-07-28 migrations create, and
`migrate deploy` replays them after it. Originally they were bare `ADD COLUMN` / `CREATE TABLE`
statements and failed on an empty database (the first one with
`column "timezone" of relation "users" already exists`). They now use `IF NOT EXISTS` /
`IF EXISTS`, `DO` blocks for enums, constraints and renames, and a column-exists guard around
the old data moves, so on a fresh database they are no-ops. Their behaviour on a database that
has not applied them is unchanged. Two small deliberate differences on a fresh database:

- `20260301000000_add_email_import_system` no longer creates `users.forwarding_email` and its
  unique index. Nothing reads them, the feature was removed, and `schema.prisma` has no such
  column. Databases that already ran the original keep the unused column; drop it with
  `ALTER TABLE users DROP COLUMN forwarding_email;` if you want them to match.
- `20260215_add_route_cache_unique_index` skips its index when the baseline already created
  the same unique index, instead of creating a duplicate.

### Editing applied migrations: what Prisma does with the changed checksums

Prisma records a checksum of each migration file when it applies it. After this change the
files differ from what existing databases recorded. This was tested against Prisma 7.10.1:

- `prisma migrate deploy` (production, the container entrypoint) does **not** compare
  checksums of already-applied migrations. It applies only the migrations that are not yet
  recorded and succeeds. No action is needed on a deployed database.
- `prisma migrate dev` **does** compare them. On a database that applied the earlier versions
  it prints `The migration ... was modified after it was applied` and offers to reset the
  schema (which deletes all data). Do not accept that on a database you care about. Instead
  run, once per development database, from `backend/`:

```bash
DATABASE_URL=postgresql://... node scripts/refresh-migration-checksums.js          # dry run
DATABASE_URL=postgresql://... node scripts/refresh-migration-checksums.js --apply
```

  It rewrites only the `checksum` column of `_prisma_migrations` for the edited migrations
  (a fixed list inside the script). It runs no migration SQL and touches no table.

## Migrations added 2026-11-28 (safe on a populated database)

Released in 8.3.1. Additive: one nullable column, nothing existing is changed. Apply with
`prisma migrate deploy`, then fill existing trips once with
`docker exec travel-life-backend node dist/scripts/backfillTripCoverColor.js`
(`--dry-run` to preview; in development `npx tsx src/scripts/backfillTripCoverColor.ts`).

| Migration | What it does |
| --- | --- |
| `20261128000000_add_trip_cover_color` | Adds `trips.cover_color` (`VARCHAR(7)`, `#rrggbb`), the dominant colour of the trip cover, used for the trip's accent tint. |

## Migrations added 2026-11-27 (safe on a populated database)

Released in 8.3.0. Additive: one new table, nothing existing is changed. Apply with
`prisma migrate deploy`.

| Migration | What it does |
| --- | --- |
| `20261127000000_add_trip_settlements` | Creates `trip_settlements`, the recorded settle-up payments between a trip's travellers. |

## Migrations added 2026-11-16 (safe on a populated database)

Released in 8.0.0. All additive: new tables, and new columns that are nullable or have a
default, so existing rows need no backfill. Apply with `prisma migrate deploy`.

| Migration | What it does |
| --- | --- |
| `20261116010000_add_expense_splits` | Adds `paid_by_owner` (`BOOLEAN NOT NULL DEFAULT false`), `paid_by_companion_id` and `split_method` to `trip_expenses`, and creates `trip_expense_splits`. Adds CHECK constraints (one payer, valid split method, one participant per split row, non-negative amounts) that `schema.prisma` cannot show. |
| `20261116020000_add_photo_is_favorite` | Adds `photos.is_favorite` (`BOOLEAN NOT NULL DEFAULT false`) and an index on `(trip_id, is_favorite)`. |
| `20261116030000_add_loyalty_programs` | Creates the `LoyaltyProgramType` enum and `loyalty_programs` (per user, `ON DELETE CASCADE`), and adds a nullable `loyalty_program_id` to `transportation` and `lodging`. |
| `20261116070000_add_expense_receipt_image` | Adds nullable `receipt_path`, `receipt_mime_type`, `receipt_size_bytes` and `receipt_uploaded_at` to `trip_expenses`. |
| `20261116080000_add_trip_stops` | Creates `trip_stops` for the route planner (`ON DELETE CASCADE` from the trip, `SET NULL` from a linked location) with CHECK constraints on latitude, longitude and nights. |
| `20261116100000_add_immich_album_link` | Adds nullable `immich_album_id` and `immich_album_synced_at` to `photo_albums`. |
| `20261116120000_add_user_measurement_system` | Adds nullable `users.measurement_system` with a CHECK constraint. `NULL` means the app default (imperial). |

Several of these add CHECK constraints, which `prisma db push` would not recreate; see
[CHECK constraints are invisible to `schema.prisma`](#check-constraints-are-invisible-to-schemaprisma).

## Migrations added 2026-07-27 (safe on a populated database)

| Migration | What it does |
| --- | --- |
| `20260729000000_add_emergency_card` | Creates `trip_emergency_info` (one row per trip, `UNIQUE (trip_id)`, `ON DELETE CASCADE`), adds `medical_notes` (nullable `TEXT`) and `allergies` (`JSONB NOT NULL DEFAULT '[]'`) to `travel_companions`, and adds `country_code` (nullable `VARCHAR(2)`) to `trips`. |

Purely additive — one new table and three new columns. No existing column, constraint or
row is modified, and both added `travel_companions` columns are nullable or defaulted, so
the `ALTER TABLE`s take only a brief metadata lock.

Local emergency numbers are **not** in the database: they ship as a static client-side
dataset so the card works in airplane mode. `trips.country_code` is nullable and means
"infer the country from the trip's locations" when unset; it is read by both the emergency
card and the local-norms card.

## Migrations added 2026-07-25 (safe on a populated database)

| Migration | What it does |
| --- | --- |
| `00000000000000_init` | Baseline. **Must be `migrate resolve --applied` on existing databases — see the top of this file.** |
| `20260728000000_add_weather_data_trip_date_unique` | De-duplicates `weather_data` (keeps the most recently fetched row per trip-day), then adds `UNIQUE (trip_id, date)`. Weather rows are a re-fetchable cache. |
| `20260728010000_add_trip_expense_trip_date_index` | Adds `INDEX (trip_id, date)` on `trip_expenses`, matching the list query's sort. |
| `20260728020000_add_trip_expense_amount_check` | Adds `CHECK (amount >= 0)` as `NOT VALID`, then validates it only if no negative rows exist. Cannot fail on legacy data. |
| `20260728030000_backfill_postgis_coordinates` | One-time backfill of `locations.coordinates` / `photos.coordinates` from `latitude`/`longitude` where they are still `NULL`. (Those columns were dropped later by `20261125000000_drop_spatial_columns_decimal_trip_stops`.) |

All four are guarded (`IF NOT EXISTS` / `DO` blocks / narrow `WHERE` clauses), so they
are idempotent and safe to re-run.

If `20260728020000` reports nothing, check for legacy negative amounts:

```sql
SELECT id, trip_id, description, amount FROM trip_expenses WHERE amount < 0;
```

Fix them, then finish the job with
`ALTER TABLE trip_expenses VALIDATE CONSTRAINT trip_expenses_amount_non_negative;`.

## CHECK constraints are invisible to `schema.prisma`

Prisma cannot represent `CHECK` constraints, so these four live only in migration SQL:

| Constraint | Table.column | Added by |
| --- | --- | --- |
| `activity_cost_non_negative` | `activities.cost` | `20260220000000` |
| `lodging_cost_non_negative` | `lodging.cost` | `20260220000000` |
| `transportation_cost_non_negative` | `transportation.cost` | `20260220000000` |
| `trip_expenses_amount_non_negative` | `trip_expenses.amount` | `20260728020000` |

Each field carries a comment in `schema.prisma` pointing here. **`prisma db push` would
rebuild the schema without them** — never use `db push` against a real database; the
baseline re-creates them so a database built from it is complete.
