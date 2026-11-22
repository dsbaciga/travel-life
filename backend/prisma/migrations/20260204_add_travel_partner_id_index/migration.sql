-- CreateIndex: Index on travel_partner_id for query performance
-- Improves lookup speed when finding users by their travel partner
CREATE INDEX IF NOT EXISTS "users_travel_partner_id_idx" ON "users"("travel_partner_id");
