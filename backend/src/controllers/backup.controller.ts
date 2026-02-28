import crypto from 'crypto';
import { Request, Response } from 'express';
import backupService from '../services/backup.service';
import restoreService from '../services/restore.service';
import { BackupDataSchema, RestoreOptionsSchema } from '../types/backup.types';
import { asyncHandler } from '../utils/asyncHandler';
import { requireUserId } from '../utils/controllerHelpers';
import { AppError } from '../utils/errors';
import config from '../config';
import logger from '../config/logger';

/**
 * Compute an HMAC-SHA256 signature over the given data using the JWT secret.
 * The data should NOT contain the integrity field itself.
 */
function computeBackupHmac(data: unknown): string {
  return crypto
    .createHmac('sha256', config.jwt.secret)
    .update(JSON.stringify(data))
    .digest('hex');
}

/**
 * Create and download a backup of all user data
 */
export const createBackup = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  // Create backup
  const backupData = await backupService.createBackup(userId);

  // Compute HMAC-SHA256 integrity signature over the backup data
  const signature = computeBackupHmac(backupData);

  // Add integrity field to the backup output
  const backupWithIntegrity = {
    ...backupData,
    integrity: {
      algorithm: 'hmac-sha256',
      signature,
    },
  };

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

  // Verify backup integrity if the integrity field is present
  if (rawBackupData && rawBackupData.integrity) {
    const { integrity, ...dataWithoutIntegrity } = rawBackupData;

    if (integrity.algorithm !== 'hmac-sha256') {
      throw new AppError(`Unsupported integrity algorithm: ${integrity.algorithm}`, 400);
    }

    const expectedSignature = computeBackupHmac(dataWithoutIntegrity);

    const sigBuffer = Buffer.from(integrity.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new AppError('Backup integrity check failed. The backup file may have been tampered with.', 400);
    }
  } else {
    // Old backups without integrity field - allow but log a warning
    logger.warn('Restoring backup without integrity verification — backup was created before HMAC signing', {
      userId,
    });
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
