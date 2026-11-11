import { Request, Response } from 'express';
import { z } from 'zod';
import oidcService from '../services/oidc.service';
import { config } from '../config';
import { asyncHandler } from '../http/asyncHandler';
import {
  setRefreshTokenCookie,
  setOidcStateCookie,
  getOidcStateCookie,
  clearOidcStateCookie,
} from '../http/cookies';
import { generateCsrfToken, setCsrfCookie } from '../security/csrf';
import { AppError } from '../middleware/errorHandler';
import logger from '../config/logger';
import authService from '../services/auth.service';
import mobilePairingService from '../services/mobilePairing.service';
import { mobileOidcExchangeSchema, MOBILE_CODE_CHALLENGE_PATTERN } from '../types/auth.types';

/**
 * Where the OIDC callback sends the native app. A fixed constant, never taken
 * from the request: a caller-supplied redirect target here would be an open
 * redirect that leaks the exchange code to an arbitrary app.
 */
export const MOBILE_OIDC_REDIRECT = 'travellife://auth/oidc';

const oidcStateSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  redirect: z.string().optional(),
  // Set when the flow was started by the native app; the callback then hands
  // back a one-time exchange code via the app's URL scheme instead of cookies.
  // Holds the app's code challenge (SHA-256 hex of a verifier it keeps).
  mobileChallenge: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

type OidcStatePayload = z.infer<typeof oidcStateSchema>;

/** Only allow same-origin paths to prevent open redirects. */
const safeRedirectPath = (raw: string | undefined): string => {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
};

const redirectToLoginWithError = (res: Response, errorCode: string): void => {
  res.redirect(`${config.frontendUrl}/login?error=${errorCode}`);
};

export const oidcController = {
  /**
   * Public config so the login page knows whether to render the SSO button.
   * Never exposes secrets.
   */
  getConfig: asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'success',
      data: {
        enabled: config.oidc.enabled,
        buttonText: config.oidc.buttonText,
        passwordLoginDisabled: config.auth.passwordLoginDisabled && config.oidc.enabled,
      },
    });
  }),

  /**
   * Starts the OIDC authorization code flow (full-page redirect to the IdP).
   */
  login: asyncHandler(async (req: Request, res: Response) => {
    if (!config.oidc.enabled) {
      throw new AppError('OIDC is not configured', 404);
    }

    // A native login must bring a code challenge. The exchange code is returned
    // over a custom URL scheme, which any installed app can register for; without
    // a secret bound to the app that started the flow, a malicious app (or a web
    // page that merely links here) could capture a code and redeem it.
    let mobileChallenge: string | undefined;
    if (req.query.client === 'mobile') {
      const challenge = req.query.code_challenge;
      if (typeof challenge !== 'string' || !MOBILE_CODE_CHALLENGE_PATTERN.test(challenge)) {
        throw new AppError('Mobile sign-in requires a valid code_challenge', 400);
      }
      mobileChallenge = challenge;
    }

    const { url, state, codeVerifier } = await oidcService.createAuthorizationRequest();

    const statePayload: OidcStatePayload = {
      state,
      codeVerifier,
      redirect: safeRedirectPath(typeof req.query.redirect === 'string' ? req.query.redirect : undefined),
      mobileChallenge,
    };
    setOidcStateCookie(res, JSON.stringify(statePayload));

    res.redirect(url);
  }),

  /**
   * IdP redirects back here. On success sets the same refresh/CSRF cookies as a
   * password login and sends the browser to the frontend, where the silent
   * refresh flow picks up the session. Errors redirect to the login page with
   * an error code (this is a browser navigation, not an XHR).
   */
  callback: asyncHandler(async (req: Request, res: Response) => {
    if (!config.oidc.enabled) {
      redirectToLoginWithError(res, 'oidc_disabled');
      return;
    }

    const stateCookie = getOidcStateCookie(req.cookies);
    clearOidcStateCookie(res);

    if (typeof req.query.error === 'string') {
      logger.warn(`OIDC provider returned error: ${req.query.error}`);
      redirectToLoginWithError(res, 'oidc_denied');
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;

    let statePayload: OidcStatePayload | null = null;
    if (stateCookie) {
      try {
        const parsed = oidcStateSchema.safeParse(JSON.parse(stateCookie));
        statePayload = parsed.success ? parsed.data : null;
      } catch {
        statePayload = null; // malformed JSON
      }
    }

    if (!code || !state || !statePayload || statePayload.state !== state) {
      logger.warn('OIDC callback with missing or mismatched state');
      redirectToLoginWithError(res, 'oidc_invalid');
      return;
    }

    if (statePayload.mobileChallenge) {
      // Native flow: no cookies. The app receives a single-use code on its URL
      // scheme and swaps it for tokens over a normal API call, so the tokens
      // themselves never appear in a URL.
      try {
        const result = await oidcService.handleCallback(code, statePayload.codeVerifier);
        const exchange = mobilePairingService.createPairingToken(
          result.user.id,
          statePayload.mobileChallenge
        );
        logger.info(`User logged in via OIDC (mobile): ${result.user.email}`);
        res.redirect(`${MOBILE_OIDC_REDIRECT}?code=${exchange.token}`);
      } catch (error) {
        logger.error('Mobile OIDC callback failed', {
          error: error instanceof Error ? error.message : error,
        });
        res.redirect(`${MOBILE_OIDC_REDIRECT}?error=oidc_failed`);
      }
      return;
    }

    try {
      const result = await oidcService.handleCallback(code, statePayload.codeVerifier);

      setRefreshTokenCookie(res, result.refreshToken);
      setCsrfCookie(res, generateCsrfToken());

      logger.info(`User logged in via OIDC: ${result.user.email}`);
      res.redirect(`${config.frontendUrl}${safeRedirectPath(statePayload.redirect)}`);
    } catch (error) {
      logger.error('OIDC callback failed', { error: error instanceof Error ? error.message : error });
      // 403s carry two distinct user-facing meanings; showing "no account
      // exists" for an unverified email sends admins down the wrong path.
      let errorCode = 'oidc_failed';
      if (error instanceof AppError && error.statusCode === 403) {
        errorCode = error.message.includes('not verified') ? 'oidc_email_unverified' : 'oidc_not_allowed';
      }
      redirectToLoginWithError(res, errorCode);
    }
  }),

  /**
   * Native app: swap the one-time code from the OIDC redirect for tokens.
   */
  mobileExchange: asyncHandler(async (req: Request, res: Response) => {
    const { code, codeVerifier } = mobileOidcExchangeSchema.parse(req.body);
    const userId = mobilePairingService.redeem(code, codeVerifier);
    const result = await authService.issueTokensForUser(userId);
    res.status(200).json({
      status: 'success',
      data: { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken },
    });
  }),
};
