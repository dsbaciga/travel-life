import { Request, Response } from 'express';
import locationService from '../services/location.service';
import {
  createLocationSchema,
  updateLocationSchema,
  createLocationCategorySchema,
  updateLocationCategorySchema,
  bulkDeleteLocationsSchema,
  bulkUpdateLocationsSchema,
} from '../types/location.types';
import { asyncHandler } from '../http/asyncHandler';
import { parseId } from '../http/parseId';
import { requireUserId } from '../auth/controllerHelpers';
import logger from '../config/logger';

export const locationController = {
  createLocation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = createLocationSchema.parse(req.body);
    const location = await locationService.createLocation(userId, data);
    logger.info(`Location created: ${location.id} by user ${userId}`);
    res.status(201).json({
      status: 'success',
      data: location,
    });
  }),

  getLocationsByTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const locations = await locationService.getLocationsByTrip(userId, tripId);
    res.json({
      status: 'success',
      data: locations,
    });
  }),

  getLocationById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const locationId = parseId(req.params.id);
    const location = await locationService.getLocationById(userId, locationId);
    res.json({
      status: 'success',
      data: location,
    });
  }),

  updateLocation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const locationId = parseId(req.params.id);
    const data = updateLocationSchema.parse(req.body);
    const location = await locationService.updateLocation(userId, locationId, data);
    logger.info(`Location updated: ${location.id} by user ${userId}`);
    res.json({
      status: 'success',
      data: location,
    });
  }),

  deleteLocation: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const locationId = parseId(req.params.id);
    const result = await locationService.deleteLocation(userId, locationId);
    logger.info(`Location deleted: ${locationId} by user ${userId}`);
    res.json({
      status: 'success',
      data: result,
    });
  }),

  // Location Categories
  getCategories: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const categories = await locationService.getCategories(userId);
    res.json({
      status: 'success',
      data: categories,
    });
  }),

  createCategory: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = createLocationCategorySchema.parse(req.body);
    const category = await locationService.createCategory(userId, data);
    res.status(201).json({
      status: 'success',
      data: category,
    });
  }),

  updateCategory: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const categoryId = parseId(req.params.id, 'categoryId');
    const data = updateLocationCategorySchema.parse(req.body);
    const category = await locationService.updateCategory(userId, categoryId, data);
    res.json({
      status: 'success',
      data: category,
    });
  }),

  deleteCategory: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const categoryId = parseId(req.params.id, 'categoryId');
    const result = await locationService.deleteCategory(userId, categoryId);
    res.json({
      status: 'success',
      data: result,
    });
  }),

  getFavoriteLocations: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const locations = await locationService.getFavoriteLocations(userId);
    res.json({
      status: 'success',
      data: locations,
    });
  }),

  getAllVisitedLocations: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 200));
    const scope = req.query.scope === 'all' ? 'all' : 'visited';
    const result = await locationService.getAllVisitedLocations(userId, page, limit, scope);
    res.json({
      status: 'success',
      data: result,
    });
  }),

  bulkDeleteLocations: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const data = bulkDeleteLocationsSchema.parse(req.body);
    const result = await locationService.bulkDeleteLocations(userId, tripId, data);
    logger.info(`Bulk deleted ${result.deletedCount} locations by user ${userId}`);
    res.json({
      status: 'success',
      data: result,
    });
  }),

  bulkUpdateLocations: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const data = bulkUpdateLocationsSchema.parse(req.body);
    const result = await locationService.bulkUpdateLocations(userId, tripId, data);
    logger.info(`Bulk updated ${result.updatedCount} locations by user ${userId}`);
    res.json({
      status: 'success',
      data: result,
    });
  }),
};

export default locationController;
