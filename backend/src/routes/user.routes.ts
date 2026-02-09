import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { sensitiveEndpointRateLimiter } from '../middleware/rateLimit';
import { userController } from '../controllers/user.controller';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *       401:
 *         description: Unauthorized
 */
router.get('/me', userController.getMe);

/**
 * @openapi
 * /api/users/settings:
 *   put:
 *     summary: Update user settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               homeTimezone:
 *                 type: string
 *                 description: User's home timezone (e.g., America/New_York)
 *               theme:
 *                 type: string
 *                 enum: [light, dark, system]
 *               defaultCurrency:
 *                 type: string
 *                 description: Default currency code (e.g., USD)
 *               locationCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Custom location categories
 *               activityCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Custom activity categories
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/settings', userController.updateSettings);
router.put('/settings/trip-types/rename', userController.renameTripType);
router.delete('/settings/trip-types/:typeName', userController.deleteTripType);

/**
 * @openapi
 * /api/users/immich-settings:
 *   get:
 *     summary: Get Immich integration settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Immich settings (URL and whether API key is set)
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update Immich integration settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               immichUrl:
 *                 type: string
 *                 format: uri
 *                 description: Immich server URL
 *               immichApiKey:
 *                 type: string
 *                 description: Immich API key
 *     responses:
 *       200:
 *         description: Immich settings updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/immich-settings', userController.getImmichSettings);
router.put('/immich-settings', userController.updateImmichSettings);

/**
 * @openapi
 * /api/users/weather-settings:
 *   get:
 *     summary: Get weather integration settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Weather settings (whether API key is set)
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update weather integration settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               openWeatherMapApiKey:
 *                 type: string
 *                 description: OpenWeatherMap API key
 *     responses:
 *       200:
 *         description: Weather settings updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/weather-settings', userController.getWeatherSettings);
router.put('/weather-settings', userController.updateWeatherSettings);

/**
 * @openapi
 * /api/users/aviationstack-settings:
 *   get:
 *     summary: Get AviationStack integration settings
 *     description: Settings for flight tracking via AviationStack API
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AviationStack settings (whether API key is set)
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update AviationStack integration settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               aviationstackApiKey:
 *                 type: string
 *                 description: AviationStack API key
 *     responses:
 *       200:
 *         description: AviationStack settings updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/aviationstack-settings', userController.getAviationstackSettings);
router.put('/aviationstack-settings', userController.updateAviationstackSettings);

/**
 * @openapi
 * /api/users/openrouteservice-settings:
 *   get:
 *     summary: Get OpenRouteService integration settings
 *     description: Settings for route distance calculations
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OpenRouteService settings (whether API key is set)
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update OpenRouteService integration settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               openrouteserviceApiKey:
 *                 type: string
 *                 description: OpenRouteService API key
 *     responses:
 *       200:
 *         description: OpenRouteService settings updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/openrouteservice-settings', userController.getOpenrouteserviceSettings);
router.put('/openrouteservice-settings', userController.updateOpenrouteserviceSettings);

/**
 * @openapi
 * /api/users/smtp-settings:
 *   get:
 *     summary: Get SMTP email settings
 *     description: Returns SMTP configuration (password is never returned, only whether it's set)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SMTP settings
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update SMTP email settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SMTP settings updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/smtp-settings', userController.getSmtpSettings);
router.put('/smtp-settings', userController.updateSmtpSettings);

/**
 * @openapi
 * /api/users/smtp-settings/test:
 *   post:
 *     summary: Test SMTP email configuration
 *     description: Sends a test email to the current user's email address
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test email sent successfully
 *       400:
 *         description: Failed to send test email
 *       401:
 *         description: Unauthorized
 */
router.post('/smtp-settings/test', userController.testSmtpSettings);

/**
 * @openapi
 * /api/users/username:
 *   put:
 *     summary: Update username
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *     responses:
 *       200:
 *         description: Username updated successfully
 *       400:
 *         description: Validation error or username taken
 *       401:
 *         description: Unauthorized
 */
router.put('/username', userController.updateUsername);

/**
 * @openapi
 * /api/users/password:
 *   put:
 *     summary: Update password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password for verification
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: New password (minimum 8 characters)
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Current password incorrect
 */
router.put('/password', userController.updatePassword);

/**
 * @openapi
 * /api/users/search:
 *   get:
 *     summary: Search users by email or username
 *     description: |
 *       Search for users to set as travel partner. Excludes the current user.
 *       Rate limited to 10 requests per minute to prevent enumeration attacks.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 3
 *         description: Search query (email or username, minimum 3 characters)
 *     responses:
 *       200:
 *         description: List of matching users
 *       400:
 *         description: Invalid query
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Too many requests - rate limit exceeded (10 requests per minute)
 */
router.get('/search', sensitiveEndpointRateLimiter, userController.searchUsers);

/**
 * @openapi
 * /api/users/travel-partner:
 *   get:
 *     summary: Get travel partner settings
 *     description: Get the current user's travel partner configuration
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Travel partner settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 travelPartnerId:
 *                   type: integer
 *                   nullable: true
 *                 defaultPartnerPermission:
 *                   type: string
 *                   enum: [view, edit, admin]
 *                 travelPartner:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     avatarUrl:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update travel partner settings
 *     description: |
 *       Set or clear the travel partner. Partnership is bidirectional - when you set
 *       someone as your partner, you automatically become their partner too.
 *
 *       Each user controls their own defaultPartnerPermission independently.
 *       Rate limited to 10 requests per minute.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               travelPartnerId:
 *                 type: integer
 *                 nullable: true
 *                 description: ID of user to set as travel partner, or null to clear
 *               defaultPartnerPermission:
 *                 type: string
 *                 enum: [view, edit, admin]
 *                 description: Permission level for YOUR auto-shared trips (each user controls their own)
 *     responses:
 *       200:
 *         description: Travel partner settings updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Partner user not found
 *       429:
 *         description: Rate limit exceeded (10 requests per minute)
 */
router.get('/travel-partner', userController.getTravelPartnerSettings);
router.put('/travel-partner', sensitiveEndpointRateLimiter, userController.updateTravelPartnerSettings);

export default router;
