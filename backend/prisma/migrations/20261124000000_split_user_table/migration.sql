-- Step E of the data model reorganization (docs/development/DATA_MODEL_REORG_PLAN.md).
--
-- Split the catch-all "users" table. "users" keeps identity and login (username, email, password hash and
-- version, avatar, timezone, OIDC subject, calendar token, travel partner link, timestamps). Two new
-- one-row-per-user tables take the rest:
--   user_integrations  Immich, weather, Aviationstack, OpenRouteService, LLM and SMTP settings. API keys and
--                      the SMTP password are copied as stored (ciphertext, byte for byte); nothing here
--                      decrypts or re-encrypts anything.
--   user_preferences   activity categories, trip types, dietary preferences, link ingest senders, map style,
--                      home currency, preferred maps app, measurement system (with its CHECK) and the default
--                      travel partner permission.
-- Every existing user gets exactly one row in each table. Column types, defaults and nullability are unchanged.
--
-- Order: (a) snapshot the columns that stay, (b) create the tables, (c) backfill, (d) assert, (e) drop. The
-- migration runs in one transaction, so a failed assertion leaves "users" untouched.

-- ---------------------------------------------------------------------------
-- (a) Snapshot of what must not change
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_step_e_users_before" AS
SELECT "id", "username", "email", "password_hash", "avatar_url", "timezone", "password_version", "oidc_subject", "calendar_token", "created_at", "updated_at", "travel_partner_id" FROM "users";

-- ---------------------------------------------------------------------------
-- (b) Structure
-- ---------------------------------------------------------------------------
CREATE TABLE "user_integrations" (
    "user_id" INTEGER NOT NULL,
    "immich_api_url" VARCHAR(500),
    "immich_api_key" VARCHAR(500),
    "weather_api_key" VARCHAR(500),
    "aviationstack_api_key" VARCHAR(500),
    "openrouteservice_api_key" VARCHAR(500),
    "llm_api_key" VARCHAR(500),
    "llm_base_url" VARCHAR(500),
    "llm_model" VARCHAR(200),
    "smtp_provider" VARCHAR(50),
    "smtp_host" VARCHAR(500),
    "smtp_port" INTEGER,
    "smtp_secure" BOOLEAN,
    "smtp_user" VARCHAR(500),
    "smtp_password" VARCHAR(500),
    "smtp_from" VARCHAR(500),

    CONSTRAINT "user_integrations_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "user_preferences" (
    "user_id" INTEGER NOT NULL,
    "activity_categories" JSONB NOT NULL DEFAULT '[{"name":"Sightseeing","emoji":"🏛️"},{"name":"Dining","emoji":"🍽️"},{"name":"Adventure","emoji":"🧗"},{"name":"Entertainment","emoji":"🎭"},{"name":"Shopping","emoji":"🛍️"},{"name":"Recreation","emoji":"⚽"},{"name":"Cultural","emoji":"🏛️"},{"name":"Sports","emoji":"🏅"},{"name":"Wellness","emoji":"🧘"},{"name":"Tour","emoji":"👥"},{"name":"Other","emoji":"📌"}]',
    "trip_types" JSONB NOT NULL DEFAULT '[{"name":"Leisure","emoji":"🏖️"},{"name":"Business","emoji":"💼"},{"name":"Road Trip","emoji":"🚗"},{"name":"Backpacking","emoji":"🎒"},{"name":"Cruise","emoji":"🚢"},{"name":"Study Abroad","emoji":"📚"},{"name":"Volunteer","emoji":"🤝"},{"name":"Pilgrimage","emoji":"🕊️"},{"name":"Adventure","emoji":"🧗"},{"name":"Family","emoji":"👨‍👩‍👧‍👦"},{"name":"Honeymoon","emoji":"💕"},{"name":"Other","emoji":"📌"}]',
    "dietary_preferences" JSONB NOT NULL DEFAULT '[]',
    "link_ingest_senders" JSONB NOT NULL DEFAULT '[]',
    "use_custom_map_style" BOOLEAN NOT NULL DEFAULT true,
    "base_currency" VARCHAR(3),
    "preferred_maps_app" VARCHAR(50),
    "measurement_system" VARCHAR(10),
    "default_partner_permission" VARCHAR(50) NOT NULL DEFAULT 'edit',

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_integrations" ADD CONSTRAINT "user_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- measurement_system carried a CHECK on "users" (migration 20261116120000_add_user_measurement_system); it
-- is recreated here under the new table. Prisma cannot represent CHECK constraints (see schema.prisma).
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_measurement_system_check"
  CHECK ("measurement_system" IS NULL OR "measurement_system" IN ('imperial', 'metric'));

-- ---------------------------------------------------------------------------
-- (c) Backfill: one row per user in each table
-- ---------------------------------------------------------------------------
INSERT INTO "user_integrations" ("user_id", "immich_api_url", "immich_api_key", "weather_api_key", "aviationstack_api_key", "openrouteservice_api_key", "llm_api_key", "llm_base_url", "llm_model", "smtp_provider", "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_password", "smtp_from")
SELECT "id", "immich_api_url", "immich_api_key", "weather_api_key", "aviationstack_api_key", "openrouteservice_api_key", "llm_api_key", "llm_base_url", "llm_model", "smtp_provider", "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_password", "smtp_from" FROM "users";

INSERT INTO "user_preferences" ("user_id", "activity_categories", "trip_types", "dietary_preferences", "link_ingest_senders", "use_custom_map_style", "base_currency", "preferred_maps_app", "measurement_system", "default_partner_permission")
SELECT "id", "activity_categories", "trip_types", "dietary_preferences", "link_ingest_senders", "use_custom_map_style", "base_currency", "preferred_maps_app", "measurement_system", "default_partner_permission" FROM "users";

-- ---------------------------------------------------------------------------
-- (d) Assertions: abort the whole migration on any mismatch
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  "users_count" bigint;
  "bad" bigint;
BEGIN
  SELECT count(*) INTO "users_count" FROM "users";

  SELECT count(*) INTO "bad" FROM "user_integrations";
  IF "bad" <> "users_count" THEN
    RAISE EXCEPTION 'Step E: user_integrations has % rows, users has %', "bad", "users_count";
  END IF;

  SELECT count(*) INTO "bad" FROM "user_preferences";
  IF "bad" <> "users_count" THEN
    RAISE EXCEPTION 'Step E: user_preferences has % rows, users has %', "bad", "users_count";
  END IF;

  -- Every user has its own row (equal counts alone would also pass with a wrong mapping).
  SELECT count(*) INTO "bad" FROM "users" u
   WHERE NOT EXISTS (SELECT 1 FROM "user_integrations" i WHERE i."user_id" = u."id")
      OR NOT EXISTS (SELECT 1 FROM "user_preferences" p WHERE p."user_id" = u."id");
  IF "bad" <> 0 THEN
    RAISE EXCEPTION 'Step E: % users are missing a user_integrations or user_preferences row', "bad";
  END IF;

  -- Every moved column equals the old value. JSON is compared as jsonb, ciphertext and text as text.
  SELECT count(*) INTO "bad" FROM "users" u JOIN "user_integrations" i ON i."user_id" = u."id"
   WHERE i."immich_api_url" IS DISTINCT FROM u."immich_api_url"
      OR i."immich_api_key" IS DISTINCT FROM u."immich_api_key"
      OR i."weather_api_key" IS DISTINCT FROM u."weather_api_key"
      OR i."aviationstack_api_key" IS DISTINCT FROM u."aviationstack_api_key"
      OR i."openrouteservice_api_key" IS DISTINCT FROM u."openrouteservice_api_key"
      OR i."llm_api_key" IS DISTINCT FROM u."llm_api_key"
      OR i."llm_base_url" IS DISTINCT FROM u."llm_base_url"
      OR i."llm_model" IS DISTINCT FROM u."llm_model"
      OR i."smtp_provider" IS DISTINCT FROM u."smtp_provider"
      OR i."smtp_host" IS DISTINCT FROM u."smtp_host"
      OR i."smtp_port" IS DISTINCT FROM u."smtp_port"
      OR i."smtp_secure" IS DISTINCT FROM u."smtp_secure"
      OR i."smtp_user" IS DISTINCT FROM u."smtp_user"
      OR i."smtp_password" IS DISTINCT FROM u."smtp_password"
      OR i."smtp_from" IS DISTINCT FROM u."smtp_from";
  IF "bad" <> 0 THEN
    RAISE EXCEPTION 'Step E: % user_integrations rows differ from users', "bad";
  END IF;

  SELECT count(*) INTO "bad" FROM "users" u JOIN "user_preferences" p ON p."user_id" = u."id"
   WHERE p."activity_categories"::jsonb IS DISTINCT FROM u."activity_categories"::jsonb
      OR p."trip_types"::jsonb IS DISTINCT FROM u."trip_types"::jsonb
      OR p."dietary_preferences"::jsonb IS DISTINCT FROM u."dietary_preferences"::jsonb
      OR p."link_ingest_senders"::jsonb IS DISTINCT FROM u."link_ingest_senders"::jsonb
      OR p."use_custom_map_style" IS DISTINCT FROM u."use_custom_map_style"
      OR p."base_currency" IS DISTINCT FROM u."base_currency"
      OR p."preferred_maps_app" IS DISTINCT FROM u."preferred_maps_app"
      OR p."measurement_system" IS DISTINCT FROM u."measurement_system"
      OR p."default_partner_permission" IS DISTINCT FROM u."default_partner_permission";
  IF "bad" <> 0 THEN
    RAISE EXCEPTION 'Step E: % user_preferences rows differ from users', "bad";
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- (e) Drop the moved columns (this also drops users_measurement_system_check)
-- ---------------------------------------------------------------------------
ALTER TABLE "users"
  DROP COLUMN "activity_categories",
  DROP COLUMN "aviationstack_api_key",
  DROP COLUMN "base_currency",
  DROP COLUMN "default_partner_permission",
  DROP COLUMN "dietary_preferences",
  DROP COLUMN "immich_api_key",
  DROP COLUMN "immich_api_url",
  DROP COLUMN "link_ingest_senders",
  DROP COLUMN "llm_api_key",
  DROP COLUMN "llm_base_url",
  DROP COLUMN "llm_model",
  DROP COLUMN "measurement_system",
  DROP COLUMN "openrouteservice_api_key",
  DROP COLUMN "preferred_maps_app",
  DROP COLUMN "smtp_from",
  DROP COLUMN "smtp_host",
  DROP COLUMN "smtp_password",
  DROP COLUMN "smtp_port",
  DROP COLUMN "smtp_provider",
  DROP COLUMN "smtp_secure",
  DROP COLUMN "smtp_user",
  DROP COLUMN "trip_types",
  DROP COLUMN "use_custom_map_style",
  DROP COLUMN "weather_api_key";

-- The columns that stay are exactly as they were, row for row (both directions of EXCEPT).
DO $$
DECLARE
  "bad" bigint;
BEGIN
  SELECT count(*) INTO "bad" FROM (
    (SELECT "id", "username", "email", "password_hash", "avatar_url", "timezone", "password_version", "oidc_subject", "calendar_token", "created_at", "updated_at", "travel_partner_id" FROM "users" EXCEPT SELECT "id", "username", "email", "password_hash", "avatar_url", "timezone", "password_version", "oidc_subject", "calendar_token", "created_at", "updated_at", "travel_partner_id" FROM "_step_e_users_before")
    UNION ALL
    (SELECT "id", "username", "email", "password_hash", "avatar_url", "timezone", "password_version", "oidc_subject", "calendar_token", "created_at", "updated_at", "travel_partner_id" FROM "_step_e_users_before" EXCEPT SELECT "id", "username", "email", "password_hash", "avatar_url", "timezone", "password_version", "oidc_subject", "calendar_token", "created_at", "updated_at", "travel_partner_id" FROM "users")
  ) AS "diff";
  IF "bad" <> 0 THEN
    RAISE EXCEPTION 'Step E: % users rows changed in the columns that stay', "bad";
  END IF;
END $$;

DROP TABLE "_step_e_users_before";
