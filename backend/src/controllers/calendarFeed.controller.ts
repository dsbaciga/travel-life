import { Request, Response } from 'express';
import { calendarFeedService } from '../services/calendarFeed.service';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';
import { AppError } from '../errors/errors';

// Feed tokens are 32 random bytes hex-encoded
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export const calendarFeedController = {
  getCalendarToken: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = await calendarFeedService.getCalendarToken(userId);
    res.json({ status: 'success', data });
  }),

  rotateCalendarToken: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = await calendarFeedService.rotateCalendarToken(userId);
    res.json({ status: 'success', data });
  }),

  revokeCalendarToken: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    await calendarFeedService.revokeCalendarToken(userId);
    res.json({ status: 'success', data: { message: 'Calendar feed disabled' } });
  }),

  /**
   * Unauthenticated ICS feed endpoint. The secret token in the URL is the
   * only credential. Returns raw text/calendar (no JSON envelope).
   */
  getFeed: asyncHandler(async (req: Request, res: Response) => {
    const rawToken = req.params.token ?? '';
    // Accept both /:token and /:token.ics
    const token = rawToken.endsWith('.ics') ? rawToken.slice(0, -4) : rawToken;
    if (!TOKEN_PATTERN.test(token)) {
      throw new AppError("We couldn't find that calendar feed.", 404);
    }

    const ics = await calendarFeedService.generateFeedForToken(token);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="travel-life.ics"');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(ics);
  }),
};
