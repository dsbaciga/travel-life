import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/database';
import logger from '../config/logger';
import { AppError } from '../errors/errors';
import { verifyTripAccessWithPermission } from './_shared/tripAccess';
import { convertDecimals } from './_shared/decimalConversion';
import { assertReceiptImage, normaliseImage } from './receiptScan.service';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const RECEIPT_DIR = path.join(UPLOADS_ROOT, 'receipts');
const RECEIPT_URL_PREFIX = '/uploads/receipts/';

/**
 * Stored copy: long edge 2400 px, JPEG quality 88. A receipt's small print
 * (tax lines, card digits) needs more than the 1600 px / q82 sent to the model;
 * a phone photo of a receipt at this size is typically 300-900 KB.
 */
export const RECEIPT_STORED_MAX_EDGE_PX = 2400;
export const RECEIPT_STORED_QUALITY = 88;

/** Resolve a stored receipt path, refusing anything outside uploads/receipts/. */
function resolveReceiptFile(storedPath: string): string | null {
  if (!storedPath.startsWith(RECEIPT_URL_PREFIX)) return null;
  const absolute = path.resolve(UPLOADS_ROOT, storedPath.slice('/uploads/'.length));
  return absolute.startsWith(RECEIPT_DIR + path.sep) ? absolute : null;
}

/**
 * Delete receipt files. A failure never propagates: the database row is the
 * source of truth, and a leftover file must not fail the user's request.
 */
export async function deleteReceiptFiles(paths: Array<string | null | undefined>): Promise<void> {
  for (const stored of paths) {
    if (!stored) continue;
    const absolute = resolveReceiptFile(stored);
    if (!absolute) {
      logger.error('Refusing to delete a receipt file outside uploads/receipts', { path: stored });
      continue;
    }
    try {
      await fs.unlink(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to delete receipt file', {
          path: stored,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }
}

async function loadExpense(expenseId: number, tripId: number) {
  const expense = await prisma.tripExpense.findFirst({ where: { id: expenseId, tripId } });
  if (!expense) throw new AppError('Expense not found or does not belong to trip', 404);
  return expense;
}

class ExpenseReceiptService {
  /** Attach a receipt photo, replacing (and deleting) any existing one. */
  async attachReceipt(userId: number, tripId: number, expenseId: number, file: Buffer | undefined) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const existing = await loadExpense(expenseId, tripId);
    await assertReceiptImage(file);

    const jpeg = await normaliseImage(
      file as Buffer,
      RECEIPT_STORED_MAX_EDGE_PX,
      RECEIPT_STORED_QUALITY
    );

    // The name is generated here; nothing from the client reaches the path.
    const filename = `${crypto.randomUUID()}.jpg`;
    const storedPath = `${RECEIPT_URL_PREFIX}${filename}`;
    await fs.mkdir(RECEIPT_DIR, { recursive: true });
    await fs.writeFile(path.join(RECEIPT_DIR, filename), jpeg);

    try {
      // Only replace the receipt we read, so two racing uploads cannot orphan a file.
      const { count } = await prisma.tripExpense.updateMany({
        where: { id: expenseId, tripId, receiptPath: existing.receiptPath },
        data: {
          receiptPath: storedPath,
          receiptMimeType: 'image/jpeg',
          receiptSizeBytes: jpeg.length,
          receiptUploadedAt: new Date(),
        },
      });
      if (count === 0) throw new AppError('The receipt was changed by another request. Try again.', 409);
    } catch (error) {
      await deleteReceiptFiles([storedPath]);
      throw error;
    }

    await deleteReceiptFiles([existing.receiptPath]);
    return convertDecimals(await loadExpense(expenseId, tripId));
  }

  /** Remove the receipt photo and delete its file. */
  async removeReceipt(userId: number, tripId: number, expenseId: number) {
    await verifyTripAccessWithPermission(userId, tripId, 'edit');
    const existing = await loadExpense(expenseId, tripId);

    const updated = await prisma.tripExpense.update({
      where: { id: expenseId },
      data: {
        receiptPath: null,
        receiptMimeType: null,
        receiptSizeBytes: null,
        receiptUploadedAt: null,
      },
    });
    await deleteReceiptFiles([existing.receiptPath]);
    return convertDecimals(updated);
  }
}

export default new ExpenseReceiptService();
