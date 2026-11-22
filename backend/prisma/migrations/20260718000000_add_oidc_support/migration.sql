-- Add OIDC subject identifier for OAuth/OIDC single sign-on
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oidc_subject" VARCHAR(500);

-- One external identity maps to exactly one user
CREATE UNIQUE INDEX IF NOT EXISTS "users_oidc_subject_key" ON "users"("oidc_subject");
