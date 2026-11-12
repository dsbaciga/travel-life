-- New users start with no home timezone so the app can prompt for it on first
-- login. Existing rows keep their current value and are not prompted.
ALTER TABLE "users" ALTER COLUMN "timezone" DROP DEFAULT;
