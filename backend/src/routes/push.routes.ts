import express from 'express';
import { authenticate } from '../middleware/auth';
import { pushController } from '../controllers/push.controller';
import { mobilePushController } from '../controllers/mobile.controller';

const router = express.Router();

/**
 * @openapi
 * /api/push/public-key:
 *   get:
 *     summary: Get the VAPID public key for web push subscriptions
 *     description: Returns null when push notifications are not configured on the server
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The VAPID public key (or null) and configured flag
 *       401:
 *         description: Unauthorized
 */
router.get('/public-key', authenticate, pushController.getPublicKey);

/**
 * @openapi
 * /api/push/subscribe:
 *   post:
 *     summary: Register a web push subscription for the current user
 *     description: Body is a standard PushSubscription JSON (endpoint + keys). Upserts by endpoint.
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint, keys]
 *             properties:
 *               endpoint:
 *                 type: string
 *               expirationTime:
 *                 type: number
 *                 nullable: true
 *               keys:
 *                 type: object
 *                 required: [p256dh, auth]
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
 *     responses:
 *       201:
 *         description: Subscription saved
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Push notifications not configured on the server
 */
router.post('/subscribe', authenticate, pushController.subscribe);

/**
 * @openapi
 * /api/push/subscribe:
 *   delete:
 *     summary: Remove a web push subscription for the current user
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endpoint]
 *             properties:
 *               endpoint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscription removed
 *       401:
 *         description: Unauthorized
 */
router.delete('/subscribe', authenticate, pushController.unsubscribe);

/**
 * @openapi
 * /api/push/test:
 *   post:
 *     summary: Send a test push notification to the caller
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test notification sent
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No active subscriptions for this account
 *       503:
 *         description: Push notifications not configured on the server
 */
router.post('/test', authenticate, pushController.sendTest);

/**
 * @openapi
 * /api/push/mobile-token:
 *   post:
 *     summary: Register the native companion app's Expo push token
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, platform]
 *             properties:
 *               token: { type: string, example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }
 *               platform: { type: string, enum: [ios, android] }
 *               deviceName: { type: string }
 *     responses:
 *       201:
 *         description: Token registered
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Remove a native push token (on logout)
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Number of tokens removed
 *       401:
 *         description: Unauthorized
 */
router.post('/mobile-token', authenticate, mobilePushController.registerToken);
router.delete('/mobile-token', authenticate, mobilePushController.unregisterToken);

export default router;
