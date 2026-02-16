import { Request, Response } from 'express';
import tripService from '../services/trip.service';
import tripValidatorService from '../services/tripValidator.service';
import {
  createTripSchema,
  updateTripSchema,
  getTripQuerySchema,
  duplicateTripSchema,
} from '../types/trip.types';
import { z } from 'zod';
import logger from '../config/logger';
import { parseId } from '../utils/parseId';
import { asyncHandler } from '../utils/asyncHandler';
import { requireUserId } from '../utils/controllerHelpers';

export const tripController = {
  createTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const validatedData = createTripSchema.parse(req.body);
    const trip = await tripService.createTrip(userId, validatedData);

    logger.info(`Trip created: ${trip.id} by user ${userId}`);

    res.status(201).json({
      status: 'success',
      data: trip,
    });
  }),

  getTrips: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const validatedQuery = getTripQuerySchema.parse(req.query);
    const result = await tripService.getTrips(userId, validatedQuery);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  }),

  getTripById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const trip = await tripService.getTripById(userId, tripId);

    res.status(200).json({
      status: 'success',
      data: trip,
    });
  }),

  updateTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const validatedData = updateTripSchema.parse(req.body);
    const trip = await tripService.updateTrip(userId, tripId, validatedData);

    logger.info(`Trip updated: ${trip.id} by user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: trip,
    });
  }),

  deleteTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    await tripService.deleteTrip(userId, tripId);

    logger.info(`Trip deleted: ${tripId} by user ${userId}`);

    res.status(200).json({ status: 'success', message: 'Trip deleted successfully' });
  }),

  updateCoverPhoto: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const schema = z.object({
      photoId: z.number().nullable(),
    });
    const { photoId } = schema.parse(req.body);

    const trip = await tripService.updateCoverPhoto(userId, tripId, photoId);

    logger.info(`Cover photo updated for trip ${tripId} by user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: trip,
    });
  }),

  validateTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const validation = await tripValidatorService.validateTrip(tripId, userId);

    logger.info(`Trip validation performed for trip ${tripId} by user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: validation,
    });
  }),

  getValidationStatus: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const status = await tripValidatorService.getQuickStatus(tripId, userId);

    res.status(200).json({
      status: 'success',
      data: status,
    });
  }),

  dismissValidationIssue: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');

    const schema = z.object({
      issueType: z.string().min(1).max(100),
      issueKey: z.string().min(1).max(500),
      category: z.enum(['SCHEDULE', 'ACCOMMODATIONS', 'TRANSPORTATION', 'COMPLETENESS']),
    });
    const { issueType, issueKey, category } = schema.parse(req.body);

    await tripValidatorService.dismissIssue(tripId, userId, issueType, issueKey, category);

    logger.info(`Validation issue dismissed for trip ${tripId}: ${issueType}:${issueKey}`);

    res.status(200).json({
      status: 'success',
      message: 'Issue dismissed',
    });
  }),

  restoreValidationIssue: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');

    const schema = z.object({
      issueType: z.string(),
      issueKey: z.string(),
    });
    const { issueType, issueKey } = schema.parse(req.body);

    await tripValidatorService.restoreIssue(tripId, userId, issueType, issueKey);

    logger.info(`Validation issue restored for trip ${tripId}: ${issueType}:${issueKey}`);

    res.status(200).json({
      status: 'success',
      message: 'Issue restored',
    });
  }),

  duplicateTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const validatedData = duplicateTripSchema.parse(req.body);
    const trip = await tripService.duplicateTrip(userId, tripId, validatedData);

    if (trip) {
      logger.info(`Trip duplicated: ${tripId} -> ${trip.id} by user ${userId}`);
    }

    res.status(201).json({
      status: 'success',
      data: trip,
    });
  }),
};
