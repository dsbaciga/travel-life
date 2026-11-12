import { Request, Response } from 'express';
import memoriesService from '../services/memories.service';
import { AppError } from '../errors/errors';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';

/**
 * Parse an optional positive-integer query parameter, throwing a 400 for
 * malformed values.
 */
function parseOptionalIntQuery(value: unknown, paramName: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new AppError(`Invalid ${paramName}: must be a number`, 400);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(`Invalid ${paramName}: must be a positive integer`, 400);
  }
  return parsed;
}

export const memoriesController = {
  getOnThisDay: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    // Optional month/day overrides let the client use its local date
    // (the server may be in a different timezone).
    const month = parseOptionalIntQuery(req.query.month, 'month');
    const day = parseOptionalIntQuery(req.query.day, 'day');
    const memories = await memoriesService.getOnThisDay(userId, month, day);
    res.json({
      status: 'success',
      data: memories,
    });
  }),

  getYearInReview: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const year = Number(req.params.year);
    if (!Number.isInteger(year)) {
      throw new AppError('Invalid year: must be an integer', 400);
    }
    const review = await memoriesService.getYearInReview(
      userId,
      year,
      req.query.includePlanning === 'true'
    );
    res.json({
      status: 'success',
      data: review,
    });
  }),
};
