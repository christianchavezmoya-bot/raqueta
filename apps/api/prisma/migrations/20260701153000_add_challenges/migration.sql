-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "challenger_roster_id" TEXT NOT NULL,
    "challenged_roster_id" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "points_at_stake" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "match_result_id" TEXT,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "challenges_match_result_id_key" ON "challenges"("match_result_id");

-- CreateIndex
CREATE INDEX "challenges_club_id_season_id_status_idx" ON "challenges"("club_id", "season_id", "status");

-- CreateIndex
CREATE INDEX "challenges_challenger_roster_id_status_idx" ON "challenges"("challenger_roster_id", "status");

-- CreateIndex
CREATE INDEX "challenges_challenged_roster_id_status_idx" ON "challenges"("challenged_roster_id", "status");

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "ranking_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenger_roster_id_fkey" FOREIGN KEY ("challenger_roster_id") REFERENCES "club_player_roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenged_roster_id_fkey" FOREIGN KEY ("challenged_roster_id") REFERENCES "club_player_roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_match_result_id_fkey" FOREIGN KEY ("match_result_id") REFERENCES "club_match_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
