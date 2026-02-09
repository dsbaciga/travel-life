-- AlterTable
ALTER TABLE "users" ADD COLUMN "smtp_provider" VARCHAR(50),
ADD COLUMN "smtp_host" VARCHAR(500),
ADD COLUMN "smtp_port" INTEGER,
ADD COLUMN "smtp_secure" BOOLEAN,
ADD COLUMN "smtp_user" VARCHAR(500),
ADD COLUMN "smtp_password" VARCHAR(500),
ADD COLUMN "smtp_from" VARCHAR(500);
