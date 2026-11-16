import { Router } from 'express';
import { expenseReceiptController } from '../controllers/expenseReceipt.controller';
import { receiptUploadSingle } from './receiptScan.routes';

// Mounted by expense.routes.ts at /api/trips/:tripId/expenses/:id/receipt, after `authenticate`.
const router = Router({ mergeParams: true });

/**
 * @openapi
 * /api/trips/{tripId}/expenses/{id}/receipt:
 *   post:
 *     summary: Attach (or replace) the receipt photo of an expense
 *     description: >
 *       Multipart field `image` (JPEG, PNG, WebP or HEIC, up to 10 MB, type checked from the
 *       bytes). A normalised JPEG (long edge 2400 px, EXIF stripped) is stored under
 *       uploads/receipts/ and any previous receipt file is deleted. Needs edit access.
 *       The file is served by the authenticated /uploads route to anyone with view access
 *       to the trip, and is never part of the public share payload.
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The updated expense
 *       400:
 *         description: Missing or unsupported file
 *       413:
 *         description: Image too large
 *       422:
 *         description: Image unreadable
 *   delete:
 *     summary: Remove the receipt photo of an expense and delete its file
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The updated expense
 */
router.post('/', receiptUploadSingle, expenseReceiptController.attachReceipt);
router.delete('/', expenseReceiptController.removeReceipt);

export default router;
