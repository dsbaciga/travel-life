import { Request, Response } from 'express';
import backupService from '../services/backup.service';
import restoreService from '../services/restore.service';
import { BackupDataSchema, RestoreOptionsSchema } from '../types/backup.types';
import { asyncHandler } from '../utils/asyncHandler';
import { requireUserId } from '../utils/controllerHelpers';

/**
 * Create and download a backup of all user data
 */
export const createBackup = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  // Create backup
  const backupData = await backupService.createBackup(userId);

  // Set headers for file download
  const filename = `travel-life-backup-${new Date().toISOString().split('T')[0]}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Send raw backup data (this is a file download, not an API response)
  // The frontend saves this directly and re-uploads it for restore
  res.json(backupData);
});

/**
 * Restore user data from a backup file
 */
export const restoreFromBackup = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);

  // Parse and validate backup data
  const backupData = BackupDataSchema.parse(req.body.backupData);

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
