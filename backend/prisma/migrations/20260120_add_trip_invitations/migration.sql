-- CreateTable
CREATE TABLE IF NOT EXISTS "trip_invitations" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "invited_by_user_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "permission_level" VARCHAR(50) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "trip_invitations_token_key" ON "trip_invitations"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trip_invitations_email_idx" ON "trip_invitations"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trip_invitations_token_idx" ON "trip_invitations"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trip_invitations_trip_id_status_idx" ON "trip_invitations"("trip_id", "status");

-- AddForeignKey
ALTER TABLE "trip_invitations" DROP CONSTRAINT IF EXISTS "trip_invitations_trip_id_fkey";
ALTER TABLE "trip_invitations" ADD CONSTRAINT "trip_invitations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_invitations" DROP CONSTRAINT IF EXISTS "trip_invitations_invited_by_user_id_fkey";
ALTER TABLE "trip_invitations" ADD CONSTRAINT "trip_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
