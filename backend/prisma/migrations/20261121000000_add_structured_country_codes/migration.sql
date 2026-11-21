-- Step B of the data model reorganization (docs/development/DATA_MODEL_REORG_PLAN.md).
--
-- Structured country codes (ISO 3166-1 alpha-2, upper case):
--   locations.country_code, visa_requirements.passport_country_code /
--   destination_country_code, travel_documents.issuing_country_code.
-- The name columns stay (display, old clients). Existing rows are backfilled from the name /
-- address text; rows whose text is not recognised stay NULL (the application falls back to
-- parsing the text for those).
--
-- The name-to-code table below is GENERATED from packages/shared/src/constants/countryFacts.ts
-- (listCountryNameEntries / listUnitedStatesStateNames) and checked against it by the backend
-- test countryCodeMigration.test.ts. Do not edit the VALUES list by hand.
--
-- Address backfill rule (a deliberately small subset of the TypeScript resolver
-- resolveCountryFromAddress, which also does word-boundary matching inside a segment): split the
-- address at commas, normalise each segment, and take the LAST segment that is a whole country
-- name or alias, a whole US state name, or a name followed by a 5-digit postcode ("France 75001").
-- A final "Georgia" is ambiguous (country or US state) and is left NULL.

-- AlterTable
ALTER TABLE "locations" ADD COLUMN "country_code" VARCHAR(2);

-- AlterTable
ALTER TABLE "visa_requirements" ADD COLUMN "passport_country_code" VARCHAR(2),
ADD COLUMN "destination_country_code" VARCHAR(2);

-- AlterTable
ALTER TABLE "travel_documents" ADD COLUMN "issuing_country_code" VARCHAR(2);

-- Constraints Prisma cannot express (documented in schema.prisma).
ALTER TABLE "locations" ADD CONSTRAINT "locations_country_code_format_check"
  CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "visa_requirements" ADD CONSTRAINT "visa_requirements_passport_country_code_format_check"
  CHECK ("passport_country_code" IS NULL OR "passport_country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "visa_requirements" ADD CONSTRAINT "visa_requirements_destination_country_code_format_check"
  CHECK ("destination_country_code" IS NULL OR "destination_country_code" ~ '^[A-Z]{2}$');
ALTER TABLE "travel_documents" ADD CONSTRAINT "travel_documents_issuing_country_code_format_check"
  CHECK ("issuing_country_code" IS NULL OR "issuing_country_code" ~ '^[A-Z]{2}$');

-- CreateIndex
CREATE INDEX "locations_trip_id_country_code_idx" ON "locations"("trip_id", "country_code");

-- CreateIndex
CREATE INDEX "visa_requirements_passport_country_code_idx" ON "visa_requirements"("passport_country_code");

-- CreateIndex
CREATE INDEX "visa_requirements_destination_country_code_idx" ON "visa_requirements"("destination_country_code");

-- ---------------------------------------------------------------------------
-- Name-to-code tables (GENERATED, see the header).
-- ---------------------------------------------------------------------------

-- Same normalisation as normalize() in countryFacts.ts: strip accents, lower-case, drop
-- apostrophes and dots, turn every other run of non-alphanumerics into one space, trim.
CREATE FUNCTION pg_temp.tl_country_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT btrim(regexp_replace(regexp_replace(translate(lower(coalesce(t, '')), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżž', 'aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzz'), '[''’.]', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
$fn$;

CREATE TEMP TABLE "_country_names" (
  "name_norm" text PRIMARY KEY,
  "code" text NOT NULL,
  "kind" text NOT NULL -- country | whole (whole-field only) | us_state | ambiguous
);

INSERT INTO "_country_names" ("name_norm", "code", "kind") VALUES
  ('al maghrib', 'MA', 'country'),
  ('alabama', 'US', 'us_state'),
  ('alaska', 'US', 'us_state'),
  ('albania', 'AL', 'country'),
  ('america', 'US', 'whole'),
  ('andorra', 'AD', 'country'),
  ('aotearoa', 'NZ', 'country'),
  ('argentina', 'AR', 'country'),
  ('arizona', 'US', 'us_state'),
  ('arkansas', 'US', 'us_state'),
  ('armenia', 'AM', 'country'),
  ('aruba', 'AW', 'country'),
  ('australia', 'AU', 'country'),
  ('austria', 'AT', 'country'),
  ('azerbaijan', 'AZ', 'country'),
  ('bahamas', 'BS', 'country'),
  ('bahrain', 'BH', 'country'),
  ('bangladesh', 'BD', 'country'),
  ('barbados', 'BB', 'country'),
  ('belarus', 'BY', 'country'),
  ('belgie', 'BE', 'country'),
  ('belgien', 'BE', 'country'),
  ('belgique', 'BE', 'country'),
  ('belgium', 'BE', 'country'),
  ('belize', 'BZ', 'country'),
  ('bharat', 'IN', 'country'),
  ('bolivia', 'BO', 'country'),
  ('bosnia and herzegovina', 'BA', 'country'),
  ('bosnia herzegovina', 'BA', 'country'),
  ('bosnia', 'BA', 'country'),
  ('botswana', 'BW', 'country'),
  ('brasil', 'BR', 'country'),
  ('brazil', 'BR', 'country'),
  ('britain', 'GB', 'country'),
  ('bulgaria', 'BG', 'country'),
  ('california', 'US', 'us_state'),
  ('cambodia', 'KH', 'country'),
  ('canada', 'CA', 'country'),
  ('ceylon', 'LK', 'country'),
  ('chile', 'CL', 'country'),
  ('china', 'CN', 'country'),
  ('chinese taipei', 'TW', 'country'),
  ('colombia', 'CO', 'country'),
  ('colorado', 'US', 'us_state'),
  ('connecticut', 'US', 'us_state'),
  ('costa rica', 'CR', 'country'),
  ('croatia', 'HR', 'country'),
  ('cuba', 'CU', 'country'),
  ('cyprus', 'CY', 'country'),
  ('czech republic', 'CZ', 'country'),
  ('czechia', 'CZ', 'country'),
  ('danmark', 'DK', 'country'),
  ('delaware', 'US', 'us_state'),
  ('denmark', 'DK', 'country'),
  ('deutschland', 'DE', 'country'),
  ('district of columbia', 'US', 'us_state'),
  ('dominican republic', 'DO', 'country'),
  ('dubai', 'AE', 'whole'),
  ('ecuador', 'EC', 'country'),
  ('egypt', 'EG', 'country'),
  ('eire', 'IE', 'country'),
  ('el salvador', 'SV', 'country'),
  ('ellada', 'GR', 'country'),
  ('england', 'GB', 'country'),
  ('espana', 'ES', 'country'),
  ('estados unidos mexicanos', 'MX', 'country'),
  ('estonia', 'EE', 'country'),
  ('ethiopia', 'ET', 'country'),
  ('fiji', 'FJ', 'country'),
  ('finland', 'FI', 'country'),
  ('florida', 'US', 'us_state'),
  ('france', 'FR', 'country'),
  ('french polynesia', 'PF', 'country'),
  ('georgia', 'GE', 'ambiguous'),
  ('germany', 'DE', 'country'),
  ('ghana', 'GH', 'country'),
  ('great britain', 'GB', 'country'),
  ('greece', 'GR', 'country'),
  ('guatemala', 'GT', 'country'),
  ('hawaii', 'US', 'us_state'),
  ('hellas', 'GR', 'country'),
  ('helvetia', 'CH', 'country'),
  ('holland', 'NL', 'country'),
  ('honduras', 'HN', 'country'),
  ('hong kong sar', 'HK', 'country'),
  ('hong kong', 'HK', 'country'),
  ('hrvatska', 'HR', 'country'),
  ('hungary', 'HU', 'country'),
  ('iceland', 'IS', 'country'),
  ('idaho', 'US', 'us_state'),
  ('illinois', 'US', 'us_state'),
  ('india', 'IN', 'country'),
  ('indiana', 'US', 'us_state'),
  ('indonesia', 'ID', 'country'),
  ('iowa', 'US', 'us_state'),
  ('ireland', 'IE', 'country'),
  ('israel', 'IL', 'country'),
  ('italia', 'IT', 'country'),
  ('italy', 'IT', 'country'),
  ('jamaica', 'JM', 'country'),
  ('japan', 'JP', 'country'),
  ('jordan', 'JO', 'country'),
  ('kansas', 'US', 'us_state'),
  ('kentucky', 'US', 'us_state'),
  ('kenya', 'KE', 'country'),
  ('kingdom of saudi arabia', 'SA', 'country'),
  ('korea republic of', 'KR', 'country'),
  ('korea south', 'KR', 'country'),
  ('korea', 'KR', 'country'),
  ('ksa', 'SA', 'country'),
  ('kuwait', 'KW', 'country'),
  ('lao pdr', 'LA', 'country'),
  ('lao peoples democratic republic', 'LA', 'country'),
  ('laos', 'LA', 'country'),
  ('latvia', 'LV', 'country'),
  ('lebanon', 'LB', 'country'),
  ('lithuania', 'LT', 'country'),
  ('louisiana', 'US', 'us_state'),
  ('luxembourg', 'LU', 'country'),
  ('macao', 'MO', 'country'),
  ('macau', 'MO', 'country'),
  ('macedonia', 'MK', 'country'),
  ('magyarorszag', 'HU', 'country'),
  ('maine', 'US', 'us_state'),
  ('mainland china', 'CN', 'country'),
  ('malaysia', 'MY', 'country'),
  ('maldives', 'MV', 'country'),
  ('malta', 'MT', 'country'),
  ('maroc', 'MA', 'country'),
  ('maryland', 'US', 'us_state'),
  ('massachusetts', 'US', 'us_state'),
  ('mauritius', 'MU', 'country'),
  ('mexico', 'MX', 'country'),
  ('michigan', 'US', 'us_state'),
  ('minnesota', 'US', 'us_state'),
  ('mississippi', 'US', 'us_state'),
  ('missouri', 'US', 'us_state'),
  ('moldova', 'MD', 'country'),
  ('monaco', 'MC', 'country'),
  ('mongolia', 'MN', 'country'),
  ('montana', 'US', 'us_state'),
  ('montenegro', 'ME', 'country'),
  ('morocco', 'MA', 'country'),
  ('namibia', 'NA', 'country'),
  ('nebraska', 'US', 'us_state'),
  ('nederland', 'NL', 'country'),
  ('nepal', 'NP', 'country'),
  ('netherlands', 'NL', 'country'),
  ('nevada', 'US', 'us_state'),
  ('new hampshire', 'US', 'us_state'),
  ('new jersey', 'US', 'us_state'),
  ('new mexico', 'US', 'us_state'),
  ('new york', 'US', 'us_state'),
  ('new zealand', 'NZ', 'country'),
  ('nigeria', 'NG', 'country'),
  ('nihon', 'JP', 'country'),
  ('nippon', 'JP', 'country'),
  ('norge', 'NO', 'country'),
  ('north carolina', 'US', 'us_state'),
  ('north dakota', 'US', 'us_state'),
  ('north macedonia', 'MK', 'country'),
  ('northern ireland', 'GB', 'country'),
  ('norway', 'NO', 'country'),
  ('ohio', 'US', 'us_state'),
  ('oklahoma', 'US', 'us_state'),
  ('oman', 'OM', 'country'),
  ('oregon', 'US', 'us_state'),
  ('osterreich', 'AT', 'country'),
  ('pakistan', 'PK', 'country'),
  ('panama', 'PA', 'country'),
  ('paraguay', 'PY', 'country'),
  ('pennsylvania', 'US', 'us_state'),
  ('peoples republic of china', 'CN', 'country'),
  ('peru', 'PE', 'country'),
  ('philippines', 'PH', 'country'),
  ('poland', 'PL', 'country'),
  ('polska', 'PL', 'country'),
  ('portugal', 'PT', 'country'),
  ('puerto rico', 'PR', 'country'),
  ('qatar', 'QA', 'country'),
  ('republic of ireland', 'IE', 'country'),
  ('republic of korea', 'KR', 'country'),
  ('republic of south africa', 'ZA', 'country'),
  ('rhode island', 'US', 'us_state'),
  ('rok', 'KR', 'whole'),
  ('romania', 'RO', 'country'),
  ('rsa', 'ZA', 'country'),
  ('russia', 'RU', 'country'),
  ('russian federation', 'RU', 'country'),
  ('rwanda', 'RW', 'country'),
  ('sakartvelo', 'GE', 'country'),
  ('saudi arabia', 'SA', 'country'),
  ('schweiz', 'CH', 'country'),
  ('scotland', 'GB', 'country'),
  ('senegal', 'SN', 'country'),
  ('serbia', 'RS', 'country'),
  ('seychelles', 'SC', 'country'),
  ('singapore', 'SG', 'country'),
  ('slovakia', 'SK', 'country'),
  ('slovenia', 'SI', 'country'),
  ('south africa', 'ZA', 'country'),
  ('south carolina', 'US', 'us_state'),
  ('south dakota', 'US', 'us_state'),
  ('south korea', 'KR', 'country'),
  ('spain', 'ES', 'country'),
  ('srbija', 'RS', 'country'),
  ('sri lanka', 'LK', 'country'),
  ('suisse', 'CH', 'country'),
  ('suomi', 'FI', 'country'),
  ('sverige', 'SE', 'country'),
  ('svizzera', 'CH', 'country'),
  ('sweden', 'SE', 'country'),
  ('switzerland', 'CH', 'country'),
  ('tahiti', 'PF', 'country'),
  ('taiwan', 'TW', 'country'),
  ('tanzania', 'TZ', 'country'),
  ('tennessee', 'US', 'us_state'),
  ('texas', 'US', 'us_state'),
  ('thailand', 'TH', 'country'),
  ('the bahamas', 'BS', 'country'),
  ('the netherlands', 'NL', 'country'),
  ('the philippines', 'PH', 'country'),
  ('tobago', 'TT', 'country'),
  ('trinidad and tobago', 'TT', 'country'),
  ('trinidad', 'TT', 'country'),
  ('tunisia', 'TN', 'country'),
  ('turkey', 'TR', 'country'),
  ('turkiye', 'TR', 'country'),
  ('u s a', 'US', 'country'),
  ('uae', 'AE', 'country'),
  ('uganda', 'UG', 'country'),
  ('uk', 'GB', 'country'),
  ('ukraine', 'UA', 'country'),
  ('united arab emirates', 'AE', 'country'),
  ('united kingdom', 'GB', 'country'),
  ('united states of america', 'US', 'country'),
  ('united states', 'US', 'country'),
  ('uruguay', 'UY', 'country'),
  ('us', 'US', 'whole'),
  ('usa', 'US', 'country'),
  ('utah', 'US', 'us_state'),
  ('venezuela', 'VE', 'country'),
  ('vermont', 'US', 'us_state'),
  ('vietnam', 'VN', 'country'),
  ('virginia', 'US', 'us_state'),
  ('wales', 'GB', 'country'),
  ('washington dc', 'US', 'us_state'),
  ('washington', 'US', 'us_state'),
  ('west virginia', 'US', 'us_state'),
  ('wisconsin', 'US', 'us_state'),
  ('wyoming', 'US', 'us_state');

CREATE TEMP TABLE "_country_codes" ("code" text PRIMARY KEY);
INSERT INTO "_country_codes" ("code") VALUES
  ('AD'),
  ('AE'),
  ('AL'),
  ('AM'),
  ('AR'),
  ('AT'),
  ('AU'),
  ('AW'),
  ('AZ'),
  ('BA'),
  ('BB'),
  ('BD'),
  ('BE'),
  ('BG'),
  ('BH'),
  ('BO'),
  ('BR'),
  ('BS'),
  ('BW'),
  ('BY'),
  ('BZ'),
  ('CA'),
  ('CH'),
  ('CL'),
  ('CN'),
  ('CO'),
  ('CR'),
  ('CU'),
  ('CY'),
  ('CZ'),
  ('DE'),
  ('DK'),
  ('DO'),
  ('EC'),
  ('EE'),
  ('EG'),
  ('ES'),
  ('ET'),
  ('FI'),
  ('FJ'),
  ('FR'),
  ('GB'),
  ('GE'),
  ('GH'),
  ('GR'),
  ('GT'),
  ('HK'),
  ('HN'),
  ('HR'),
  ('HU'),
  ('ID'),
  ('IE'),
  ('IL'),
  ('IN'),
  ('IS'),
  ('IT'),
  ('JM'),
  ('JO'),
  ('JP'),
  ('KE'),
  ('KH'),
  ('KR'),
  ('KW'),
  ('LA'),
  ('LB'),
  ('LK'),
  ('LT'),
  ('LU'),
  ('LV'),
  ('MA'),
  ('MC'),
  ('MD'),
  ('ME'),
  ('MK'),
  ('MN'),
  ('MO'),
  ('MT'),
  ('MU'),
  ('MV'),
  ('MX'),
  ('MY'),
  ('NA'),
  ('NG'),
  ('NL'),
  ('NO'),
  ('NP'),
  ('NZ'),
  ('OM'),
  ('PA'),
  ('PE'),
  ('PF'),
  ('PH'),
  ('PK'),
  ('PL'),
  ('PR'),
  ('PT'),
  ('PY'),
  ('QA'),
  ('RO'),
  ('RS'),
  ('RU'),
  ('RW'),
  ('SA'),
  ('SC'),
  ('SE'),
  ('SG'),
  ('SI'),
  ('SK'),
  ('SN'),
  ('SV'),
  ('TH'),
  ('TN'),
  ('TR'),
  ('TT'),
  ('TW'),
  ('TZ'),
  ('UA'),
  ('UG'),
  ('US'),
  ('UY'),
  ('VE'),
  ('VN'),
  ('ZA');

-- ---------------------------------------------------------------------------
-- Backfill locations.country_code from address text.
-- ---------------------------------------------------------------------------
UPDATE "locations" loc
SET "country_code" = hit."code"
FROM (
  SELECT DISTINCT ON (seg."id") seg."id", cn."code", cn."kind"
  FROM (
    SELECT l."id", s."ord", pg_temp.tl_country_norm(s."part") AS "norm"
    FROM "locations" l
    CROSS JOIN LATERAL unnest(string_to_array(l."address", ',')) WITH ORDINALITY AS s("part", "ord")
    WHERE l."address" IS NOT NULL
  ) seg
  JOIN "_country_names" cn
    ON cn."kind" <> 'whole'
   AND (
     cn."name_norm" = seg."norm"
     OR cn."name_norm" = substring(seg."norm" from '^(.*?)\s+\d{5}(?:\s+\d{4})?$')
   )
  WHERE seg."norm" <> ''
  ORDER BY seg."id", seg."ord" DESC
) hit
WHERE loc."id" = hit."id" AND hit."kind" <> 'ambiguous';

-- ---------------------------------------------------------------------------
-- Backfill the name columns of visa_requirements and travel_documents.
-- A name is matched whole (country names, every alias, the whole-field aliases such as "USA"
-- and "UK"); a bare two-letter value that is a known code maps to itself.
-- ---------------------------------------------------------------------------
UPDATE "visa_requirements" v
SET "passport_country_code" = COALESCE(
  (SELECT cn."code" FROM "_country_names" cn WHERE cn."kind" IN ('country', 'whole') AND cn."name_norm" = pg_temp.tl_country_norm(v."passport_country")),
  (SELECT cc."code" FROM "_country_codes" cc WHERE cc."code" = upper(btrim(v."passport_country")))
);

UPDATE "visa_requirements" v
SET "destination_country_code" = COALESCE(
  (SELECT cn."code" FROM "_country_names" cn WHERE cn."kind" IN ('country', 'whole') AND cn."name_norm" = pg_temp.tl_country_norm(v."destination_country")),
  (SELECT cc."code" FROM "_country_codes" cc WHERE cc."code" = upper(btrim(v."destination_country")))
);

UPDATE "travel_documents" d
SET "issuing_country_code" = COALESCE(
  (SELECT cn."code" FROM "_country_names" cn WHERE cn."kind" IN ('country', 'whole') AND cn."name_norm" = pg_temp.tl_country_norm(d."issuing_country")),
  (SELECT cc."code" FROM "_country_codes" cc WHERE cc."code" = upper(btrim(d."issuing_country")))
);

-- ---------------------------------------------------------------------------
-- Verify. Not every row can be mapped (free text), so the invariants are the format of whatever
-- was written and that no row was added or lost.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad_locations integer;
  bad_visa integer;
  bad_docs integer;
BEGIN
  SELECT count(*) INTO bad_locations FROM "locations"
    WHERE "country_code" IS NOT NULL AND "country_code" !~ '^[A-Z]{2}$';
  SELECT count(*) INTO bad_visa FROM "visa_requirements"
    WHERE ("passport_country_code" IS NOT NULL AND "passport_country_code" !~ '^[A-Z]{2}$')
       OR ("destination_country_code" IS NOT NULL AND "destination_country_code" !~ '^[A-Z]{2}$');
  SELECT count(*) INTO bad_docs FROM "travel_documents"
    WHERE "issuing_country_code" IS NOT NULL AND "issuing_country_code" !~ '^[A-Z]{2}$';

  IF bad_locations <> 0 OR bad_visa <> 0 OR bad_docs <> 0 THEN
    RAISE EXCEPTION 'country code backfill produced malformed codes (locations %, visa_requirements %, travel_documents %)',
      bad_locations, bad_visa, bad_docs;
  END IF;

  -- A code may only be set on a location that has an address to derive it from.
  IF EXISTS (SELECT 1 FROM "locations" WHERE "country_code" IS NOT NULL AND ("address" IS NULL OR btrim("address") = '')) THEN
    RAISE EXCEPTION 'country code backfill set a code on a location without an address';
  END IF;
END
$$;

DROP TABLE "_country_names";
DROP TABLE "_country_codes";
DROP FUNCTION pg_temp.tl_country_norm(text);
