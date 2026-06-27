-- Stage 10: Parent-child linked accounts

-- Enum for link status
CREATE TYPE "ParentChildLinkStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- PlayerProfile: canTransact + isMinorAccount
ALTER TABLE "player_profiles"
  ADD COLUMN "can_transact"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "is_minor_account" BOOLEAN NOT NULL DEFAULT false;

-- Payment: actedByUserId audit trail
ALTER TABLE "payments"
  ADD COLUMN "acted_by_user_id" TEXT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_acted_by_user_id_fkey"
  FOREIGN KEY ("acted_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- TournamentRegistration: actedByUserId audit trail
ALTER TABLE "tournament_registrations"
  ADD COLUMN "acted_by_user_id" TEXT;

ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "tournament_registrations_acted_by_user_id_fkey"
  FOREIGN KEY ("acted_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- MatchInvitation: actedByUserId audit trail
ALTER TABLE "match_invitations"
  ADD COLUMN "acted_by_user_id" TEXT;

ALTER TABLE "match_invitations"
  ADD CONSTRAINT "match_invitations_acted_by_user_id_fkey"
  FOREIGN KEY ("acted_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ParentChildLink table
CREATE TABLE "parent_child_links" (
  "id"                 TEXT         NOT NULL,
  "parent_user_id"     TEXT         NOT NULL,
  "child_user_id"      TEXT         NOT NULL,
  "club_id"            TEXT         NOT NULL,
  "status"             "ParentChildLinkStatus" NOT NULL DEFAULT 'PENDING',
  "requested_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_by_user_id" TEXT,
  "approved_at"        TIMESTAMP(3),

  CONSTRAINT "parent_child_links_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "parent_child_links"
  ADD CONSTRAINT "parent_child_links_parent_user_id_fkey"
  FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parent_child_links"
  ADD CONSTRAINT "parent_child_links_child_user_id_fkey"
  FOREIGN KEY ("child_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parent_child_links"
  ADD CONSTRAINT "parent_child_links_club_id_fkey"
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parent_child_links"
  ADD CONSTRAINT "parent_child_links_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: only one PENDING request per (parent, child) pair at a time
CREATE UNIQUE INDEX "parent_child_links_pending_unique"
  ON "parent_child_links" ("parent_user_id", "child_user_id")
  WHERE status = 'PENDING';
