import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { loyaltyProgramController } from '../controllers/loyaltyProgram.controller';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/loyalty-programs:
 *   get:
 *     summary: Get all loyalty programs for the authenticated user
 *     description: Membership numbers are returned in full, to the owner only.
 *     tags: [Loyalty Programs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of loyalty programs
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create a loyalty program
 *     tags: [Loyalty Programs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, providerName, membershipNumber]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 255
 *               type:
 *                 type: string
 *                 enum: [AIRLINE, HOTEL, RAIL, CAR_RENTAL, OTHER]
 *               providerName:
 *                 type: string
 *                 maxLength: 255
 *                 description: Carrier or brand the program belongs to (used to match bookings)
 *               providerCode:
 *                 type: string
 *                 maxLength: 10
 *                 description: IATA airline code, e.g. DL
 *               alliance:
 *                 type: string
 *                 maxLength: 100
 *               aliases:
 *                 type: array
 *                 items:
 *                   type: string
 *               membershipNumber:
 *                 type: string
 *                 maxLength: 100
 *               tier:
 *                 type: string
 *                 maxLength: 100
 *               pointsBalance:
 *                 type: integer
 *                 minimum: 0
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Loyalty program created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/', loyaltyProgramController.getAll);
router.post('/', loyaltyProgramController.create);

/**
 * @openapi
 * /api/loyalty-programs/{id}:
 *   get:
 *     summary: Get a loyalty program by ID
 *     tags: [Loyalty Programs]
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
 *         description: Loyalty program details
 *       404:
 *         description: Loyalty program not found
 *   put:
 *     summary: Update a loyalty program
 *     tags: [Loyalty Programs]
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
 *         description: Loyalty program updated
 *       400:
 *         description: Validation error
 *       404:
 *         description: Loyalty program not found
 *   delete:
 *     summary: Delete a loyalty program
 *     description: Bookings that referenced it simply lose the reference.
 *     tags: [Loyalty Programs]
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
 *         description: Loyalty program deleted
 *       404:
 *         description: Loyalty program not found
 */
router.get('/:id', loyaltyProgramController.getById);
router.put('/:id', loyaltyProgramController.update);
router.delete('/:id', loyaltyProgramController.delete);

export default router;
