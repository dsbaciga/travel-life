import { Request, Response } from 'express';
import shareService from '../services/share.service';
import { shareTokenSchema } from '../validation/share';
import { AppError } from '../errors/errors';
import { asyncHandler } from '../http/asyncHandler';
import { parseId } from '../http/parseId';
import { requireUserId } from '../auth/controllerHelpers';
import logger from '../config/logger';

/**
 * Parse the share token from the URL. A malformed token can never match a
 * real trip, so it is reported as a 404 (not a 400) to keep the public
 * endpoint's behavior uniform for invalid links.
 */
const parseShareToken = (raw: string | undefined): string => {
  const result = shareTokenSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError("We couldn't find that shared trip.", 404);
  }
  return result.data;
};

export const shareController = {
  // ------------------------------------------------------------------
  // Authenticated, owner-only share management
  // ------------------------------------------------------------------

  enableShare: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const shareInfo = await shareService.enableShare(userId, tripId);

    logger.info(`Sharing enabled for trip ${tripId} by user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: shareInfo,
    });
  }),

  rotateShareToken: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const shareInfo = await shareService.rotateShareToken(userId, tripId);

    logger.info(`Share token rotated for trip ${tripId} by user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: shareInfo,
    });
  }),

  disableShare: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.id, 'tripId');
    const shareInfo = await shareService.disableShare(userId, tripId);

    logger.info(`Sharing disabled for trip ${tripId} by user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: shareInfo,
    });
  }),

  // ------------------------------------------------------------------
  // Public, unauthenticated endpoints
  // ------------------------------------------------------------------

  getPublicTrip: asyncHandler(async (req: Request, res: Response) => {
    const token = parseShareToken(req.params.token);
    const trip = await shareService.getPublicTrip(token);

    res.status(200).json({
      status: 'success',
      data: trip,
    });
  }),

  getPublicPhotoFile: asyncHandler(async (req: Request, res: Response) => {
    const token = parseShareToken(req.params.token);
    const photoId = parseId(req.params.photoId, 'photoId');
    const filePath = await shareService.getPublicPhotoFilePath(token, photoId, 'full');

    res.sendFile(filePath);
  }),

  getPublicPhotoThumbnail: asyncHandler(async (req: Request, res: Response) => {
    const token = parseShareToken(req.params.token);
    const photoId = parseId(req.params.photoId, 'photoId');
    const filePath = await shareService.getPublicPhotoFilePath(token, photoId, 'thumbnail');

    res.sendFile(filePath);
  }),
};
