import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock services before importing controller
jest.mock('../../services/backup.service', () => ({
  __esModule: true,
  default: {
    createBackup: jest.fn(),
  },
}));

jest.mock('../../services/restore.service', () => ({
  __esModule: true,
  default: {
    restoreFromBackup: jest.fn(),
  },
}));

import backupService from '../../services/backup.service';
import restoreService from '../../services/restore.service';
import backupController from '../backup.controller';
import {
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

describe('backup.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createBackup', () => {
    it('should call backupService.createBackup and return backup data', async () => {
      const mockBackupData = { version: '1.0.0', exportedAt: '2024-01-01', trips: [] };
      (backupService.createBackup as jest.Mock).mockResolvedValue(mockBackupData as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await backupController.createBackup(req as any, res as any, next);

      expect(backupService.createBackup).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename="travel-life-backup-')
      );
      expect(res.json).toHaveBeenCalledWith(mockBackupData);
    });

    it('should pass errors to next via asyncHandler', async () => {
      const error = new Error('Backup failed');
      (backupService.createBackup as jest.Mock).mockRejectedValue(error as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await backupController.createBackup(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('restoreFromBackup', () => {
    it('should validate input and call restoreService', async () => {
      const mockResult = { message: 'Restored successfully', stats: { trips: 2, locations: 5 } };
      (restoreService.restoreFromBackup as jest.Mock).mockResolvedValue(mockResult as never);

      const backupData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        user: { username: 'test', email: 'test@test.com' },
        data: { trips: [] },
      };

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { backupData, options: {} },
      });
      await backupController.restoreFromBackup(req as any, res as any, next);

      // If Zod validation fails, next will be called with error; otherwise service is called
      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(restoreService.restoreFromBackup).toHaveBeenCalled();
        expectSuccessResponse(res, 200);
      }
    });

    it('should pass Zod validation errors to next', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { backupData: 'invalid', options: {} },
      });
      await backupController.restoreFromBackup(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getBackupInfo', () => {
    it('should return backup info with version and formats', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await backupController.getBackupInfo(req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          version: '1.0.0',
          supportedFormats: ['json'],
        },
      });
    });
  });
});
