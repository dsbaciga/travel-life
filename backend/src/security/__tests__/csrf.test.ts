/**
 * CSRF Tests
 *
 * Covers the signed double-submit implementation in src/security/csrf.ts:
 * - setCsrfCookie mints `<nonce>.<hmac>` bound to the refresh token on the response
 * - validateCsrf accepts a correctly signed token for the presenting session
 * - a token signed for a DIFFERENT session is rejected
 * - a tampered nonce or tampered HMAC is rejected
 * - unsigned plain 64-hex tokens without an HMAC suffix are rejected with 403
 * - exempt-path normalisation exempts exactly the intended paths and cannot be
 *   widened by encoding tricks, double slashes or trailing junk
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';

import {
  generateCsrfToken,
  setCsrfCookie,
  clearCsrfCookie,
  validateCsrf,
} from '../csrf';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  AuthenticatedRequest,
  MockResponse,
  MockNextFunction,
} from '../../__tests__/mockBuilders/requests';

// ---------------------------------------------------------------------------
// Express adapters
//
// Express's Request/Response carry ~100 members each; the shared test helpers
// build structural stand-ins with only the ones middleware touches. Narrowing
// them to the real interfaces requires an assertion — this is the repo-wide
// convention (see prisma/__tests__/crudHelpers.test.ts) and it is confined to
// these three one-line adapters so no test body contains a cast.
// ---------------------------------------------------------------------------

const asRequest = (req: Partial<AuthenticatedRequest>): Request => req as unknown as Request;
const asResponse = (res: MockResponse): Response => res as unknown as Response;
const asNext = (next: MockNextFunction): NextFunction => next as unknown as NextFunction;

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mint a real CSRF cookie value the way the login/refresh controllers do:
 * stage the refresh cookie on the response, then call setCsrfCookie.
 * Returns the exact string that would be sent to the browser.
 */
function mintCsrfToken(refreshToken?: string): string {
  const res = createMockResponse();
  res.getHeader.mockImplementation((name: unknown) =>
    String(name).toLowerCase() === 'set-cookie' && refreshToken !== undefined
      ? [`refreshToken=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly`]
      : undefined
  );

  setCsrfCookie(asResponse(res), generateCsrfToken());

  const call = res.cookie.mock.calls.find((c) => c[0] === CSRF_COOKIE_NAME);
  expect(call).toBeDefined();
  return (call as unknown[])[1] as string;
}

interface RunOptions {
  method?: string;
  path?: string;
  cookieToken?: string;
  headerToken?: string;
  refreshToken?: string;
}

function runValidateCsrf(options: RunOptions = {}): {
  res: MockResponse;
  next: MockNextFunction;
} {
  const cookies: Record<string, string> = {};
  if (options.cookieToken !== undefined) cookies[CSRF_COOKIE_NAME] = options.cookieToken;
  if (options.refreshToken !== undefined) cookies.refreshToken = options.refreshToken;

  const headers: Record<string, string> = {};
  if (options.headerToken !== undefined) headers[CSRF_HEADER_NAME] = options.headerToken;

  const req = createMockRequest({
    method: options.method ?? 'POST',
    path: options.path ?? '/trips',
    cookies,
    headers,
  });
  const res = createMockResponse();
  const next = createMockNext();

  validateCsrf(asRequest(req), asResponse(res), asNext(next));

  return { res, next };
}

function expectPassed(res: MockResponse, next: MockNextFunction): void {
  expect(next).toHaveBeenCalledTimes(1);
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).not.toHaveBeenCalled();
}

function expectRejected(res: MockResponse, next: MockNextFunction, status = 403): void {
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(status);
  const body = res.json.mock.calls[0][0] as { status: string; message: string };
  expect(body.status).toBe('error');
}

const HEX64_A = 'a'.repeat(64);
const HEX64_B = 'b'.repeat(64);

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// Token minting
// ===========================================================================

describe('generateCsrfToken / setCsrfCookie', () => {
  it('generates a 64-character hex nonce', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(token).not.toBe(generateCsrfToken());
  });

  it('writes a signed <nonce>.<hmac> cookie readable by JavaScript', () => {
    const res = createMockResponse();
    res.getHeader.mockReturnValue(['refreshToken=rt-value; Path=/; HttpOnly']);

    setCsrfCookie(asResponse(res), generateCsrfToken());

    const [name, value, options] = res.cookie.mock.calls[0] as [
      string,
      string,
      { httpOnly: boolean; path: string },
    ];
    expect(name).toBe(CSRF_COOKIE_NAME);
    expect(value).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/);
    expect(options.httpOnly).toBe(false);
    expect(options.path).toBe('/');
  });

  it('binds the signature to the refresh token — different sessions get different HMACs for the same nonce', () => {
    const nonce = generateCsrfToken();

    const mintWith = (refreshToken: string): string => {
      const res = createMockResponse();
      res.getHeader.mockReturnValue([`refreshToken=${refreshToken}; Path=/`]);
      setCsrfCookie(asResponse(res), nonce);
      return (res.cookie.mock.calls[0] as unknown[])[1] as string;
    };

    const tokenA = mintWith('session-a-refresh');
    const tokenB = mintWith('session-b-refresh');

    expect(tokenA.split('.')[0]).toBe(nonce);
    expect(tokenB.split('.')[0]).toBe(nonce);
    expect(tokenA.split('.')[1]).not.toBe(tokenB.split('.')[1]);
  });

  it('is deterministic for the same nonce and session', () => {
    const nonce = generateCsrfToken();
    const mint = (): string => {
      const res = createMockResponse();
      res.getHeader.mockReturnValue(['refreshToken=stable-rt; Path=/']);
      setCsrfCookie(asResponse(res), nonce);
      return (res.cookie.mock.calls[0] as unknown[])[1] as string;
    };
    expect(mint()).toBe(mint());
  });

  it('URL-decodes the pending refresh cookie so the binding matches the parsed request cookie', () => {
    const refreshToken = 'rt+with/special=chars';
    const token = mintCsrfToken(refreshToken);

    // req.cookies holds the DECODED value; validation must line up with it.
    const { res, next } = runValidateCsrf({
      cookieToken: token,
      headerToken: token,
      refreshToken,
    });
    expectPassed(res, next);
  });

  it('clearCsrfCookie clears the same cookie name on the same path', () => {
    const res = createMockResponse();
    clearCsrfCookie(asResponse(res));

    const [name, options] = res.clearCookie.mock.calls[0] as [string, { path: string }];
    expect(name).toBe(CSRF_COOKIE_NAME);
    expect(options.path).toBe('/');
  });
});

// ===========================================================================
// Safe methods
// ===========================================================================

describe('validateCsrf — safe methods', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('skips validation for %s', (method) => {
    const { res, next } = runValidateCsrf({ method, path: '/trips' });
    expectPassed(res, next);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('enforces validation for %s', (method) => {
    const { res, next } = runValidateCsrf({ method, path: '/trips' });
    expectRejected(res, next);
  });
});

// ===========================================================================
// Signed token validation
// ===========================================================================

describe('validateCsrf — signed double-submit', () => {
  it('accepts a token minted for the session presenting it', () => {
    const refreshToken = 'session-a-refresh-token';
    const token = mintCsrfToken(refreshToken);

    const { res, next } = runValidateCsrf({
      cookieToken: token,
      headerToken: token,
      refreshToken,
    });

    expectPassed(res, next);
  });

  it('rejects a token minted for a DIFFERENT session', () => {
    const token = mintCsrfToken('session-a-refresh-token');

    // Attacker/other session replays a valid, correctly-shaped token.
    const { res, next } = runValidateCsrf({
      cookieToken: token,
      headerToken: token,
      refreshToken: 'session-b-refresh-token',
    });

    expectRejected(res, next);
  });

  it('rejects a token minted anonymously when a refresh session is present', () => {
    const anonymousToken = mintCsrfToken(undefined);

    const withSession = runValidateCsrf({
      cookieToken: anonymousToken,
      headerToken: anonymousToken,
      refreshToken: 'some-refresh-token',
    });
    expectRejected(withSession.res, withSession.next);

    // ...but the same token is valid for the anonymous session it was minted for.
    const withoutSession = runValidateCsrf({
      cookieToken: anonymousToken,
      headerToken: anonymousToken,
    });
    expectPassed(withoutSession.res, withoutSession.next);
  });

  it('rejects a tampered nonce (HMAC no longer covers it)', () => {
    const refreshToken = 'session-a-refresh-token';
    const token = mintCsrfToken(refreshToken);
    const [nonce, mac] = token.split('.');

    // Flip the first hex digit of the nonce.
    const flipped = (nonce[0] === '0' ? '1' : '0') + nonce.slice(1);
    const tampered = `${flipped}.${mac}`;
    expect(tampered).not.toBe(token);

    const { res, next } = runValidateCsrf({
      cookieToken: tampered,
      headerToken: tampered,
      refreshToken,
    });

    expectRejected(res, next);
  });

  it('rejects a tampered HMAC', () => {
    const refreshToken = 'session-a-refresh-token';
    const token = mintCsrfToken(refreshToken);
    const [nonce, mac] = token.split('.');

    const flipped = (mac[0] === '0' ? '1' : '0') + mac.slice(1);
    const tampered = `${nonce}.${flipped}`;
    expect(tampered).not.toBe(token);

    const { res, next } = runValidateCsrf({
      cookieToken: tampered,
      headerToken: tampered,
      refreshToken,
    });

    expectRejected(res, next);
  });

  it('rejects a forged token whose HMAC is an unrelated 64-hex string', () => {
    const forged = `${HEX64_A}.${HEX64_B}`;

    const { res, next } = runValidateCsrf({
      cookieToken: forged,
      headerToken: forged,
      refreshToken: 'session-a-refresh-token',
    });

    expectRejected(res, next);
  });

  it('rejects when the header token does not match the cookie token', () => {
    const refreshToken = 'session-a-refresh-token';
    const cookieToken = mintCsrfToken(refreshToken);
    const headerToken = mintCsrfToken(refreshToken); // different nonce

    expect(headerToken).not.toBe(cookieToken);

    const { res, next } = runValidateCsrf({ cookieToken, headerToken, refreshToken });
    expectRejected(res, next);
  });

  it('rejects when the cookie is present but the header is missing', () => {
    const refreshToken = 'session-a-refresh-token';
    const token = mintCsrfToken(refreshToken);

    const { res, next } = runValidateCsrf({ cookieToken: token, refreshToken });
    expectRejected(res, next);
  });

  it('rejects when the header is present but the cookie is missing', () => {
    const refreshToken = 'session-a-refresh-token';
    const token = mintCsrfToken(refreshToken);

    const { res, next } = runValidateCsrf({ headerToken: token, refreshToken });
    expectRejected(res, next);
  });

  it('rejects when both are missing', () => {
    const { res, next } = runValidateCsrf();
    expectRejected(res, next);
  });

  it('rejects a garbage token that is neither signed nor legacy-shaped', () => {
    for (const bad of ['not-a-token', 'z'.repeat(64), `${HEX64_A}.`, `.${HEX64_B}`, HEX64_A.slice(1)]) {
      jest.clearAllMocks();
      const { res, next } = runValidateCsrf({
        cookieToken: bad,
        headerToken: bad,
        refreshToken: 'rt',
      });
      expectRejected(res, next);
    }
  });
});

// ===========================================================================
// Unsigned plain-hex tokens (rejected)
// ===========================================================================

describe('validateCsrf — unsigned plain-hex tokens', () => {
  it('rejects an unsigned 64-hex token with no HMAC suffix with 403', () => {
    const unsigned = generateCsrfToken();
    expect(unsigned).toMatch(/^[a-f0-9]{64}$/);

    const { res, next } = runValidateCsrf({
      cookieToken: unsigned,
      headerToken: unsigned,
      refreshToken: 'any-session',
    });

    expectRejected(res, next, 403);
  });

  it('rejects an unsigned 64-hex token even when no refresh session is present', () => {
    const unsigned = HEX64_A;

    const { res, next } = runValidateCsrf({
      cookieToken: unsigned,
      headerToken: unsigned,
    });

    expectRejected(res, next, 403);
  });

  it('rejects a 63-hex and a 65-hex token', () => {
    for (const bad of ['a'.repeat(63), 'a'.repeat(65)]) {
      jest.clearAllMocks();
      const { res, next } = runValidateCsrf({ cookieToken: bad, headerToken: bad });
      expectRejected(res, next, 403);
    }
  });

  it('rejects an uppercase-hex token', () => {
    const upper = 'A'.repeat(64);
    const { res, next } = runValidateCsrf({ cookieToken: upper, headerToken: upper });
    expectRejected(res, next, 403);
  });
});

// ===========================================================================
// Exempt-path normalisation
// ===========================================================================

describe('validateCsrf — exempt-path normalisation', () => {
  const DECLINE_TOKEN = 'f'.repeat(64);

  it.each([
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/silent-refresh',
    '/user-invitations/accept',
    `/user-invitations/decline/${DECLINE_TOKEN}`,
  ])('exempts %s with no CSRF token at all', (path) => {
    const { res, next } = runValidateCsrf({ method: 'POST', path });
    expectPassed(res, next);
  });

  it.each([
    '//auth//login',
    '///auth/login',
    '/auth//login',
    `//user-invitations//decline//${DECLINE_TOKEN}`,
  ])('collapses repeated slashes so %s is still recognised as exempt', (path) => {
    const { res, next } = runValidateCsrf({ method: 'POST', path });
    expectPassed(res, next);
  });

  it.each(['/%2Fauth%2Flogin', '/auth/%6Cogin', '/user-invitations/%61ccept'])(
    'decodes percent-encoding so %s resolves to its exempt path',
    (path) => {
      const { res, next } = runValidateCsrf({ method: 'POST', path });
      expectPassed(res, next);
    }
  );

  it.each([
    // Crafted prefixes/suffixes must NOT inherit the exemption.
    ['/auth/login/', 'trailing slash'],
    ['/auth/login2', 'trailing junk'],
    ['/auth/loginmalicious', 'suffix'],
    ['/auth/login/../trips', 'traversal-looking suffix'],
    ['/auth/login/extra', 'extra segment'],
    ['/x/auth/login', 'prefixed segment'],
    ['/auth/logout', 'sibling auth route'],
    ['/auth/change-password', 'sibling auth route'],
    ['/user-invitations/accept-malicious', 'suffix on accept'],
    ['/user-invitations/accepts', 'plural suffix'],
    [`/user-invitations/decline/${DECLINE_TOKEN}/evil`, 'extra segment after decline token'],
    [`/user-invitations/decline/${'f'.repeat(63)}`, 'decline token one char short'],
    [`/user-invitations/decline/${'f'.repeat(65)}`, 'decline token one char long'],
    ['/user-invitations/decline/not-hex-at-all', 'non-hex decline token'],
    ['/user-invitations/decline', 'decline with no token'],
    ['/trips', 'ordinary protected route'],
    ['/%2Ftrips', 'percent-encoded protected route'],
  ])('does NOT exempt %s (%s)', (path) => {
    const { res, next } = runValidateCsrf({ method: 'POST', path });
    expectRejected(res, next);
  });

  it('rejects a malformed percent-encoded path with 400 rather than exempting it', () => {
    const { res, next } = runValidateCsrf({ method: 'POST', path: '/auth/%E0%A4%A' });

    expectRejected(res, next, 400);
    const body = res.json.mock.calls[0][0] as { message: string };
    expect(body.message).toBe('Malformed request path');
  });

  it('exempt paths bypass validation even when a mismatched token is supplied', () => {
    const { res, next } = runValidateCsrf({
      method: 'POST',
      path: '/auth/login',
      cookieToken: HEX64_A,
      headerToken: HEX64_B,
    });
    expectPassed(res, next);
  });

  it('a valid signed token still works on a non-exempt path', () => {
    const refreshToken = 'rt';
    const token = mintCsrfToken(refreshToken);

    const { res, next } = runValidateCsrf({
      method: 'DELETE',
      path: '/trips/42',
      cookieToken: token,
      headerToken: token,
      refreshToken,
    });
    expectPassed(res, next);
  });
});
