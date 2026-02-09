/**
 * Tag Controller Tests
 *
 * Tests for all tag controller methods:
 * - createTag: POST - validates body, calls tagService.createTag, returns 201
 * - getTagsByUser: GET - calls tagService.getTagsByUser, returns 200
 * - getTagById: GET - parses id param, calls tagService.getTagById, returns 200
 * - updateTag: PATCH - parses id param, validates body, calls tagService.updateTag, returns 200
 * - deleteTag: DELETE - parses id param, calls tagService.deleteTag, returns 204
 * - linkTagToTrip: POST - validates body, calls tagService.linkTagToTrip, returns 201
 * - unlinkTagFromTrip: DELETE - parses tripId/tagId, calls tagService.unlinkTagFromTrip, returns 204
 * - getTagsByTrip: GET - parses tripId, calls tagService.getTagsByTrip, returns 200
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the tag service module
const mockCreateTag = jest.fn();
const mockGetTagsByUser = jest.fn();
const mockGetTagById = jest.fn();
const mockUpdateTag = jest.fn();
const mockDeleteTag = jest.fn();
const mockLinkTagToTrip = jest.fn();
const mockUnlinkTagFromTrip = jest.fn();
const mockGetTagsByTrip = jest.fn();

jest.mock('../../services/tag.service', () => ({
  tagService: {
    createTag: (...args: unknown[]) => mockCreateTag(...args),
    getTagsByUser: (...args: unknown[]) => mockGetTagsByUser(...args),
    getTagById: (...args: unknown[]) => mockGetTagById(...args),
    updateTag: (...args: unknown[]) => mockUpdateTag(...args),
    deleteTag: (...args: unknown[]) => mockDeleteTag(...args),
    linkTagToTrip: (...args: unknown[]) => mockLinkTagToTrip(...args),
    unlinkTagFromTrip: (...args: unknown[]) => mockUnlinkTagFromTrip(...args),
    getTagsByTrip: (...args: unknown[]) => mockGetTagsByTrip(...args),
  },
}));

import { tagController } from '../tag.controller';
import {
  createAuthenticatedControllerArgs,
  createMockResponse,
  createMockNext,
} from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';
import { Request, Response, NextFunction } from 'express';

describe('Tag Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTag', () => {
    it('should create a tag and return 201', async () => {
      const mockTag = { id: 1, name: 'Beach', color: '#FF0000', userId: 1 };
      mockCreateTag.mockResolvedValue(mockTag);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'Beach', color: '#FF0000' },
      });

      await tagController.createTag(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockCreateTag).toHaveBeenCalledWith(testUsers.user1.id, {
        name: 'Beach',
        color: '#FF0000',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockTag,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Database error');
      mockCreateTag.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: 'Beach' },
      });

      await tagController.createTag(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for invalid body', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { name: '' }, // name must be min 1 char
      });

      await tagController.createTag(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockCreateTag).not.toHaveBeenCalled();
    });
  });

  describe('getTagsByUser', () => {
    it('should return all tags for the user with 200', async () => {
      const mockTags = [
        { id: 1, name: 'Beach', userId: 1 },
        { id: 2, name: 'Mountain', userId: 1 },
      ];
      mockGetTagsByUser.mockResolvedValue(mockTags);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await tagController.getTagsByUser(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetTagsByUser).toHaveBeenCalledWith(testUsers.user1.id);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockTags,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Database error');
      mockGetTagsByUser.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await tagController.getTagsByUser(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getTagById', () => {
    it('should return a tag by id with 200', async () => {
      const mockTag = { id: 5, name: 'Beach', userId: 1 };
      mockGetTagById.mockResolvedValue(mockTag);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      await tagController.getTagById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetTagById).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockTag,
      });
    });

    it('should propagate error for invalid id param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: 'abc' },
      });

      await tagController.getTagById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockGetTagById).not.toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Not found');
      mockGetTagById.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      await tagController.getTagById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateTag', () => {
    it('should update a tag and return 200', async () => {
      const mockTag = { id: 5, name: 'Updated Beach', color: '#00FF00', userId: 1 };
      mockUpdateTag.mockResolvedValue(mockTag);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { name: 'Updated Beach', color: '#00FF00' },
      });

      await tagController.updateTag(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateTag).toHaveBeenCalledWith(testUsers.user1.id, 5, {
        name: 'Updated Beach',
        color: '#00FF00',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockTag,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateTag.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
        body: { name: 'Updated' },
      });

      await tagController.updateTag(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag and return 204', async () => {
      mockDeleteTag.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      await tagController.deleteTag(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockDeleteTag).toHaveBeenCalledWith(testUsers.user1.id, 5);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      mockDeleteTag.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { id: '5' },
      });

      await tagController.deleteTag(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('linkTagToTrip', () => {
    it('should link a tag to a trip and return 201', async () => {
      const mockLink = { tripId: 10, tagId: 5 };
      mockLinkTagToTrip.mockResolvedValue(mockLink);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 10, tagId: 5 },
      });

      await tagController.linkTagToTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockLinkTagToTrip).toHaveBeenCalledWith(testUsers.user1.id, {
        tripId: 10,
        tagId: 5,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLink,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Link failed');
      mockLinkTagToTrip.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 10, tagId: 5 },
      });

      await tagController.linkTagToTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate Zod validation errors for invalid body', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        body: { tripId: 'invalid' },
      });

      await tagController.linkTagToTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockLinkTagToTrip).not.toHaveBeenCalled();
    });
  });

  describe('unlinkTagFromTrip', () => {
    it('should unlink a tag from a trip and return 204', async () => {
      mockUnlinkTagFromTrip.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', tagId: '5' },
      });

      await tagController.unlinkTagFromTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUnlinkTagFromTrip).toHaveBeenCalledWith(testUsers.user1.id, 10, 5);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Unlink failed');
      mockUnlinkTagFromTrip.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', tagId: '5' },
      });

      await tagController.unlinkTagFromTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate error for invalid tripId param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: 'abc', tagId: '5' },
      });

      await tagController.unlinkTagFromTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockUnlinkTagFromTrip).not.toHaveBeenCalled();
    });
  });

  describe('getTagsByTrip', () => {
    it('should return tags for a trip with 200', async () => {
      const mockTags = [
        { id: 1, name: 'Beach' },
        { id: 2, name: 'Mountain' },
      ];
      mockGetTagsByTrip.mockResolvedValue(mockTags);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
      });

      await tagController.getTagsByTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetTagsByTrip).toHaveBeenCalledWith(testUsers.user1.id, 10);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockTags,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetTagsByTrip.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
      });

      await tagController.getTagsByTrip(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
