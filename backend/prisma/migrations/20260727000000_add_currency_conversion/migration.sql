-- AlterTable users: add home/base currency for budget totals
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "base_currency" VARCHAR(3);

-- AlterTable trip_expenses: add frozen FX snapshot
ALTER TABLE "trip_expenses" ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,10);
ALTER TABLE "trip_expenses" ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(12,2);
ALTER TABLE "trip_expenses" ADD COLUMN IF NOT EXISTS "base_currency" VARCHAR(3);

-- AlterTable activities: add frozen FX snapshot
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,10);
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(12,2);
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "base_currency" VARCHAR(3);

-- AlterTable transportation: add frozen FX snapshot
ALTER TABLE "transportation" ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,10);
ALTER TABLE "transportation" ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(12,2);
ALTER TABLE "transportation" ADD COLUMN IF NOT EXISTS "base_currency" VARCHAR(3);

-- AlterTable lodging: add frozen FX snapshot
ALTER TABLE "lodging" ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(20,10);
ALTER TABLE "lodging" ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(12,2);
ALTER TABLE "lodging" ADD COLUMN IF NOT EXISTS "base_currency" VARCHAR(3);

-- CreateTable exchange_rates
CREATE TABLE IF NOT EXISTS "exchange_rates" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "from_currency" VARCHAR(3) NOT NULL,
    "to_currency" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" VARCHAR(50) NOT NULL DEFAULT 'frankfurter',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rates_date_from_currency_to_currency_key" ON "exchange_rates"("date", "from_currency", "to_currency");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exchange_rates_from_currency_to_currency_idx" ON "exchange_rates"("from_currency", "to_currency");
