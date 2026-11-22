-- AlterTable trips: add budget fields
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "budget" DECIMAL(12,2);
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "budget_currency" VARCHAR(3);

-- CreateTable trip_expenses
CREATE TABLE IF NOT EXISTS "trip_expenses" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3),
    "date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trip_expenses_trip_id_idx" ON "trip_expenses"("trip_id");

-- AddForeignKey trip_expenses -> trips
ALTER TABLE "trip_expenses" DROP CONSTRAINT IF EXISTS "trip_expenses_trip_id_fkey";
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
