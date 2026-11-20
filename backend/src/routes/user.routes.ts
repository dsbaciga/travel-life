import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { sensitiveEndpointRateLimiter } from '../middleware/rateLimit';
import { userController } from '../controllers/user.controller';
import { travelPartnerRequestController } from '../controllers/travelPartnerRequest.controller';
import { calendarFeedController } from '../controllers/calendarFeed.controller';

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
 * /api/users/me/calendar-token:
 *   get:
 *     summary: Get the current iCal feed token (or null if none)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current token and feed path (both null if not generated)
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Generate or rotate the iCal feed token
 *     description: Rotating invalidates any previously issued feed URL.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: New token and feed path
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Revoke the iCal feed token
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token revoked, feed disabled
 *       401:
 *         description: Unauthorized
 */
router.get('/me/calendar-token', calendarFeedController.getCalendarToken);
router.post('/me/calendar-token', calendarFeedController.rotateCalendarToken);
router.delete('/me/calendar-token', calendarFeedController.revokeCalendarToken);

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
router.put('/settings/categories/rename', userController.renameCategory);
router.delete('/settings/categories/:categoryName', userController.deleteCategory);

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
 * /api/users/llm-settings:
 *   get:
 *     summary: Get the user's LLM (AI) settings
 *     description: >
 *       Per-user overrides for the LLM that powers PDF import and AI suggestions.
 *       The API key itself is never returned, only whether one is set.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: LLM settings (llmApiKeySet, llmBaseUrl, llmModel, llmConfigured)
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update the user's LLM (AI) settings
 *     description: >
 *       Any OpenAI-compatible endpoint. A base URL with no API key is allowed for
 *       local no-auth servers such as Ollama. Private-network URLs are rejected
 *       unless ALLOW_PRIVATE_INTEGRATION_URLS is enabled.
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
 *               llmApiKey:
 *                 type: string
 *                 nullable: true
 *               llmBaseUrl:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 description: e.g. http://192.168.1.50:11434/v1
 *               llmModel:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: LLM settings updated
 *       400:
 *         description: Validation error or disallowed URL
 *       401:
 *         description: Unauthorized
 */
router.get('/llm-settings', userController.getLlmSettings);
router.put('/llm-settings', userController.updateLlmSettings);

/**
 * @openapi
 * /api/users/maps-settings:
 *   get:
 *     summary: Get the preferred external maps app
 *     description: >
 *       Which maps/rideshare app the "Directions" deep links default to.
 *       Null means no preference has been set.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Maps app preference
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Set the preferred external maps app
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
 *               preferredMapsApp:
 *                 type: string
 *                 nullable: true
 *                 enum: [apple, google, citymapper, uber, lyft]
 *                 description: Pass null to clear the preference
 *     responses:
 *       200:
 *         description: Preference updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/maps-settings', userController.getMapsSettings);
router.put('/maps-settings', userController.updateMapsSettings);

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
 *       Set or clear YOUR OWN side of the travel partnership, and your default
 *       permission level. This never writes another user's row: setting a partner here
 *       only causes YOUR new trips to be auto-shared with them. To establish a mutual
 *       partnership, send a request via POST /api/users/travel-partner/requests and
 *       have the other user accept it.
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

/**
 * @openapi
 * /api/users/travel-partner/requests:
 *   get:
 *     summary: List pending travel partner requests
 *     description: |
 *       Returns the caller's pending requests in both directions:
 *       `incoming` (awaiting the caller's response) and `outgoing` (awaiting the
 *       other user's response). Both lists are scoped to the caller.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending requests, grouped into incoming and outgoing
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Send a travel partner request
 *     description: |
 *       Asks another user to become your travel partner. The partnership is only
 *       established when they accept — sending a request writes nothing to either
 *       user's profile.
 *
 *       Re-sending while a request to the same user is already pending refreshes that
 *       request rather than creating a duplicate. Rate limited to 10 requests per minute.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientId]
 *             properties:
 *               recipientId:
 *                 type: integer
 *                 description: ID of the user to ask (from GET /api/users/search)
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Optional personal note
 *               shareExistingTrips:
 *                 type: boolean
 *                 default: false
 *                 description: >
 *                   Opt in to sharing YOUR OWN existing trips with the recipient if they
 *                   accept. Never shares their trips with you — the recipient makes that
 *                   choice separately when accepting. Trips flagged excludeFromAutoShare
 *                   are skipped.
 *     responses:
 *       201:
 *         description: Request created or refreshed
 *       400:
 *         description: Validation error, self-request, or the request cannot be sent
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded (10 requests per minute)
 */
router.get('/travel-partner/requests', travelPartnerRequestController.getRequests);
router.post(
  '/travel-partner/requests',
  sensitiveEndpointRateLimiter,
  travelPartnerRequestController.sendRequest
);

/**
 * @openapi
 * /api/users/travel-partner/requests/{requestId}/accept:
 *   post:
 *     summary: Accept a travel partner request
 *     description: |
 *       Only the recipient of the request may accept it. Accepting establishes the
 *       partnership on both users — the one place where the other user's
 *       `travelPartnerId` is written, which is legitimate because both sides have now
 *       consented (the requester by sending, the recipient by accepting).
 *
 *       Existing trips are back-shared only where a side opted in, and each side's
 *       opt-in shares only that side's own trips.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shareExistingTrips:
 *                 type: boolean
 *                 default: false
 *                 description: >
 *                   Opt in to sharing YOUR OWN existing trips with the requester. Whether
 *                   THEIR existing trips are shared with you was their choice, made when
 *                   they sent the request. Trips flagged excludeFromAutoShare are skipped.
 *     responses:
 *       200:
 *         description: >
 *           Partnership established; returns the caller's travel partner settings plus
 *           sharedTripCount (your trips shared with them) and receivedTripCount
 *           (their trips shared with you)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found, already responded to, or the caller is not the recipient
 *       409:
 *         description: The requester now has a different travel partner
 */
router.post(
  '/travel-partner/requests/:requestId/accept',
  travelPartnerRequestController.acceptRequest
);

/**
 * @openapi
 * /api/users/travel-partner/requests/{requestId}/decline:
 *   post:
 *     summary: Decline a travel partner request
 *     description: Only the recipient of the request may decline it.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Request declined
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found, already responded to, or the caller is not the recipient
 */
router.post(
  '/travel-partner/requests/:requestId/decline',
  travelPartnerRequestController.declineRequest
);

/**
 * @openapi
 * /api/users/travel-partner/requests/{requestId}:
 *   delete:
 *     summary: Cancel a travel partner request you sent
 *     description: Only the requester may cancel; recipients decline instead.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Request cancelled
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Request not found, already responded to, or the caller is not the requester
 */
router.delete(
  '/travel-partner/requests/:requestId',
  travelPartnerRequestController.cancelRequest
);

/**
 * @openapi
 * /api/users/link-ingest:
 *   get:
 *     summary: Get saved-link email ingest settings
 *     description: >
 *       Returns the addresses trusted to forward links for this user, plus the
 *       server-configured ingest mailbox. The account's own email is always
 *       accepted and is returned for display but is not part of the editable list.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Link ingest settings
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Replace the list of trusted forwarding addresses
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [linkIngestSenders]
 *             properties:
 *               linkIngestSenders:
 *                 type: array
 *                 maxItems: 20
 *                 items:
 *                   type: string
 *                   format: email
 *     responses:
 *       200:
 *         description: Updated settings
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.get('/link-ingest', userController.getLinkIngestSettings);
router.put('/link-ingest', userController.updateLinkIngestSettings);

export default router;
