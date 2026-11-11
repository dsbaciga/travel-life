import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  mobileSyncController,
  receiptController,
  trackController,
} from '../controllers/mobile.controller';

// Mounted at /api/trips/:tripId — mergeParams exposes :tripId to the handlers.
// This router is mounted alongside others on the same prefix, so authentication
// is applied per route rather than with router.use(), which would also run for
// requests that fall through to a later router.
const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/trips/{tripId}/mobile-sync:
 *   get:
 *     summary: Full or delta snapshot of a trip for the mobile offline mirror
 *     description: >
 *       Returns every entity of the trip and its EntityLink graph in one
 *       response. Pass the previous response's `serverTime` as `since` to get
 *       only rows changed after it; `ids` always lists every current row so
 *       deletions can be detected.
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Trip snapshot
 *       400:
 *         description: Invalid trip id or `since`
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found or access denied
 */
router.get('/mobile-sync', authenticate, mobileSyncController.getSnapshot);

/**
 * @openapi
 * /api/trips/{tripId}/tracks/batch:
 *   post:
 *     summary: Ingest a batch of background GPS points
 *     description: Idempotent — points are de-duplicated by timestamp per user.
 *     tags: [Mobile]
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
 *             required: [points]
 *             properties:
 *               points:
 *                 type: array
 *                 maxItems: 2000
 *                 items:
 *                   type: object
 *                   required: [latitude, longitude, recordedAt]
 *                   properties:
 *                     latitude: { type: number }
 *                     longitude: { type: number }
 *                     recordedAt: { type: string, format: date-time }
 *                     accuracy: { type: number, nullable: true }
 *                     altitude: { type: number, nullable: true }
 *                     speed: { type: number, nullable: true }
 *     responses:
 *       201:
 *         description: Counts of received and newly stored points
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Edit permission required
 *       404:
 *         description: Trip not found or access denied
 */
router.post('/tracks/batch', authenticate, trackController.ingestBatch);

/**
 * @openapi
 * /api/trips/{tripId}/tracks:
 *   get:
 *     summary: The caller's GPS trail for one day as a GeoJSON LineString feature
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "2026-06-01"
 *       - in: query
 *         name: timezone
 *         description: IANA zone defining the day; defaults to the trip's, then the user's
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: GeoJSON Feature
 *       400:
 *         description: Malformed date or timezone
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found or access denied
 */
router.get('/tracks', authenticate, trackController.getTrackForDay);

/**
 * @openapi
 * /api/trips/{tripId}/photos/infer-locations:
 *   post:
 *     summary: Infer coordinates for un-geotagged photos from the GPS trail
 *     description: >
 *       Matches each photo's `takenAt` against the caller's recorded track and
 *       proposes a TAKEN_AT link to the nearest itinerary location. Read-only
 *       unless `apply` is true.
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               apply: { type: boolean }
 *               photoIds:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Proposals, plus how many were applied
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Edit permission required to apply
 *       404:
 *         description: Trip not found or access denied
 */
router.post('/photos/infer-locations', authenticate, trackController.inferPhotoLocations);

/**
 * @openapi
 * /api/trips/{tripId}/expenses/parse-receipt:
 *   post:
 *     summary: Parse OCR text from a receipt into expense fields
 *     description: >
 *       Deterministic parsing always runs; when an LLM is configured for the
 *       user it refines individual fields. Returns a suggestion only — nothing
 *       is saved.
 *     tags: [Mobile]
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
 *             required: [text]
 *             properties:
 *               text: { type: string }
 *               defaultCurrency: { type: string, nullable: true }
 *               dateOrder: { type: string, enum: [DMY, MDY] }
 *               useLlm: { type: boolean }
 *     responses:
 *       200:
 *         description: amount, currency, merchant, date, category, confidence, source
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Edit permission required
 *       404:
 *         description: Trip not found or access denied
 */
router.post('/expenses/parse-receipt', authenticate, receiptController.parseReceipt);

export default router;
