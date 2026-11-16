import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tripStopController } from '../controllers/tripStop.controller';

/**
 * @openapi
 * /api/trips/{tripId}/stops:
 *   get:
 *     summary: List the trip's route stops in order (Multi-City Trip Planner)
 *     tags: [Trip Stops]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Stops, first stop first }
 *   post:
 *     summary: Append a stop to the end of the route
 *     tags: [Trip Stops]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, latitude, longitude]
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               nights: { type: integer, minimum: 0, maximum: 365, nullable: true }
 *               locationId: { type: integer, nullable: true, description: A saved place on the same trip }
 *     responses:
 *       201: { description: Stop created }
 *       404: { description: Trip or location not found }
 * /api/trips/{tripId}/stops/reorder:
 *   put:
 *     summary: Reorder the stops; the body is the full ordered id list
 *     tags: [Trip Stops]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stopIds]
 *             properties:
 *               stopIds: { type: array, items: { type: integer } }
 *     responses:
 *       200: { description: Stops in their new order }
 *       400: { description: The list is not exactly the trip's stops (missing, extra or duplicate ids) }
 * /api/trips/{tripId}/stops/{id}:
 *   put:
 *     summary: Update a stop's name, coordinates, nights or linked place
 *     tags: [Trip Stops]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Stop updated }
 *   delete:
 *     summary: Delete a stop; the remaining stops close up the gap
 *     tags: [Trip Stops]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Stop deleted }
 */
// mergeParams to access :tripId from the parent mount path
const router = Router({ mergeParams: true });
router.use(authenticate);
router.get('/', tripStopController.getStopsByTrip);
router.post('/', tripStopController.createStop);
// Registered before '/:id' so "reorder" is not read as an id.
router.put('/reorder', tripStopController.reorderStops);
router.put('/:id', tripStopController.updateStop);
router.delete('/:id', tripStopController.deleteStop);

export default router;
