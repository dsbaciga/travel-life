import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { foodLogController } from '../controllers/foodLog.controller';

/**
 * @openapi
 * /api/trips/{tripId}/food-log:
 *   post:
 *     summary: Log a dish (rating 1-5, notes, order-again) optionally tied to a dining activity or location of the trip
 *     tags: [Food Log]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [restaurantName, dish, rating]
 *             properties:
 *               restaurantName: { type: string, maxLength: 200 }
 *               dish: { type: string, maxLength: 200 }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               notes: { type: string, maxLength: 2000 }
 *               orderAgain: { type: boolean }
 *               activityId: { type: integer, nullable: true }
 *               locationId: { type: integer, nullable: true }
 *     responses:
 *       201: { description: Entry created }
 *       404: { description: Trip, activity or location not found }
 *   get:
 *     summary: List a trip's food log entries, best rated first
 *     tags: [Food Log]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Entries }
 * /api/trips/{tripId}/food-log/{id}:
 *   put:
 *     summary: Update a food log entry
 *     tags: [Food Log]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Entry updated }
 *   delete:
 *     summary: Delete a food log entry
 *     tags: [Food Log]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Entry deleted }
 */
// mergeParams to access :tripId from the parent mount path
const router = Router({ mergeParams: true });
router.use(authenticate);
router.post('/', foodLogController.createEntry);
router.get('/', foodLogController.getEntriesByTrip);
router.put('/:id', foodLogController.updateEntry);
router.delete('/:id', foodLogController.deleteEntry);

/**
 * @openapi
 * /api/food-log:
 *   get:
 *     summary: Best-meals search across all the user's trips (?minRating=1-5, ?orderAgain=true|false, ?q=text), best first
 *     tags: [Food Log]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Matching entries with their trip }
 */
export const foodLogSearchRouter = Router();
foodLogSearchRouter.get('/', authenticate, foodLogController.searchEntries);

export default router;
