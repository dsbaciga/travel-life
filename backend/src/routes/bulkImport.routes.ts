import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { bulkImportController } from '../controllers/bulkImport.controller';

// mergeParams: mounted under /api/trips/:tripId/import
const router = Router({ mergeParams: true });

router.use(authenticate);

/**
 * @openapi
 * /api/trips/{tripId}/import/locations:
 *   post:
 *     summary: Import locations from CSV rows (dry run or real)
 *     description: >
 *       Rows are raw strings; each is parsed and validated with the same rules as single-create.
 *       With dryRun true nothing is written and the per-row results are exactly what a real run
 *       would produce. A real run creates every valid, non-excluded row in one transaction.
 *       At most 500 rows and about 1 MB of JSON per request. Requires edit access to the trip.
 *       Address-only rows are imported without coordinates (not geocoded) and no OpenStreetMap
 *       opening-hours lookup is made.
 *     tags: [Bulk Import]
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
 *             required: [rows]
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *               excludeRows:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Zero-based indexes of rows to leave out
 *               rows:
 *                 type: array
 *                 maxItems: 500
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     address: { type: string }
 *                     latitude: { type: string }
 *                     longitude: { type: string }
 *                     category: { type: string }
 *                     notes: { type: string }
 *                     openingHours: { type: string }
 *                     timezone: { type: string }
 *     responses:
 *       200:
 *         description: Per-row results and counts
 *       400:
 *         description: Malformed request (not per-row validation, which is reported in the body)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No edit access to the trip
 *       404:
 *         description: Trip not found
 */
router.post('/locations', bulkImportController.importLocations);

/**
 * @openapi
 * /api/trips/{tripId}/import/activities:
 *   post:
 *     summary: Import activities from CSV rows (dry run or real)
 *     description: >
 *       Same contract as the locations import. Times without an offset are wall-clock times in
 *       the timezone of the row, else the trip timezone, else the user timezone. Costs are
 *       decimal strings such as 1234.50. An optional location name links the activity to an
 *       existing trip location.
 *     tags: [Bulk Import]
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
 *             required: [rows]
 *             properties:
 *               dryRun:
 *                 type: boolean
 *               excludeRows:
 *                 type: array
 *                 items:
 *                   type: integer
 *               rows:
 *                 type: array
 *                 maxItems: 500
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     description: { type: string }
 *                     category: { type: string }
 *                     location: { type: string }
 *                     startTime: { type: string }
 *                     endTime: { type: string }
 *                     timezone: { type: string }
 *                     allDay: { type: string }
 *                     cost: { type: string }
 *                     currency: { type: string }
 *                     bookingUrl: { type: string }
 *                     bookingReference: { type: string }
 *                     notes: { type: string }
 *     responses:
 *       200:
 *         description: Per-row results and counts
 *       400:
 *         description: Malformed request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: No edit access to the trip
 *       404:
 *         description: Trip not found
 */
router.post('/activities', bulkImportController.importActivities);

export default router;
