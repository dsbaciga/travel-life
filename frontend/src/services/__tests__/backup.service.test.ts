import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../lib/axios';
import backupService from '../backup.service';

describe('backupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBackup', () => {
    it('should call POST /backup/create and return backup data', async () => {
      const mockBackupData = {
        version: '1.0',
        exportedAt: '2024-06-15T12:00:00Z',
        user: { id: 1, username: 'testuser' },
        trips: [{ id: 1, name: 'Trip 1' }],
      };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockBackupData });

      const result = await backupService.createBackup();

      expect(api.post).toHaveBeenCalledWith('/backup/create');
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockBackupData);
    });

    it('should propagate errors on backup creation failure', async () => {
      const error = new Error('Server error');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(backupService.createBackup()).rejects.toThrow('Server error');
    });
  });

  describe('downloadBackupFile', () => {
    it('should create a download link and trigger click', () => {
      const mockBackupData = {
        version: '1.0',
        exportedAt: '2024-06-15T12:00:00Z',
        user: { id: 1, username: 'testuser' },
        trips: [],
      };

      // Mock URL and DOM APIs
      const mockUrl = 'blob:http://localhost/mock-url';
      const mockCreateObjectURL = vi.fn(() => mockUrl);
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const mockClick = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();
      const mockCreateElement = vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: mockClick,
      } as unknown as HTMLAnchorElement);
      vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
      vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);

      backupService.downloadBackupFile(mockBackupData as any);

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(mockAppendChild).toHaveBeenCalledTimes(1);
      expect(mockRemoveChild).toHaveBeenCalledTimes(1);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(mockUrl);

      mockCreateElement.mockRestore();
    });
  });

  describe('restoreFromBackup', () => {
    it('should call POST /backup/restore with backup data and options', async () => {
      const backupData = {
        version: '1.0',
        user: { id: 1, username: 'testuser' },
        trips: [{ id: 1, name: 'Trip 1' }],
      };
      const options = { overwrite: true, includePhotos: false };
      const mockResult = {
        message: 'Restore completed successfully',
        stats: { tripsRestored: 1, locationsRestored: 5, photosRestored: 0 },
      };
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockResult });

      const result = await backupService.restoreFromBackup(backupData as any, options as any);

      expect(api.post).toHaveBeenCalledWith('/backup/restore', {
        backupData,
        options,
      });
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        success: true,
        message: 'Restore completed successfully',
        stats: { tripsRestored: 1, locationsRestored: 5, photosRestored: 0 },
      });
    });

    it('should propagate errors on restore failure', async () => {
      const error = new Error('Invalid backup format');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(backupService.restoreFromBackup({} as any, {} as any)).rejects.toThrow('Invalid backup format');
    });
  });

  describe('getBackupInfo', () => {
    it('should call GET /backup/info and return backup metadata', async () => {
      const mockInfo = {
        lastBackup: '2024-06-15T12:00:00Z',
        totalTrips: 5,
        totalLocations: 50,
        totalPhotos: 200,
      };
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockInfo });

      const result = await backupService.getBackupInfo();

      expect(api.get).toHaveBeenCalledWith('/backup/info');
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockInfo);
    });

    it('should propagate errors on info fetch failure', async () => {
      const error = new Error('Unauthorized');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(backupService.getBackupInfo()).rejects.toThrow('Unauthorized');
    });
  });

  describe('readBackupFile', () => {
    it('should read and parse a valid backup JSON file', async () => {
      const backupContent = {
        version: '1.0',
        user: { id: 1, username: 'testuser' },
        trips: [{ id: 1, name: 'Trip 1' }],
      };
      const file = new File([JSON.stringify(backupContent)], 'backup.json', { type: 'application/json' });

      const result = await backupService.readBackupFile(file);

      expect(result).toEqual(backupContent);
    });

    it('should reject with error for invalid JSON', async () => {
      const file = new File(['not valid json'], 'backup.json', { type: 'application/json' });

      await expect(backupService.readBackupFile(file)).rejects.toThrow('Failed to parse backup file');
    });

    it('should reject with error for missing required fields', async () => {
      const invalidBackup = { someField: 'value' };
      const file = new File([JSON.stringify(invalidBackup)], 'backup.json', { type: 'application/json' });

      await expect(backupService.readBackupFile(file)).rejects.toThrow('Invalid backup file format');
    });

    it('should reject with error for file missing version field', async () => {
      const invalidBackup = { user: { id: 1 }, trips: [] };
      const file = new File([JSON.stringify(invalidBackup)], 'backup.json', { type: 'application/json' });

      await expect(backupService.readBackupFile(file)).rejects.toThrow('Invalid backup file format');
    });

    it('should reject with error for file missing user field', async () => {
      const invalidBackup = { version: '1.0', trips: [] };
      const file = new File([JSON.stringify(invalidBackup)], 'backup.json', { type: 'application/json' });

      await expect(backupService.readBackupFile(file)).rejects.toThrow('Invalid backup file format');
    });

    it('should reject with error for file missing trips field', async () => {
      const invalidBackup = { version: '1.0', user: { id: 1 } };
      const file = new File([JSON.stringify(invalidBackup)], 'backup.json', { type: 'application/json' });

      await expect(backupService.readBackupFile(file)).rejects.toThrow('Invalid backup file format');
    });
  });
});
