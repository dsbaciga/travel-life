import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { bookingDeadlineController } from '../controllers/bookingDeadline.controller';

/**
 * @openapi
 * /api/trips/{tripId}/deadlines:
 *   post:
 *     summary: Add a deadline (cancellation cutoff, check-in window, payment due) to a booking
 *     tags: [Deadlines]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entityType, entityId, kind, dueAt]
 *             properties:
 *               entityType: { type: string, enum: [lodging, transportation, activity] }
 *               entityId: { type: integer }
 *               kind: { type: string, enum: [cancellation, check_in, payment, other] }
 *               dueAt: { type: string, format: date-time }
 *               note: { type: string, maxLength: 500 }
 *     responses:
 *       201: { description: Deadline created }
 *       404: { description: Trip or booking not found }
 *   get:
 *     summary: List a trip's deadlines, soonest first
 *     tags: [Deadlines]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Deadlines }
 * /api/trips/{tripId}/deadlines/{id}:
 *   put:
 *     summary: Update, dismiss (dismissed true) or restore (dismissed false) a deadline
 *     tags: [Deadlines]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Deadline updated }
 *   delete:
 *     summary: Delete a deadline
 *     tags: [Deadlines]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Deadline deleted }
 */
// mergeParams to access :tripId from the parent mount path
const router = Router({ mergeParams: true });
router.use(authenticate);
router.post('/', bookingDeadlineController.createDeadline);
router.get('/', bookingDeadlineController.getDeadlinesByTrip);
router.put('/:id', bookingDeadlineController.updateDeadline);
router.delete('/:id', bookingDeadlineController.deleteDeadline);

/**
 * @openapi
 * /api/deadlines/upcoming:
 *   get:
 *     summary: Undismissed deadlines due within ?days (default 30, max 365) across all the user's trips, including overdue ones
 *     tags: [Deadlines]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Upcoming deadlines }
 */
export const upcomingDeadlinesRouter = Router();
upcomingDeadlinesRouter.get('/upcoming', authenticate, bookingDeadlineController.getUpcoming);

export default router;
