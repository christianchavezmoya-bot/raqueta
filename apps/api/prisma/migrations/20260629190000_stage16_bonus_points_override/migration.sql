-- Stage 16: per-award points override on ClubBonusPointAward.
-- New `points` column captures the actual delta applied (signed int), so
-- staff can issue free-form positive bonuses or negative penalties without
-- touching the bonusType defaults. Existing rows backfill from their
-- bonusType.points at the time of the award.

ALTER TABLE "club_bonus_point_awards"
  ADD COLUMN IF NOT EXISTS "points" INTEGER;

-- Backfill: use the bonusType.points snapshot at time of award.
UPDATE "club_bonus_point_awards" cpa
SET "points" = cbpt."points"
FROM "club_bonus_point_types" cbpt
WHERE cpa."bonus_type_id" = cbpt."id"
  AND cpa."points" IS NULL;

-- Anything still NULL gets 0 (defensive — should not exist).
UPDATE "club_bonus_point_awards"
SET "points" = COALESCE("points", 0)
WHERE "points" IS NULL;

ALTER TABLE "club_bonus_point_awards"
  ALTER COLUMN "points" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "club_bonus_point_awards_roster_season_idx"
  ON "club_bonus_point_awards" ("club_id", "season_id", "roster_id");
