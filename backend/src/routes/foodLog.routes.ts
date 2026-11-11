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
 * /api/trips/{tripId}/food-log/{id}/photos:
 *   post:
 *     summary: Attach existing photos of the trip to an entry (max 12 per entry; already-attached photos are ignored)
 *     tags: [Food Log]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [photoIds]
 *             properties:
 *               photoIds: { type: array, minItems: 1, maxItems: 12, items: { type: integer } }
 *     responses:
 *       200: { description: The entry with its photos }
 *       404: { description: Entry or a photo not found in this trip }
 * /api/trips/{tripId}/food-log/{id}/photos/immich:
 *   post:
 *     summary: Attach Immich photos to an entry. Each asset is linked to the trip first (reusing the photo if already linked). Photos only - videos are rejected. Max 12 per entry
 *     tags: [Food Log]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assets]
 *             properties:
 *               assets:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 12
 *                 items:
 *                   type: object
 *                   required: [immichAssetId]
 *                   properties:
 *                     immichAssetId: { type: string }
 *                     mediaType: { type: string, enum: [image] }
 *                     takenAt: { type: string, nullable: true }
 *                     latitude: { type: number, nullable: true }
 *                     longitude: { type: number, nullable: true }
 *     responses:
 *       200: { description: The entry with its photos }
 *       400: { description: A video was supplied, or the per-entry photo cap would be exceeded }
 * /api/trips/{tripId}/food-log/{id}/photos/{photoId}:
 *   delete:
 *     summary: Detach a photo from an entry (the photo stays in the trip gallery)
 *     tags: [Food Log]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Photo detached }
 */
// mergeParams to access :tripId from the parent mount path
const router = Router({ mergeParams: true });
router.use(authenticate);
router.post('/', foodLogController.createEntry);
router.get('/', foodLogController.getEntriesByTrip);
router.put('/:id', foodLogController.updateEntry);
router.delete('/:id', foodLogController.deleteEntry);
router.post('/:id/photos', foodLogController.attachPhotos);
router.post('/:id/photos/immich', foodLogController.attachImmichAssets);
router.delete('/:id/photos/:photoId', foodLogController.removePhoto);

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
