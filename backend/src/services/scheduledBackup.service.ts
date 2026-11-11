import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/database';
import config from '../config';
import logger from '../config/logger';
import backupService from './backup.service';
import { signBackup } from './backupIntegrity.service';

const FILE_RE = /^travel-life-backup-(\d{4})-(\d{2})-(\d{2})\.json$/;

export interface ScheduledBackupStatus {
  lastRunAt: string | null;
  lastSuccessCount: number;
  lastFailureCount: number;
  lastError: string | null;
}

let status: ScheduledBackupStatus = {
  lastRunAt: null,
  lastSuccessCount: 0,
  lastFailureCount: 0,
  lastError: null,
};

function dateStamp(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Decide which backup file names to keep: the newest `keepDaily` files, plus the
 * newest file of each of the following `keepWeekly` ISO-ish weeks (7-day buckets
 * counted back from the newest file). Pure so it can be tested without a disk.
 */
export function selectFilesToKeep(
  names: string[],
  keepDaily: number,
  keepWeekly: number
): Set<string> {
  const dated = names
    .map((name) => ({ name, m: FILE_RE.exec(name) }))
    .filter((x): x is { name: string; m: RegExpExecArray } => x.m !== null)
    .map((x) => ({
      name: x.name,
      time: Date.UTC(Number(x.m[1]), Number(x.m[2]) - 1, Number(x.m[3])),
    }))
    .sort((a, b) => b.time - a.time);

  const keep = new Set<string>();
  dated.slice(0, Math.max(0, keepDaily)).forEach((f) => keep.add(f.name));

  const rest = dated.slice(Math.max(0, keepDaily));
  const seenBuckets = new Set<number>();
  const newest = dated.length ? dated[0].time : 0;
  for (const f of rest) {
    const bucket = Math.floor((newest - f.time) / (7 * 24 * 3600 * 1000));
    if (!seenBuckets.has(bucket) && seenBuckets.size < Math.max(0, keepWeekly)) {
      seenBuckets.add(bucket);
      keep.add(f.name);
    }
  }
  return keep;
}

async function pruneUserDir(dir: string): Promise<number> {
  const names = await fs.readdir(dir);
  const keep = selectFilesToKeep(names, config.scheduledBackup.keepDaily, config.scheduledBackup.keepWeekly);
  let removed = 0;
  for (const name of names) {
    if (FILE_RE.test(name) && !keep.has(name)) {
      await fs.unlink(path.join(dir, name));
      removed++;
    }
  }
  return removed;
}

/**
 * Write a backup for every user to BACKUP_DIR/user-<id>/ and apply retention.
 * One user's failure never stops the others.
 */
export async function runScheduledBackups(now: Date = new Date()): Promise<ScheduledBackupStatus> {
  const root = path.resolve(config.scheduledBackup.dir);
  const users = await prisma.user.findMany({ select: { id: true } });
  let ok = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const { id } of users) {
    try {
      const dir = path.join(root, `user-${id}`);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const data = await backupService.createBackup(id);
      const file = path.join(dir, `travel-life-backup-${dateStamp(now)}.json`);
      const tmp = `${file}.tmp`;
      // Signed exactly like a manual download: restore refuses unsigned files.
      await fs.writeFile(tmp, JSON.stringify(signBackup(data)), { mode: 0o600 });
      await fs.rename(tmp, file); // atomic: never leaves a half-written backup under the real name
      await pruneUserDir(dir);
      ok++;
    } catch (error) {
      failed++;
      lastError = error instanceof Error ? error.message : String(error);
      logger.error(`Scheduled backup failed for user ${id}:`, error);
    }
  }

  status = { lastRunAt: now.toISOString(), lastSuccessCount: ok, lastFailureCount: failed, lastError };
  return status;
}

export function getScheduledBackupStatus(): ScheduledBackupStatus {
  return { ...status };
}

export default { runScheduledBackups, getScheduledBackupStatus, selectFilesToKeep };
