-- Add previous_rank to club_ranking_entries so recalculation can track
-- per-player rank movement (positive = moved up, negative = dropped).
ALTER TABLE "club_ranking_entries"
  ADD COLUMN IF NOT EXISTS "previous_rank" INTEGER;
