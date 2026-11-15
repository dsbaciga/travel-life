import { Request, Response } from 'express';
import nearbyFoodService from '../services/nearbyFood.service';
import placeSearchService from '../services/placeSearch.service';
import { nearbyFoodQuerySchema, placeSearchQuerySchema } from '../types/places.types';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';

export const placesController = {
  /**
   * Find a place by name or address, to choose where to search.
   */
  search: asyncHandler(async (req: Request, res: Response) => {
    requireUserId(req);
    const query = placeSearchQuerySchema.parse(req.query);
    const results = await placeSearchService.searchPlaces(query.q, query.limit);
    res.status(200).json({ status: 'success', data: { results } });
  }),

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
