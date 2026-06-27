ALTER TABLE "player_profiles"
  ADD COLUMN "share_stats_with_club" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "share_stats_with_players" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "last_known_latitude" DOUBLE PRECISION,
  ADD COLUMN "last_known_longitude" DOUBLE PRECISION,
  ADD COLUMN "location_updated_at" TIMESTAMP(3);
