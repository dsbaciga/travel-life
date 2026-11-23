import { Request, Response } from 'express';
import tripLanguageService from '../services/tripLanguage.service';
import languagePhraseService from '../services/languagePhrase.service';
import { AddTripLanguageSchema, LanguageCodeSchema, PhraseCategorySchema } from '../types/languagePhrase.types';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';
import { parseId } from '../http/parseId';
import { AppError } from '../errors/errors';

export const languagePhraseController = {
  /**
   * GET /api/languages
   * Get all available languages with phrase counts
   */
  getAvailableLanguages: asyncHandler(async (_req: Request, res: Response) => {
    const languages = languagePhraseService.getAvailableLanguages();

    res.json({
      status: 'success',
      data: languages,
    });
  }),

  /**
   * GET /api/phrases/:languageCode
   * Get all phrases for a specific language
   */
  getPhrasesByLanguage: asyncHandler(async (req: Request, res: Response) => {
    const { languageCode } = req.params;

    // Validate language code
    const validationResult = LanguageCodeSchema.safeParse(languageCode);
    if (!validationResult.success) {
      throw new AppError("That language code isn't recognized.", 400);
    }

    const language = languagePhraseService.getPhrasesByLanguage(languageCode);

    if (!language) {
      throw new AppError("We couldn't find that language.", 404);
    }

    res.json({
      status: 'success',
      data: language,
    });
  }),

  /**
   * GET /api/phrases/:languageCode/category/:category
   * Get phrases for a specific language and category
   */
  getPhrasesByCategory: asyncHandler(async (req: Request, res: Response) => {
    const { languageCode, category } = req.params;

    // Validate language code
    const languageValidation = LanguageCodeSchema.safeParse(languageCode);
    if (!languageValidation.success) {
      throw new AppError("That language code isn't recognized.", 400);
    }

    // Validate category
    const categoryValidation = PhraseCategorySchema.safeParse(category);
    if (!categoryValidation.success) {
      throw new AppError('Choose a category from the list.', 400);
    }

    const language = languagePhraseService.getPhrasesByLanguageAndCategory(
      languageValidation.data,
      categoryValidation.data
    );

    if (!language) {
      throw new AppError("We couldn't find that language.", 404);
    }

    res.json({
      status: 'success',
      data: language,
    });
  }),

  /**
   * GET /api/phrases/categories
   * Get all phrase categories
   */
  getCategories: asyncHandler(async (_req: Request, res: Response) => {
    const categories = languagePhraseService.getCategories();

    res.json({
      status: 'success',
      data: categories,
    });
  }),

  /**
   * GET /api/trips/:tripId/languages
   * Get all languages selected for a trip
   */
  getTripLanguages: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');

    const languages = await tripLanguageService.getLanguagesForTrip(tripId, userId);

    res.json({
      status: 'success',
      data: languages,
    });
  }),

  /**
   * POST /api/trips/:tripId/languages
   * Add a language to a trip
   */
  addTripLanguage: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const validatedData = AddTripLanguageSchema.parse(req.body);

    const language = await tripLanguageService.addLanguageToTrip(
      tripId,
      userId,
      validatedData
    );

    res.status(201).json({
      status: 'success',
      data: language,
    });
  }),

  /**
   * DELETE /api/trips/:tripId/languages/:languageCode
   * Remove a language from a trip
   */
  removeTripLanguage: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');
    const { languageCode } = req.params;

    await tripLanguageService.removeLanguageFromTrip(tripId, userId, languageCode);

    res.json({
      status: 'success',
      message: 'Language removed from trip',
    });
  }),

  /**
   * GET /api/trips/:tripId/phrases
   * Get phrases for all languages selected for a trip
   */
  getTripPhrases: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tripId = parseId(req.params.tripId, 'tripId');

    const languages = await languagePhraseService.getPhrasesForTrip(tripId, userId);

    res.json({
      status: 'success',
      data: { languages },
    });
  }),
};
