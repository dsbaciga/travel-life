import { Router } from 'express';
import { lodgingController } from '../controllers/lodging.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/lodging:
 *   post:
 *     summary: Create a new lodging
 *     tags: [Lodging]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, type, name]
 *             properties:
 *               tripId:
 *                 type: integer
 *               locationId:
 *                 type: integer
 *                 nullable: true
 *                 description: Location (of the same trip) the stay is at; null clears it
 *               type:
 *                 type: string
 *                 enum: [hotel, hostel, airbnb, vacation_rental, camping, resort, motel, bed_and_breakfast, apartment, friends_family, other]
 *               name:
 *                 type: string
 *                 maxLength: 500
 *               address:
 *                 type: string
 *                 maxLength: 1000
 *               checkInDate:
 *                 type: string
 *                 format: date-time
 *               checkOutDate:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *                 maxLength: 100
 *               confirmationNumber:
 *                 type: string
 *                 maxLength: 100
 *               cost:
 *                 type: number
 *                 minimum: 0
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *               bookingUrl:
 *                 type: string
 *                 format: uri
 *                 maxLength: 1000
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       201:
 *         description: Lodging created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', lodgingController.createLodging);

/**
 * @openapi
 * /api/lodging/trip/{tripId}:
 *   get:
 *     summary: Get all lodging for a trip
 *     tags: [Lodging]
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
 *         description: List of lodging for the trip
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found
 */
router.get('/trip/:tripId', lodgingController.getLodgingByTrip);

/**
 * @openapi
 * /api/lodging/trip/{tripId}/bulk:
 *   delete:
 *     summary: Bulk delete lodging
 *     tags: [Lodging]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
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
 *     responses:
 *       200:
 *         description: Lodging deleted successfully
 *   patch:
 *     summary: Bulk update lodging
 *     tags: [Lodging]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
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
 *               updates:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                   notes:
 *                     type: string
 *     responses:
 *       200:
 *         description: Lodging updated successfully
 */
router.delete('/trip/:tripId/bulk', lodgingController.bulkDeleteLodging);
router.patch('/trip/:tripId/bulk', lodgingController.bulkUpdateLodging);

/**
 * @openapi
 * /api/lodging/{id}:
 *   get:
 *     summary: Get lodging by ID
 *     tags: [Lodging]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The lodging ID
 *     responses:
 *       200:
 *         description: Lodging details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Lodging not found
 *   put:
 *     summary: Update lodging
 *     tags: [Lodging]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The lodging ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [hotel, hostel, airbnb, vacation_rental, camping, resort, motel, bed_and_breakfast, apartment, friends_family, other]
 *               name:
 *                 type: string
 *                 maxLength: 500
 *               address:
 *                 type: string
 *                 maxLength: 1000
 *               checkInDate:
 *                 type: string
 *                 format: date-time
 *               checkOutDate:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *                 maxLength: 100
 *               confirmationNumber:
 *                 type: string
 *                 maxLength: 100
 *               cost:
 *                 type: number
 *                 minimum: 0
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *               bookingUrl:
 *                 type: string
 *                 format: uri
 *                 maxLength: 1000
 *               notes:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Lodging updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Lodging not found
 *   delete:
 *     summary: Delete lodging
 *     tags: [Lodging]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The lodging ID
 *     responses:
 *       200:
 *         description: Lodging deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Lodging not found
 */
router.get('/:id', lodgingController.getLodgingById);
router.put('/:id', lodgingController.updateLodging);
router.delete('/:id', lodgingController.deleteLodging);

export default router;
