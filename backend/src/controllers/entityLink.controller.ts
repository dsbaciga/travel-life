import { Request, Response } from 'express';
import { entityLinkService, cleanupOrphanedEntityLinks } from '../services/entityLink.service';
import {
  createEntityLinkSchema,
  bulkCreateEntityLinksSchema,
  deleteEntityLinkSchema,
  updateEntityLinkSchema,
  bulkLinkPhotosSchema,
  entityTypeEnum,
  type EntityLinkSummary,
} from '../types/entityLink.types';
import { asyncHandler } from '../utils/asyncHandler';
import { parseId } from '../utils/parseId';
import { requireUserId } from '../utils/controllerHelpers';
import { verifyTripAccessWithPermission } from '../utils/serviceHelpers';

export const entityLinkController = {
  /**
   * Create a single link between two entities
   * POST /api/trips/:tripId/links
   */
  createLink: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const data = createEntityLinkSchema.parse({ ...req.body, tripId });
    const link = await entityLinkService.createLink(userId, data);
    res.status(201).json({ status: 'success', data: link });
  }),

  /**
   * Bulk create links from one source to multiple targets
   * POST /api/trips/:tripId/links/bulk
   */
  bulkCreateLinks: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const data = bulkCreateEntityLinksSchema.parse({ ...req.body, tripId });
    const result = await entityLinkService.bulkCreateLinks(userId, data);
    res.status(201).json({ status: 'success', data: result });
  }),

  /**
   * Bulk link multiple photos to a single target
   * POST /api/trips/:tripId/links/photos
   */
  bulkLinkPhotos: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const data = bulkLinkPhotosSchema.parse({ ...req.body, tripId });
    const result = await entityLinkService.bulkLinkPhotos(userId, data);
    res.status(201).json({ status: 'success', data: result });
  }),

  /**
   * Get links from a specific entity
   * GET /api/trips/:tripId/links/from/:entityType/:entityId
   */
  getLinksFrom: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const sourceType = entityTypeEnum.parse(req.params.entityType);
    const sourceId = parseId(req.params.entityId, 'entityId');
    const targetType = req.query.targetType
      ? entityTypeEnum.parse(req.query.targetType)
      : undefined;

    const links = await entityLinkService.getLinksFrom(userId, {
      tripId,
      sourceType,
      sourceId,
      targetType,
    });
    res.json({ status: 'success', data: links });
  }),

  /**
   * Get links to a specific entity
   * GET /api/trips/:tripId/links/to/:entityType/:entityId
   */
  getLinksTo: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const targetType = entityTypeEnum.parse(req.params.entityType);
    const targetId = parseId(req.params.entityId, 'entityId');
    const sourceType = req.query.sourceType
      ? entityTypeEnum.parse(req.query.sourceType)
      : undefined;

    const links = await entityLinkService.getLinksTo(userId, {
      tripId,
      targetType,
      targetId,
      sourceType,
    });
    res.json({ status: 'success', data: links });
  }),

  /**
   * Get all links for an entity (both directions)
   * GET /api/trips/:tripId/links/entity/:entityType/:entityId
   */
  getAllLinksForEntity: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const entityType = entityTypeEnum.parse(req.params.entityType);
    const entityId = parseId(req.params.entityId, 'entityId');

    const result = await entityLinkService.getAllLinksForEntity(
      userId,
      tripId,
      entityType,
      entityId
    );
    res.json({ status: 'success', data: result });
  }),

  /**
   * Get photos linked to an entity
   * GET /api/trips/:tripId/links/photos/:entityType/:entityId
   */
  getPhotosForEntity: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const entityType = entityTypeEnum.parse(req.params.entityType);
    const entityId = parseId(req.params.entityId, 'entityId');

    const photos = await entityLinkService.getPhotosForEntity(
      userId,
      tripId,
      entityType,
      entityId
    );
    res.json({ status: 'success', data: photos });
  }),

  /**
   * Get all links targeting a specific entity type
   * GET /api/trips/:tripId/links/target-type/:targetType
   */
  getLinksByTargetType: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const targetType = entityTypeEnum.parse(req.params.targetType);

    const links = await entityLinkService.getLinksByTargetType(
      userId,
      tripId,
      targetType
    );
    res.json({ status: 'success', data: links });
  }),

  /**
   * Get link summary for entire trip
   * GET /api/trips/:tripId/links/summary
   */
  getTripLinkSummary: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');

    const summaryMap = await entityLinkService.getTripLinkSummary(userId, tripId);

    // Convert Map to object for JSON response
    const summary: Record<string, EntityLinkSummary> = {};
    summaryMap.forEach((value, key) => {
      summary[key] = value;
    });

    res.json({ status: 'success', data: summary });
  }),

  /**
   * Delete a specific link by source/target
   * DELETE /api/trips/:tripId/links
   */
  deleteLink: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const data = deleteEntityLinkSchema.parse({ ...req.body, tripId });
    await entityLinkService.deleteLink(userId, data);
    res.status(200).json({ status: 'success', message: 'Entity link deleted' });
  }),

  /**
   * Delete a link by ID
   * DELETE /api/trips/:tripId/links/:linkId
   */
  deleteLinkById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const linkId = parseId(req.params.linkId, 'linkId');
    await entityLinkService.deleteLinkById(userId, tripId, linkId);
    res.status(200).json({ status: 'success', message: 'Entity link deleted' });
  }),

  /**
   * Update a link (relationship and/or notes)
   * PATCH /api/trips/:tripId/links/:linkId
   */
  updateLink: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const linkId = parseId(req.params.linkId, 'linkId');
    const data = updateEntityLinkSchema.parse(req.body);
    const link = await entityLinkService.updateLink(userId, tripId, linkId, data);
    res.json({ status: 'success', data: link });
  }),

  /**
   * Delete all links for an entity
   * DELETE /api/trips/:tripId/links/entity/:entityType/:entityId
   */
  deleteAllLinksForEntity: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const entityType = entityTypeEnum.parse(req.params.entityType);
    const entityId = parseId(req.params.entityId, 'entityId');

    const result = await entityLinkService.deleteAllLinksForEntity(
      userId,
      tripId,
      entityType,
      entityId
    );
    res.json({ status: 'success', data: result });
  }),

  /**
   * Clean up orphaned entity links for a trip
   * POST /api/trips/:tripId/links/cleanup-orphans
   */
  cleanupOrphans: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');

    // Verify user has edit permission on the trip
    await verifyTripAccessWithPermission(userId, tripId, 'edit');

    const deletedCount = await cleanupOrphanedEntityLinks(tripId);
    res.json({ status: 'success', data: { deletedCount } });
  }),
};
