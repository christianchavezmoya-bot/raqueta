-- Catch-up migration: adds 2FA fields, player search fields,
-- match_invitations and match_log_entries tables, and enum values
-- that were added to schema.prisma but omitted from earlier migrations.

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MatchLogType" AS ENUM ('MATCH', 'TRAINING', 'COACHING', 'FITNESS');

-- AlterEnum: ClubStatus
ALTER TYPE "ClubStatus" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "ClubStatus" ADD VALUE IF NOT EXISTS 'LOCKED';

-- AlterEnum: NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_INVITATION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_INVITATION_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_INVITATION_DECLINED';

-- AlterTable: clubs
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3);

-- AlterTable: player_profiles
ALTER TABLE "player_profiles"
  ADD COLUMN IF NOT EXISTS "available_for_match" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "available_weekdays"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "available_weekends"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "comuna"              TEXT,
  ADD COLUMN IF NOT EXISTS "show_photo_in_search" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: users (2FA)
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "two_factor_code"         TEXT,
  ADD COLUMN IF NOT EXISTS "two_factor_enabled"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "two_factor_expiry"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "two_factor_login_token"   TEXT;

-- CreateIndex (only if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'users_two_factor_login_token_key'
  ) THEN
    CREATE UNIQUE INDEX "users_two_factor_login_token_key" ON "users"("two_factor_login_token");
  END IF;
END $$;

-- CreateTable: match_invitations
CREATE TABLE IF NOT EXISTS "match_invitations" (
    "id"           TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "status"       "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "message"      TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "match_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: match_log_entries
CREATE TABLE IF NOT EXISTS "match_log_entries" (
    "id"            TEXT NOT NULL,
    "player_id"     TEXT NOT NULL,
    "opponent_id"   TEXT,
    "opponent_name" TEXT,
    "type"          "MatchLogType" NOT NULL DEFAULT 'MATCH',
    "date"          TIMESTAMP(3) NOT NULL,
    "duration_mins" INTEGER,
    "location"      TEXT,
    "notes"         TEXT,
    "sets_data"     JSONB,
    "player_won"    BOOLEAN,
    "best_of"       INTEGER NOT NULL DEFAULT 3,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "match_log_entries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (with IF NOT EXISTS guards via DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_invitations_requester_id_fkey') THEN
    ALTER TABLE "match_invitations" ADD CONSTRAINT "match_invitations_requester_id_fkey"
      FOREIGN KEY ("requester_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_invitations_recipient_id_fkey') THEN
    ALTER TABLE "match_invitations" ADD CONSTRAINT "match_invitations_recipient_id_fkey"
      FOREIGN KEY ("recipient_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_log_entries_player_id_fkey') THEN
    ALTER TABLE "match_log_entries" ADD CONSTRAINT "match_log_entries_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_log_entries_opponent_id_fkey') THEN
    ALTER TABLE "match_log_entries" ADD CONSTRAINT "match_log_entries_opponent_id_fkey"
      FOREIGN KEY ("opponent_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
