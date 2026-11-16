-- Loyalty programs: a user's frequent-flyer / hotel-loyalty memberships. Personal data,
-- scoped to the user. Transportation and lodging reference a program by id so the
-- membership number is never copied onto a booking (and so never reaches collaborators
-- or the public share page); deleting a program just clears the reference.

-- CreateEnum
CREATE TYPE "LoyaltyProgramType" AS ENUM ('AIRLINE', 'HOTEL', 'RAIL', 'CAR_RENTAL', 'OTHER');

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "LoyaltyProgramType" NOT NULL,
    "provider_name" VARCHAR(255) NOT NULL,
    "provider_code" VARCHAR(10),
    "alliance" VARCHAR(100),
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "membership_number" VARCHAR(100) NOT NULL,
    "tier" VARCHAR(100),
    "points_balance" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "transportation" ADD COLUMN "loyalty_program_id" INTEGER;

-- AlterTable
ALTER TABLE "lodging" ADD COLUMN "loyalty_program_id" INTEGER;

-- CreateIndex
CREATE INDEX "loyalty_programs_user_id_idx" ON "loyalty_programs"("user_id");

-- CreateIndex
CREATE INDEX "transportation_loyalty_program_id_idx" ON "transportation"("loyalty_program_id");

-- CreateIndex
CREATE INDEX "lodging_loyalty_program_id_idx" ON "lodging"("loyalty_program_id");

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transportation" ADD CONSTRAINT "transportation_loyalty_program_id_fkey" FOREIGN KEY ("loyalty_program_id") REFERENCES "loyalty_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lodging" ADD CONSTRAINT "lodging_loyalty_program_id_fkey" FOREIGN KEY ("loyalty_program_id") REFERENCES "loyalty_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
