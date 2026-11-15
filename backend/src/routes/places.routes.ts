import { Router } from 'express';
import { placesController } from '../controllers/places.controller';
import { authenticate } from '../middleware/auth';
import { nearbyFoodLimiter } from '../middleware/rateLimit';

const router = Router();

// Every place lookup needs a signed-in user, and the limiter keys on that user.
router.use(authenticate);

/**
 * @openapi
 * /api/places/food:
 *   get:
 *     summary: Food and drink near a point, optionally filtered for a dietary restriction
 *     description: >
 *       Searches OpenStreetMap (through Overpass) for restaurants, cafes, bars, bakeries and the
 *       like around the point. Dietary information is only as good as the map: places nobody has
 *       tagged for a diet come back with `diet: "unknown"` ("not confirmed"), listed after the
 *       ones that match. Places that say they do not cater for the diet are left out and counted
 *       in `excludedCount`. Results are cached for ten minutes per area, and changing `diet`
 *       does not repeat the upstream request.
 *     tags: [Places]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: lat, required: true, schema: { type: number, minimum: -90, maximum: 90 } }
 *       - { in: query, name: lng, required: true, schema: { type: number, minimum: -180, maximum: 180 } }
 *       - { in: query, name: radius, schema: { type: integer, minimum: 100, maximum: 3000, default: 1000 }, description: Metres }
 *       - in: query
 *         name: diet
 *         schema: { type: string, enum: [vegetarian, vegan, halal, kosher, gluten_free, lactose_free, pescetarian] }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 50 } }
 *     responses:
 *       200: { description: Places, best diet match first, then nearest }
 *       400: { description: Invalid query }
 *       429: { description: Too many searches }
 *       502: { description: The map service is unavailable }
 *       503: { description: The map service is busy, retry shortly }
 */
router.get('/food', nearbyFoodLimiter, placesController.nearbyFood);

/**
 * @openapi
 * /api/places/search:
 *   get:
 *     summary: Find a place by name or address
 *     description: >
 *       Looks a place up on OpenStreetMap (Nominatim) so the mobile food search can look
 *       somewhere other than where the phone is. Answers are cached for an hour.
 *     tags: [Places]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: q, required: true, schema: { type: string, minLength: 2, maxLength: 200 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 10, default: 5 } }
 *     responses:
 *       200: { description: Matching places, best first (name, description, latitude, longitude) }
 *       400: { description: Invalid query }
 *       429: { description: Too many searches }
 *       503: { description: The place search service is unavailable }
 */
router.get('/search', nearbyFoodLimiter, placesController.search);

export default router;
