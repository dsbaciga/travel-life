import { Request, Response } from 'express';
import tripComparisonService from '../services/tripComparison.service';
import { compareTripsQuerySchema } from '../types/tripComparison.types';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';

export const tripComparisonController = {
  compare: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { ids } = compareTripsQuerySchema.parse(req.query);
    const data = await tripComparisonService.compareTrips(userId, ids);
    res.status(200).json({ status: 'success', data });
  }),
};
