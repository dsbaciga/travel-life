import { Request, Response } from 'express';
import pushNotificationService from '../services/pushNotification.service';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '../types/push.types';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';
import { AppError } from '../errors/errors';
import { validateUrlNotInternal } from '../security/urlValidation';

export const pushController = {
  /**
   * Get the VAPID public key (null when push is not configured on the server)
   */
  getPublicKey: asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      status: 'success',
      data: {
        publicKey: pushNotificationService.getPublicKey(),
        configured: pushNotificationService.isConfigured(),
      },
    });
  }),

  /**
   * Subscribe the current user (upsert by endpoint)
   */
  subscribe: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    if (!pushNotificationService.isConfigured()) {
      throw new AppError('Push notifications are not configured on this server', 503);
    }
    const parsed = pushSubscribeSchema.parse(req.body);

    // The server later POSTs to this endpoint on the user's behalf, so it is an
    // outbound-request target the client chose. Real push services are public
    // HTTPS hosts; anything else is someone aiming the server at its own network.
    if (!/^https:\/\//i.test(parsed.endpoint)) {
      throw new AppError('Push endpoint must be an https URL', 400);
    }
    await validateUrlNotInternal(parsed.endpoint);

    const result = await pushNotificationService.saveSubscription(
      userId,
      {
        endpoint: parsed.endpoint,
        keys: { p256dh: parsed.keys.p256dh, auth: parsed.keys.auth },
      },
      req.headers['user-agent']
    );
    res.status(201).json({
      status: 'success',
      data: result,
    });
  }),

  /**
   * Unsubscribe the current user's subscription by endpoint
   */
  unsubscribe: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { endpoint } = pushUnsubscribeSchema.parse(req.body);
    const removed = await pushNotificationService.removeSubscription(
      userId,
      endpoint
    );
    res.json({
      status: 'success',
      data: { removed },
    });
  }),

  /**
   * Send a test notification to the caller's subscriptions
   */
  sendTest: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    if (!pushNotificationService.isConfigured()) {
      throw new AppError('Push notifications are not configured on this server', 503);
    }
    const sent = await pushNotificationService.sendToUser(userId, {
      title: 'Travel Life',
      body: 'Push notifications are working!',
      url: '/dashboard',
      tag: 'test-notification',
    });
    if (sent === 0) {
      throw new AppError(
        'No active push subscriptions found for this account',
        404
      );
    }
    res.json({
      status: 'success',
      data: { sent },
    });
  }),
};
