import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tagController } from '../controllers/tag.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/tags:
 *   post:
 *     summary: Create a new tag
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               color:
 *                 type: string
 *                 description: Hex color code (e.g., #FF5733)
 *     responses:
 *       201:
 *         description: Tag created successfully
 *       400:
 *         description: Validation error or tag already exists
 *       401:
 *         description: Unauthorized
 *   get:
 *     summary: Get all tags for the current user
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's tags
 *       401:
 *         description: Unauthorized
 */
router.post('/', tagController.createTag);
router.get('/', tagController.getTagsByUser);
router.put('/reorder', tagController.reorderTags);

/**
 * @openapi
 * /api/tags/{id}:
 *   get:
 *     summary: Get a tag by ID
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The tag ID
 *     responses:
 *       200:
 *         description: Tag details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tag not found
 *   put:
 *     summary: Update a tag
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The tag ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               color:
 *                 type: string
 *                 description: Hex color code (e.g., #FF5733)
 *     responses:
 *       200:
 *         description: Tag updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tag not found
 *   delete:
 *     summary: Delete a tag
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The tag ID
 *     responses:
 *       200:
 *         description: Tag deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tag not found
 */
router.get('/:id', tagController.getTagById);
router.put('/:id', tagController.updateTag);
router.delete('/:id', tagController.deleteTag);

// NOTE: Trip-tag association routes use paths like /trips/:tripId/tags/:tagId.
// Since this router is mounted at /api/tags, the full paths become
// /api/tags/trips/:tripId/tags/:tagId, which reads oddly with "tags" appearing
// twice. However, changing these routes would be a breaking API change for the
// frontend, so the current structure is intentionally preserved.

/**
 * @openapi
 * /api/tags/link:
 *   post:
 *     summary: Link a tag to a trip
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, tagId]
 *             properties:
 *               tripId:
 *                 type: integer
 *               tagId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Tag linked to trip successfully
 *       400:
 *         description: Validation error or tag already linked
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip or tag not found
 */
router.post('/link', tagController.linkTagToTrip);

/**
 * @openapi
 * /api/tags/trips/{tripId}/tags/{tagId}:
 *   delete:
 *     summary: Unlink a tag from a trip
 *     tags: [Tags]
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
 *         name: tagId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The tag ID
 *     responses:
 *       200:
 *         description: Tag unlinked from trip successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip-tag link not found
 */
router.delete('/trips/:tripId/tags/:tagId', tagController.unlinkTagFromTrip);

/**
 * @openapi
 * /api/tags/trips/{tripId}:
 *   get:
 *     summary: Get all tags for a specific trip
 *     tags: [Tags]
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
 *         description: List of tags for the trip
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found
 */
router.get('/trips/:tripId', tagController.getTagsByTrip);

export default router;
