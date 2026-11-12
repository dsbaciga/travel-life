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
import {
  mobileOidcExchangeSchema,
  mobileOidcConfirmSchema,
  MOBILE_CODE_CHALLENGE_PATTERN,
} from '../types/auth.types';
import { sendMobileConfirmPage, sendMobileSignInErrorPage } from '../http/mobileSignInPages';

/**
 * Where the OIDC callback sends the native app. A fixed constant, never taken
 * from the request: a caller-supplied redirect target here would be an open
 * redirect that leaks the exchange code to an arbitrary app.
 */
export const MOBILE_OIDC_REDIRECT = 'travellife://auth/oidc';

/** The scheme part of `MOBILE_OIDC_REDIRECT`, as a CSP scheme-source. */
const MOBILE_APP_SCHEME = `${MOBILE_OIDC_REDIRECT.split('://')[0]}:`;

/**
 * Form target on the confirmation page. Relative, so it resolves next to the
 * callback URL the browser is on whatever prefix a reverse proxy adds; the
 * callback and the confirm handler are siblings in the auth router.
 */
const MOBILE_CONFIRM_FORM_ACTION = 'mobile-confirm';

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
      // Native flow: no cookies. The app will receive a single-use code on its
      // URL scheme and swap it for tokens over a normal API call, so the tokens
      // themselves never appear in a URL.
      //
      // The code is NOT minted here. Any installed app can open the login URL
      // with its own challenge and register for the URL scheme; if the user
      // already has a provider session this callback is reached with no
      // interaction at all. So the sign-in is parked behind a confirmation
      // page naming the account, and only an explicit Continue (a POST carrying
      // the page's single-use nonce, see mobileConfirm) mints the code.
      try {
        const result = await oidcService.handleCallback(code, statePayload.codeVerifier);
        const pending = mobilePairingService.createPendingSignIn(
          result.user.id,
          result.user.email,
          statePayload.mobileChallenge
        );
        logger.info(`OIDC (mobile) sign-in awaiting confirmation: ${result.user.email}`);
        sendMobileConfirmPage(res, {
          email: result.user.email,
          nonce: pending.nonce,
          formAction: MOBILE_CONFIRM_FORM_ACTION,
          appScheme: MOBILE_APP_SCHEME,
        });
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
   * The confirmation page's form posts here. Continue mints the exchange code
   * and redirects to the app's URL scheme; Cancel discards the pending sign-in.
   *
   * The nonce in the body is the only credential: no cookie is read, which is
   * why this route is CSRF-exempt (see security/csrf.ts). It is a browser
   * navigation, so failures render a page rather than a JSON error.
   */
  mobileConfirm: asyncHandler(async (req: Request, res: Response) => {
    const parsed = mobileOidcConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      sendMobileSignInErrorPage(res, 400, 'This sign-in request is not valid.');
      return;
    }
    const { nonce, action } = parsed.data;

    // The redirect carries a one-time code; keep it out of any cache.
    res.setHeader('Cache-Control', 'no-store');

    if (action === 'cancel') {
      mobilePairingService.cancelPendingSignIn(nonce);
      res.redirect(303, `${MOBILE_OIDC_REDIRECT}?error=cancelled`);
      return;
    }

    try {
      const exchange = mobilePairingService.confirmPendingSignIn(nonce);
      logger.info('OIDC (mobile) sign-in confirmed');
      res.redirect(303, `${MOBILE_OIDC_REDIRECT}?code=${exchange.token}`);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        sendMobileSignInErrorPage(res, 401, 'This sign-in request has expired or was already used.');
        return;
      }
      throw error;
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
