#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
loadEnv(path.join(repoRoot, '.env'));

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || !['backup', 'prune', 'restore'].includes(command)) {
  printUsage();
  process.exit(1);
}

const config = getConfig(args);

if (command === 'backup') {
  const created = createBackup(config);
  pruneBackups(config);
  console.log(JSON.stringify(created, null, 2));
} else if (command === 'prune') {
  const result = pruneBackups(config);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'restore') {
  const result = restoreBackup(config, args);
  console.log(JSON.stringify(result, null, 2));
}

function printUsage() {
  console.log(`Usage:
  node scripts/backup/raqueta-backup.mjs backup [--backup-root ./backups]
  node scripts/backup/raqueta-backup.mjs prune [--backup-root ./backups]
  node scripts/backup/raqueta-backup.mjs restore --backup-set ./backups/<timestamp> --restore-database-url <url> --restore-storage-root <dir> [--restore-admin-database-url <url>] [--drop-existing]
`);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function getConfig(cliArgs) {
  const databaseUrl = mustGetEnv('DATABASE_URL');
  const storageRootSetting = process.env.STORAGE_ROOT ?? './storage';
  const backupRootSetting = cliArgs['backup-root'] ?? process.env.BACKUP_ROOT ?? './backups';

  return {
    databaseUrl,
    sourceMediaRoot: resolveStorageRoot(storageRootSetting),
    backupRoot: path.resolve(repoRoot, backupRootSetting),
    dailyRetention: toInt(cliArgs['retention-daily'] ?? process.env.BACKUP_RETENTION_DAILY, 7),
    weeklyRetention: toInt(cliArgs['retention-weekly'] ?? process.env.BACKUP_RETENTION_WEEKLY, 4),
    monthlyRetention: toInt(cliArgs['retention-monthly'] ?? process.env.BACKUP_RETENTION_MONTHLY, 6),
    backupNow: cliArgs['backup-now'] ?? process.env.BACKUP_NOW ?? null,
  };
}

function createBackup(config) {
  fs.mkdirSync(config.backupRoot, { recursive: true });

  const now = config.backupNow ? new Date(config.backupNow) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid BACKUP_NOW timestamp: ${config.backupNow}`);
  }

  const backupId = formatBackupId(now);
  const backupDir = path.join(config.backupRoot, backupId);
  if (fs.existsSync(backupDir)) {
    throw new Error(`Backup set already exists: ${backupDir}`);
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const dbDumpPath = path.join(backupDir, 'database.sql');
  const mediaArchivePath = path.join(backupDir, 'media.tar.gz');

  runCommand('pg_dump', [
    '--format=plain',
    '--no-owner',
    '--no-privileges',
    '--file',
    dbDumpPath,
    config.databaseUrl,
  ]);

  const mediaSource = ensureArchiveSource(config.sourceMediaRoot);
  runCommand('tar', ['-czf', mediaArchivePath, '-C', mediaSource, '.']);

  const manifest = {
    backupId,
    createdAt: now.toISOString(),
    databaseDump: path.basename(dbDumpPath),
    mediaArchive: path.basename(mediaArchivePath),
    sourceDatabase: redactDatabaseUrl(config.databaseUrl),
    sourceMediaRoot: config.sourceMediaRoot,
    retention: {
      daily: config.dailyRetention,
      weekly: config.weeklyRetention,
      monthly: config.monthlyRetention,
    },
    notes: [
      'Backups are stored separately from the live database process, but production should write to off-host object storage.',
    ],
  };
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    backupDir,
    dbDumpPath,
    mediaArchivePath,
    manifestPath: path.join(backupDir, 'manifest.json'),
  };
}

function pruneBackups(config) {
  if (!fs.existsSync(config.backupRoot)) {
    return { backupRoot: config.backupRoot, kept: [], pruned: [] };
  }

  const backups = listBackups(config.backupRoot);
  const keepIds = chooseRetention(backups, config);
  const pruned = [];

  for (const backup of backups) {
    if (keepIds.has(backup.backupId)) continue;
    fs.rmSync(backup.path, { recursive: true, force: true });
    pruned.push(backup.backupId);
  }

  return {
    backupRoot: config.backupRoot,
    kept: backups.filter(backup => keepIds.has(backup.backupId)).map(backup => backup.backupId),
    pruned,
  };
}

function restoreBackup(config, cliArgs) {
  const backupSet = cliArgs['backup-set'];
  const restoreDatabaseUrl = cliArgs['restore-database-url'];
  const restoreStorageRoot = cliArgs['restore-storage-root'];
  const restoreAdminDatabaseUrl = cliArgs['restore-admin-database-url'] ?? process.env.RESTORE_ADMIN_DATABASE_URL ?? null;
  const dropExisting = cliArgs['drop-existing'] === 'true';

  if (!backupSet || !restoreDatabaseUrl || !restoreStorageRoot) {
    throw new Error('restore requires --backup-set, --restore-database-url, and --restore-storage-root');
  }

  const backupDir = path.resolve(repoRoot, backupSet);
  const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));
  const dbDumpPath = path.join(backupDir, manifest.databaseDump);
  const mediaArchivePath = path.join(backupDir, manifest.mediaArchive);
  const restoreMediaRoot = path.resolve(repoRoot, restoreStorageRoot);

  if (sameDatabase(config.databaseUrl, restoreDatabaseUrl)) {
    throw new Error('Refusing to restore into the live database URL');
  }
  if (path.resolve(config.sourceMediaRoot) === restoreMediaRoot) {
    throw new Error('Refusing to restore into the live media directory');
  }

  recreateDatabase(restoreDatabaseUrl, restoreAdminDatabaseUrl, dropExisting);
  runCommand('psql', [restoreDatabaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', dbDumpPath]);

  fs.rmSync(restoreMediaRoot, { recursive: true, force: true });
  fs.mkdirSync(restoreMediaRoot, { recursive: true });
  runCommand('tar', ['-xzf', mediaArchivePath, '-C', restoreMediaRoot]);

  return {
    backupDir,
    restoredDatabase: redactDatabaseUrl(restoreDatabaseUrl),
    restoredStorageRoot: restoreMediaRoot,
  };
}

function recreateDatabase(databaseUrl, adminDatabaseUrl, dropExisting) {
  const targetUrl = new URL(databaseUrl);
  const adminUrl = adminDatabaseUrl ? new URL(adminDatabaseUrl) : targetUrl;
  const databaseName = targetUrl.pathname.replace(/^\//, '');
  const owner = decodeURIComponent(targetUrl.username || targetUrl.searchParams.get('user') || '');
  const adminUser = decodeURIComponent(adminUrl.username || adminUrl.searchParams.get('user') || '');
  const adminPassword = decodeURIComponent(adminUrl.password || adminUrl.searchParams.get('password') || '');
  const maintenanceDb = adminUrl.pathname.replace(/^\//, '') || 'postgres';
  const baseArgs = ['--maintenance-db', maintenanceDb];

  if (adminUrl.hostname) {
    baseArgs.push('-h', adminUrl.hostname);
  }
  if (adminUrl.port) {
    baseArgs.push('-p', adminUrl.port);
  }
  if (adminUser) {
    baseArgs.push('-U', adminUser);
  }

  const env = adminPassword
    ? { ...process.env, PGPASSWORD: adminPassword }
    : { ...process.env };

  if (dropExisting) {
    runCommand('dropdb', [...baseArgs, '--if-exists', databaseName], { env });
  }

  const createArgs = [...baseArgs];
  if (owner) {
    createArgs.push('--owner', owner);
  }
  createArgs.push(databaseName);
  runCommand('createdb', createArgs, { env });
}

function listBackups(backupRoot) {
  return fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const manifestPath = path.join(backupRoot, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) return null;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return {
        backupId: manifest.backupId ?? entry.name,
        createdAt: new Date(manifest.createdAt),
        path: path.join(backupRoot, entry.name),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function chooseRetention(backups, config) {
  const keepIds = new Set();
  if (backups[0]) keepIds.add(backups[0].backupId);

  keepNewestByBucket(backups, keepIds, backup => isoDayKey(backup.createdAt), config.dailyRetention);
  keepNewestByBucket(backups, keepIds, backup => isoWeekKey(backup.createdAt), config.weeklyRetention);
  keepNewestByBucket(backups, keepIds, backup => monthKey(backup.createdAt), config.monthlyRetention);

  return keepIds;
}

function keepNewestByBucket(backups, keepIds, keyBuilder, limit) {
  const seen = new Set();
  for (const backup of backups) {
    const key = keyBuilder(backup);
    if (seen.has(key)) continue;
    seen.add(key);
    keepIds.add(backup.backupId);
    if (seen.size >= limit) break;
  }
}

function ensureArchiveSource(sourceMediaRoot) {
  if (fs.existsSync(sourceMediaRoot)) return sourceMediaRoot;
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raqueta-empty-media-'));
  return emptyDir;
}

function resolveStorageRoot(storageRootSetting) {
  if (path.isAbsolute(storageRootSetting)) return storageRootSetting;
  return path.resolve(repoRoot, 'apps/api', storageRootSetting);
}

function runCommand(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${commandName} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function sameDatabase(left, right) {
  const leftUrl = new URL(left);
  const rightUrl = new URL(right);
  return leftUrl.toString() === rightUrl.toString();
}

function redactDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.password) url.password = '***';
  return url.toString();
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function mustGetEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatBackupId(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

function isoDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoWeekKey(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
