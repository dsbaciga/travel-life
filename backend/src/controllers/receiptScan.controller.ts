import { Request, Response } from 'express';
import { asyncHandler } from '../http/asyncHandler';
import { parseId } from '../http/parseId';
import { requireUserId } from '../auth/controllerHelpers';
import receiptScanService from '../services/receiptScan.service';

export const receiptScanController = {
  scanReceipt: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const result = await receiptScanService.scanReceipt(userId, tripId, req.file?.buffer);
    res.json({ status: 'success', data: result });
  }),
};
