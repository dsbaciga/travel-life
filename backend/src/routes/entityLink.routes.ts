import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { entityLinkController } from '../controllers/entityLink.controller';
import { photoAutoLinkController } from '../controllers/photoAutoLink.controller';

const router = Router({ mergeParams: true }); // mergeParams to access :tripId from parent

// All routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/trips/{tripId}/links:
 *   post:
 *     summary: Create a link between two entities
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, sourceType, sourceId, targetType, targetId]
 *             properties:
 *               tripId:
 *                 type: integer
 *               sourceType:
 *                 type: string
 *                 enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *               sourceId:
 *                 type: integer
 *               targetType:
 *                 type: string
 *                 enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *               targetId:
 *                 type: integer
 *               relationship:
 *                 type: string
 *                 enum: [RELATED, TAKEN_AT, OCCURRED_AT, PART_OF, DOCUMENTS, FEATURED_IN]
 *                 default: RELATED
 *               sortOrder:
 *                 type: integer
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       201:
 *         description: Link created successfully
 *       400:
 *         description: Validation error or link already exists
 *       401:
 *         description: Unauthorized
 */
router.post('/', entityLinkController.createLink);

/**
 * @openapi
 * /api/trips/{tripId}/links/bulk:
 *   post:
 *     summary: Create multiple links from one source to many targets
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, sourceType, sourceId, targets]
 *             properties:
 *               tripId:
 *                 type: integer
 *               sourceType:
 *                 type: string
 *                 enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *               sourceId:
 *                 type: integer
 *               targets:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required: [targetType, targetId]
 *                   properties:
 *                     targetType:
 *                       type: string
 *                       enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *                     targetId:
 *                       type: integer
 *                     relationship:
 *                       type: string
 *                       enum: [RELATED, TAKEN_AT, OCCURRED_AT, PART_OF, DOCUMENTS, FEATURED_IN]
 *                     sortOrder:
 *                       type: integer
 *                     notes:
 *                       type: string
 *                       maxLength: 1000
 *     responses:
 *       201:
 *         description: Links created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/bulk', entityLinkController.bulkCreateLinks);

/**
 * @openapi
 * /api/trips/{tripId}/links/photos:
 *   post:
 *     summary: Link multiple photos to a target entity
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, photoIds, targetType, targetId]
 *             properties:
 *               tripId:
 *                 type: integer
 *               photoIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: integer
 *               targetType:
 *                 type: string
 *                 enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *               targetId:
 *                 type: integer
 *               relationship:
 *                 type: string
 *                 enum: [RELATED, TAKEN_AT, OCCURRED_AT, PART_OF, DOCUMENTS, FEATURED_IN]
 *     responses:
 *       201:
 *         description: Photos linked successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/photos', entityLinkController.bulkLinkPhotos);

/**
 * @openapi
 * /api/trips/{tripId}/links/photos/activity-suggestions:
 *   get:
 *     summary: Suggest an activity for each unlinked photo, by capture time
 *     description: >
 *       Matches every photo that is not linked to an activity yet against the trip's
 *       activities. A photo taken during an activity matches it; failing that, one
 *       taken within 30 minutes of it; failing that, an all-day activity on the same
 *       date. Activities with a start but no end are assumed to last 2 hours. Nothing
 *       is linked: apply the reviewed result with the POST on this path.
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     responses:
 *       200:
 *         description: Suggestions in itinerary order, with counts of what was skipped
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           activity:
 *                             type: object
 *                           photoIds:
 *                             type: array
 *                             items:
 *                               type: integer
 *                           previewPhotos:
 *                             type: array
 *                             items:
 *                               type: object
 *                           matchCounts:
 *                             type: object
 *                             properties:
 *                               during:
 *                                 type: integer
 *                               near:
 *                                 type: integer
 *                               same_day:
 *                                 type: integer
 *                           firstTakenAt:
 *                             type: string
 *                             format: date-time
 *                           lastTakenAt:
 *                             type: string
 *                             format: date-time
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalPhotos:
 *                           type: integer
 *                         matchedPhotos:
 *                           type: integer
 *                         alreadyLinkedPhotos:
 *                           type: integer
 *                         photosWithoutTime:
 *                           type: integer
 *                         unmatchedPhotos:
 *                           type: integer
 *                         activitiesWithoutTime:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found or access denied
 *   post:
 *     summary: Link reviewed photos to their activities
 *     description: >
 *       Creates a PHOTO to ACTIVITY link for every pair given. Pairs that are already
 *       linked (from either end) are skipped, so the call is safe to repeat.
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [links]
 *             properties:
 *               links:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 500
 *                 items:
 *                   type: object
 *                   required: [activityId, photoIds]
 *                   properties:
 *                     activityId:
 *                       type: integer
 *                     photoIds:
 *                       type: array
 *                       minItems: 1
 *                       maxItems: 5000
 *                       items:
 *                         type: integer
 *     responses:
 *       201:
 *         description: Links created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     created:
 *                       type: integer
 *                     skipped:
 *                       type: integer
 *       400:
 *         description: Validation error, or an id that is not in this trip
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found or access denied
 */
router.get('/photos/activity-suggestions', photoAutoLinkController.getActivitySuggestions);
router.post('/photos/activity-suggestions', photoAutoLinkController.applyActivityLinks);

/**
 * @openapi
 * /api/trips/{tripId}/links/cleanup-orphans:
 *   post:
 *     summary: Clean up orphaned entity links
 *     description: >
 *       Removes EntityLinks where the source or target entity no longer exists.
 *       This is a safety net for any deletion paths that might have missed cleanup.
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     responses:
 *       200:
 *         description: Orphaned links cleaned up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.post('/cleanup-orphans', entityLinkController.cleanupOrphans);

/**
 * @openapi
 * /api/trips/{tripId}/links/summary:
 *   get:
 *     summary: Get link summary for the entire trip
 *     description: Returns counts of links grouped by entity type
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     responses:
 *       200:
 *         description: Trip link summary
 *       401:
 *         description: Unauthorized
 */
router.get('/summary', entityLinkController.getTripLinkSummary);

/**
 * @openapi
 * /api/trips/{tripId}/links/target-type/{targetType}:
 *   get:
 *     summary: Get all links to a specific target type
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: targetType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *         description: The target entity type
 *     responses:
 *       200:
 *         description: List of links to the specified target type
 *       401:
 *         description: Unauthorized
 */
router.get('/target-type/:targetType', entityLinkController.getLinksByTargetType);

/**
 * @openapi
 * /api/trips/{tripId}/links/from/{entityType}/{entityId}:
 *   get:
 *     summary: Get all links from a specific entity
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *         description: The source entity type
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The source entity ID
 *     responses:
 *       200:
 *         description: List of links from the entity
 *       401:
 *         description: Unauthorized
 */
router.get('/from/:entityType/:entityId', entityLinkController.getLinksFrom);

/**
 * @openapi
 * /api/trips/{tripId}/links/to/{entityType}/{entityId}:
 *   get:
 *     summary: Get all links to a specific entity
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *         description: The target entity type
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The target entity ID
 *     responses:
 *       200:
 *         description: List of links to the entity
 *       401:
 *         description: Unauthorized
 */
router.get('/to/:entityType/:entityId', entityLinkController.getLinksTo);

/**
 * @openapi
 * /api/trips/{tripId}/links/entity/{entityType}/{entityId}:
 *   get:
 *     summary: Get all links for an entity (both directions)
 *     description: Returns links where the entity is either source or target
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *         description: The entity type
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The entity ID
 *     responses:
 *       200:
 *         description: All links involving the entity
 *       401:
 *         description: Unauthorized
 */
router.get('/entity/:entityType/:entityId', entityLinkController.getAllLinksForEntity);

/**
 * @openapi
 * /api/trips/{tripId}/links/photos/{entityType}/{entityId}:
 *   get:
 *     summary: Get all photos linked to an entity
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *         description: The entity type
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The entity ID
 *     responses:
 *       200:
 *         description: List of photos linked to the entity
 *       401:
 *         description: Unauthorized
 */
router.get('/photos/:entityType/:entityId', entityLinkController.getPhotosForEntity);

/**
 * @openapi
 * /api/trips/{tripId}/links/{linkId}:
 *   patch:
 *     summary: Update a link's relationship or notes
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The link ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               relationship:
 *                 type: string
 *                 enum: [RELATED, TAKEN_AT, OCCURRED_AT, PART_OF, DOCUMENTS, FEATURED_IN]
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       200:
 *         description: Link updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Link not found
 *   delete:
 *     summary: Delete a link by ID
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The link ID
 *     responses:
 *       200:
 *         description: Link deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Link not found
 */
router.patch('/:linkId', entityLinkController.updateLink);

// Note: More specific routes must come before parameterized routes

/**
 * @openapi
 * /api/trips/{tripId}/links/entity/{entityType}/{entityId}:
 *   delete:
 *     summary: Delete all links for an entity
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *         description: The entity type
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The entity ID
 *     responses:
 *       200:
 *         description: All links for entity deleted
 *       401:
 *         description: Unauthorized
 */
router.delete('/entity/:entityType/:entityId', entityLinkController.deleteAllLinksForEntity);

router.delete('/:linkId', entityLinkController.deleteLinkById);

/**
 * @openapi
 * /api/trips/{tripId}/links:
 *   delete:
 *     summary: Delete a specific link by source and target
 *     tags: [Entity Links]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, sourceType, sourceId, targetType, targetId]
 *             properties:
 *               tripId:
 *                 type: integer
 *               sourceType:
 *                 type: string
 *                 enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *               sourceId:
 *                 type: integer
 *               targetType:
 *                 type: string
 *                 enum: [PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM]
 *               targetId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Link deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Link not found
 */
router.delete('/', entityLinkController.deleteLink);

export default router;
