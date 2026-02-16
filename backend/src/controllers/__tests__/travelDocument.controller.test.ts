import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock service before importing controller
jest.mock('../../services/travelDocument.service', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    getAll: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getDocumentsRequiringAttention: jest.fn(),
    checkDocumentValidityForTrip: jest.fn(),
    getPrimaryPassport: jest.fn(),
  },
}));

import travelDocumentService from '../../services/travelDocument.service';
import { travelDocumentController } from '../travelDocument.controller';
import {
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';

describe('travelDocument.controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should create a travel document and return 201', async () => {
      const mockDoc = { id: 1, type: 'passport', documentNumber: 'AB123456' };
      (travelDocumentService.create as jest.Mock).mockResolvedValue(mockDoc as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { type: 'passport', documentNumber: 'AB123456', issuingCountry: 'US' },
      });
      await travelDocumentController.create(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(travelDocumentService.create).toHaveBeenCalledWith(
          testUsers.user1.id,
          expect.objectContaining({ type: 'passport' })
        );
        expectSuccessResponse(res, 201, mockDoc);
      }
    });
  });

  describe('getAll', () => {
    it('should return all travel documents for user', async () => {
      const mockDocs = [{ id: 1, type: 'passport' }, { id: 2, type: 'visa' }];
      (travelDocumentService.getAll as jest.Mock).mockResolvedValue(mockDocs as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await travelDocumentController.getAll(req as any, res as any, next);

      expect(travelDocumentService.getAll).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockDocs });
    });
  });

  describe('getById', () => {
    it('should return a single document by id', async () => {
      const mockDoc = { id: 1, type: 'passport', documentNumber: 'AB123456' };
      (travelDocumentService.getById as jest.Mock).mockResolvedValue(mockDoc as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });
      await travelDocumentController.getById(req as any, res as any, next);

      expect(travelDocumentService.getById).toHaveBeenCalledWith(testUsers.user1.id, 1);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockDoc });
    });
  });

  describe('update', () => {
    it('should update a travel document', async () => {
      const mockDoc = { id: 1, type: 'passport', documentNumber: 'AB999999' };
      (travelDocumentService.update as jest.Mock).mockResolvedValue(mockDoc as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
        body: { documentNumber: 'AB999999' },
      });
      await travelDocumentController.update(req as any, res as any, next);

      if ((next as jest.Mock).mock.calls.length === 0) {
        expect(travelDocumentService.update).toHaveBeenCalledWith(
          testUsers.user1.id,
          1,
          expect.objectContaining({ documentNumber: 'AB999999' })
        );
        expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockDoc });
      }
    });
  });

  describe('delete', () => {
    it('should delete a travel document and return 200', async () => {
      (travelDocumentService.delete as jest.Mock).mockResolvedValue(undefined as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '1' },
      });
      await travelDocumentController.delete(req as any, res as any, next);

      expect(travelDocumentService.delete).toHaveBeenCalledWith(testUsers.user1.id, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('getAlerts', () => {
    it('should return documents requiring attention', async () => {
      const mockAlerts = [{ id: 1, type: 'passport', expiresIn: 30 }];
      (travelDocumentService.getDocumentsRequiringAttention as jest.Mock).mockResolvedValue(mockAlerts as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await travelDocumentController.getAlerts(req as any, res as any, next);

      expect(travelDocumentService.getDocumentsRequiringAttention).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockAlerts });
    });
  });

  describe('checkForTrip', () => {
    it('should check document validity for a specific trip', async () => {
      const mockCheck = { valid: true, warnings: [] };
      (travelDocumentService.checkDocumentValidityForTrip as jest.Mock).mockResolvedValue(mockCheck as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '5' },
      });
      await travelDocumentController.checkForTrip(req as any, res as any, next);

      expect(travelDocumentService.checkDocumentValidityForTrip).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockCheck });
    });
  });

  describe('getPrimaryPassport', () => {
    it('should return the primary passport', async () => {
      const mockPassport = { id: 1, type: 'passport', isPrimary: true };
      (travelDocumentService.getPrimaryPassport as jest.Mock).mockResolvedValue(mockPassport as never);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
      await travelDocumentController.getPrimaryPassport(req as any, res as any, next);

      expect(travelDocumentService.getPrimaryPassport).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', data: mockPassport });
    });
  });
});
