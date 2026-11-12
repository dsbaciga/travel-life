import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const REFRESH_COOKIE_NAME = 'refreshToken';

// Signed double-submit: the cookie carries `<nonce>.<hmac>` where the HMAC binds
// the nonce to the session (the refresh token this response/request carries).
// A bare-equality double-submit passes for ANY value present in both cookie and
// header, so a sibling subdomain able to write cookies under a shared
// COOKIE_DOMAIN could forge it. The HMAC key is server-side only, so a token
// minted for one session cannot be replayed against another.
const SIGNED_TOKEN_PATTERN = /^([a-f0-9]{64})\.([a-f0-9]{64})$/;

// Derived from JWT_SECRET rather than requiring a new env var. Domain-separated
// so it can never collide with the token-signing key.
const CSRF_HMAC_KEY = crypto.createHash('sha256').update(`csrf-token-binding:${config.jwt.secret}`).digest();

/** Stable, non-reversible identifier for the session a CSRF token is bound to. */
const sessionIdFor = (refreshToken: string | undefined): string =>
  refreshToken ? crypto.createHash('sha256').update(refreshToken).digest('hex') : 'anonymous';

const signCsrfToken = (nonce: string, sessionId: string): string => {
  const mac = crypto.createHmac('sha256', CSRF_HMAC_KEY).update(`${nonce}.${sessionId}`).digest('hex');
  return `${nonce}.${mac}`;
};

/**
 * Reads the refresh token this response is in the middle of setting.
 *
 * Every caller sets the refresh cookie immediately before the CSRF cookie, so
 * the value is already staged in the pending Set-Cookie header. Doing the
 * lookup here keeps the `setCsrfCookie(res, token)` signature unchanged for the
 * controllers that call it.
 */
const pendingRefreshToken = (res: Response): string | undefined => {
  const header = res.getHeader('Set-Cookie');
  const values = Array.isArray(header) ? header.map(String) : header ? [String(header)] : [];
  for (const value of values) {
    const match = new RegExp(`^${REFRESH_COOKIE_NAME}=([^;]*)`).exec(value);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return undefined;
};

/**
 * Generates a cryptographically secure CSRF nonce.
 * The session binding is applied by setCsrfCookie, which knows the session.
 */
export const generateCsrfToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Sets the CSRF token in a regular (non-httpOnly) cookie.
 * This allows JavaScript to read the token and send it in request headers.
 * The security comes from verifying the header matches the cookie AND that the
 * token carries a valid server-side HMAC binding it to the current session.
 */
export const setCsrfCookie = (res: Response, token: string): void => {
  const nonce = token.split('.')[0];
  const signedToken = signCsrfToken(nonce, sessionIdFor(pendingRefreshToken(res)));
  res.cookie(CSRF_COOKIE_NAME, signedToken, {
    httpOnly: false, // Must be readable by JavaScript
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: '/',
    maxAge: config.cookie.maxAge,
  });
};

/**
 * Clears the CSRF token cookie.
 * Used during logout to ensure the token is removed.
 */
export const clearCsrfCookie = (res: Response): void => {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: '/',
  });
};

/**
 * True when the request authenticates purely by bearer token: a non-empty
 * `Authorization: Bearer <token>` header and no refresh-token cookie.
 */
export const isBearerOnlyRequest = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return false;
  if (authHeader.substring(7).trim().length === 0) return false;
  const cookies: Record<string, unknown> | undefined = req.cookies;
  return !cookies || !cookies[REFRESH_COOKIE_NAME];
};

/**
 * Middleware to validate CSRF token.
 * Compares the token in the cookie with the token in the request header.
 * Skips validation for safe HTTP methods (GET, HEAD, OPTIONS).
 * Skips validation for auth routes (login/register/refresh bootstrap the CSRF token).
 * Skips validation for public invitation routes (the invitation token provides equivalent protection).
 */
export const validateCsrf = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF validation for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Normalize the path to prevent bypass via URL encoding (e.g., %2Fauth%2Flogin)
  // decodeURIComponent handles percent-encoded characters, then we normalize double slashes
  let normalizedPath: string;
  try {
    normalizedPath = decodeURIComponent(req.path).replace(/\/+/g, '/');
  } catch {
    // If decoding fails (e.g., malformed percent encoding), reject the request
    res.status(400).json({
      status: 'error',
      message: 'Malformed request path',
    });
    return;
  }

  // Skip CSRF validation for auth routes (these bootstrap the CSRF token)
  // Login, register, refresh, and silent-refresh set the CSRF cookie
  // Use exact path matching to prevent bypass via crafted path prefixes
  // The two mobile endpoints are unauthenticated token exchanges: the single-use
  // pairing token / exchange code in the body is the credential, and no cookie
  // is read or set, so there is no ambient authority for a forged request to ride.
  // `/auth/oidc/mobile-confirm` is the plain HTML form on the mobile sign-in
  // confirmation page. It cannot send an `x-csrf-token` header (the page runs
  // no script) and the browser may hold no session at all. The single-use nonce
  // in the form body, readable only from the page the server just rendered, is
  // the credential; the handler reads no cookie. A cross-site page cannot guess
  // a victim's nonce, and replaying the attacker's OWN nonce only yields a code
  // bound to the attacker's challenge for the attacker's account.
  const AUTH_CSRF_EXEMPT = [
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/silent-refresh',
    '/auth/mobile/pair',
    '/auth/oidc/mobile-exchange',
    '/auth/oidc/mobile-confirm',
  ];
  if (AUTH_CSRF_EXEMPT.includes(normalizedPath)) {
    return next();
  }

  // Skip CSRF validation for public user invitation routes
  // These are accessed by unauthenticated users who don't have CSRF tokens
  // Security is provided by:
  // 1. The invitation token itself (cryptographically random, one-time use)
  // 2. Rate limiting (20 requests per 15 minutes)
  // 3. CORS configuration (restricts origins)
  // Use exact path matching to prevent bypass attacks (e.g., /user-invitations/accept-malicious)
  if (normalizedPath === '/user-invitations/accept' ||
      /^\/user-invitations\/decline\/[a-f0-9]{64}$/.test(normalizedPath)) {
    return next();
  }

  // Native clients authenticate with an explicit `Authorization: Bearer` header
  // and carry no session cookie. CSRF exploits credentials the browser attaches
  // on its own; a cross-site page cannot make a browser send an Authorization
  // header it does not possess. BOTH conditions are required: a request that
  // still carries the refresh cookie is a browser session and gets the full
  // double-submit check even if it also sends a bearer token (which the web app
  // always does).
  if (isBearerOnlyRequest(req)) {
    return next();
  }

  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
    res.status(403).json({
      status: 'error',
      message: 'Invalid CSRF token',
    });
    return;
  }

  const cookieBuffer = Buffer.from(cookieToken, 'utf8');
  const headerBuffer = Buffer.from(headerToken, 'utf8');

  if (cookieBuffer.length !== headerBuffer.length || !crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
    res.status(403).json({
      status: 'error',
      message: 'Invalid CSRF token',
    });
    return;
  }

  const signed = SIGNED_TOKEN_PATTERN.exec(cookieToken);
  if (!signed) {
    res.status(403).json({
      status: 'error',
      message: 'Invalid CSRF token',
    });
    return;
  }

  // Verify the HMAC binds this token to the session presenting it.
  const expected = signCsrfToken(signed[1], sessionIdFor(req.cookies[REFRESH_COOKIE_NAME]));
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (expectedBuffer.length !== cookieBuffer.length || !crypto.timingSafeEqual(expectedBuffer, cookieBuffer)) {
    res.status(403).json({
      status: 'error',
      message: 'Invalid CSRF token',
    });
    return;
  }

  next();
};
