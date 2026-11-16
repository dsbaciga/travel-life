import { Request, Response } from 'express';
import { asyncHandler } from '../http/asyncHandler';
import { parseId } from '../http/parseId';
import { requireUserId } from '../auth/controllerHelpers';
import expenseReceiptService from '../services/expenseReceipt.service';

export const expenseReceiptController = {
  attachReceipt: asyncHandler(async (req: Request, res: Response) => {
    const expense = await expenseReceiptService.attachReceipt(
      requireUserId(req),
      parseId(req.params.tripId, 'tripId'),
      parseId(req.params.id),
      req.file?.buffer
    );
    res.json({ status: 'success', data: expense });
  }),

  removeReceipt: asyncHandler(async (req: Request, res: Response) => {
    const expense = await expenseReceiptService.removeReceipt(
      requireUserId(req),
      parseId(req.params.tripId, 'tripId'),
      parseId(req.params.id)
    );
    res.json({ status: 'success', data: expense });
  }),
};
