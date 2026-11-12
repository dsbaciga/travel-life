import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import authService from '../services/auth.service';
import { registerSchema, loginSchema, refreshTokenSchema, mobilePairSchema } from '../types/auth.types';
import { asyncHandler } from '../http/asyncHandler';
import { requireUserId } from '../auth/controllerHelpers';
import { setRefreshTokenCookie, clearRefreshTokenCookie, getRefreshTokenFromCookie } from '../http/cookies';
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie } from '../security/csrf';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config';
import logger from '../config/logger';
import { isMobileClient } from '../auth/clientPlatform';
import mobilePairingService from '../services/mobilePairing.service';

/** SSO-only mode is only honored while OIDC is enabled (lockout guard). */
const passwordAuthDisabled = (): boolean =>
  config.auth.passwordLoginDisabled && config.oidc.enabled;
import { blacklistToken } from '../services/tokenBlacklist.service';

/**
 * Extract the bearer access token from the Authorization header.
 * Mirrors the extraction logic in the authenticate middleware.
 * Returns undefined if not present or malformed.
 */
const getAccessTokenFromHeader = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authHeader.substring(7).trim();
  return token.length > 0 ? token : undefined;
};

/**
 * Compute remaining TTL (in milliseconds) for a JWT based on its `exp` claim.
 * Returns null if the token cannot be decoded or has no exp claim.
 * Returns 0 if the token has already expired (caller may skip blacklisting).
 */
const getRemainingTtlMs = (token: string): number | null => {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== 'object' || !('exp' in decoded)) return null;
  const { exp } = decoded;
  if (typeof exp !== 'number') return null;
  const remainingMs = exp * 1000 - Date.now();
  return remainingMs > 0 ? remainingMs : 0;
};

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    if (passwordAuthDisabled()) {
      throw new AppError('Password registration is disabled; use single sign-on', 403);
    }
    const validatedData = registerSchema.parse(req.body);
    const result = await authService.register(validatedData);

    if (isMobileClient(req)) {
      // Native client: tokens go in the body for expo-secure-store, no cookies.
      logger.info(`New user registered (mobile): ${result.user.email}`);
      res.status(201).json({
        status: 'success',
        data: { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken },
      });
      return;
    }

    // Set refresh token in httpOnly cookie
    setRefreshTokenCookie(res, result.refreshToken);

    // Set CSRF token in regular cookie for defense-in-depth
    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);

    logger.info(`New user registered: ${result.user.email}`);

    // Return access token in body (NOT refresh token - it's in the cookie)
    res.status(201).json({
      status: 'success',
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    if (passwordAuthDisabled()) {
      throw new AppError('Password login is disabled; use single sign-on', 403);
    }
    const validatedData = loginSchema.parse(req.body);
    const result = await authService.login(validatedData);

    if (isMobileClient(req)) {
      // Native client: tokens go in the body for expo-secure-store, no cookies.
      logger.info(`User logged in (mobile): ${result.user.email}`);
      res.status(200).json({
        status: 'success',
        data: { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken },
      });
      return;
    }

    // Set refresh token in httpOnly cookie
    setRefreshTokenCookie(res, result.refreshToken);

    // Set CSRF token in regular cookie for defense-in-depth
    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);

    logger.info(`User logged in: ${result.user.email}`);

    // Return access token in body (NOT refresh token - it's in the cookie)
    res.status(200).json({
      status: 'success',
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  }),

  refreshToken: asyncHandler(async (req: Request, res: Response) => {
    // Try cookie first, fall back to body for backward compatibility during migration
    const mobile = isMobileClient(req);
    // A native client never holds the cookie; take its token from the body only,
    // so a stray cookie on the same host can never be rotated on its behalf.
    const refreshToken = mobile
      ? refreshTokenSchema.parse(req.body).refreshToken
      : getRefreshTokenFromCookie(req.cookies) || refreshTokenSchema.parse(req.body).refreshToken;

    if (!refreshToken) {
      throw new AppError('No refresh token provided', 401);
    }

    if (mobile) {
      // Rotation still applies: the old token is single-use, and the replacement
      // travels back in the body. Errors propagate as 401 with no cookie work.
      const rotated = await authService.refreshToken(refreshToken);
      res.status(200).json({
        status: 'success',
        data: {
          user: rotated.user,
          accessToken: rotated.accessToken,
          refreshToken: rotated.refreshToken,
        },
      });
      return;
    }

    // Do NOT short-circuit revoked tokens here. Refresh tokens are single-use,
    // so a revoked one being replayed means the family is compromised;
    // authService.refreshToken() detects that and invalidates every outstanding
    // token for the user. Short-circuiting would reject the replay but leave a
    // thief's freshly-rotated session alive.
    let result;
    try {
      result = await authService.refreshToken(refreshToken);
    } catch (error) {
      // Any refresh failure (revoked, expired, tampered) ends the session here.
      clearRefreshTokenCookie(res);
      clearCsrfCookie(res);
      throw error;
    }

    // Set new refresh token in cookie (token rotation)
    setRefreshTokenCookie(res, result.refreshToken);

    // Rotate CSRF token on refresh for additional security
    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);

    res.status(200).json({
      status: 'success',
      data: {
        accessToken: result.accessToken,
      },
    });
  }),

  getCurrentUser: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const user = await authService.getCurrentUser(userId);

    res.status(200).json({
      status: 'success',
      data: user,
    });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    // Blacklist the refresh token to enable immediate revocation. A native
    // client has no cookie and sends its refresh token in the body instead.
    const bodyToken: unknown = isMobileClient(req) ? req.body?.refreshToken : undefined;
    const refreshToken =
      getRefreshTokenFromCookie(req.cookies) || (typeof bodyToken === 'string' ? bodyToken : undefined);
    if (refreshToken) {
      blacklistToken(refreshToken);
      logger.debug('Refresh token blacklisted on logout');
    }

    // Also blacklist the access token so a stolen access token cannot be reused
    // until its natural expiry (~15 min). Wrapped in try/catch because a malformed
    // or already-expired access token must not fail the logout.
    const accessToken = getAccessTokenFromHeader(req);
    if (accessToken) {
      try {
        const remainingMs = getRemainingTtlMs(accessToken);
        if (remainingMs === null) {
          logger.warn('Could not decode access token on logout; skipping access-token blacklist');
        } else if (remainingMs > 0) {
          blacklistToken(accessToken, remainingMs);
          logger.debug('Access token blacklisted on logout');
        }
        // remainingMs === 0: token already expired, no need to blacklist
      } catch (err) {
        logger.warn('Failed to blacklist access token on logout; continuing with logout', { error: err });
      }
    }

    // Clear the refresh token cookie
    clearRefreshTokenCookie(res);

    // Clear the CSRF token cookie
    clearCsrfCookie(res);

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  }),

  /**
   * Silent refresh endpoint for restoring auth state on page load.
   * Uses httpOnly cookie to refresh tokens without JavaScript access.
   */
  silentRefresh: asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = getRefreshTokenFromCookie(req.cookies);

    if (!refreshToken) {
      // No cookie - user is not logged in, this is not an error
      res.status(200).json({
        status: 'success',
        data: null, // Indicates no active session
      });
      return;
    }

    // As in `refresh` above, revoked tokens are deliberately NOT short-circuited
    // here: authService.refreshToken() treats a replayed single-use token as a
    // compromised family and invalidates every outstanding token for the user.
    // The catch below still degrades to "no active session" for the client.
    try {
      // Get new tokens and user data (single verification in authService.refreshToken)
      const result = await authService.refreshToken(refreshToken);

      // Set new refresh token in cookie
      setRefreshTokenCookie(res, result.refreshToken);

      // Set CSRF token in regular cookie for defense-in-depth
      const csrfToken = generateCsrfToken();
      setCsrfCookie(res, csrfToken);

      res.status(200).json({
        status: 'success',
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch {
      // Invalid/expired token - clear the bad cookies
      clearRefreshTokenCookie(res);
      clearCsrfCookie(res);
      res.status(200).json({
        status: 'success',
        data: null,
      });
    }
  }),

  /**
   * Web -> phone handoff, step 1. The signed-in web user asks for a short-lived
   * single-use pairing token, which Settings renders as a QR code together with
   * the server URL.
   */
  createPairingToken: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const pairing = mobilePairingService.createPairingToken(userId);
    res.status(201).json({
      status: 'success',
      data: {
        pairingToken: pairing.token,
        expiresAt: pairing.expiresAt.toISOString(),
        // The public origin the phone should talk to. BASE_URL is what an admin
        // configured as the externally reachable address of this API.
        serverUrl: config.baseUrl,
      },
    });
  }),

  /**
   * Web -> phone handoff, step 2. The phone redeems the scanned token for its own
   * access/refresh token pair. Unauthenticated by design: the token is the
   * credential (256 bits, single use, 5 minutes).
   */
  redeemPairingToken: asyncHandler(async (req: Request, res: Response) => {
    const { pairingToken } = mobilePairSchema.parse(req.body);
    const userId = mobilePairingService.redeem(pairingToken);
    const result = await authService.issueTokensForUser(userId);
    logger.info(`Mobile app paired for user: ${result.user.email}`);
    res.status(200).json({
      status: 'success',
      data: { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken },
    });
  }),
};
