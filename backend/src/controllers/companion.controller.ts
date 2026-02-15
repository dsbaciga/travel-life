import { Request, Response } from 'express';
import { companionService } from '../services/companion.service';
import {
  createCompanionSchema,
  updateCompanionSchema,
  linkCompanionToTripSchema,
} from '../types/companion.types';
import { asyncHandler } from '../utils/asyncHandler';
import { parseId } from '../utils/parseId';
import { requireUserId } from '../utils/controllerHelpers';
import { AppError } from '../utils/errors';

export const companionController = {
  createCompanion: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = createCompanionSchema.parse(req.body);
    const companion = await companionService.createCompanion(userId, data);
    res.status(201).json({ status: 'success', data: companion });
  }),

  getCompanionsByUser: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const companions = await companionService.getCompanionsByUser(userId);
    res.json({ status: 'success', data: companions });
  }),

  getCompanionById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const companionId = parseId(req.params.id);
    const companion = await companionService.getCompanionById(userId, companionId);
    res.json({ status: 'success', data: companion });
  }),

  updateCompanion: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const companionId = parseId(req.params.id);
    const data = updateCompanionSchema.parse(req.body);
    const companion = await companionService.updateCompanion(userId, companionId, data);
    res.json({ status: 'success', data: companion });
  }),

  deleteCompanion: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const companionId = parseId(req.params.id);
    await companionService.deleteCompanion(userId, companionId);
    res.status(200).json({ status: 'success', message: 'Companion deleted successfully' });
  }),

  linkCompanionToTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = linkCompanionToTripSchema.parse(req.body);
    const link = await companionService.linkCompanionToTrip(userId, data);
    res.status(201).json({ status: 'success', data: link });
  }),

  unlinkCompanionFromTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const companionId = parseId(req.params.companionId, 'companionId');
    await companionService.unlinkCompanionFromTrip(userId, tripId, companionId);
    res.status(200).json({ status: 'success', message: 'Companion unlinked from trip' });
  }),

  getCompanionsByTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const companions = await companionService.getCompanionsByTrip(userId, tripId);
    res.json({ status: 'success', data: companions });
  }),

  uploadAvatar: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const companionId = parseId(req.params.id);

    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const companion = await companionService.uploadAvatar(userId, companionId, req.file);
    res.json({ status: 'success', data: companion });
  }),

  setImmichAvatar: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const companionId = parseId(req.params.id);
    const { immichAssetId } = req.body;

    if (!immichAssetId) {
      throw new AppError('immichAssetId is required', 400);
    }

    const companion = await companionService.setImmichAvatar(userId, companionId, immichAssetId);
    res.json({ status: 'success', data: companion });
  }),

  deleteAvatar: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const companionId = parseId(req.params.id);
    const companion = await companionService.deleteAvatar(userId, companionId);
    res.json({ status: 'success', data: companion });
  }),
};
