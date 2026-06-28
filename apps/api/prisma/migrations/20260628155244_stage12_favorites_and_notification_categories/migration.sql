-- Stage 12: Club favorites + per-player notification category preferences
--
-- Goals:
--   * Players can "favorite" any club (no membership / home-club requirement).
--   * Players control which categories of announcements they hear about via
--     a single per-player preference row.
--   * Club announcements are tagged with one of four platform-defined
--     categories, so audience resolution can mute by category.
--   * Critical transactional notifications (booking confirmations, 2FA codes,
--     payment confirmations, direct match invitations, parent/child approvals,
--     role changes) NEVER go through the category-mute system — they keep
--     using the existing unconditional Notification table path.

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE "NotificationCategory" AS ENUM (
  'EVENTS',
  'OFFERS',
  'MEMBERSHIP_OFFERS',
  'MATCH_FINDING'
);

-- ─── CLUB ANNOUNCEMENT CATEGORY ──────────────────────────────────────────────
-- Add the category to existing club_announcements so the audience resolver
-- can mute by category. Default to EVENTS for any existing row to preserve
-- current behavior.

ALTER TABLE "club_announcements"
  ADD COLUMN IF NOT EXISTS "category" "NotificationCategory" NOT NULL DEFAULT 'EVENTS';

-- ─── CLUB FAVORITES ──────────────────────────────────────────────────────────

CREATE TABLE "club_favorites" (
  "id"          TEXT        NOT NULL,
  "user_id"     TEXT        NOT NULL,
  "club_id"     TEXT        NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "club_favorites_pkey" PRIMARY KEY ("id")
);

-- One row per (user, club) — favoriting the same club twice is a no-op.
CREATE UNIQUE INDEX "club_favorites_user_id_club_id_key"
  ON "club_favorites" ("user_id", "club_id");

CREATE INDEX "club_favorites_user_id_idx"
  ON "club_favorites" ("user_id");

CREATE INDEX "club_favorites_club_id_idx"
  ON "club_favorites" ("club_id");

ALTER TABLE "club_favorites"
  ADD CONSTRAINT "club_favorites_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_favorites"
  ADD CONSTRAINT "club_favorites_club_id_fkey"
  FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── PLAYER NOTIFICATION PREFERENCES ────────────────────────────────────────
-- One row per user, upserted on first preference change. All booleans default
-- to TRUE so existing players keep receiving every category until they mute.

CREATE TABLE "player_notification_preferences" (
  "user_id"               TEXT        NOT NULL,
  "notify_events"            BOOLEAN     NOT NULL DEFAULT TRUE,
  "notify_offers"            BOOLEAN     NOT NULL DEFAULT TRUE,
  "notify_membership_offers" BOOLEAN     NOT NULL DEFAULT TRUE,
  "notify_match_finding"     BOOLEAN     NOT NULL DEFAULT TRUE,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "player_notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "player_notification_preferences"
  ADD CONSTRAINT "player_notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
