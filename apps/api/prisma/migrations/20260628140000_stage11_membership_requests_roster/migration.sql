-- Stage 11: roster-keyed memberships, membership requests, and payment instructions

-- ─── ENUMS ──────────────────────────────────────────────────────────────────

CREATE TYPE "MembershipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- ─── CLUB / PLAN PAYMENT INSTRUCTIONS ───────────────────────────────────────

ALTER TABLE "club_profiles"
  ADD COLUMN IF NOT EXISTS "default_payment_instructions" TEXT;

ALTER TABLE "membership_plans"
  ADD COLUMN IF NOT EXISTS "payment_instructions" TEXT;

-- ─── MEMBERSHIP REQUESTS ────────────────────────────────────────────────────

CREATE TABLE "membership_requests" (
  "id"                    TEXT                      NOT NULL,
  "club_id"               TEXT                      NOT NULL,
  "plan_id"               TEXT                      NOT NULL,
  "requested_by_user_id"  TEXT                      NOT NULL,
  "status"                "MembershipRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requested_at"          TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at"            TIMESTAMP(3),
  "decided_by_user_id"    TEXT,
  "denial_reason"         TEXT,

  CONSTRAINT "membership_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "membership_requests"
  ADD CONSTRAINT "membership_requests_club_id_fkey"
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_requests"
  ADD CONSTRAINT "membership_requests_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_requests"
  ADD CONSTRAINT "membership_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_requests"
  ADD CONSTRAINT "membership_requests_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "membership_requests_club_id_status_idx"
  ON "membership_requests" ("club_id", "status");

CREATE INDEX "membership_requests_requested_by_user_id_status_idx"
  ON "membership_requests" ("requested_by_user_id", "status");

CREATE UNIQUE INDEX "membership_requests_pending_requester_club_key"
  ON "membership_requests" ("club_id", "requested_by_user_id")
  WHERE "status" = 'PENDING';

-- ─── MEMBERSHIPS: USER-KEYED → ROSTER-KEYED ─────────────────────────────────

ALTER TABLE "memberships"
  ADD COLUMN IF NOT EXISTS "roster_id" TEXT;

DO $$
BEGIN
  -- Prefer an existing roster row already linked to the player's profile.
  UPDATE "memberships" m
  SET "roster_id" = cpr."id"
  FROM "player_profiles" pp, "club_player_roster" cpr
  WHERE pp."user_id" = m."user_id"
    AND cpr."club_id" = m."club_id"
    AND cpr."linked_player_profile_id" = pp."id"
    AND m."roster_id" IS NULL;

  -- If a roster row exists by RUT but is still unlinked, attach it first.
  UPDATE "club_player_roster" cpr
  SET "linked_player_profile_id" = pp."id",
      "updated_at" = CURRENT_TIMESTAMP
  FROM "memberships" m
  JOIN "player_profiles" pp ON pp."user_id" = m."user_id"
  WHERE m."roster_id" IS NULL
    AND pp."rut" IS NOT NULL
    AND cpr."club_id" = m."club_id"
    AND cpr."rut" = pp."rut"
    AND cpr."linked_player_profile_id" IS NULL;

  UPDATE "memberships" m
  SET "roster_id" = cpr."id"
  FROM "player_profiles" pp, "club_player_roster" cpr
  WHERE pp."user_id" = m."user_id"
    AND cpr."club_id" = m."club_id"
    AND (cpr."linked_player_profile_id" = pp."id" OR (pp."rut" IS NOT NULL AND cpr."rut" = pp."rut"))
    AND m."roster_id" IS NULL;

  -- Create a roster row for any remaining legacy membership.
  INSERT INTO "club_player_roster" (
    "id",
    "club_id",
    "first_name",
    "last_name",
    "rut",
    "phone",
    "city",
    "linked_player_profile_id",
    "created_at",
    "updated_at"
  )
  SELECT DISTINCT ON (m."club_id", pp."id")
    gen_random_uuid()::text,
    m."club_id",
    COALESCE(NULLIF(SPLIT_PART(pp."display_name", ' ', 1), ''), COALESCE(NULLIF(SPLIT_PART(u."email", '@', 1), ''), 'Jugador')),
    COALESCE(NULLIF(TRIM(SUBSTRING(pp."display_name" FROM POSITION(' ' IN pp."display_name") + 1)), ''), '-'),
    pp."rut",
    u."phone",
    club_profile."city",
    pp."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "memberships" m
  JOIN "users" u ON u."id" = m."user_id"
  JOIN "player_profiles" pp ON pp."user_id" = u."id"
  LEFT JOIN "club_profiles" club_profile ON club_profile."club_id" = m."club_id"
  LEFT JOIN "club_player_roster" cpr
    ON cpr."club_id" = m."club_id"
   AND cpr."linked_player_profile_id" = pp."id"
  WHERE m."roster_id" IS NULL
    AND cpr."id" IS NULL
  ON CONFLICT DO NOTHING;

  UPDATE "memberships" m
  SET "roster_id" = cpr."id"
  FROM "player_profiles" pp, "club_player_roster" cpr
  WHERE pp."user_id" = m."user_id"
    AND cpr."club_id" = m."club_id"
    AND cpr."linked_player_profile_id" = pp."id"
    AND m."roster_id" IS NULL;

  IF EXISTS (SELECT 1 FROM "memberships" WHERE "roster_id" IS NULL) THEN
    RAISE EXCEPTION 'Stage 11 migration failed: some memberships could not be linked to a roster row';
  END IF;
END $$;

ALTER TABLE "memberships"
  ALTER COLUMN "roster_id" SET NOT NULL;

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_roster_id_fkey"
  FOREIGN KEY ("roster_id") REFERENCES "club_player_roster"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "memberships_roster_id_idx"
  ON "memberships" ("roster_id");

CREATE UNIQUE INDEX "memberships_active_roster_club_key"
  ON "memberships" ("club_id", "roster_id")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_user_id_fkey";
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "user_id";
