import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { activityController } from '../controllers/activity.controller';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/activities:
 *   post:
 *     summary: Create a new activity
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, name]
 *             properties:
 *               tripId:
 *                 type: integer
 *               parentId:
 *                 type: integer
 *                 description: Parent activity ID for nested activities
 *               locationId:
 *                 type: integer
 *                 nullable: true
 *                 description: Location (of the same trip) the activity is at; null clears it
 *               name:
 *                 type: string
 *                 maxLength: 500
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 maxLength: 100
 *               allDay:
 *                 type: boolean
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *                 maxLength: 100
 *               cost:
 *                 type: number
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *               bookingUrl:
 *                 type: string
 *                 format: uri
 *                 maxLength: 500
 *               bookingReference:
 *                 type: string
 *                 maxLength: 255
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Activity created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', activityController.createActivity);

/**
 * @openapi
 * /api/activities/trip/{tripId}:
 *   get:
 *     summary: Get all activities for a trip
 *     tags: [Activities]
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
 *         description: List of activities for the trip
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found
 */
router.get('/trip/:tripId', activityController.getActivitiesByTrip);

/**
 * @openapi
 * /api/activities/{id}:
 *   get:
 *     summary: Get an activity by ID
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The activity ID
 *     responses:
 *       200:
 *         description: Activity details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Activity not found
 *   put:
 *     summary: Update an activity
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The activity ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentId:
 *                 type: integer
 *               locationId:
 *                 type: integer
 *                 nullable: true
 *                 description: Location (of the same trip) the activity is at; null clears it
 *               name:
 *                 type: string
 *                 maxLength: 500
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 maxLength: 100
 *               allDay:
 *                 type: boolean
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *                 maxLength: 100
 *               cost:
 *                 type: number
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *               bookingUrl:
 *                 type: string
 *                 format: uri
 *                 maxLength: 500
 *               bookingReference:
 *                 type: string
 *                 maxLength: 255
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Activity updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Activity not found
 *   delete:
 *     summary: Delete an activity
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The activity ID
 *     responses:
 *       200:
 *         description: Activity deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Activity not found
 */
router.get('/:id', activityController.getActivityById);
router.put('/:id', activityController.updateActivity);
router.delete('/:id', activityController.deleteActivity);

/**
 * @openapi
 * /api/activities/trip/{tripId}/bulk:
 *   delete:
 *     summary: Bulk delete activities
 *     tags: [Activities]
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
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of activity IDs to delete
 *     responses:
 *       200:
 *         description: Activities deleted successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more activities not found
 *   patch:
 *     summary: Bulk update activities
 *     tags: [Activities]
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
 *             required: [ids, updates]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of activity IDs to update
 *               updates:
 *                 type: object
 *                 properties:
 *                   category:
 *                     type: string
 *                   notes:
 *                     type: string
 *                   timezone:
 *                     type: string
 *     responses:
 *       200:
 *         description: Activities updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more activities not found
 */
router.delete('/trip/:tripId/bulk', activityController.bulkDeleteActivities);
router.patch('/trip/:tripId/bulk', activityController.bulkUpdateActivities);

export default router;
