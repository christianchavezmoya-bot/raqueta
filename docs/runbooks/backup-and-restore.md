# Backup And Restore Runbook

This runbook assumes you are in the repo root: `/Users/christianchavez/Documents/Codex/Raqueta`.

## Before You Start

1. Confirm `.env` points at the correct live database with `DATABASE_URL`.
2. Confirm `STORAGE_ROOT` points at the live local media directory used by the API.
3. Choose a backup root that is separate from the live database storage.
4. For production, do not stop at a different local folder on the same disk. Move backups to separate encrypted storage such as object storage.

## Config

The backup utility reads `.env` plus these optional environment variables:

- `BACKUP_ROOT`
- `BACKUP_RETENTION_DAILY`
- `BACKUP_RETENTION_WEEKLY`
- `BACKUP_RETENTION_MONTHLY`

Defaults:

- `BACKUP_ROOT=./backups`
- `BACKUP_RETENTION_DAILY=7`
- `BACKUP_RETENTION_WEEKLY=4`
- `BACKUP_RETENTION_MONTHLY=6`

## Create A Backup

Run:

```bash
npm run backup:create
```

What it does:

1. Writes a plain SQL dump from `pg_dump` into `backups/<timestamp>/database.sql`
2. Archives the API media directory into `backups/<timestamp>/media.tar.gz`
3. Writes `backups/<timestamp>/manifest.json`
4. Prunes old backup sets using the configured retention policy

## Prune Only

Run:

```bash
npm run backup:prune
```

Use this after copying in test backup folders or after changing retention settings.

## Restore Drill

Never restore into the live database or the live media directory.

1. Pick a backup set:

```bash
ls backups
```

2. Choose a fresh throwaway database name and storage directory.

Example:

- restore DB URL: `postgresql://raqueta_user:raqueta_pass@localhost:5432/raqueta_restore_test`
- restore media root: `/private/tmp/raqueta-restore-storage`

3. Run the restore:

```bash
npm run backup:restore -- \
  --backup-set ./backups/<timestamp> \
  --restore-database-url postgresql://raqueta_user:raqueta_pass@localhost:5432/raqueta_restore_test \
  --restore-admin-database-url postgresql:///postgres?user=<local-admin-user> \
  --restore-storage-root /private/tmp/raqueta-restore-storage \
  --drop-existing
```

What it does:

1. Uses the admin connection for drop/create when the app role does not have `CREATEDB`
2. Drops the target database if it already exists and `--drop-existing` is supplied
3. Creates the fresh target database and assigns ownership to the restore user
4. Restores `database.sql` with `psql`
5. Recreates the target media directory and extracts `media.tar.gz` into it

## Verification After Restore

Run row-count checks on both live and restored databases for key tables:

```bash
PGPASSWORD=raqueta_pass psql -h localhost -U raqueta_user -d raqueta_db -Atc "select count(*) from users;"
PGPASSWORD=raqueta_pass psql -h localhost -U raqueta_user -d raqueta_restore_test -Atc "select count(*) from users;"
```

Repeat for:

- `clubs`
- `reservations`
- `club_match_results`

Then spot-check one known row in both databases and compare the exact columns you care about.

Finally, compare one media file from the live storage root and the restored storage root:

```bash
shasum -a 256 <live-file>
shasum -a 256 <restored-file>
file <restored-file>
```

## Scheduling

For local development on this Mac, schedule:

- a cron entry that runs `npm run backup:create`
- or a `launchd` job that does the same

Do not build custom scheduler infrastructure for this.

## Security Note

Backups contain the same sensitive data as the live system. Once roster/contact data is populated with real users, treat backup files like production data:

- keep them on encrypted storage
- do not copy them to personal cloud folders
- do not leave them on unencrypted removable media
