-- Stage 15: roster identity matching by nombre + apellido + fecha de nacimiento.
-- Drops RUT as an auto-linking key (RUT stays as a private field on both tables,
-- but is no longer used to bind player profiles to roster entries).

-- ─── PLAYER PROFILE: split identity ──────────────────────────────────────────

ALTER TABLE "player_profiles"
  ADD COLUMN IF NOT EXISTS "first_name"   TEXT,
  ADD COLUMN IF NOT EXISTS "last_name"    TEXT;

-- Backfill from displayName where possible (best-effort split on first space).
UPDATE "player_profiles"
SET
  "first_name" = COALESCE(
    NULLIF(SPLIT_PART("display_name", ' ', 1), ''),
    "display_name"
  ),
  "last_name" = COALESCE(
    NULLIF(TRIM(SUBSTRING("display_name" FROM POSITION(' ' IN "display_name") + 1)), ''),
    ''
  )
WHERE "first_name" IS NULL;

-- ─── HELPER-NORMALIZED INDEX FOR IDENTITY MATCHING ───────────────────────────
-- We can't add a generated column "immutable" function easily without breaking
-- Prisma's introspection; the matcher relies on NFD-normalized value comparisons
-- at query time (see RosterService.attemptRosterLinkByIdentity).
CREATE INDEX IF NOT EXISTS "player_profiles_first_last_name_idx"
  ON "player_profiles" ("first_name", "last_name");

CREATE INDEX IF NOT EXISTS "club_player_roster_first_last_name_idx"
  ON "club_player_roster" ("first_name", "last_name");

CREATE INDEX IF NOT EXISTS "club_player_roster_club_dob_idx"
  ON "club_player_roster" ("club_id", "date_of_birth");
