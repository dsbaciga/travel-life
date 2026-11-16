import { Router } from 'express';
import { tripComparisonController } from '../controllers/tripComparison.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/trip-comparison:
 *   get:
 *     summary: Compare two or more trips side by side
 *     description: >
 *       Returns per-trip dates, length, counts, distance and cost, plus the mappable
 *       locations of all trips. Costs are expressed in the caller's base currency using
 *       the budget summary's frozen FX snapshots; amounts that could not be converted are
 *       excluded and reported per trip. Every requested trip must be viewable by the
 *       caller, otherwise the request is rejected with 404 naming the ids.
 *     tags: [Trips]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: ids
 *         required: true
 *         schema: { type: string, example: "12,15,19" }
 *         description: Comma-separated distinct trip ids (2 to 8).
 *     responses:
 *       200: { description: The comparison }
 *       400: { description: Invalid ids, fewer than 2 or more than 8 trips }
 *       404: { description: A trip does not exist or is not accessible }
 */
router.get('/', tripComparisonController.compare);

export default router;
