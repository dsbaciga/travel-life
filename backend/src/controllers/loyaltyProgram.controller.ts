import { Request, Response } from 'express';
import loyaltyProgramService from '../services/loyaltyProgram.service';
import {
  createLoyaltyProgramSchema,
  updateLoyaltyProgramSchema,
} from '../types/loyaltyProgram.types';
import { asyncHandler } from '../http/asyncHandler';
import { parseId } from '../http/parseId';
import { requireUserId } from '../auth/controllerHelpers';

export const loyaltyProgramController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = createLoyaltyProgramSchema.parse(req.body);
    const program = await loyaltyProgramService.create(userId, data);
    res.status(201).json({ status: 'success', data: program });
  }),

  getAll: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const programs = await loyaltyProgramService.getAll(userId);
    res.json({ status: 'success', data: programs });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const programId = parseId(req.params.id);
    const program = await loyaltyProgramService.getById(userId, programId);
    res.json({ status: 'success', data: program });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const programId = parseId(req.params.id);
    const data = updateLoyaltyProgramSchema.parse(req.body);
    const program = await loyaltyProgramService.update(userId, programId, data);
    res.json({ status: 'success', data: program });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const programId = parseId(req.params.id);
    await loyaltyProgramService.delete(userId, programId);
    res.status(200).json({ status: 'success', message: 'Loyalty program deleted successfully' });
  }),
};
