import { Request, Response } from 'express';
import { tagService } from '../services/tag.service';
import { createTagSchema, updateTagSchema, linkTagToTripSchema } from '../types/tag.types';
import { asyncHandler } from '../utils/asyncHandler';
import { parseId } from '../utils/parseId';
import { requireUserId } from '../utils/controllerHelpers';
import { z } from 'zod';

export const tagController = {
  createTag: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = createTagSchema.parse(req.body);
    const tag = await tagService.createTag(userId, data);
    res.status(201).json({ status: 'success', data: tag });
  }),

  getTagsByUser: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tags = await tagService.getTagsByUser(userId);
    res.json({ status: 'success', data: tags });
  }),

  getTagById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tagId = parseId(req.params.id);
    const tag = await tagService.getTagById(userId, tagId);
    res.json({ status: 'success', data: tag });
  }),

  updateTag: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tagId = parseId(req.params.id);
    const data = updateTagSchema.parse(req.body);
    const tag = await tagService.updateTag(userId, tagId, data);
    res.json({ status: 'success', data: tag });
  }),

  deleteTag: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tagId = parseId(req.params.id);
    await tagService.deleteTag(userId, tagId);
    res.status(200).json({ status: 'success', message: 'Tag deleted successfully' });
  }),

  reorderTags: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { tagIds } = z.object({
      tagIds: z.array(z.number().int().positive()),
    }).parse(req.body);
    const tags = await tagService.reorderTags(userId, tagIds);
    res.json({ status: 'success', data: tags });
  }),

  linkTagToTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = linkTagToTripSchema.parse(req.body);
    const link = await tagService.linkTagToTrip(userId, data);
    res.status(201).json({ status: 'success', data: link });
  }),

  unlinkTagFromTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const tagId = parseId(req.params.tagId, 'tagId');
    await tagService.unlinkTagFromTrip(userId, tripId, tagId);
    res.status(200).json({ status: 'success', message: 'Tag unlinked from trip' });
  }),

  getTagsByTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const tags = await tagService.getTagsByTrip(userId, tripId);
    res.json({ status: 'success', data: tags });
  }),
};
