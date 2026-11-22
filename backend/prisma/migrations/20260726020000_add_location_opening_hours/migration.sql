-- Opening hours for a location, stored as the raw OpenStreetMap `opening_hours`
-- specification (e.g. "Mo-Fr 09:00-17:00; Sa 10:00-14:00"). Parsed on demand rather
-- than normalised into columns, so the original tag survives round-trips untouched.
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "opening_hours" TEXT;

-- Provenance of opening_hours: 'osm' (auto-populated from Nominatim extratags) or
-- 'manual' (entered by the user). Manual values are never overwritten by the OSM lookup.
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "opening_hours_source" VARCHAR(20);

-- IANA timezone of the place itself, e.g. "Europe/Paris". Opening hours are wall-clock
-- times in this zone, which is not necessarily the trip's or the viewer's zone.
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(100);
