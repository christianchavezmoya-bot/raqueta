-- Stage 6: Club roster, RUT linking, ranking seasons, historical import, bonus points
-- Depends on: 20260625130000_catch_up_schema

-- ─── NEW ENUM ────────────────────────────────────────────────────────────────

CREATE TYPE "RankingSeasonStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- ─── PLAYER PROFILE: add RUT ─────────────────────────────────────────────────

ALTER TABLE "player_profiles" ADD COLUMN IF NOT EXISTS "rut" TEXT;
ALTER TABLE "player_profiles" DROP CONSTRAINT IF EXISTS "player_profiles_rut_key";
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_rut_key" UNIQUE ("rut");

-- ─── CLUB PLAYER ROSTER ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "club_player_roster" (
    "id"                       TEXT         NOT NULL,
    "club_id"                  TEXT         NOT NULL,
    "first_name"               TEXT         NOT NULL,
    "last_name"                TEXT         NOT NULL,
    "date_of_birth"            TIMESTAMP(3),
    "rut"                      TEXT,
    "phone"                    TEXT,
    "address"                  TEXT,
    "suburb"                   TEXT,
    "postcode"                 TEXT,
    "city"                     TEXT,
    "division"                 TEXT,
    "linked_player_profile_id" TEXT,
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "club_player_roster_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "club_player_roster"
    ADD CONSTRAINT "club_player_roster_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_player_roster"
    ADD CONSTRAINT "club_player_roster_linked_player_profile_id_fkey"
    FOREIGN KEY ("linked_player_profile_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-club RUT uniqueness: only one roster entry per RUT per club (NULLs don't participate)
CREATE UNIQUE INDEX IF NOT EXISTS "club_player_roster_club_id_rut_key"
    ON "club_player_roster"("club_id", "rut")
    WHERE "rut" IS NOT NULL;

-- Per-club uniqueness: one roster entry per linked profile per club
CREATE UNIQUE INDEX IF NOT EXISTS "club_player_roster_club_id_linked_profile_key"
    ON "club_player_roster"("club_id", "linked_player_profile_id")
    WHERE "linked_player_profile_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "club_player_roster_club_id_idx" ON "club_player_roster"("club_id");

-- ─── RANKING SEASONS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ranking_seasons" (
    "id"                         TEXT                  NOT NULL,
    "club_id"                    TEXT                  NOT NULL,
    "label"                      TEXT                  NOT NULL,
    "started_at"                 TIMESTAMP(3)          NOT NULL,
    "closed_at"                  TIMESTAMP(3),
    "status"                     "RankingSeasonStatus" NOT NULL DEFAULT 'ACTIVE',
    "carry_forward_decay_percent" INTEGER              NOT NULL DEFAULT 50,
    "created_at"                 TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                 TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ranking_seasons_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ranking_seasons"
    ADD CONSTRAINT "ranking_seasons_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ranking_seasons_club_id_status_idx" ON "ranking_seasons"("club_id", "status");

-- ─── CLUB DIVISION CONFIG ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "club_division_configs" (
    "id"               TEXT    NOT NULL,
    "club_id"          TEXT    NOT NULL,
    "division_key"     TEXT    NOT NULL,
    "label"            TEXT    NOT NULL,
    "tier_base_points" INTEGER NOT NULL DEFAULT 0,
    "display_order"    INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "club_division_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "club_division_configs"
    ADD CONSTRAINT "club_division_configs_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_division_configs"
    ADD CONSTRAINT "club_division_configs_club_id_division_key_key"
    UNIQUE ("club_id", "division_key");

-- ─── MODIFY club_match_results: swap player FKs → roster FKs + season ────────

-- Add new columns
ALTER TABLE "club_match_results" ADD COLUMN IF NOT EXISTS "season_id"       TEXT;
ALTER TABLE "club_match_results" ADD COLUMN IF NOT EXISTS "winner_roster_id" TEXT;
ALTER TABLE "club_match_results" ADD COLUMN IF NOT EXISTS "loser_roster_id"  TEXT;

-- Data migration: for any existing rows that referenced player profiles,
-- create roster entries and re-point the references.
DO $$
DECLARE
    existing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO existing_count FROM "club_match_results";
    IF existing_count > 0 THEN
        -- Create roster entries for every unique (club_id, player_id) referenced
        INSERT INTO "club_player_roster"
            ("id", "club_id", "first_name", "last_name", "linked_player_profile_id", "created_at", "updated_at")
        SELECT DISTINCT ON (sub.club_id, sub.player_id)
            gen_random_uuid()::text,
            sub.club_id,
            COALESCE(SPLIT_PART(pp.display_name, ' ', 1), 'Unknown'),
            COALESCE(NULLIF(TRIM(SUBSTRING(pp.display_name FROM POSITION(' ' IN pp.display_name) + 1)), ''), '-'),
            pp.id,
            NOW(),
            NOW()
        FROM (
            SELECT club_id, winner_player_id AS player_id FROM "club_match_results"
              WHERE winner_player_id IS NOT NULL
            UNION
            SELECT club_id, loser_player_id  AS player_id FROM "club_match_results"
              WHERE loser_player_id IS NOT NULL
        ) sub
        JOIN "player_profiles" pp ON pp.id = sub.player_id
        ON CONFLICT DO NOTHING;

        -- Point winner_roster_id
        UPDATE "club_match_results" cmr
        SET winner_roster_id = cpr.id
        FROM "club_player_roster" cpr
        WHERE cmr.winner_player_id IS NOT NULL
          AND cpr.club_id = cmr.club_id
          AND cpr.linked_player_profile_id = cmr.winner_player_id;

        -- Point loser_roster_id
        UPDATE "club_match_results" cmr
        SET loser_roster_id = cpr.id
        FROM "club_player_roster" cpr
        WHERE cmr.loser_player_id IS NOT NULL
          AND cpr.club_id = cmr.club_id
          AND cpr.linked_player_profile_id = cmr.loser_player_id;
    END IF;
END $$;

-- Drop old player FK columns (after data migration)
ALTER TABLE "club_match_results" DROP COLUMN IF EXISTS "winner_player_id";
ALTER TABLE "club_match_results" DROP COLUMN IF EXISTS "loser_player_id";

-- Add new FKs
ALTER TABLE "club_match_results"
    ADD CONSTRAINT "club_match_results_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "ranking_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "club_match_results"
    ADD CONSTRAINT "club_match_results_winner_roster_id_fkey"
    FOREIGN KEY ("winner_roster_id") REFERENCES "club_player_roster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "club_match_results"
    ADD CONSTRAINT "club_match_results_loser_roster_id_fkey"
    FOREIGN KEY ("loser_roster_id") REFERENCES "club_player_roster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "club_match_results_club_id_season_id_idx"
    ON "club_match_results"("club_id", "season_id");

-- ─── MODIFY club_ranking_entries: swap player FK → roster FK + season ─────────

-- Drop old unique constraint
ALTER TABLE "club_ranking_entries" DROP CONSTRAINT IF EXISTS "club_ranking_entries_club_id_player_id_key";
DROP INDEX IF EXISTS "club_ranking_entries_club_id_rank_idx";

-- Add new columns
ALTER TABLE "club_ranking_entries" ADD COLUMN IF NOT EXISTS "season_id"  TEXT;
ALTER TABLE "club_ranking_entries" ADD COLUMN IF NOT EXISTS "roster_id"  TEXT;
ALTER TABLE "club_ranking_entries" ADD COLUMN IF NOT EXISTS "withdrawn"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "club_ranking_entries" ADD COLUMN IF NOT EXISTS "division"   TEXT;

-- Data migration for ranking entries
DO $$
DECLARE
    existing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO existing_count FROM "club_ranking_entries";
    IF existing_count > 0 THEN
        -- Create roster entries for any player_profiles not already migrated above
        INSERT INTO "club_player_roster"
            ("id", "club_id", "first_name", "last_name", "linked_player_profile_id", "created_at", "updated_at")
        SELECT DISTINCT ON (cre.club_id, cre.player_id)
            gen_random_uuid()::text,
            cre.club_id,
            COALESCE(SPLIT_PART(pp.display_name, ' ', 1), 'Unknown'),
            COALESCE(NULLIF(TRIM(SUBSTRING(pp.display_name FROM POSITION(' ' IN pp.display_name) + 1)), ''), '-'),
            pp.id,
            NOW(),
            NOW()
        FROM "club_ranking_entries" cre
        JOIN "player_profiles" pp ON pp.id = cre.player_id
        WHERE cre.player_id IS NOT NULL
        ON CONFLICT DO NOTHING;

        -- Point roster_id
        UPDATE "club_ranking_entries" cre
        SET roster_id = cpr.id
        FROM "club_player_roster" cpr
        WHERE cre.player_id IS NOT NULL
          AND cpr.club_id = cre.club_id
          AND cpr.linked_player_profile_id = cre.player_id;

        -- Delete any entries where roster_id is still null (safety net)
        DELETE FROM "club_ranking_entries" WHERE roster_id IS NULL;
    END IF;
END $$;

-- Drop old player_id column
ALTER TABLE "club_ranking_entries" DROP COLUMN IF EXISTS "player_id";

-- Make roster_id NOT NULL now that data is migrated
ALTER TABLE "club_ranking_entries" ALTER COLUMN "roster_id" SET NOT NULL;

-- Add new FK
ALTER TABLE "club_ranking_entries"
    ADD CONSTRAINT "club_ranking_entries_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "ranking_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_ranking_entries"
    ADD CONSTRAINT "club_ranking_entries_roster_id_fkey"
    FOREIGN KEY ("roster_id") REFERENCES "club_player_roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New unique index: unique per (club, season, roster) — NULLs treated as distinct by SQL
CREATE UNIQUE INDEX IF NOT EXISTS "club_ranking_entries_club_season_roster_key"
    ON "club_ranking_entries"("club_id", "season_id", "roster_id")
    WHERE "season_id" IS NOT NULL;

-- Legacy (no-season) uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "club_ranking_entries_club_noseas_roster_key"
    ON "club_ranking_entries"("club_id", "roster_id")
    WHERE "season_id" IS NULL;

CREATE INDEX IF NOT EXISTS "club_ranking_entries_club_season_rank_idx"
    ON "club_ranking_entries"("club_id", "season_id", "rank");

-- ─── BONUS POINT TYPES ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "club_bonus_point_types" (
    "id"     TEXT    NOT NULL,
    "club_id" TEXT   NOT NULL,
    "key"    TEXT    NOT NULL,
    "label"  TEXT    NOT NULL,
    "points" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "club_bonus_point_types_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "club_bonus_point_types"
    ADD CONSTRAINT "club_bonus_point_types_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_bonus_point_types"
    ADD CONSTRAINT "club_bonus_point_types_club_id_key_key"
    UNIQUE ("club_id", "key");

-- ─── BONUS POINT AWARDS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "club_bonus_point_awards" (
    "id"               TEXT         NOT NULL,
    "club_id"          TEXT         NOT NULL,
    "season_id"        TEXT         NOT NULL,
    "roster_id"        TEXT         NOT NULL,
    "bonus_type_id"    TEXT         NOT NULL,
    "awarded_by_user_id" TEXT       NOT NULL,
    "awarded_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"             TEXT,
    CONSTRAINT "club_bonus_point_awards_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "club_bonus_point_awards"
    ADD CONSTRAINT "club_bonus_point_awards_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_bonus_point_awards"
    ADD CONSTRAINT "club_bonus_point_awards_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "ranking_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "club_bonus_point_awards"
    ADD CONSTRAINT "club_bonus_point_awards_roster_id_fkey"
    FOREIGN KEY ("roster_id") REFERENCES "club_player_roster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "club_bonus_point_awards"
    ADD CONSTRAINT "club_bonus_point_awards_bonus_type_id_fkey"
    FOREIGN KEY ("bonus_type_id") REFERENCES "club_bonus_point_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "club_bonus_point_awards"
    ADD CONSTRAINT "club_bonus_point_awards_awarded_by_user_id_fkey"
    FOREIGN KEY ("awarded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
