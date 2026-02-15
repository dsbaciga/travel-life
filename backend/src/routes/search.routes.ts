import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { searchController } from '../controllers/search.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// Rate limiting for search endpoint - prevents abuse of expensive search queries
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: 'Too many search requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// All search routes require authentication
router.use(authenticate);
router.use(searchLimiter);

/**
 * @openapi
 * /api/search:
 *   get:
 *     summary: Global search across all entities
 *     description: Searches trips, locations, activities, lodging, photos, albums, and journal entries
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query string
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: Comma-separated list of entity types to search (trips, locations, activities, lodging, photos, albums, journals)
 *       - in: query
 *         name: tripId
 *         schema:
 *           type: integer
 *         description: Limit search to a specific trip
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum results per entity type
 *     responses:
 *       200:
 *         description: Search results grouped by entity type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trips:
 *                   type: array
 *                   items:
 *                     type: object
 *                 locations:
 *                   type: array
 *                   items:
 *                     type: object
 *                 activities:
 *                   type: array
 *                   items:
 *                     type: object
 *                 lodging:
 *                   type: array
 *                   items:
 *                     type: object
 *                 photos:
 *                   type: array
 *                   items:
 *                     type: object
 *                 albums:
 *                   type: array
 *                   items:
 *                     type: object
 *                 journals:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing search query
 *       401:
 *         description: Unauthorized
 */
router.get('/', searchController.globalSearch);

export default router;
