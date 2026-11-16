-- Per-user choice of imperial or metric units for distance and temperature.
-- NULL means the user never chose: the client then applies its single default constant
-- (DEFAULT_MEASUREMENT_SYSTEM), so existing users need no backfill and the default can be
-- changed later without a data migration. Prisma cannot represent CHECK constraints.
ALTER TABLE "users" ADD COLUMN "measurement_system" VARCHAR(10);

ALTER TABLE "users" ADD CONSTRAINT "users_measurement_system_check"
  CHECK ("measurement_system" IS NULL OR "measurement_system" IN ('imperial', 'metric'));
