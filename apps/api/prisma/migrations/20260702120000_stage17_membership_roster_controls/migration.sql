ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

ALTER TABLE "memberships"
  ADD COLUMN "last_payment_date" TIMESTAMP(3),
  ADD COLUMN "next_payment_due" TIMESTAMP(3),
  ADD COLUMN "payment_notes" TEXT;

ALTER TABLE "club_player_roster"
  ADD COLUMN "deleted_at" TIMESTAMP(3);
