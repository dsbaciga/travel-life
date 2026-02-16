import { Router } from 'express';
import locationController from '../controllers/location.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All location routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/locations:
 *   post:
 *     summary: Create a new location
 *     tags: [Locations]
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
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               categoryId:
 *                 type: integer
 *               visitDatetime:
 *                 type: string
 *                 format: date-time
 *               visitDurationMinutes:
 *                 type: integer
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Location created successfully
 */
router.post('/', locationController.createLocation);

/**
 * @openapi
 * /api/locations/visited:
 *   get:
 *     summary: Get all locations from user's trips marked as "Places Visited"
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of visited locations
 */
router.get('/visited', locationController.getAllVisitedLocations);

/**
 * @openapi
 * /api/locations/trip/{tripId}:
 *   get:
 *     summary: Get all locations for a specific trip
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of locations for the trip
 */
router.get('/trip/:tripId', locationController.getLocationsByTrip);

/**
 * @openapi
 * /api/locations/trip/{tripId}/bulk:
 *   delete:
 *     summary: Bulk delete locations
 *     tags: [Locations]
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
 *                 description: Array of location IDs to delete
 *     responses:
 *       200:
 *         description: Locations deleted successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more locations not found
 *   patch:
 *     summary: Bulk update locations
 *     tags: [Locations]
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
 *                 description: Array of location IDs to update
 *               updates:
 *                 type: object
 *                 properties:
 *                   categoryId:
 *                     type: integer
 *                   notes:
 *                     type: string
 *     responses:
 *       200:
 *         description: Locations updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more locations not found
 */
router.delete('/trip/:tripId/bulk', locationController.bulkDeleteLocations);
router.patch('/trip/:tripId/bulk', locationController.bulkUpdateLocations);

/**
 * @openapi
 * /api/locations/categories/list:
 *   get:
 *     summary: Get all location categories (system + user)
 *     tags: [Location Categories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get('/categories/list', locationController.getCategories);

/**
 * @openapi
 * /api/locations/categories:
 *   post:
 *     summary: Create a custom location category
 *     tags: [Location Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               icon:
 *                 type: string
 *               color:
 *                 type: string
 *     responses:
 *       201:
 *         description: Category created
 */
router.post('/categories', locationController.createCategory);

/**
 * @openapi
 * /api/locations/categories/{id}:
 *   put:
 *     summary: Update a custom location category
 *     tags: [Location Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               icon:
 *                 type: string
 *               color:
 *                 type: string
 *     responses:
 *       200:
 *         description: Category updated
 *   delete:
 *     summary: Delete a custom location category
 *     tags: [Location Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category deleted
 */
router.put('/categories/:id', locationController.updateCategory);
router.delete('/categories/:id', locationController.deleteCategory);

/**
 * @openapi
 * /api/locations/{id}:
 *   get:
 *     summary: Get a location by ID
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Location details
 *       404:
 *         description: Location not found
 *   put:
 *     summary: Update a location
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Location updated
 *   delete:
 *     summary: Delete a location
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Location deleted
 */
// IMPORTANT: /:id routes must be LAST to avoid catching named routes like /visited, /categories/*
router.get('/:id', locationController.getLocationById);
router.put('/:id', locationController.updateLocation);
router.delete('/:id', locationController.deleteLocation);

export default router;
