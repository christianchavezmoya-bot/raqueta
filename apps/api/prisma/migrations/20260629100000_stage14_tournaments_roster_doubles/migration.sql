-- Stage 14: Tournament roster-keyed registrations, doubles teams, bracket sub-stages,
-- interclub name label, tournament import/export/template plumbing.

-- ─── NEW ENUM ─────────────────────────────────────────────────────────────────

CREATE TYPE "BracketStage" AS ENUM ('MAIN', 'WINNERS', 'LOSERS');

-- ─── TOURNAMENT: add opponent club name (interclub label) ────────────────────

ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "opponent_club_name" TEXT;

-- ─── TOURNAMENT TEAMS (doubles) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tournament_teams" (
  "id"                  TEXT         NOT NULL,
  "tournament_id"       TEXT         NOT NULL,
  "category_id"         TEXT         NOT NULL,
  "player1_roster_id"   TEXT         NOT NULL,
  "player2_roster_id"   TEXT         NOT NULL,
  "group"               TEXT,
  "label"               TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_teams_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tournament_teams"
  ADD CONSTRAINT "tournament_teams_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_teams"
  ADD CONSTRAINT "tournament_teams_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "tournament_categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_teams"
  ADD CONSTRAINT "tournament_teams_player1_roster_id_fkey"
  FOREIGN KEY ("player1_roster_id") REFERENCES "club_player_roster"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tournament_teams"
  ADD CONSTRAINT "tournament_teams_player2_roster_id_fkey"
  FOREIGN KEY ("player2_roster_id") REFERENCES "club_player_roster"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "tournament_teams_tournament_category_players_key"
  ON "tournament_teams" ("tournament_id", "category_id", "player1_roster_id", "player2_roster_id");

CREATE INDEX IF NOT EXISTS "tournament_teams_tournament_category_idx"
  ON "tournament_teams" ("tournament_id", "category_id");

-- ─── TOURNAMENT REGISTRATIONS: USER-KEYED → ROSTER-KEYED ─────────────────────

ALTER TABLE "tournament_registrations"
  ADD COLUMN IF NOT EXISTS "roster_id"           TEXT,
  ADD COLUMN IF NOT EXISTS "team_id"             TEXT,
  ADD COLUMN IF NOT EXISTS "registered_by_user_id" TEXT;

DO $$
BEGIN
  -- Build roster rows for any legacy user-registered team members that
  -- don't yet have a roster entry for the tournament's club.
  INSERT INTO "club_player_roster" (
      "id", "club_id", "first_name", "last_name", "linked_player_profile_id", "created_at", "updated_at"
  )
  SELECT DISTINCT ON (t."club_id", pp."id")
      gen_random_uuid()::text,
      t."club_id",
      COALESCE(NULLIF(SPLIT_PART(pp."display_name", ' ', 1), ''), 'Jugador'),
      COALESCE(NULLIF(TRIM(SUBSTRING(pp."display_name" FROM POSITION(' ' IN pp."display_name") + 1)), ''), '-'),
      pp."id",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
  FROM "tournament_registrations" tr
  JOIN "tournaments" t ON t."id" = tr."tournament_id"
  JOIN "users" u ON u."id" = tr."player_id"
  JOIN "player_profiles" pp ON pp."user_id" = u."id"
  LEFT JOIN "club_player_roster" cpr
    ON cpr."club_id" = t."club_id"
   AND cpr."linked_player_profile_id" = pp."id"
  WHERE tr."roster_id" IS NULL
    AND cpr."id" IS NULL
  ON CONFLICT DO NOTHING;

  -- Re-point: existing registration rows → matching roster entry by club + linked profile
  UPDATE "tournament_registrations" tr
  SET "roster_id" = cpr."id"
  FROM "tournaments" t, "users" u, "player_profiles" pp, "club_player_roster" cpr
  WHERE t."id" = tr."tournament_id"
    AND u."id" = tr."player_id"
    AND pp."user_id" = u."id"
    AND cpr."club_id" = t."club_id"
    AND cpr."linked_player_profile_id" = pp."id"
    AND tr."roster_id" IS NULL;

  -- Capture who-registered info so we don't lose that either
  UPDATE "tournament_registrations"
  SET "registered_by_user_id" = COALESCE("registered_by_user_id", "acted_by_user_id", "player_id")
  WHERE "registered_by_user_id" IS NULL;

  IF EXISTS (SELECT 1 FROM "tournament_registrations"
             WHERE "roster_id" IS NULL AND "team_id" IS NULL) THEN
    RAISE EXCEPTION 'Stage 14 migration failed: some tournament registrations could not be linked to either roster or team';
  END IF;
END $;

-- roster_id stays nullable: doubles registrations use team_id instead.
-- Application layer enforces exactly one of (roster_id, team_id) being set.

ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "tournament_registrations_roster_id_fkey"
  FOREIGN KEY ("roster_id") REFERENCES "club_player_roster"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "tournament_registrations_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "tournament_teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tournament_registrations"
  ADD CONSTRAINT "tournament_registrations_registered_by_user_id_fkey"
  FOREIGN KEY ("registered_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "tournament_registrations_tournament_id_category_id_player_id_key";
CREATE UNIQUE INDEX "tournament_registrations_tournament_category_roster_key"
  ON "tournament_registrations" ("tournament_id", "category_id", "roster_id")
  WHERE "team_id" IS NULL;

CREATE UNIQUE INDEX "tournament_registrations_tournament_category_team_key"
  ON "tournament_registrations" ("tournament_id", "category_id", "team_id")
  WHERE "team_id" IS NOT NULL;

CREATE INDEX "tournament_registrations_roster_id_idx"
  ON "tournament_registrations" ("roster_id");

ALTER TABLE "tournament_registrations" DROP CONSTRAINT IF EXISTS "tournament_registrations_player_id_fkey";
ALTER TABLE "tournament_registrations" DROP COLUMN IF EXISTS "player_id";

-- ─── MATCHES: USER-KEYED → ROSTER-KEYED + doubles team refs + bracket stage ──

ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "player_one_roster_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "player_two_roster_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "winner_roster_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "team_one_id"           TEXT,
  ADD COLUMN IF NOT EXISTS "team_two_id"           TEXT,
  ADD COLUMN IF NOT EXISTS "team_winner_id"        TEXT,
  ADD COLUMN IF NOT EXISTS "bracket_stage"         "BracketStage" NOT NULL DEFAULT 'MAIN',
  ADD COLUMN IF NOT EXISTS "opponent_club_name"    TEXT,
  ADD COLUMN IF NOT EXISTS "recorded_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "set_scores"            JSONB;

DO $
DECLARE
  rec RECORD;
  p1 TEXT;
  p2 TEXT;
  pw TEXT;
BEGIN
  FOR rec IN
    SELECT m."id", m."player_one_id", m."player_two_id", m."winner_id", t."club_id"
    FROM "matches" m
    LEFT JOIN "tournaments" t ON t."id" = m."tournament_id"
    WHERE m."player_one_roster_id" IS NULL
      AND m."player_one_id" IS NOT NULL
  LOOP
    -- Resolve roster rows by user → linked profile
    SELECT cpr."id" INTO p1
      FROM "users" u
      JOIN "player_profiles" pp ON pp."user_id" = u."id"
      JOIN "club_player_roster" cpr
        ON cpr."club_id" = rec."club_id"
       AND cpr."linked_player_profile_id" = pp."id"
     WHERE u."id" = rec."player_one_id"
     LIMIT 1;

    SELECT cpr."id" INTO p2
      FROM "users" u
      JOIN "player_profiles" pp ON pp."user_id" = u."id"
      JOIN "club_player_roster" cpr
        ON cpr."club_id" = rec."club_id"
       AND cpr."linked_player_profile_id" = pp."id"
     WHERE u."id" = rec."player_two_id"
     LIMIT 1;

    SELECT cpr."id" INTO pw
      FROM "users" u
      JOIN "player_profiles" pp ON pp."user_id" = u."id"
      JOIN "club_player_roster" cpr
        ON cpr."club_id" = rec."club_id"
       AND cpr."linked_player_profile_id" = pp."id"
     WHERE u."id" = rec."winner_id"
     LIMIT 1;

    UPDATE "matches"
       SET "player_one_roster_id" = p1,
           "player_two_roster_id" = p2,
           "winner_roster_id"     = pw,
           "recorded_at"          = COALESCE("recorded_at", "updated_at")
     WHERE "id" = rec."id";
  END LOOP;
END $;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_player_one_roster_id_fkey"
  FOREIGN KEY ("player_one_roster_id") REFERENCES "club_player_roster"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_player_two_roster_id_fkey"
  FOREIGN KEY ("player_two_roster_id") REFERENCES "club_player_roster"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_winner_roster_id_fkey"
  FOREIGN KEY ("winner_roster_id") REFERENCES "club_player_roster"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_team_one_id_fkey"
  FOREIGN KEY ("team_one_id") REFERENCES "tournament_teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_team_two_id_fkey"
  FOREIGN KEY ("team_two_id") REFERENCES "tournament_teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_team_winner_id_fkey"
  FOREIGN KEY ("team_winner_id") REFERENCES "tournament_teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "matches_tournament_bracket_idx"
  ON "matches" ("tournament_id", "bracket_stage", "round");

CREATE INDEX "matches_player_one_roster_idx"
  ON "matches" ("player_one_roster_id");

CREATE INDEX "matches_player_two_roster_idx"
  ON "matches" ("player_two_roster_id");

CREATE INDEX "matches_team_one_idx"
  ON "matches" ("team_one_id");

CREATE INDEX "matches_team_two_idx"
  ON "matches" ("team_two_id");

ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_player_one_id_fkey";
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_player_two_id_fkey";
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_winner_id_fkey";
ALTER TABLE "matches" DROP COLUMN IF EXISTS "player_one_id";
ALTER TABLE "matches" DROP COLUMN IF EXISTS "player_two_id";
ALTER TABLE "matches" DROP COLUMN IF EXISTS "winner_id";

-- ─── USER RELATIONS CLEANUP ──────────────────────────────────────────────────
-- The previous schema declared User.tournamentRegistrations/matchesAsPlayerOne/etc.;
-- these are removed in the prisma schema. We don't need to drop SQL FKs here
-- because they were never declared as DB foreign keys (the columns were
-- nullable, app-level authority only via prisma).
