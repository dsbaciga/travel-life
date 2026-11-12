import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { oidcController } from '../controllers/oidc.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or user already exists
 */
router.post('/register', authController.register);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Login to the application
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful, returns tokens
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authController.login);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     description: Reads refresh token from httpOnly cookie (preferred) or request body (backward compatibility)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Legacy - refresh token (now read from cookie)
 *     responses:
 *       200:
 *         description: Access token refreshed (new refresh token set in cookie)
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', authController.refreshToken);

/**
 * @openapi
 * /api/auth/silent-refresh:
 *   post:
 *     summary: Silently refresh access token using httpOnly cookie
 *     tags: [Authentication]
 *     description: Used on page load to restore authentication state without exposing tokens to JavaScript
 *     responses:
 *       200:
 *         description: Returns user and access token if valid cookie exists, or null if not logged in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   oneOf:
 *                     - type: object
 *                       properties:
 *                         user:
 *                           type: object
 *                         accessToken:
 *                           type: string
 *                     - type: 'null'
 */
router.post('/silent-refresh', authController.silentRefresh);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticate, authController.getCurrentUser);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Logout from the application
 *     tags: [Authentication]
 *     description: Clears the refresh token cookie. No authentication required - this allows logout even with an expired access token.
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', authController.logout);

/**
 * @openapi
 * /api/auth/oidc/config:
 *   get:
 *     summary: Get public OIDC single sign-on configuration
 *     tags: [Authentication]
 *     description: Tells the login page whether SSO is enabled and what the button should say. Contains no secrets.
 *     responses:
 *       200:
 *         description: OIDC configuration
 */
router.get('/oidc/config', oidcController.getConfig);

/**
 * @openapi
 * /api/auth/oidc/login:
 *   get:
 *     summary: Start OIDC single sign-on
 *     tags: [Authentication]
 *     description: Full-page redirect to the configured identity provider (authorization code flow with PKCE).
 *     parameters:
 *       - in: query
 *         name: redirect
 *         schema:
 *           type: string
 *         description: Same-origin path to return to after login (defaults to /dashboard)
 *     responses:
 *       302:
 *         description: Redirect to the identity provider
 *       404:
 *         description: OIDC is not configured
 */
router.get('/oidc/login', oidcController.login);

/**
 * @openapi
 * /api/auth/oidc/callback:
 *   get:
 *     summary: OIDC callback endpoint
 *     tags: [Authentication]
 *     description: >
 *       The identity provider redirects here. On success, sets auth cookies and
 *       redirects to the frontend; on failure, redirects to the login page with
 *       an error code. For a flow started with `client=mobile`, success instead
 *       renders an HTML confirmation page; no exchange code exists until the
 *       user confirms via `/api/auth/oidc/mobile-confirm`.
 *     responses:
 *       200:
 *         description: Mobile flow - HTML confirmation page
 *       302:
 *         description: Redirect to the frontend
 */
router.get('/oidc/callback', oidcController.callback);

/**
 * @openapi
 * /api/auth/oidc/mobile-confirm:
 *   post:
 *     summary: Confirm or cancel a pending mobile OIDC sign-in
 *     description: >
 *       Posted by the form on the confirmation page the mobile callback renders,
 *       never by the app itself. `continue` mints the one-time exchange code and
 *       redirects to `travellife://auth/oidc?code=...`; `cancel` discards the
 *       pending sign-in and redirects to `travellife://auth/oidc?error=cancelled`.
 *       The nonce is single-use, expires after five minutes, and is the only
 *       credential (the route is CSRF-exempt).
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [nonce, action]
 *             properties:
 *               nonce:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [continue, cancel]
 *     responses:
 *       303:
 *         description: Redirect to the app URL scheme
 *       400:
 *         description: Malformed form (HTML error page)
 *       401:
 *         description: Nonce unknown, already used, or expired (HTML error page)
 */
router.post('/oidc/mobile-confirm', oidcController.mobileConfirm);

/**
 * @openapi
 * /api/auth/mobile/pairing-token:
 *   post:
 *     summary: Mint a single-use token for pairing the mobile companion app
 *     description: >
 *       Called by the signed-in web app. The response is rendered as a QR code
 *       that the phone scans to configure the server URL and sign in at once.
 *       The token expires after five minutes and can be redeemed once.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Pairing token created
 *       401:
 *         description: Unauthorized
 */
router.post('/mobile/pairing-token', authenticate, authController.createPairingToken);

/**
 * @openapi
 * /api/auth/mobile/pair:
 *   post:
 *     summary: Redeem a pairing token for mobile access and refresh tokens
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pairingToken]
 *             properties:
 *               pairingToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens issued in the response body
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Token invalid, already used, or expired
 */
router.post('/mobile/pair', authController.redeemPairingToken);

/**
 * @openapi
 * /api/auth/oidc/mobile-exchange:
 *   post:
 *     summary: Exchange the one-time code from a mobile OIDC login for tokens
 *     description: >
 *       Start the flow at
 *       `/api/auth/oidc/login?client=mobile&code_challenge=<sha256 hex of a random verifier>`.
 *       After the user confirms on the page the callback renders, the browser
 *       is redirected to `travellife://auth/oidc?code=...`; post that code here
 *       together with the verifier.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, codeVerifier]
 *             properties:
 *               code:
 *                 type: string
 *               codeVerifier:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens issued in the response body
 *       401:
 *         description: Code invalid, already used, expired, or verifier mismatch
 */
router.post('/oidc/mobile-exchange', oidcController.mobileExchange);

export default router;
