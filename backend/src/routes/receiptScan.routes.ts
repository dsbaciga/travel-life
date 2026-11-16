import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { receiptScanController } from '../controllers/receiptScan.controller';
import { aiLimiter } from '../middleware/rateLimit';
import { RECEIPT_MAX_BYTES } from '../services/receiptScan.service';

// Mounted by expense.routes.ts under /api/trips/:tripId/expenses/scan-receipt,
// after `authenticate`, so the per-user aiLimiter keys off req.user.
const router = Router({ mergeParams: true });

// Memory storage: the image is never written to disk. The real file type is
// verified from the bytes in the service, not from the client-supplied type.
export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECEIPT_MAX_BYTES, files: 1 },
});

export function receiptUploadSingle(req: Request, res: Response, next: NextFunction): void {
  receiptUpload.single('image')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      res.status(tooLarge ? 413 : 400).json({
        status: 'error',
        message: tooLarge ? 'Image is too large (10 MB maximum)' : err.message,
      });
      return;
    }
    next(err);
  });
}

/**
 * @openapi
 * /api/trips/{tripId}/expenses/scan-receipt:
 *   post:
 *     summary: Extract expense fields from a receipt photo (does not create an expense)
 *     description: >
 *       Sends the image to the user's configured AI model and returns validated
 *       fields for pre-filling the expense form. Every field may be null when it
 *       could not be read. The image is not stored. Requires edit access to the trip.
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: JPEG, PNG, WebP or HEIC, up to 10 MB
 *     responses:
 *       200:
 *         description: Extracted fields (merchant, amount as decimal string, currency, date YYYY-MM-DD, category), each nullable
 *       400:
 *         description: Missing or unsupported file
 *       413:
 *         description: Image too large
 *       422:
 *         description: Image unreadable or nothing could be extracted
 *       502:
 *         description: AI provider error
 *       503:
 *         description: No AI key configured
 */
router.post('/', aiLimiter, receiptUploadSingle, receiptScanController.scanReceipt);

export default router;
