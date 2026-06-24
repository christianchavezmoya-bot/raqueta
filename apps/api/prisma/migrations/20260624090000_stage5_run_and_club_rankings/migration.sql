-- CreateEnum
CREATE TYPE "ClubMatchResultSource" AS ENUM ('UPLOAD', 'MANUAL');

-- AlterTable
ALTER TABLE "player_profiles"
ADD COLUMN "run_player_id" TEXT,
ADD COLUMN "run_rank_cached" INTEGER,
ADD COLUMN "run_points_cached" INTEGER,
ADD COLUMN "run_atp_points_cached" INTEGER,
ADD COLUMN "run_last_synced_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "club_ranking_rules" (
  "id" TEXT NOT NULL,
  "club_id" TEXT NOT NULL,
  "category_key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "winner_points" INTEGER NOT NULL,
  "loser_points" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "club_ranking_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_ranking_entries" (
  "id" TEXT NOT NULL,
  "club_id" TEXT NOT NULL,
  "player_id" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "total_points" INTEGER NOT NULL DEFAULT 0,
  "games_played" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "club_ranking_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_match_results" (
  "id" TEXT NOT NULL,
  "club_id" TEXT NOT NULL,
  "winner_player_id" TEXT,
  "winner_name_raw" TEXT NOT NULL,
  "loser_player_id" TEXT,
  "loser_name_raw" TEXT NOT NULL,
  "category_key" TEXT NOT NULL,
  "set_scores" JSONB,
  "recorded_at" TIMESTAMP(3) NOT NULL,
  "source" "ClubMatchResultSource" NOT NULL,
  "entered_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "club_match_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_ranking_rules_club_id_category_key_key" ON "club_ranking_rules"("club_id", "category_key");
CREATE UNIQUE INDEX "club_ranking_entries_club_id_player_id_key" ON "club_ranking_entries"("club_id", "player_id");
CREATE INDEX "club_ranking_entries_club_id_rank_idx" ON "club_ranking_entries"("club_id", "rank");
CREATE INDEX "club_match_results_club_id_category_key_idx" ON "club_match_results"("club_id", "category_key");
CREATE INDEX "club_match_results_club_id_recorded_at_idx" ON "club_match_results"("club_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "club_ranking_rules"
ADD CONSTRAINT "club_ranking_rules_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_ranking_entries"
ADD CONSTRAINT "club_ranking_entries_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "club_ranking_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_match_results"
ADD CONSTRAINT "club_match_results_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "club_match_results_winner_player_id_fkey" FOREIGN KEY ("winner_player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "club_match_results_loser_player_id_fkey" FOREIGN KEY ("loser_player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "club_match_results_entered_by_user_id_fkey" FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
