ALTER TABLE "club_profiles"
ADD COLUMN "accent_color" TEXT;

CREATE TABLE "club_announcements" (
    "id" TEXT NOT NULL,
    "club_id" TEXT NOT NULL,
    "sent_by_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_announcements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notifications"
ADD COLUMN "announcement_id" TEXT;

CREATE INDEX "club_announcements_club_id_created_at_idx" ON "club_announcements"("club_id", "created_at");

ALTER TABLE "club_announcements"
ADD CONSTRAINT "club_announcements_club_id_fkey"
FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "club_announcements"
ADD CONSTRAINT "club_announcements_sent_by_user_id_fkey"
FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_announcement_id_fkey"
FOREIGN KEY ("announcement_id") REFERENCES "club_announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
