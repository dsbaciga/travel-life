import crypto from 'crypto';
import { Request, Response } from 'express';
import backupService from '../services/backup.service';
import { computeBackupHmac, signBackup } from '../services/backupIntegrity.service';
import restoreService from '../services/restore.service';
import { BackupDataSchema, RestoreOptionsSchema } from '../types/backup.types';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';
import { AppError } from '../errors/errors';
import logger from '../config/logger';

/**
 * Create and download a backup of all user data
 */
export const createBackup = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  // Create backup
  const backupData = await backupService.createBackup(userId);

  // Attach the HMAC-SHA256 integrity signature
  const backupWithIntegrity = signBackup(backupData);

  // Set headers for file download
  const filename = `travel-life-backup-${new Date().toISOString().split('T')[0]}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Send raw backup data (this is a file download, not an API response)
  // The frontend saves this directly and re-uploads it for restore
  res.json(backupWithIntegrity);
});

/**
 * Restore user data from a backup file
 */
export const restoreFromBackup = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  const rawBackupData = req.body.backupData;

  // The HMAC signature is MANDATORY. A backup file is fully attacker-controlled
  // input that is written straight into the user's records (including file paths
  // that later reach fs.unlink()), so an unsigned file must not be trusted.
  //
  // ESCAPE HATCH: backups created before HMAC signing was introduced carry no
  // `integrity` field. Rather than locking users out of their own old backups
  // permanently, an operator can set ALLOW_UNSIGNED_BACKUP_RESTORE=true to accept
  // them. This is deliberately an env var and not a request flag — a request flag
  // would let any caller opt out of the check, which is the bug being fixed here.
  // Restore the old backup once, then re-export to get a signed file and unset it.
  const allowUnsigned = process.env.ALLOW_UNSIGNED_BACKUP_RESTORE === 'true';

  if (rawBackupData && rawBackupData.integrity) {
    const { integrity, ...dataWithoutIntegrity } = rawBackupData;

    if (integrity.algorithm !== 'hmac-sha256') {
      throw new AppError(`Unsupported integrity algorithm: ${integrity.algorithm}`, 400);
    }

    if (typeof integrity.signature !== 'string' || !/^[0-9a-fA-F]+$/.test(integrity.signature)) {
      throw new AppError('Backup integrity signature is missing or malformed.', 400);
    }

    const expectedSignature = computeBackupHmac(dataWithoutIntegrity);

    const sigBuffer = Buffer.from(integrity.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new AppError('Backup integrity check failed. The backup file may have been tampered with.', 400);
    }
  } else if (allowUnsigned) {
    logger.warn(
      'Restoring UNSIGNED backup — ALLOW_UNSIGNED_BACKUP_RESTORE is enabled. ' +
        'Unset it once legacy backups have been re-exported.',
      { userId }
    );
  } else {
    logger.warn('Rejected restore of a backup with no integrity signature', { userId });
    throw new AppError(
      'This backup has no integrity signature and cannot be restored. Backups created by this ' +
        'application are signed; re-export a fresh backup, or ask an administrator to set ' +
        'ALLOW_UNSIGNED_BACKUP_RESTORE=true to restore a legacy unsigned file.',
      400
    );
  }

  // Parse and validate backup data (Zod strips the integrity field automatically)
  const backupData = BackupDataSchema.parse(rawBackupData);

  // Parse options
  const options = RestoreOptionsSchema.parse(req.body.options || {});

  // Restore data
  const result = await restoreService.restoreFromBackup(userId, backupData, options);

  res.json({
    status: 'success',
    data: {
      message: result.message,
      stats: result.stats,
    },
  });
});

/**
 * Get backup information/metadata
 */
export const getBackupInfo = asyncHandler(async (_req: Request, res: Response) => {
  // For now, just return basic info
  // In the future, we could store backup metadata in the database
  res.json({
    status: 'success',
    data: {
      version: '1.0.0',
      supportedFormats: ['json'],
    },
  });
});

export default {
  createBackup,
  restoreFromBackup,
  getBackupInfo,
};
