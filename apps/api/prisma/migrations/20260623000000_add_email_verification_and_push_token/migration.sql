-- AlterTable: add email verification, password reset, and push token fields to users
ALTER TABLE "users"
  ADD COLUMN "email_verified_at"          TIMESTAMP(3),
  ADD COLUMN "email_verification_token"   TEXT,
  ADD COLUMN "email_verification_expiry"  TIMESTAMP(3),
  ADD COLUMN "password_reset_token"       TEXT,
  ADD COLUMN "password_reset_expiry"      TIMESTAMP(3),
  ADD COLUMN "expo_push_token"            TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_verification_token_key" ON "users"("email_verification_token");
CREATE UNIQUE INDEX "users_password_reset_token_key" ON "users"("password_reset_token");
