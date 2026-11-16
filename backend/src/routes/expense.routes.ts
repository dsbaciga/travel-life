import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { expenseController } from '../controllers/expense.controller';
import receiptScanRouter from './receiptScan.routes';

// mergeParams to access :tripId from the parent mount path
const router = Router({ mergeParams: true });

router.use(authenticate);

// Receipt photo -> pre-filled expense fields (read-only; creates nothing)
router.use('/scan-receipt', receiptScanRouter);

/**
 * @openapi
 * /api/trips/{tripId}/expenses:
 *   post:
 *     summary: Create a new expense for a trip
 *     tags: [Expenses]
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
 *             required: [description, category, amount]
 *             properties:
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               category:
 *                 type: string
 *                 enum: [food, transportation, lodging, activities, shopping, other]
 *               amount:
 *                 type: number
 *                 minimum: 0
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *               date:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Expense created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found
 *   get:
 *     summary: Get all expenses for a trip
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     responses:
 *       200:
 *         description: List of expenses for the trip
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found
 */
router.post('/', expenseController.createExpense);
router.get('/', expenseController.getExpensesByTrip);

/**
 * @openapi
 * /api/trips/{tripId}/expenses/{id}:
 *   get:
 *     summary: Get an expense by ID
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
 *         description: Expense details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Expense not found
 *   put:
 *     summary: Update an expense
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               category:
 *                 type: string
 *                 enum: [food, transportation, lodging, activities, shopping, other]
 *               amount:
 *                 type: number
 *                 minimum: 0
 *               currency:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 3
 *               date:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Expense updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Expense not found
 *   delete:
 *     summary: Delete an expense
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
 *         description: Expense deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Expense not found
 */
router.get('/:id', expenseController.getExpenseById);
router.put('/:id', expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);

export default router;

/**
 * Budget summary router, mounted at /api/trips/:tripId
 * (separate router so the expense CRUD routes stay under /expenses).
 */
const budgetSummaryRouter = Router({ mergeParams: true });

/**
 * @openapi
 * /api/trips/{tripId}/budget-summary:
 *   get:
 *     summary: Get the budget summary (budget vs spent with category breakdown) for a trip
 *     description: >
 *       Totals are converted into a single base currency using the exchange
 *       rate frozen at each record's own date. Amounts that could not be
 *       converted are excluded from `spent` and listed under
 *       `conversion.unconverted` rather than summed at face value.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The trip ID
 *     responses:
 *       200:
 *         description: Budget summary with spending breakdown by category
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Trip not found
 */
budgetSummaryRouter.get(
  '/budget-summary',
  authenticate,
  expenseController.getBudgetSummary
);

export { budgetSummaryRouter };
