import { Request, Response } from 'express';
import { z } from 'zod';
import photoService from '../services/photo.service';
import albumSuggestionService from '../services/albumSuggestion.service';
import {
  uploadPhotoSchema,
  linkImmichPhotoSchema,
  linkImmichPhotoBatchSchema,
  updatePhotoSchema,
  acceptAlbumSuggestionSchema,
  PhotoWithOptionalAlbums,
  TransformedPhoto,
} from '../types/photo.types';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { parseId } from '../utils/parseId';
import { requireUserId } from '../utils/controllerHelpers';

const photoQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(1000).default(20),
  albumId: z.coerce.number().int().optional(),
  sortBy: z.enum(['date', 'caption', 'location', 'created']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Helper function to add Immich URLs for photos and transform album assignments
function transformPhoto(photo: PhotoWithOptionalAlbums): TransformedPhoto {
  const transformed: TransformedPhoto = { ...photo };

  // Transform Immich paths
  if (photo.source === 'immich' && photo.immichAssetId) {
    transformed.thumbnailPath = `/api/immich/assets/${photo.immichAssetId}/thumbnail`;
    transformed.localPath = `/api/immich/assets/${photo.immichAssetId}/original`;
  }

  // Transform albumAssignments to albums for frontend compatibility
  if (photo.albumAssignments) {
    transformed.albums = photo.albumAssignments.map((assignment) => ({
      album: assignment.album,
    }));
    delete (transformed as { albumAssignments?: unknown }).albumAssignments;
  }

  return transformed;
}

export const photoController = {
  uploadPhoto: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError('No file provided', 400);
    }

    const validatedData = uploadPhotoSchema.parse({
      ...req.body,
      tripId: parseInt(req.body.tripId),
      latitude: req.body.latitude ? parseFloat(req.body.latitude) : undefined,
      longitude: req.body.longitude
        ? parseFloat(req.body.longitude)
        : undefined,
    });

    const photo = await photoService.uploadPhoto(
      requireUserId(req),
      req.file,
      validatedData
    );

    res.status(201).json({ status: 'success', data: transformPhoto(photo) });
  }),

  linkImmichPhoto: asyncHandler(async (req: Request, res: Response) => {
    const validatedData = linkImmichPhotoSchema.parse(req.body);
    const photo = await photoService.linkImmichPhoto(
      requireUserId(req),
      validatedData
    );

    res.status(201).json({ status: 'success', data: transformPhoto(photo) });
  }),

  linkImmichPhotosBatch: asyncHandler(async (req: Request, res: Response) => {
    const validatedData = linkImmichPhotoBatchSchema.parse(req.body);
    const results = await photoService.linkImmichPhotosBatch(
      requireUserId(req),
      validatedData
    );

    res.status(201).json({
      status: 'success',
      data: results,
      message: `Successfully linked ${results.successful} photos (${results.failed} failed)`,
    });
  }),

  getPhotosByTrip: asyncHandler(async (req: Request, res: Response) => {
    const tripId = parseId(req.params.tripId, 'tripId');
    const { skip, take, sortBy, sortOrder } = photoQuerySchema.parse(req.query);

    const result = await photoService.getPhotosByTrip(requireUserId(req), tripId, {
      skip,
      take,
      sortBy,
      sortOrder,
    });

    // Add thumbnail URLs for Immich photos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma returns partial album selects and Decimal types that don't match PhotoWithOptionalAlbums at compile time
    const photosWithUrls = result.photos.map((photo: any) => transformPhoto(photo));

    res.json({
      status: 'success',
      data: {
        photos: photosWithUrls,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  }),

  getImmichAssetIdsByTrip: asyncHandler(async (req: Request, res: Response) => {
    const tripId = parseId(req.params.tripId, 'tripId');
    const assetIds = await photoService.getImmichAssetIdsByTrip(requireUserId(req), tripId);
    res.json({ status: 'success', data: { assetIds } });
  }),

  getUnsortedPhotosByTrip: asyncHandler(async (req: Request, res: Response) => {
    const tripId = parseId(req.params.tripId, 'tripId');
    const { skip, take, sortBy, sortOrder } = photoQuerySchema.parse(req.query);

    const result = await photoService.getUnsortedPhotosByTrip(requireUserId(req), tripId, {
      skip,
      take,
      sortBy,
      sortOrder,
    });

    // Add thumbnail URLs for Immich photos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma returns partial album selects and Decimal types that don't match PhotoWithOptionalAlbums at compile time
    const photosWithUrls = result.photos.map((photo: any) => transformPhoto(photo));

    res.json({
      status: 'success',
      data: {
        photos: photosWithUrls,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  }),

  getPhotoById: asyncHandler(async (req: Request, res: Response) => {
    const photoId = parseId(req.params.id);
    const photo = await photoService.getPhotoById(requireUserId(req), photoId);

    if (!photo) {
      throw new AppError('Photo not found', 404);
    }

    res.json({ status: 'success', data: transformPhoto(photo) });
  }),

  updatePhoto: asyncHandler(async (req: Request, res: Response) => {
    const photoId = parseId(req.params.id);
    const validatedData = updatePhotoSchema.parse(req.body);
    const photo = await photoService.updatePhoto(
      requireUserId(req),
      photoId,
      validatedData
    );

    res.json({ status: 'success', data: transformPhoto(photo) });
  }),

  deletePhoto: asyncHandler(async (req: Request, res: Response) => {
    const photoId = parseId(req.params.id);
    await photoService.deletePhoto(requireUserId(req), photoId);

    res.status(200).json({ status: 'success', message: 'Photo deleted successfully' });
  }),

  getPhotoDateGroupings: asyncHandler(async (req: Request, res: Response) => {
    const tripId = parseId(req.params.tripId, 'tripId');
    const timezone = req.query.timezone as string | undefined;

    const result = await photoService.getPhotoDateGroupings(
      requireUserId(req),
      tripId,
      timezone
    );
    res.json({ status: 'success', data: result });
  }),

  getPhotosByDate: asyncHandler(async (req: Request, res: Response) => {
    const tripId = parseId(req.params.tripId, 'tripId');
    const date = req.params.date; // YYYY-MM-DD format
    const timezone = req.query.timezone as string | undefined;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD', 400);
    }

    // Validate date is a valid calendar date
    const parsedDate = new Date(date + 'T12:00:00Z');
    if (isNaN(parsedDate.getTime())) {
      throw new AppError('Invalid date value', 400);
    }

    const result = await photoService.getPhotosByDate(
      requireUserId(req),
      tripId,
      date,
      timezone
    );

    // Transform photos for frontend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Raw SQL returns DecimalValue types and partial album data that don't match PhotoWithOptionalAlbums at compile time
    const photosWithUrls = result.photos.map((photo: any) => transformPhoto(photo));

    res.json({
      status: 'success',
      data: {
        photos: photosWithUrls,
        date: result.date,
        count: result.count,
      },
    });
  }),

  getAlbumSuggestions: asyncHandler(async (req: Request, res: Response) => {
    const tripId = parseId(req.params.tripId, 'tripId');
    const suggestions = await albumSuggestionService.getAlbumSuggestions(
      requireUserId(req),
      tripId
    );

    res.json({ status: 'success', data: suggestions });
  }),

  acceptAlbumSuggestion: asyncHandler(async (req: Request, res: Response) => {
    const tripId = parseId(req.params.tripId, 'tripId');

    // Validate input with Zod schema
    const validationResult = acceptAlbumSuggestionSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new AppError(
        `Invalid suggestion data: ${validationResult.error.errors.map(e => e.message).join(', ')}`,
        400
      );
    }

    const { name, photoIds } = validationResult.data;

    const result = await albumSuggestionService.acceptSuggestion(
      requireUserId(req),
      tripId,
      { name, photoIds }
    );

    res.status(201).json({ status: 'success', data: result });
  }),
};
