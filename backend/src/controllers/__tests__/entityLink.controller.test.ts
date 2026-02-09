/**
 * EntityLink Controller Tests
 *
 * Tests for all entityLink controller methods:
 * - createLink: POST - validates body merged with tripId, calls entityLinkService.createLink, returns 201
 * - bulkCreateLinks: POST - validates body merged with tripId, calls entityLinkService.bulkCreateLinks, returns 201
 * - bulkLinkPhotos: POST - validates body merged with tripId, calls entityLinkService.bulkLinkPhotos, returns 201
 * - getLinksFrom: GET - parses params/query, calls entityLinkService.getLinksFrom, returns 200
 * - getLinksTo: GET - parses params/query, calls entityLinkService.getLinksTo, returns 200
 * - getAllLinksForEntity: GET - parses params, calls entityLinkService.getAllLinksForEntity, returns 200
 * - getPhotosForEntity: GET - parses params, calls entityLinkService.getPhotosForEntity, returns 200
 * - getLinksByTargetType: GET - parses params, calls entityLinkService.getLinksByTargetType, returns 200
 * - getTripLinkSummary: GET - parses tripId, calls entityLinkService.getTripLinkSummary, returns 200
 * - deleteLink: DELETE - validates body merged with tripId, calls entityLinkService.deleteLink, returns 204
 * - deleteLinkById: DELETE - parses tripId/linkId, calls entityLinkService.deleteLinkById, returns 204
 * - updateLink: PATCH - parses tripId/linkId, validates body, calls entityLinkService.updateLink, returns 200
 * - deleteAllLinksForEntity: DELETE - parses params, calls entityLinkService.deleteAllLinksForEntity, returns 200
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the entityLink service module
const mockCreateLink = jest.fn();
const mockBulkCreateLinks = jest.fn();
const mockBulkLinkPhotos = jest.fn();
const mockGetLinksFrom = jest.fn();
const mockGetLinksTo = jest.fn();
const mockGetAllLinksForEntity = jest.fn();
const mockGetPhotosForEntity = jest.fn();
const mockGetLinksByTargetType = jest.fn();
const mockGetTripLinkSummary = jest.fn();
const mockDeleteLink = jest.fn();
const mockDeleteLinkById = jest.fn();
const mockUpdateLink = jest.fn();
const mockDeleteAllLinksForEntity = jest.fn();

jest.mock('../../services/entityLink.service', () => ({
  entityLinkService: {
    createLink: (...args: unknown[]) => mockCreateLink(...args),
    bulkCreateLinks: (...args: unknown[]) => mockBulkCreateLinks(...args),
    bulkLinkPhotos: (...args: unknown[]) => mockBulkLinkPhotos(...args),
    getLinksFrom: (...args: unknown[]) => mockGetLinksFrom(...args),
    getLinksTo: (...args: unknown[]) => mockGetLinksTo(...args),
    getAllLinksForEntity: (...args: unknown[]) => mockGetAllLinksForEntity(...args),
    getPhotosForEntity: (...args: unknown[]) => mockGetPhotosForEntity(...args),
    getLinksByTargetType: (...args: unknown[]) => mockGetLinksByTargetType(...args),
    getTripLinkSummary: (...args: unknown[]) => mockGetTripLinkSummary(...args),
    deleteLink: (...args: unknown[]) => mockDeleteLink(...args),
    deleteLinkById: (...args: unknown[]) => mockDeleteLinkById(...args),
    updateLink: (...args: unknown[]) => mockUpdateLink(...args),
    deleteAllLinksForEntity: (...args: unknown[]) => mockDeleteAllLinksForEntity(...args),
  },
}));

import { entityLinkController } from '../entityLink.controller';
import { createAuthenticatedControllerArgs } from '../../__tests__/helpers/requests';
import { testUsers } from '../../__tests__/fixtures/users';
import { Request, Response, NextFunction } from 'express';

describe('EntityLink Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLink', () => {
    it('should create a link and return 201', async () => {
      const mockLink = {
        id: 1,
        tripId: 10,
        sourceType: 'PHOTO',
        sourceId: 1,
        targetType: 'LOCATION',
        targetId: 2,
        relationship: 'TAKEN_AT',
      };
      mockCreateLink.mockResolvedValue(mockLink);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
        body: {
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
          targetId: 2,
          relationship: 'TAKEN_AT',
        },
      });

      await entityLinkController.createLink(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockCreateLink).toHaveBeenCalledWith(testUsers.user1.id, expect.objectContaining({
        tripId: 10,
        sourceType: 'PHOTO',
        sourceId: 1,
        targetType: 'LOCATION',
        targetId: 2,
        relationship: 'TAKEN_AT',
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLink,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Database error');
      mockCreateLink.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
        body: {
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
          targetId: 2,
        },
      });

      await entityLinkController.createLink(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate error for invalid tripId param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: 'abc' },
        body: {
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
          targetId: 2,
        },
      });

      await entityLinkController.createLink(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockCreateLink).not.toHaveBeenCalled();
    });
  });

  describe('bulkCreateLinks', () => {
    it('should bulk create links and return 201', async () => {
      const mockResult = { created: 3 };
      mockBulkCreateLinks.mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
        body: {
          sourceType: 'LOCATION',
          sourceId: 1,
          targets: [
            { targetType: 'PHOTO', targetId: 1 },
            { targetType: 'PHOTO', targetId: 2 },
            { targetType: 'ACTIVITY', targetId: 3 },
          ],
        },
      });

      await entityLinkController.bulkCreateLinks(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockBulkCreateLinks).toHaveBeenCalledWith(testUsers.user1.id, expect.objectContaining({
        tripId: 10,
        sourceType: 'LOCATION',
        sourceId: 1,
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Bulk create failed');
      mockBulkCreateLinks.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
        body: {
          sourceType: 'LOCATION',
          sourceId: 1,
          targets: [{ targetType: 'PHOTO', targetId: 1 }],
        },
      });

      await entityLinkController.bulkCreateLinks(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('bulkLinkPhotos', () => {
    it('should bulk link photos and return 201', async () => {
      const mockResult = { created: 2 };
      mockBulkLinkPhotos.mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
        body: {
          photoIds: [1, 2],
          targetType: 'LOCATION',
          targetId: 5,
        },
      });

      await entityLinkController.bulkLinkPhotos(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockBulkLinkPhotos).toHaveBeenCalledWith(testUsers.user1.id, expect.objectContaining({
        tripId: 10,
        photoIds: [1, 2],
        targetType: 'LOCATION',
        targetId: 5,
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Bulk photo link failed');
      mockBulkLinkPhotos.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
        body: {
          photoIds: [1],
          targetType: 'LOCATION',
          targetId: 5,
        },
      });

      await entityLinkController.bulkLinkPhotos(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getLinksFrom', () => {
    it('should return links from an entity with 200', async () => {
      const mockLinks = [
        { id: 1, sourceType: 'LOCATION', sourceId: 1, targetType: 'PHOTO', targetId: 2 },
      ];
      mockGetLinksFrom.mockResolvedValue(mockLinks);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.getLinksFrom(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetLinksFrom).toHaveBeenCalledWith(testUsers.user1.id, {
        tripId: 10,
        sourceType: 'LOCATION',
        sourceId: 1,
        targetType: undefined,
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLinks,
      });
    });

    it('should pass targetType from query if provided', async () => {
      mockGetLinksFrom.mockResolvedValue([]);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
        query: { targetType: 'PHOTO' },
      });

      await entityLinkController.getLinksFrom(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetLinksFrom).toHaveBeenCalledWith(testUsers.user1.id, {
        tripId: 10,
        sourceType: 'LOCATION',
        sourceId: 1,
        targetType: 'PHOTO',
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetLinksFrom.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.getLinksFrom(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getLinksTo', () => {
    it('should return links to an entity with 200', async () => {
      const mockLinks = [
        { id: 1, sourceType: 'PHOTO', sourceId: 2, targetType: 'LOCATION', targetId: 1 },
      ];
      mockGetLinksTo.mockResolvedValue(mockLinks);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.getLinksTo(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetLinksTo).toHaveBeenCalledWith(testUsers.user1.id, {
        tripId: 10,
        targetType: 'LOCATION',
        targetId: 1,
        sourceType: undefined,
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLinks,
      });
    });

    it('should pass sourceType from query if provided', async () => {
      mockGetLinksTo.mockResolvedValue([]);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
        query: { sourceType: 'PHOTO' },
      });

      await entityLinkController.getLinksTo(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetLinksTo).toHaveBeenCalledWith(testUsers.user1.id, {
        tripId: 10,
        targetType: 'LOCATION',
        targetId: 1,
        sourceType: 'PHOTO',
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetLinksTo.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.getLinksTo(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getAllLinksForEntity', () => {
    it('should return all links for an entity with 200', async () => {
      const mockResult = { from: [], to: [] };
      mockGetAllLinksForEntity.mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.getAllLinksForEntity(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetAllLinksForEntity).toHaveBeenCalledWith(
        testUsers.user1.id,
        10,
        'LOCATION',
        1,
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetAllLinksForEntity.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.getAllLinksForEntity(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getPhotosForEntity', () => {
    it('should return photos for an entity with 200', async () => {
      const mockPhotos = [{ id: 1, filename: 'photo.jpg' }];
      mockGetPhotosForEntity.mockResolvedValue(mockPhotos);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.getPhotosForEntity(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetPhotosForEntity).toHaveBeenCalledWith(
        testUsers.user1.id,
        10,
        'LOCATION',
        1,
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockPhotos,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetPhotosForEntity.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.getPhotosForEntity(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getLinksByTargetType', () => {
    it('should return links by target type with 200', async () => {
      const mockLinks = [{ id: 1, targetType: 'PHOTO' }];
      mockGetLinksByTargetType.mockResolvedValue(mockLinks);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', targetType: 'PHOTO' },
      });

      await entityLinkController.getLinksByTargetType(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetLinksByTargetType).toHaveBeenCalledWith(
        testUsers.user1.id,
        10,
        'PHOTO',
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLinks,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Fetch failed');
      mockGetLinksByTargetType.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', targetType: 'PHOTO' },
      });

      await entityLinkController.getLinksByTargetType(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getTripLinkSummary', () => {
    it('should return trip link summary with Map converted to object', async () => {
      const summaryMap = new Map();
      summaryMap.set('LOCATION:1', { entityType: 'LOCATION', entityId: 1, totalLinks: 3 });
      summaryMap.set('PHOTO:2', { entityType: 'PHOTO', entityId: 2, totalLinks: 1 });
      mockGetTripLinkSummary.mockResolvedValue(summaryMap);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
      });

      await entityLinkController.getTripLinkSummary(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockGetTripLinkSummary).toHaveBeenCalledWith(testUsers.user1.id, 10);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          'LOCATION:1': { entityType: 'LOCATION', entityId: 1, totalLinks: 3 },
          'PHOTO:2': { entityType: 'PHOTO', entityId: 2, totalLinks: 1 },
        },
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Summary failed');
      mockGetTripLinkSummary.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
      });

      await entityLinkController.getTripLinkSummary(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteLink', () => {
    it('should delete a link and return 204', async () => {
      mockDeleteLink.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
        body: {
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
          targetId: 2,
        },
      });

      await entityLinkController.deleteLink(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockDeleteLink).toHaveBeenCalledWith(testUsers.user1.id, expect.objectContaining({
        tripId: 10,
        sourceType: 'PHOTO',
        sourceId: 1,
        targetType: 'LOCATION',
        targetId: 2,
      }));
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      mockDeleteLink.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10' },
        body: {
          sourceType: 'PHOTO',
          sourceId: 1,
          targetType: 'LOCATION',
          targetId: 2,
        },
      });

      await entityLinkController.deleteLink(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteLinkById', () => {
    it('should delete a link by id and return 204', async () => {
      mockDeleteLinkById.mockResolvedValue(undefined);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', linkId: '5' },
      });

      await entityLinkController.deleteLinkById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockDeleteLinkById).toHaveBeenCalledWith(testUsers.user1.id, 10, 5);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete failed');
      mockDeleteLinkById.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', linkId: '5' },
      });

      await entityLinkController.deleteLinkById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate error for invalid linkId param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', linkId: 'abc' },
      });

      await entityLinkController.deleteLinkById(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockDeleteLinkById).not.toHaveBeenCalled();
    });
  });

  describe('updateLink', () => {
    it('should update a link and return 200', async () => {
      const mockLink = { id: 5, relationship: 'TAKEN_AT', notes: 'Updated note' };
      mockUpdateLink.mockResolvedValue(mockLink);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', linkId: '5' },
        body: { relationship: 'TAKEN_AT', notes: 'Updated note' },
      });

      await entityLinkController.updateLink(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockUpdateLink).toHaveBeenCalledWith(testUsers.user1.id, 10, 5, {
        relationship: 'TAKEN_AT',
        notes: 'Updated note',
      });
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockLink,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Update failed');
      mockUpdateLink.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', linkId: '5' },
        body: { relationship: 'RELATED' },
      });

      await entityLinkController.updateLink(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteAllLinksForEntity', () => {
    it('should delete all links for an entity and return 200', async () => {
      const mockResult = { deleted: 5 };
      mockDeleteAllLinksForEntity.mockResolvedValue(mockResult);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.deleteAllLinksForEntity(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(mockDeleteAllLinksForEntity).toHaveBeenCalledWith(
        testUsers.user1.id,
        10,
        'LOCATION',
        1,
      );
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: mockResult,
      });
    });

    it('should propagate service errors via next', async () => {
      const error = new Error('Delete all failed');
      mockDeleteAllLinksForEntity.mockRejectedValue(error);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'LOCATION', entityId: '1' },
      });

      await entityLinkController.deleteAllLinksForEntity(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should propagate error for invalid entityType param', async () => {
      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1, {
        params: { tripId: '10', entityType: 'INVALID_TYPE', entityId: '1' },
      });

      await entityLinkController.deleteAllLinksForEntity(req as unknown as Request, res as unknown as Response, next as NextFunction);

      expect(next).toHaveBeenCalled();
      expect(mockDeleteAllLinksForEntity).not.toHaveBeenCalled();
    });
  });
});
