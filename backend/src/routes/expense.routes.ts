import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { expenseController } from '../controllers/expense.controller';
import { expenseSplitController } from '../controllers/expenseSplit.controller';

// mergeParams to access :tripId from the parent mount path
const router = Router({ mergeParams: true });

router.use(authenticate);

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
 * /api/trips/{tripId}/expenses/participants:
 *   get:
 *     summary: List who an expense can be paid by or split with (the owner and the trip's companions)
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
 *         description: Participants, each with a key of `owner` or `companion:<id>`
 *       404:
 *         description: Trip not found
 */
router.get('/participants', expenseSplitController.getParticipants);

/**
 * @openapi
 * /api/trips/{tripId}/expenses/{id}/split:
 *   put:
 *     summary: Set or clear who paid an expense and how it is split
 *     description: >
 *       `paidBy: null` clears the payer and the split. Otherwise `method` and
 *       `participants` are required. `equal` needs only participant keys;
 *       `amount` needs an `amount` per participant summing to the expense
 *       amount; `percentage` needs a `percentage` per participant summing to 100.
 *       Shares are stored in the expense's own currency and always sum exactly
 *       to the expense amount.
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
 *             required: [paidBy]
 *             properties:
 *               paidBy:
 *                 type: string
 *                 nullable: true
 *                 example: companion:12
 *               method:
 *                 type: string
 *                 enum: [equal, amount, percentage]
 *               participants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [participant]
 *                   properties:
 *                     participant:
 *                       type: string
 *                       example: owner
 *                     amount:
 *                       type: number
 *                     percentage:
 *                       type: number
 *     responses:
 *       200:
 *         description: The expense with its payer and splits
 *       400:
 *         description: Validation error (amounts or percentages do not add up, unknown participant)
 *       404:
 *         description: Expense not found
 */
router.put('/:id/split', expenseSplitController.setSplit);

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

/**
 * @openapi
 * /api/trips/{tripId}/settle-up:
 *   get:
 *     summary: Who owes whom for the trip's split expenses
 *     description: >
 *       Computed in the same base currency as the budget summary using exact
 *       decimal arithmetic. Returns each person's paid / owed / net and a short
 *       list of payments that settles everyone. Expenses with no payer or split
 *       are listed under `unsplit`; split expenses with no available exchange
 *       rate are excluded and listed under `unconverted`.
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
 *         description: Balances and suggested transfers
 *       404:
 *         description: Trip not found
 */
budgetSummaryRouter.get('/settle-up', authenticate, expenseSplitController.getSettleUp);

export { budgetSummaryRouter };
