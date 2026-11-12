/**
 * OIDC Controller — native client flow tests
 *
 * Test cases:
 * - OIDC-MOB-001: login?client=mobile records the mobile flag in the state cookie
 * - OIDC-MOB-002: a mobile callback parks a pending sign-in behind the confirmation page — no redirect, no code, no session cookies
 * - OIDC-MOB-003: the redirect target is constant — a stored `redirect` cannot steer the page or the code elsewhere
 * - OIDC-MOB-004: a failed mobile callback redirects to the app scheme with an error and mints no code
 * - OIDC-MOB-005: a browser callback is unchanged (cookies set, frontend redirect, no code minted)
 * - OIDC-MOB-006: mobileExchange redeems the code and returns tokens in the body
 * - OIDC-MOB-007: mobileExchange rejects a malformed code and propagates an expired one as 401
 * - OIDC-MOB-008: a state mismatch never reaches the provider, mobile flag or not
 * - OIDC-MOB-009: a mobile login without a valid code_challenge is refused before contacting the provider
 * - OIDC-MOB-010: mobileExchange requires a code verifier
 * - OIDC-MOB-011: mobileConfirm continue mints the code via the pending sign-in and redirects (303) to the app scheme
 * - OIDC-MOB-012: mobileConfirm cancel discards the pending sign-in and mints nothing
 * - OIDC-MOB-013: mobileConfirm passes unexpected service failures to the error handler
 *
 * The nonce lifecycle against the real pairing service (reuse, expiry) is in
 * oidc.mobileConfirm.controller.test.ts.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockOidcService = { createAuthorizationRequest: jest.fn(), handleCallback: jest.fn() };
jest.mock('../../services/oidc.service', () => ({ __esModule: true, default: mockOidcService }));

const mockAuthService = { issueTokensForUser: jest.fn() };
jest.mock('../../services/auth.service', () => ({ __esModule: true, default: mockAuthService }));

const mockPairing = {
  createPairingToken: jest.fn(),
  redeem: jest.fn(),
  createPendingSignIn: jest.fn(),
  confirmPendingSignIn: jest.fn(),
  cancelPendingSignIn: jest.fn(),
};
jest.mock('../../services/mobilePairing.service', () => ({ __esModule: true, default: mockPairing }));

const mockSetRefreshTokenCookie = jest.fn();
const mockSetOidcStateCookie = jest.fn();
const mockGetOidcStateCookie = jest.fn();
jest.mock('../../http/cookies', () => ({
  setRefreshTokenCookie: mockSetRefreshTokenCookie,
  setOidcStateCookie: mockSetOidcStateCookie,
  getOidcStateCookie: mockGetOidcStateCookie,
  clearOidcStateCookie: jest.fn(),
}));

const mockSetCsrfCookie = jest.fn();
jest.mock('../../security/csrf', () => ({
  generateCsrfToken: () => 'csrf',
  setCsrfCookie: mockSetCsrfCookie,
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../config', () => {
  const config = {
    oidc: { enabled: true, buttonText: 'SSO' },
    auth: { passwordLoginDisabled: false },
    frontendUrl: 'https://app.example.com',
  };
  return { __esModule: true, config, default: config };
});

import { oidcController, MOBILE_OIDC_REDIRECT } from '../oidc.controller';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  expectAppError,
} from '../../__tests__/mockBuilders/requests';
import { AppError } from '../../errors/errors';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const CODE = 'cd'.repeat(32);
const NONCE = 'ef'.repeat(32);
const CHALLENGE = 'ab'.repeat(32);
const VERIFIER = 'v'.repeat(43);
const authResult = {
  user: { id: 7, username: 'dana', email: 'dana@example.com', avatarUrl: null, timezone: null },
  accessToken: 'access',
  refreshToken: 'refresh',
};

type Res = ReturnType<typeof createMockResponse> & { redirect: jest.Mock };

function makeRes(): Res {
  const res = createMockResponse() as Res;
  res.redirect = jest.fn();
  return res;
}

async function callback(
  state: Record<string, unknown> | null,
  query: Record<string, string>
): Promise<Res> {
  mockGetOidcStateCookie.mockReturnValue(state ? JSON.stringify(state) : undefined);
  const res = makeRes();
  oidcController.callback(
    createMockRequest({ query }) as never,
    res as never,
    createMockNext() as never
  );
  await flushPromises();
  return res;
}

describe('OidcController — native clients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOidcService.handleCallback.mockResolvedValue(authResult as never);
    mockPairing.createPairingToken.mockReturnValue({ token: CODE, expiresAt: new Date() });
    mockPairing.createPendingSignIn.mockReturnValue({ nonce: NONCE, expiresAt: new Date() });
    mockPairing.confirmPendingSignIn.mockReturnValue({ token: CODE, expiresAt: new Date() });
  });

  it('OIDC-MOB-001: login?client=mobile records the mobile flag in the state cookie', async () => {
    mockOidcService.createAuthorizationRequest.mockResolvedValue({
      url: 'https://idp.example.com/authorize?x=1',
      state: 'st',
      codeVerifier: 'cv',
    } as never);

    const res = makeRes();
    oidcController.login(
      createMockRequest({ query: { client: 'mobile', code_challenge: CHALLENGE } }) as never,
      res as never,
      createMockNext() as never
    );
    await flushPromises();

    const stored = JSON.parse(mockSetOidcStateCookie.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(stored).toMatchObject({ state: 'st', codeVerifier: 'cv', mobileChallenge: CHALLENGE });
    expect(res.redirect).toHaveBeenCalledWith('https://idp.example.com/authorize?x=1');

    // A plain browser login does not carry the flag.
    mockSetOidcStateCookie.mockClear();
    oidcController.login(createMockRequest({ query: {} }) as never, makeRes() as never, createMockNext() as never);
    await flushPromises();
    const browser = JSON.parse(mockSetOidcStateCookie.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(browser.mobileChallenge).toBeUndefined();
  });

  it('OIDC-MOB-002: mobile callback parks a pending sign-in behind the confirmation page', async () => {
    const res = await callback(
      { state: 'st', codeVerifier: 'cv', mobileChallenge: CHALLENGE },
      { code: 'idp-code', state: 'st' }
    );

    expect(mockOidcService.handleCallback).toHaveBeenCalledWith('idp-code', 'cv');
    // The pending sign-in carries the challenge the app sent at the start.
    expect(mockPairing.createPendingSignIn).toHaveBeenCalledWith(7, 'dana@example.com', CHALLENGE);
    // Reaching the callback is not enough: no code, no redirect to the app.
    expect(mockPairing.createPairingToken).not.toHaveBeenCalled();
    expect(mockPairing.confirmPendingSignIn).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
    expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
    expect(mockSetCsrfCookie).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(200);
    const html = String(res.send.mock.calls[0][0]);
    expect(html).toContain('dana@example.com');
    expect(html).toContain(`name="nonce" value="${NONCE}"`);
    // Tokens never appear in the page.
    expect(html).not.toContain('access');
    expect(html).not.toContain('refresh');
  });

  it('OIDC-MOB-003: the redirect target is constant regardless of the stored redirect', async () => {
    const res = await callback(
      { state: 'st', codeVerifier: 'cv', mobileChallenge: CHALLENGE, redirect: '//evil.example.com/steal' },
      { code: 'idp-code', state: 'st' }
    );
    expect(res.redirect).not.toHaveBeenCalled();
    expect(String(res.send.mock.calls[0][0])).not.toContain('evil');

    // Nothing in the confirm request can steer the code either.
    const confirmRes = makeRes();
    oidcController.mobileConfirm(
      createMockRequest({
        body: { nonce: NONCE, action: 'continue', redirect: 'https://evil.example.com/steal' },
        query: { redirect: '//evil.example.com/steal' },
      }) as never,
      confirmRes as never,
      createMockNext() as never
    );
    await flushPromises();
    expect(confirmRes.redirect).toHaveBeenCalledWith(303, `travellife://auth/oidc?code=${CODE}`);
  });

  it('OIDC-MOB-004: a failed mobile callback returns an error to the app and mints no code', async () => {
    mockOidcService.handleCallback.mockRejectedValue(new AppError('No account exists', 403) as never);
    const res = await callback(
      { state: 'st', codeVerifier: 'cv', mobileChallenge: CHALLENGE },
      { code: 'idp-code', state: 'st' }
    );
    expect(res.redirect).toHaveBeenCalledWith(`${MOBILE_OIDC_REDIRECT}?error=oidc_failed`);
    expect(mockPairing.createPairingToken).not.toHaveBeenCalled();
    expect(mockPairing.createPendingSignIn).not.toHaveBeenCalled();
  });

  it('OIDC-MOB-005: a browser callback is unchanged', async () => {
    const res = await callback(
      { state: 'st', codeVerifier: 'cv', redirect: '/trips' },
      { code: 'idp-code', state: 'st' }
    );
    expect(mockSetRefreshTokenCookie).toHaveBeenCalledWith(res, 'refresh');
    expect(mockSetCsrfCookie).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/trips');
    expect(mockPairing.createPairingToken).not.toHaveBeenCalled();
    expect(mockPairing.createPendingSignIn).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('OIDC-MOB-006: mobileExchange redeems the code and returns tokens in the body', async () => {
    mockPairing.redeem.mockReturnValue(7);
    mockAuthService.issueTokensForUser.mockResolvedValue(authResult as never);
    const res = makeRes();

    oidcController.mobileExchange(
      createMockRequest({ body: { code: CODE, codeVerifier: VERIFIER } }) as never,
      res as never,
      createMockNext() as never
    );
    await flushPromises();

    expect(mockPairing.redeem).toHaveBeenCalledWith(CODE, VERIFIER);
    expect(mockAuthService.issueTokensForUser).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      data: { user: authResult.user, accessToken: 'access', refreshToken: 'refresh' },
    });
    expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
  });

  it('OIDC-MOB-007: mobileExchange rejects malformed and expired codes', async () => {
    const badNext = createMockNext();
    oidcController.mobileExchange(
      createMockRequest({ body: { code: 'nope', codeVerifier: VERIFIER } }) as never,
      makeRes() as never,
      badNext as never
    );
    await flushPromises();
    expect(mockPairing.redeem).not.toHaveBeenCalled();
    expect(badNext).toHaveBeenCalledTimes(1);

    mockPairing.redeem.mockImplementation(() => {
      throw new AppError('Pairing code is invalid or has expired', 401);
    });
    const expiredNext = createMockNext();
    oidcController.mobileExchange(
      createMockRequest({ body: { code: CODE, codeVerifier: VERIFIER } }) as never,
      makeRes() as never,
      expiredNext as never
    );
    await flushPromises();
    expectAppError(expiredNext, 401, 'Pairing code is invalid or has expired');
    expect(mockAuthService.issueTokensForUser).not.toHaveBeenCalled();
  });

  it('OIDC-MOB-008: a state mismatch never reaches the provider', async () => {
    const res = await callback(
      { state: 'st', codeVerifier: 'cv', mobileChallenge: CHALLENGE },
      { code: 'idp-code', state: 'forged' }
    );
    expect(mockOidcService.handleCallback).not.toHaveBeenCalled();
    expect(mockPairing.createPairingToken).not.toHaveBeenCalled();
    expect(mockPairing.createPendingSignIn).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/login?error=oidc_invalid');
  });

  it('OIDC-MOB-009: a mobile login without a valid code_challenge is refused', async () => {
    for (const query of [
      { client: 'mobile' },
      { client: 'mobile', code_challenge: 'short' },
      { client: 'mobile', code_challenge: 'Z'.repeat(64) },
    ] as Array<Record<string, string>>) {
      const next = createMockNext();
      oidcController.login(createMockRequest({ query }) as never, makeRes() as never, next as never);
      await flushPromises();
      expectAppError(next, 400, 'Mobile sign-in requires a valid code_challenge');
    }
    expect(mockOidcService.createAuthorizationRequest).not.toHaveBeenCalled();
    expect(mockSetOidcStateCookie).not.toHaveBeenCalled();
  });

  it('OIDC-MOB-010: mobileExchange requires a code verifier', async () => {
    const next = createMockNext();
    oidcController.mobileExchange(
      createMockRequest({ body: { code: CODE } }) as never,
      makeRes() as never,
      next as never
    );
    await flushPromises();
    expect(mockPairing.redeem).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('OIDC-MOB-011: mobileConfirm continue mints the code and redirects to the app scheme', async () => {
    const res = makeRes();
    oidcController.mobileConfirm(
      createMockRequest({ body: { nonce: NONCE, action: 'continue' } }) as never,
      res as never,
      createMockNext() as never
    );
    await flushPromises();

    expect(mockPairing.confirmPendingSignIn).toHaveBeenCalledWith(NONCE);
    expect(mockPairing.cancelPendingSignIn).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(303, `${MOBILE_OIDC_REDIRECT}?code=${CODE}`);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    // Confirming hands over a code, never a session.
    expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
    expect(mockSetCsrfCookie).not.toHaveBeenCalled();
    expect(mockAuthService.issueTokensForUser).not.toHaveBeenCalled();
  });

  it('OIDC-MOB-012: mobileConfirm cancel discards the pending sign-in and mints nothing', async () => {
    const res = makeRes();
    oidcController.mobileConfirm(
      createMockRequest({ body: { nonce: NONCE, action: 'cancel' } }) as never,
      res as never,
      createMockNext() as never
    );
    await flushPromises();

    expect(mockPairing.cancelPendingSignIn).toHaveBeenCalledWith(NONCE);
    expect(mockPairing.confirmPendingSignIn).not.toHaveBeenCalled();
    expect(mockPairing.createPairingToken).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(303, `${MOBILE_OIDC_REDIRECT}?error=cancelled`);
  });

  it('OIDC-MOB-013: mobileConfirm passes unexpected failures to the error handler', async () => {
    mockPairing.confirmPendingSignIn.mockImplementation(() => {
      throw new Error('boom');
    });
    const res = makeRes();
    const next = createMockNext();
    oidcController.mobileConfirm(
      createMockRequest({ body: { nonce: NONCE, action: 'continue' } }) as never,
      res as never,
      next as never
    );
    await flushPromises();

    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
