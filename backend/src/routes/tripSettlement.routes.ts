import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { tripSettlementController } from '../controllers/tripSettlement.controller';

// mergeParams to access :tripId from the parent mount path
const router = Router({ mergeParams: true });

router.use(authenticate);

/**
 * @openapi
 * /api/trips/{tripId}/settlements:
 *   get:
 *     summary: List the recorded settlement payments of a trip
 *     description: >
 *       Payments one person made to another to settle up split expenses, newest first.
 *       `GET /api/trips/{tripId}/settle-up` subtracts them from the net balances.
 *     tags: [Expenses]
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
 *         description: Settlements, each with `from` / `to` participant keys (`owner` or `companion:<id>`) and labels
 *       404:
 *         description: Trip not found
 *   post:
 *     summary: Record a settlement payment
 *     description: Requires edit access. Both people must be the trip owner or a companion on the trip.
 *     tags: [Expenses]
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
 *             required: [from, to, amount, currency, date]
 *             properties:
 *               from:
 *                 type: string
 *                 description: Who paid (`owner` or `companion:<id>`)
 *               to:
 *                 type: string
 *                 description: Who was paid (`owner` or `companion:<id>`), different from `from`
 *               amount:
 *                 type: number
 *                 description: Greater than 0
 *               currency:
 *                 type: string
 *                 description: ISO 4217 code
 *               date:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: The recorded settlement
 *       400:
 *         description: Validation error, or a person is not on the trip
 *       404:
 *         description: Trip not found
 */
router.get('/', tripSettlementController.list);
router.post('/', tripSettlementController.create);

/**
 * @openapi
 * /api/trips/{tripId}/settlements/{id}:
 *   put:
 *     summary: Edit a settlement payment
 *     description: >
 *       Every field is optional; `notes: null` clears the note. A person who has since left the
 *       trip can stay on the payment, but a newly chosen person must be on the trip.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               from:
 *                 type: string
 *               to:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: The updated settlement
 *       404:
 *         description: Settlement not found
 *   delete:
 *     summary: Delete a settlement payment
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Settlement not found
 */
router.put('/:id', tripSettlementController.update);
router.delete('/:id', tripSettlementController.remove);

export default router;
