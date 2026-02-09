import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service before importing controller
jest.mock('../../services/checklist.service', () => ({
  __esModule: true,
  default: {
    getChecklistsByUserId: jest.fn(),
    getChecklistsByTripId: jest.fn(),
    getChecklistById: jest.fn(),
    createChecklist: jest.fn(),
    updateChecklist: jest.fn(),
    deleteChecklist: jest.fn(),
    addChecklistItem: jest.fn(),
    updateChecklistItem: jest.fn(),
    deleteChecklistItem: jest.fn(),
    initializeDefaultChecklists: jest.fn(),
    autoCheckFromTrips: jest.fn(),
    removeDefaultChecklists: jest.fn(),
    restoreDefaultChecklists: jest.fn(),
    getDefaultChecklistsStatus: jest.fn(),
    addDefaultChecklists: jest.fn(),
    removeDefaultChecklistsByType: jest.fn(),
  },
}));

import checklistService from '../../services/checklist.service';
import { checklistController } from '../checklist.controller';
import {
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

describe('checklist.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getChecklists', () => {
    it('should return all checklists for user when no tripId', async () => {
      const mockChecklists = [{ id: 1, name: 'Packing' }];
      (checklistService.getChecklistsByUserId as jest.Mock).mockResolvedValue(mockChecklists as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await checklistController.getChecklists(req as any, res as any, next);

      expect(checklistService.getChecklistsByUserId).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockChecklists });
    });

    it('should return checklists filtered by tripId when provided', async () => {
      const mockChecklists = [{ id: 2, name: 'Trip Packing' }];
      (checklistService.getChecklistsByTripId as jest.Mock).mockResolvedValue(mockChecklists as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        query: { tripId: '5' },
      });
      await checklistController.getChecklists(req as any, res as any, next);

      expect(checklistService.getChecklistsByTripId).toHaveBeenCalledWith(5, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockChecklists });
    });
  });

  describe('getChecklistById', () => {
    it('should return a single checklist by id', async () => {
      const mockChecklist = { id: 1, name: 'Packing', items: [] };
      (checklistService.getChecklistById as jest.Mock).mockResolvedValue(mockChecklist as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });
      await checklistController.getChecklistById(req as any, res as any, next);

      expect(checklistService.getChecklistById).toHaveBeenCalledWith(1, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockChecklist });
    });
  });

  describe('createChecklist', () => {
    it('should create a checklist and return 201', async () => {
      const mockChecklist = { id: 1, name: 'New Checklist' };
      (checklistService.createChecklist as jest.Mock).mockResolvedValue(mockChecklist as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'New Checklist' },
      });
      await checklistController.createChecklist(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(checklistService.createChecklist).toHaveBeenCalledWith(
          testUsers.user1.id,
          expect.objectContaining({ name: 'New Checklist' })
        );
        expectSuccessResponse(res, 201, mockChecklist);
      }
    });
  });

  describe('updateChecklist', () => {
    it('should update a checklist and return it', async () => {
      const mockChecklist = { id: 1, name: 'Updated Checklist' };
      (checklistService.updateChecklist as jest.Mock).mockResolvedValue(mockChecklist as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { name: 'Updated Checklist' },
      });
      await checklistController.updateChecklist(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(checklistService.updateChecklist).toHaveBeenCalledWith(
          1,
          testUsers.user1.id,
          expect.objectContaining({ name: 'Updated Checklist' })
        );
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockChecklist });
      }
    });
  });

  describe('deleteChecklist', () => {
    it('should delete a checklist and return success message', async () => {
      (checklistService.deleteChecklist as jest.Mock).mockResolvedValue(undefined as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });
      await checklistController.deleteChecklist(req as any, res as any, next);

      expect(checklistService.deleteChecklist).toHaveBeenCalledWith(1, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Checklist deleted successfully',
      });
    });
  });

  describe('addChecklistItem', () => {
    it('should add an item and return 201', async () => {
      const mockItem = { id: 1, name: 'Passport', checklistId: 1 };
      (checklistService.addChecklistItem as jest.Mock).mockResolvedValue(mockItem as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { name: 'Passport' },
      });
      await checklistController.addChecklistItem(req as any, res as any, next);

      expect(checklistService.addChecklistItem).toHaveBeenCalledWith(1, testUsers.user1.id, {
        name: 'Passport',
        description: undefined,
        metadata: undefined,
      });
      expectSuccessResponse(res, 201, mockItem);
    });

    it('should throw error when name is missing', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: {},
      });
      await checklistController.addChecklistItem(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('updateChecklistItem', () => {
    it('should update a checklist item', async () => {
      const mockItem = { id: 1, name: 'Updated Item', isChecked: true };
      (checklistService.updateChecklistItem as jest.Mock).mockResolvedValue(mockItem as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { itemId: '1' },
        body: { isChecked: true },
      });
      await checklistController.updateChecklistItem(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(checklistService.updateChecklistItem).toHaveBeenCalledWith(
          1,
          testUsers.user1.id,
          expect.objectContaining({ isChecked: true })
        );
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockItem });
      }
    });
  });

  describe('deleteChecklistItem', () => {
    it('should delete a checklist item', async () => {
      (checklistService.deleteChecklistItem as jest.Mock).mockResolvedValue(undefined as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { itemId: '1' },
      });
      await checklistController.deleteChecklistItem(req as any, res as any, next);

      expect(checklistService.deleteChecklistItem).toHaveBeenCalledWith(1, testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Checklist item deleted successfully',
      });
    });
  });

  describe('initializeDefaults', () => {
    it('should initialize default checklists', async () => {
      (checklistService.initializeDefaultChecklists as jest.Mock).mockResolvedValue(undefined as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await checklistController.initializeDefaults(req as any, res as any, next);

      expect(checklistService.initializeDefaultChecklists).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Default checklists initialized',
      });
    });
  });

  describe('autoCheckFromTrips', () => {
    it('should auto-check items and return updated count', async () => {
      const mockResult = { updated: 3 };
      (checklistService.autoCheckFromTrips as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await checklistController.autoCheckFromTrips(req as any, res as any, next);

      expect(checklistService.autoCheckFromTrips).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
        message: '3 items automatically checked',
      });
    });
  });

  describe('removeDefaults', () => {
    it('should remove default checklists and return count', async () => {
      const mockResult = { removed: 2 };
      (checklistService.removeDefaultChecklists as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await checklistController.removeDefaults(req as any, res as any, next);

      expect(checklistService.removeDefaultChecklists).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
        message: '2 default checklists removed',
      });
    });
  });

  describe('restoreDefaults', () => {
    it('should restore missing default checklists', async () => {
      const mockResult = { restored: 1 };
      (checklistService.restoreDefaultChecklists as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await checklistController.restoreDefaults(req as any, res as any, next);

      expect(checklistService.restoreDefaultChecklists).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
        message: '1 default checklists restored',
      });
    });
  });

  describe('getDefaultsStatus', () => {
    it('should return status of default checklists', async () => {
      const mockStatus = { existing: ['packing'], available: ['documents'] };
      (checklistService.getDefaultChecklistsStatus as jest.Mock).mockResolvedValue(mockStatus as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await checklistController.getDefaultsStatus(req as any, res as any, next);

      expect(checklistService.getDefaultChecklistsStatus).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockStatus });
    });
  });

  describe('addDefaults', () => {
    it('should add specific default checklists', async () => {
      const mockResult = { added: 2 };
      (checklistService.addDefaultChecklists as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { types: ['packing', 'documents'] },
      });
      await checklistController.addDefaults(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(checklistService.addDefaultChecklists).toHaveBeenCalledWith(
          testUsers.user1.id,
          ['packing', 'documents']
        );
        expect(res.json).toHaveBeenCalledWith({
          status: 'success',
          data: mockResult,
          message: '2 default checklists added',
        });
      }
    });
  });

  describe('removeDefaultsByType', () => {
    it('should remove specific default checklists by type', async () => {
      const mockResult = { removed: 1 };
      (checklistService.removeDefaultChecklistsByType as jest.Mock).mockResolvedValue(mockResult as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { types: ['packing'] },
      });
      await checklistController.removeDefaultsByType(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(checklistService.removeDefaultChecklistsByType).toHaveBeenCalledWith(
          testUsers.user1.id,
          ['packing']
        );
        expect(res.json).toHaveBeenCalledWith({
          status: 'success',
          data: mockResult,
          message: '1 default checklists removed',
        });
      }
    });
  });
});
