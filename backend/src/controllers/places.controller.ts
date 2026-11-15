import { Request, Response } from 'express';
import nearbyFoodService from '../services/nearbyFood.service';
import { nearbyFoodQuerySchema } from '../types/places.types';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';

export const placesController = {
  /**
   * Food and drink near a point, optionally filtered for a dietary restriction.
   */
  nearbyFood: asyncHandler(async (req: Request, res: Response) => {
    requireUserId(req);
    const query = nearbyFoodQuerySchema.parse(req.query);

    const result = await nearbyFoodService.searchNearbyFood({
      latitude: query.lat,
      longitude: query.lng,
      radiusMeters: query.radius,
      diet: query.diet,
      limit: query.limit,
    });

    res.status(200).json({ status: 'success', data: result });
  }),
};
