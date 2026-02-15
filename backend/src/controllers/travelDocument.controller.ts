import { Request, Response } from 'express';
import travelDocumentService from '../services/travelDocument.service';
import {
  createTravelDocumentSchema,
  updateTravelDocumentSchema,
} from '../types/travelDocument.types';
import { asyncHandler } from '../utils/asyncHandler';
import { parseId } from '../utils/parseId';
import { requireUserId } from '../utils/controllerHelpers';

export const travelDocumentController = {
  /**
   * Create a new travel document
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = createTravelDocumentSchema.parse(req.body);
    const document = await travelDocumentService.create(userId, data);
    res.status(201).json({
      status: 'success',
      data: document,
    });
  }),

  /**
   * Get all travel documents for the authenticated user
   */
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documents = await travelDocumentService.getAll(userId);
    res.json({
      status: 'success',
      data: documents,
    });
  }),

  /**
   * Get a single travel document by ID
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = parseId(req.params.id);
    const document = await travelDocumentService.getById(userId, documentId);
    res.json({
      status: 'success',
      data: document,
    });
  }),

  /**
   * Update a travel document
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = parseId(req.params.id);
    const data = updateTravelDocumentSchema.parse(req.body);
    const document = await travelDocumentService.update(userId, documentId, data);
    res.json({
      status: 'success',
      data: document,
    });
  }),

  /**
   * Delete a travel document
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const documentId = parseId(req.params.id);
    await travelDocumentService.delete(userId, documentId);
    res.status(200).json({ status: 'success', message: 'Document deleted successfully' });
  }),

  /**
   * Get documents requiring attention (expiring within alert window)
   */
  getAlerts: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const alerts = await travelDocumentService.getDocumentsRequiringAttention(userId);
    res.json({
      status: 'success',
      data: alerts,
    });
  }),

  /**
   * Check document validity for a specific trip
   */
  checkForTrip: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const check = await travelDocumentService.checkDocumentValidityForTrip(userId, tripId);
    res.json({
      status: 'success',
      data: check,
    });
  }),

  /**
   * Get primary passport
   */
  getPrimaryPassport: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const passport = await travelDocumentService.getPrimaryPassport(userId);
    res.json({
      status: 'success',
      data: passport,
    });
  }),
};
