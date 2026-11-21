# Data Model Reorganization Plan

Status: in progress on branch `refactor/data-model-reorg` (November 2026).

This plan reorganizes how the backend stores data. It is carried out as seven
sequential steps (A to G), each one migration plus the code that goes with it. Each step
must leave the whole repository building and passing tests before the next begins.

## Ground rules for every step

These apply to all steps and override convenience.

1. **Clients must keep working.** The web frontend, the installed Android app (which
   mirrors the trip snapshot from `mobileSync.service.ts` and writes through the normal
   REST API from `mobile/src/sync/payloads.ts`) and old backup files must all keep working.
   Prefer changing storage while keeping request and response shapes; add fields rather
   than remove or rename them. Where a response field's storage moves, the service
   hydrates it so the JSON is unchanged.
2. **Migrations are hand-written SQL** in `backend/prisma/migrations/<timestamp>_<name>/migration.sql`,
   following the existing ones. Timestamps continue after the latest existing migration
   and after any earlier step of this plan. `schema.prisma` must match exactly: the drift
   check (`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`)
   prints nothing.
3. **Backfill, assert, then drop.** A migration that moves data must (a) add the new
   structure, (b) backfill, (c) verify the backfill inside the migration with a
   `DO $$ ... RAISE EXCEPTION ... $$` block that aborts when counts or sums disagree, and
   only then (d) drop the old columns. Constraints Prisma cannot express (CHECK, partial
   unique indexes, triggers) get a comment in `schema.prisma` naming the migration.
4. **Backups.** `backup.service.ts` and `restore.service.ts` are versioned. A backup
   written before this plan must still restore correctly. Bump `BACKUP_VERSION` only when
   the file format changes, and document the change in the version list in `restore.service.ts`.
5. **Test against a real database**, not only Jest mocks. See "Test database" below.
6. **Conventions.** Read `CLAUDE.md`, `docs/architecture/CODE_CONVENTIONS.md` and
   `docs/architecture/FEATURE_MAP.md` first. Services own permission checks; no
   `src/utils/`; Zod update schemas use `.nullable().optional()`; `services/_shared/vendored/`
   is generated (`npm run sync:vendored` from the repository root after editing `packages/shared`).
7. **Mobile.** Another branch has uncommitted UI work in `mobile/src/app/**`,
   `mobile/src/components/**`, `mobile/src/lib/theme.ts`, `toast.ts` and `feedback.ts`.
   Avoid editing those files; if a change there is unavoidable keep it minimal and report it.
8. **Docs.** Update `docs/architecture/DATABASE_SCHEMA.md`, the Feature Map where a helper
   is added, and `## [Unreleased]` in `CHANGELOG.md`. Tick the step off in this file.
9. **Git.** Commit on `refactor/data-model-reorg` only. Never push, never switch branch,
   never touch `main`.

## Test database

A throwaway PostGIS container `tl-datamodel-db` listens on `127.0.0.1:55432`
(user `tl`, password `tl_test_pw`). The working database is `tl_work`:

```bash
export DATABASE_URL="postgresql://tl:tl_test_pw@127.0.0.1:55432/tl_work?schema=public"
```

For each step:

1. Before applying the new migration, put rows in the **old** shape into `tl_work` that
   cover the backfill's edge cases (plain SQL through `docker exec tl-datamodel-db psql -U tl -d tl_work`
   is fine), then snapshot it: `CREATE DATABASE tl_pre_<step> TEMPLATE tl_work;`
   (no connections may be open on `tl_work` at that moment).
2. `npx prisma migrate deploy`, then check the result with SQL and run the drift check.
3. If the migration has to change, drop `tl_work`, recreate it from the snapshot and apply again.
4. Build the backend and run it against `tl_work` on a free port (not 5000, 5001, 5173 or
   3000; start it with the scratch directory as working directory so it does not write the
   developer's `data/token-blacklist.json`), and exercise the changed endpoints over HTTP.
   `tools/release-verify/README.md` describes `api-smoke.cjs` and `backup-roundtrip.cjs`.

Never run against the developer's own database on port 5432.

## Checks every step must pass

Run from each package directory in the worktree (frontend Vitest from a path with an
uppercase drive letter, `C:/...`):

- `backend`: `npm run build`, `npm run build:strict`, `npx jest`
- `frontend`: `npm run lint`, `npm run build`, `npm run build:strict`, `npm run test:run`
- `packages/shared`: `npm test`; `mobile`: `npm test` and `npx tsc --noEmit` when touched

All of these are green on `main`. Any failure is a regression from the step.

## Step A: direct location links, and integrity for `EntityLink`

Problem: "this activity/lodging is at this place" is stored as an `EntityLink` row
(sometimes `RELATED`, sometimes `OCCURRED_AT`), while transportation, custom items and
food log entries use a real foreign key. `EntityLink` itself has no referential integrity.

Design:

- Add nullable `location_id` to `activities` and `lodging`, FK to `locations`,
  `ON DELETE SET NULL`, indexed. This is the single source of truth for "is at".
- Backfill from `entity_links` rows joining an ACTIVITY or LODGING to a LOCATION of the same
  trip, in either direction. When an entity has several, prefer `OCCURRED_AT`, then the
  lowest link id. The chosen link row is deleted (the FK replaces it); other location links
  stay as loose `RELATED` associations.
- Services: activity and lodging create/update accept and return `locationId` (validated
  to be in the same trip) and include a small `location` object where other entities
  already do. Every writer that expresses "is at" through a link is switched to the FK,
  including the PDF import accept path, AI suggestions, bulk import and the frontend forms.
  Every reader that derives an activity's or lodging's place from links (timeline, daily
  view, maps, travel time, weather, validator, calendar feed, public share page, search)
  reads the FK.
- Compatibility: a link-create request ACTIVITY/LODGING to LOCATION that arrives from an
  older client while the entity has no `locationId` sets the FK instead of storing a link,
  and still answers in the link response shape. The sync snapshot carries `locationId`
  automatically; the mobile domain code that resolves an entity's place prefers it and
  falls back to links.
- Integrity: `AFTER DELETE` triggers on every table an `EntityType` can name delete the
  `entity_links` rows that reference the deleted row. Application-level
  `cleanupEntityLinks` calls stay (databases created with `prisma db push` have no triggers).

- [x] Step A done

## Step B: structured country

Problem: `Location` has only free-text `address`; the visa check parses a country name out
of it. `VisaRequirement` and `TravelDocument.issuingCountry` hold names, `Trip.countryCode`
holds ISO 3166-1 alpha-2.

Design:

- Add `locations.country_code` `VARCHAR(2)` nullable (upper-case ISO alpha-2, CHECK on format).
- Populate on create/update: the frontend geocoder already requests `addressdetails=1`,
  so pass Nominatim's `address.country_code` through; the backend accepts `countryCode` on
  location create/update, and when it is absent derives it from the address text using the
  existing name parsing plus a name-to-ISO table (reuse `packages/shared/src/constants/countryFacts.ts`
  if it has one; do not add a second country list). Backfill existing rows in the migration
  from the same name-to-ISO mapping where the address ends in a recognisable country name;
  leave the rest null.
- Add `visa_requirements.passport_country_code` / `destination_country_code` and
  `travel_documents.issuing_country_code` (`VARCHAR(2)`, nullable), backfilled from the
  names. Name columns stay for display and for old clients. Visa lookups match on codes
  first and fall back to names.
- `tripValidator.service.ts` groups destinations by `Location.countryCode`, falling back to
  address parsing only for rows with no code. Wherever the app derives a trip's country
  from its locations, structured codes win; `Trip.countryCode` stays the manual override.

- [x] Step B done

## Step C: one representation of "who paid"

Problem: the trip owner is `Trip.userId`, a `TravelCompanion` with `isMyself`, and the
booleans `TripExpense.paidByOwner` / `TripExpenseSplit.isOwner`, each with an either-or CHECK.

Design:

- Add `travel_companions.linked_user_id` (nullable FK to `users`, `ON DELETE SET NULL`).
  The `isMyself` companion gets `linked_user_id = user_id`. Add a partial unique index so a
  user has at most one `is_myself` companion (the migration first un-flags duplicates,
  keeping the lowest id).
- Payer and split participant are always a companion: backfill
  `paid_by_companion_id` / `companion_id` with the trip owner's "myself" companion
  (creating one named after the username when the owner has none), assert, then drop
  `paid_by_owner`, `is_owner` and their CHECKs; `trip_expense_splits.companion_id` becomes
  `NOT NULL`, with a unique index on `(expense_id, companion_id)`.
- API compatibility: requests may still send `paidByOwner: true` / `isOwner: true` (mapped
  to the owner's "myself" companion, created on demand); responses still carry derived
  `paidByOwner` / `isOwner` booleans beside the companion ids. Settle-up maths
  (`services/_shared/settleUp.ts`) keeps its results; prove it with the existing tests plus
  a before/after comparison on the test database.
- Backups keep their existing shape (`paidByOwner` plus `paidByCompanionName`); restore maps
  owner payers to the restoring user's "myself" companion.

- [x] Step C done

## Step D: every cost is a `TripExpense`

Problem: `Activity`, `Transportation`, `Lodging` and `CustomItem` each carry `cost`,
`currency`, `exchangeRate`, `baseAmount`, `baseCurrency`; only `TripExpense` supports
splits and receipts, and `getBudgetSummary` unions five tables.

Design:

- `trip_expenses` gains nullable `activity_id`, `transportation_id`, `lodging_id`,
  `custom_item_id` (FK, `ON DELETE CASCADE`), a CHECK that at most one is set, and a
  partial unique index per column so a booking has at most one cost row.
- Backfill one expense per booking whose `cost` is not null: description from the booking's
  name, category from its kind, amount/currency/FX snapshot copied, date = the booking's
  start as a calendar day in its own timezone (entity, then trip, then owner's zone; never
  a UTC slice). Assert row counts and per-trip sums match, then drop the five cost columns
  from the four booking tables.
- One helper (`services/_shared/bookingCost.ts`) reads and writes a booking's cost through
  its expense row. Booking services keep accepting and returning `cost`, `currency` and the
  FX fields exactly as before; clearing the cost deletes the expense row; renaming or
  re-dating a booking updates the row. The sync snapshot hydrates the same fields so the
  mobile app is unaffected.
- `getBudgetSummary` reads `trip_expenses` only; totals, per-category figures and the
  "unconverted" reporting must equal the pre-migration results (compare before and after on
  the test database). The expense list marks booking-linked rows and links to the booking;
  such rows can now be split and carry a receipt.
- Backups: bookings export with their hydrated cost as before. Booking-linked expenses are
  exported with a reference to their booking so splits and receipts survive a round trip;
  restore must not create the cost twice. Bump `BACKUP_VERSION`.

- [x] Step D done

## Step E: split the `User` table

Problem: `users` mixes identity, login, six integration secrets, SMTP settings and display
preferences, so every query needs a careful `select` to avoid loading secrets.

Design:

- `user_integrations` (one row per user, `user_id` primary key): Immich URL/key, weather,
  Aviationstack, OpenRouteService, LLM key/URL/model, all SMTP columns. Values stay
  encrypted exactly as now (`security/encryption.ts`); move ciphertext as-is.
- `user_preferences` (one row per user): `activityCategories`, `tripTypes`,
  `dietaryPreferences`, `linkIngestSenders`, `useCustomMapStyle`, `baseCurrency`,
  `preferredMapsApp`, `measurementSystem` (recreate its CHECK), `defaultPartnerPermission`.
- `users` keeps identity and login: username, email, password hash/version, avatar,
  `timezone` (it is on the session payload and read everywhere), OIDC subject, calendar
  token, travel partner link.
- The migration creates a row in both tables for every user, copies, asserts, then drops
  the old columns. Every user creation path creates both rows (registration, invitation
  acceptance, OIDC provisioning, restore). Two small accessors in `services/_shared/`
  return a user's integrations and preferences; nothing else reads the tables directly.
- API responses and the backup format are unchanged.

- [x] Step E done

## Step F (cleanup): spatial columns and coordinate types

- The `coordinates geography` columns on `locations` and `photos` are written on every
  change by `config/prismaExtensions.ts` and never read. Drop both columns, their GiST
  indexes and the dual-write extension code. Keep the `postgis` extension installed.
- `trip_stops.latitude/longitude` are `Float` while every other coordinate is
  `Decimal(10,8)` / `Decimal(11,8)`; convert them, keeping the range CHECKs and the API's
  plain-number JSON.

- [ ] Step F done

## Step G (cleanup): constrained status strings and redundant indexes

- Add CHECK constraints for free-string columns with a fixed vocabulary, using the allowed
  values in the Zod schemas as the authority: `trips.status`, `trips.privacy_level`,
  `trip_collaborators.permission_level`, `trip_invitations.permission_level` and `.status`,
  `users`/`user_preferences.default_partner_permission`, `transportation.status`,
  `journal_entries.entry_type`, `photos.source` and `.media_type`, `booking_deadlines.kind`,
  `checklists.type`, `locations.opening_hours_source`, `transportation.distance_source`,
  `mobile_push_tokens.platform`. Do not constrain user-extensible columns
  (`transportation.type`, `lodging.type`, `activities.category`, `trips.trip_type`,
  `trip_expenses.category`) unless the Zod schema is a closed enum. Add each constraint
  `NOT VALID` and validate it only when no existing row violates it (the pattern in
  `20260728020000_add_trip_expense_amount_check`).
- Drop indexes that are a strict prefix of another index or duplicate a unique constraint
  on the same table (for example `photos(trip_id)`, `entity_links(trip_id)`,
  `trip_invitations(token)`, `user_invitations(token)` and `(email)`,
  `photo_album_assignments(album_id)`, `trip_languages(trip_id)`,
  `dismissed_validation_issues(trip_id)`, `language_phrases(language_code)`,
  `weather_data(trip_id)`, `food_log_entry_photos(entry_id)`, `pdf_imports(user_id)`,
  `saved_links(user_id)`, `email_ingests(user_id)`). Confirm each against the final schema
  before dropping; keep any index that is not provably covered.

- [ ] Step G done
