/**
 * Companion Controller Tests
 *
 * Tests for all companion controller methods:
 * - createCompanion: POST - validates body, calls companionService.createCompanion, returns 201
 * - getCompanionsByUser: GET - calls companionService.getCompanionsByUser, returns 200
 * - getCompanionById: GET - parses id, calls companionService.getCompanionById, returns 200
 * - updateCompanion: PATCH - parses id, validates body, calls companionService.updateCompanion, returns 200
 * - deleteCompanion: DELETE - parses id, calls companionService.deleteCompanion, returns 204
 * - linkCompanionToTrip: POST - validates body, calls companionService.linkCompanionToTrip, returns 201
 * - unlinkCompanionFromTrip: DELETE - parses tripId/companionId, returns 204
 * - getCompanionsByTrip: GET - parses tripId, calls companionService.getCompanionsByTrip, returns 200
 * - uploadAvatar: POST - requires req.file, calls companionService.uploadAvatar, returns 200
 * - setImmichAvatar: POST - requires immichAssetId, calls companionService.setImmichAvatar, returns 200
 * - deleteAvatar: DELETE - parses id, calls companionService.deleteAvatar, returns 200
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the companion service module
const mockCreateCompanion = jest.fn();
const mockGetCompanionsByUser = jest.fn();
const mockGetCompanionById = jest.fn();
const mockUpdateCompanion = jest.fn();
const mockDeleteCompanion = jest.fn();
const mockLinkCompanionToTrip = jest.fn();
const mockUnlinkCompanionFromTrip = jest.fn();
const mockGetCompanionsByTrip = jest.fn();
const mockUploadAvatar = jest.fn();
const mockSetImmichAvatar = jest.fn();
const mockDeleteAvatar = jest.fn();

jest.mock('../../services/companion.service', () => ({
  companionService: {
    createCompanion: (...args: unknown[]) => mockCreateCompanion(...args),
    getCompanionsByUser: (...args: unknown[]) => mockGetCompanionsByUser(...args),
    getCompanionById: (...args: unknown[]) => mockGetCompanionById(...args),
    updateCompanion: (...args: unknown[]) => mockUpdateCompanion(...args),
    deleteCompanion: (...args: unknown[]) => mockDeleteCompanion(...args),
    linkCompanionToTrip: (...args: unknown[]) => mockLinkCompanionToTrip(...args),
    unlinkCompanionFromTrip: (...args: unknown[]) => mockUnlinkCompanionFromTrip(...args),
    getCompanionsByTrip: (...args: unknown[]) => mockGetCompanionsByTrip(...args),
    uploadAvatar: (...args: unknown[]) => mockUploadAvatar(...args),
    setImmichAvatar: (...args: unknown[]) => mockSetImmichAvatar(...args),
    deleteAvatar: (...args: unknown[]) => mockDeleteAvatar(...args),
  },
}));

import { companionController } from '../companion.controller';
import {
  createAuthenticatedControllerArgs,
  createMockFile,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';
import { Request, Response, NextFunction } from 'express';

/**
 * asyncHandler does not return the inner promise, so rejected promises
 * propagate to next() via a .catch() that runs in a later microtask.
 * We need to flush the microtask queue before asserting on next().
 */
const flushPromises = () => new Promise(resolve => process.nextTick(resolve));

describe('Companion Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCompanion', () => {
    it('should create a companion and return 201', async () => {
      const mockCompanion = { id: 1, name: 'Alice', userId: 1 };
      mockCreateCompanion.mockResolvedValue(mockCompanion);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'Alice' },
      });

      companionController.createCompanion(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockCreateCompanion).toHaveBeenCalledWith(testUsers.user1.id, { name: 'Alice' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCompanion,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Database error');
      mockCreateCompanion.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'Alice' },
      });

      companionController.createCompanion(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for invalid body', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: '' }, // name must be min 1 char
      });

      companionController.createCompanion(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      expect(mockCreateCompanion).not.toHaveBeenCalled();
    });
  });

  describe('getCompanionsByUser', () => {
    it('should return all companions for the user with 200', async () => {
      const mockCompanions = [
        { id: 1, name: 'Alice', userId: 1 },
        { id: 2, name: 'Bob', userId: 1 },
      ];
      mockGetCompanionsByUser.mockResolvedValue(mockCompanions);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      companionController.getCompanionsByUser(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockGetCompanionsByUser).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCompanions,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Database error');
      mockGetCompanionsByUser.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      companionController.getCompanionsByUser(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getCompanionById', () => {
    it('should return a companion by id with 200', async () => {
      const mockCompanion = { id: 3, name: 'Alice', userId: 1 };
      mockGetCompanionById.mockResolvedValue(mockCompanion);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });

      companionController.getCompanionById(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockGetCompanionById).toHaveBeenCalledWith(testUsers.user1.id, 3);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCompanion,
      });
    });

    it('should propagate error for invalid id param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'abc' },
      });

      companionController.getCompanionById(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      expect(mockGetCompanionById).not.toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Not found');
      mockGetCompanionById.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });

      companionController.getCompanionById(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateCompanion', () => {
    it('should update a companion and return 200', async () => {
      const mockCompanion = { id: 3, name: 'Alice Updated', userId: 1 };
      mockUpdateCompanion.mockResolvedValue(mockCompanion);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
        body: { name: 'Alice Updated' },
      });

      companionController.updateCompanion(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockUpdateCompanion).toHaveBeenCalledWith(testUsers.user1.id, 3, {
        name: 'Alice Updated',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCompanion,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateCompanion.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
        body: { name: 'Updated' },
      });

      companionController.updateCompanion(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteCompanion', () => {
    it('should delete a companion and return 204', async () => {
      mockDeleteCompanion.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });

      companionController.deleteCompanion(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockDeleteCompanion).toHaveBeenCalledWith(testUsers.user1.id, 3);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      mockDeleteCompanion.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });

      companionController.deleteCompanion(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('linkCompanionToTrip', () => {
    it('should link a companion to a trip and return 201', async () => {
      const mockLink = { tripId: 10, companionId: 3 };
      mockLinkCompanionToTrip.mockResolvedValue(mockLink);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 10, companionId: 3 },
      });

      companionController.linkCompanionToTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockLinkCompanionToTrip).toHaveBeenCalledWith(testUsers.user1.id, {
        tripId: 10,
        companionId: 3,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLink,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Link failed');
      mockLinkCompanionToTrip.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 10, companionId: 3 },
      });

      companionController.linkCompanionToTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for invalid body', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 'invalid' },
      });

      companionController.linkCompanionToTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      expect(mockLinkCompanionToTrip).not.toHaveBeenCalled();
    });
  });

  describe('unlinkCompanionFromTrip', () => {
    it('should unlink a companion from a trip and return 204', async () => {
      mockUnlinkCompanionFromTrip.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', companionId: '3' },
      });

      companionController.unlinkCompanionFromTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockUnlinkCompanionFromTrip).toHaveBeenCalledWith(testUsers.user1.id, 10, 3);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Unlink failed');
      mockUnlinkCompanionFromTrip.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', companionId: '3' },
      });

      companionController.unlinkCompanionFromTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate error for invalid tripId param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: 'abc', companionId: '3' },
      });

      companionController.unlinkCompanionFromTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      expect(mockUnlinkCompanionFromTrip).not.toHaveBeenCalled();
    });
  });

  describe('getCompanionsByTrip', () => {
    it('should return companions for a trip with 200', async () => {
      const mockCompanions = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      mockGetCompanionsByTrip.mockResolvedValue(mockCompanions);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
      });

      companionController.getCompanionsByTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockGetCompanionsByTrip).toHaveBeenCalledWith(testUsers.user1.id, 10);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCompanions,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetCompanionsByTrip.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
      });

      companionController.getCompanionsByTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('uploadAvatar', () => {
    it('should upload an avatar and return 200', async () => {
      const mockCompanion = { id: 3, name: 'Alice', avatarUrl: '/uploads/avatar.jpg' };
      mockUploadAvatar.mockResolvedValue(mockCompanion);
      const mockFile = createMockFile({ originalname: 'avatar.jpg' });

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });
      (req as Record<string, unknown>).file = mockFile;

      companionController.uploadAvatar(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockUploadAvatar).toHaveBeenCalledWith(testUsers.user1.id, 3, mockFile);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCompanion,
      });
    });

    it('should throw AppError when no file is uploaded', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });
      // req.file is undefined by default

      companionController.uploadAvatar(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      const error = (next as jest.Mock).mock.calls[0][0] as { message: string; statusCode: number };
      expect(error.message).toBe('No file uploaded');
      expect(error.statusCode).toBe(400);
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Upload failed');
      mockUploadAvatar.mockRejectedValue(error);
      const mockFile = createMockFile();

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });
      (req as Record<string, unknown>).file = mockFile;

      companionController.uploadAvatar(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('setImmichAvatar', () => {
    it('should set immich avatar and return 200', async () => {
      const mockCompanion = { id: 3, name: 'Alice', avatarUrl: 'immich://asset123' };
      mockSetImmichAvatar.mockResolvedValue(mockCompanion);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
        body: { immichAssetId: 'asset123' },
      });

      companionController.setImmichAvatar(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockSetImmichAvatar).toHaveBeenCalledWith(testUsers.user1.id, 3, 'asset123');
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCompanion,
      });
    });

    it('should throw AppError when immichAssetId is missing', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
        body: {},
      });

      companionController.setImmichAvatar(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      const error = (next as jest.Mock).mock.calls[0][0] as { message: string; statusCode: number };
      expect(error.message).toBe('immichAssetId is required');
      expect(error.statusCode).toBe(400);
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Immich error');
      mockSetImmichAvatar.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
        body: { immichAssetId: 'asset123' },
      });

      companionController.setImmichAvatar(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteAvatar', () => {
    it('should delete an avatar and return 200', async () => {
      const mockCompanion = { id: 3, name: 'Alice', avatarUrl: null };
      mockDeleteAvatar.mockResolvedValue(mockCompanion);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });

      companionController.deleteAvatar(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(mockDeleteAvatar).toHaveBeenCalledWith(testUsers.user1.id, 3);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockCompanion,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete avatar failed');
      mockDeleteAvatar.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '3' },
      });

      companionController.deleteAvatar(req as unknown as Request, res as unknown as Response, next as NextFunction);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
