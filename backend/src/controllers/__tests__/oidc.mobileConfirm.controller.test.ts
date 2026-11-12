/**
 * OIDC Controller — mobile sign-in confirmation tests
 *
 * Runs the controller against the REAL pairing service and page renderer, so
 * the nonce lifecycle is exercised end to end rather than through mocks.
 *
 * Test cases:
 * - OIDC-CONF-001: the mobile callback renders the confirmation page and mints nothing
 * - OIDC-CONF-002: the page is uncacheable, unframeable and under a strict CSP
 * - OIDC-CONF-003: the account email is HTML-escaped
 * - OIDC-CONF-004: Continue redirects to the app scheme with a code only the starting app can redeem
 * - OIDC-CONF-005: a nonce works once — a second Continue gets an error page and no code
 * - OIDC-CONF-006: Cancel discards the pending sign-in; the nonce cannot be confirmed afterwards
 * - OIDC-CONF-007: an expired nonce is refused, and stays refused
 * - OIDC-CONF-008: an unknown nonce is refused
 * - OIDC-CONF-009: malformed form bodies are refused without touching pending sign-ins
 * - OIDC-CONF-010: the nonce is not accepted from the query string (a GET-style link cannot confirm)
 * - OIDC-CONF-011: the nonce is not an exchange code, and the exchange code is not a nonce
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';

const mockOidcService = { createAuthorizationRequest: jest.fn(), handleCallback: jest.fn() };
jest.mock('../../services/oidc.service', () => ({ __esModule: true, default: mockOidcService }));

jest.mock('../../services/auth.service', () => ({
  __esModule: true,
  default: { issueTokensForUser: jest.fn() },
}));

const mockGetOidcStateCookie = jest.fn();
jest.mock('../../http/cookies', () => ({
  setRefreshTokenCookie: jest.fn(),
  setOidcStateCookie: jest.fn(),
  getOidcStateCookie: mockGetOidcStateCookie,
  clearOidcStateCookie: jest.fn(),
}));

jest.mock('../../security/csrf', () => ({
  generateCsrfToken: () => 'csrf',
  setCsrfCookie: jest.fn(),
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
import mobilePairingService, { PAIRING_TOKEN_TTL_MS } from '../../services/mobilePairing.service';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  MockResponse,
} from '../../__tests__/mockBuilders/requests';
import { AppError } from '../../errors/errors';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const VERIFIER = 'v'.repeat(43);
const CHALLENGE = crypto.createHash('sha256').update(VERIFIER).digest('hex');
const START = new Date('2026-11-11T12:00:00Z').getTime();

const userResult = (email: string) => ({
  user: { id: 7, username: 'dana', email, avatarUrl: null, timezone: null },
  accessToken: 'access',
  refreshToken: 'refresh',
});

const headersOf = (res: MockResponse): Record<string, string> =>
  Object.fromEntries(
    res.setHeader.mock.calls.map(([name, value]) => [String(name).toLowerCase(), String(value)])
  );

const htmlOf = (res: MockResponse): string => String(res.send.mock.calls[0]?.[0] ?? '');

/** Drives the mobile callback and returns the rendered page plus its nonce. */
async function renderConfirmPage(
  email = 'dana@example.com'
): Promise<{ res: MockResponse; html: string; nonce: string }> {
  mockOidcService.handleCallback.mockResolvedValue(userResult(email) as never);
  mockGetOidcStateCookie.mockReturnValue(
    JSON.stringify({ state: 'st', codeVerifier: 'cv', mobileChallenge: CHALLENGE })
  );
  const res = createMockResponse();
  oidcController.callback(
    createMockRequest({ query: { code: 'idp-code', state: 'st' } }) as never,
    res as never,
    createMockNext() as never
  );
  await flushPromises();
  const html = htmlOf(res);
  const nonce = /name="nonce" value="([a-f0-9]{64})"/.exec(html)?.[1] ?? '';
  return { res, html, nonce };
}

async function submit(
  body: unknown,
  query: Record<string, string> = {}
): Promise<{ res: MockResponse; next: ReturnType<typeof createMockNext> }> {
  const res = createMockResponse();
  const next = createMockNext();
  oidcController.mobileConfirm(
    createMockRequest({ body, query }) as never,
    res as never,
    next as never
  );
  await flushPromises();
  return { res, next };
}

const expectErrorPage = (res: MockResponse, status: number): void => {
  expect(res.redirect).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(status);
  expect(htmlOf(res)).toContain('Sign-in not completed');
  expect(htmlOf(res)).not.toContain('<form');
  expect(headersOf(res)['cache-control']).toBe('no-store');
};

const expectRedeemRejected = (code: string, verifier?: string): void => {
  let error: unknown;
  try {
    mobilePairingService.redeem(code, verifier);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(AppError);
};

describe('OidcController — mobile sign-in confirmation', () => {
  let now = START;

  beforeEach(() => {
    jest.clearAllMocks();
    mobilePairingService.clear();
    now = START;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('OIDC-CONF-001: the mobile callback renders the confirmation page and mints nothing', async () => {
    const createPairingToken = jest.spyOn(mobilePairingService, 'createPairingToken');
    const { res, html, nonce } = await renderConfirmPage();

    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(html).toContain('Sign in to the Travel Life app?');
    expect(html).toContain('dana@example.com');
    expect(nonce).toMatch(/^[a-f0-9]{64}$/);
    // An explicit POST to the sibling route, with both choices offered.
    expect(html).toContain('<form method="post" action="mobile-confirm">');
    expect(html).toContain('name="action" value="continue"');
    expect(html).toContain('name="action" value="cancel"');
    // No exchange code exists yet, and nothing points at the app scheme.
    expect(createPairingToken).not.toHaveBeenCalled();
    expect(html).not.toContain('travellife://');
    expect(html).not.toContain('<script');
  });

  it('OIDC-CONF-002: the page is uncacheable, unframeable and under a strict CSP', async () => {
    const { res, html } = await renderConfirmPage();
    const headers = headersOf(res);

    expect(headers['cache-control']).toBe('no-store');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['content-type']).toBe('text/html; charset=utf-8');

    const csp = headers['content-security-policy'];
    const directives = csp.split('; ');
    expect(directives).toContain("default-src 'none'");
    expect(directives).toContain("frame-ancestors 'none'");
    expect(directives).toContain("base-uri 'none'");
    // The form may post home and be redirected to the app scheme, nowhere else.
    expect(directives).toContain("form-action 'self' travellife:");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('script-src');
    // The only inline style is the one the policy's nonce names.
    const styleNonce = /style-src 'nonce-([^']+)'/.exec(csp)?.[1];
    expect(styleNonce).toBeTruthy();
    expect(html).toContain(`<style nonce="${styleNonce}">`);
  });

  it('OIDC-CONF-003: the account email is HTML-escaped', async () => {
    const { html } = await renderConfirmPage('"><script>alert(1)</script>@example.com');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;@example.com');
  });

  it('OIDC-CONF-004: Continue redirects with a code only the starting app can redeem', async () => {
    const { nonce } = await renderConfirmPage();
    const { res } = await submit({ nonce, action: 'continue' });

    expect(res.redirect).toHaveBeenCalledTimes(1);
    const [status, target] = res.redirect.mock.calls[0] as [number, string];
    expect(status).toBe(303);
    expect(target).toMatch(/^travellife:\/\/auth\/oidc\?code=[a-f0-9]{64}$/);
    expect(target.startsWith(`${MOBILE_OIDC_REDIRECT}?code=`)).toBe(true);
    expect(headersOf(res)['cache-control']).toBe('no-store');

    const code = target.split('code=')[1];
    expect(code).not.toBe(nonce);
    // The challenge from the start of the flow still gates redemption.
    expect(mobilePairingService.redeem(code, VERIFIER)).toBe(7);
  });

  it('OIDC-CONF-005: a nonce works once', async () => {
    const { nonce } = await renderConfirmPage();
    const first = await submit({ nonce, action: 'continue' });
    expect(first.res.redirect).toHaveBeenCalledTimes(1);

    const createPairingToken = jest.spyOn(mobilePairingService, 'createPairingToken');
    const second = await submit({ nonce, action: 'continue' });
    expectErrorPage(second.res, 401);
    expect(createPairingToken).not.toHaveBeenCalled();
    expect(second.next).not.toHaveBeenCalled();
  });

  it('OIDC-CONF-006: Cancel discards the pending sign-in', async () => {
    const createPairingToken = jest.spyOn(mobilePairingService, 'createPairingToken');
    const { nonce } = await renderConfirmPage();

    const cancelled = await submit({ nonce, action: 'cancel' });
    expect(cancelled.res.redirect).toHaveBeenCalledWith(303, `${MOBILE_OIDC_REDIRECT}?error=cancelled`);
    expect(createPairingToken).not.toHaveBeenCalled();

    // Going back and pressing Continue is too late.
    const late = await submit({ nonce, action: 'continue' });
    expectErrorPage(late.res, 401);
    expect(createPairingToken).not.toHaveBeenCalled();
  });

  it('OIDC-CONF-007: an expired nonce is refused, and stays refused', async () => {
    const createPairingToken = jest.spyOn(mobilePairingService, 'createPairingToken');
    const { nonce } = await renderConfirmPage();

    // Still good one millisecond before the deadline...
    const other = await renderConfirmPage();
    now = START + PAIRING_TOKEN_TTL_MS - 1;
    expect((await submit({ nonce: other.nonce, action: 'continue' })).res.redirect).toHaveBeenCalledTimes(1);
    createPairingToken.mockClear();

    // ...and dead at it.
    now = START + PAIRING_TOKEN_TTL_MS;
    expectErrorPage((await submit({ nonce, action: 'continue' })).res, 401);
    // Winding the clock back does not resurrect it: the attempt consumed it.
    now = START + 1000;
    expectErrorPage((await submit({ nonce, action: 'continue' })).res, 401);
    expect(createPairingToken).not.toHaveBeenCalled();
  });

  it('OIDC-CONF-008: an unknown nonce is refused', async () => {
    await renderConfirmPage();
    const { res } = await submit({ nonce: 'f'.repeat(64), action: 'continue' });
    expectErrorPage(res, 401);
  });

  it('OIDC-CONF-009: malformed form bodies are refused without touching pending sign-ins', async () => {
    const { nonce } = await renderConfirmPage();
    const confirm = jest.spyOn(mobilePairingService, 'confirmPendingSignIn');
    const cancel = jest.spyOn(mobilePairingService, 'cancelPendingSignIn');

    for (const body of [
      undefined,
      {},
      { nonce },
      { nonce, action: 'approve' },
      { nonce: 'short', action: 'continue' },
      { nonce: nonce.toUpperCase(), action: 'continue' },
      { nonce: [nonce, nonce], action: 'continue' },
    ]) {
      const { res, next } = await submit(body);
      expectErrorPage(res, 400);
      expect(next).not.toHaveBeenCalled();
    }
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();

    // The pending sign-in survived all of that.
    expect((await submit({ nonce, action: 'continue' })).res.redirect).toHaveBeenCalledTimes(1);
  });

  it('OIDC-CONF-010: the nonce is not accepted from the query string', async () => {
    const { nonce } = await renderConfirmPage();
    const { res } = await submit({}, { nonce, action: 'continue' });
    expectErrorPage(res, 400);
  });

  it('OIDC-CONF-011: nonce and exchange code are not interchangeable', async () => {
    const { nonce } = await renderConfirmPage();
    // The nonce cannot be redeemed for tokens directly, verifier or not...
    expectRedeemRejected(nonce, VERIFIER);
    // ...and trying did not consume the pending sign-in.
    const { res } = await submit({ nonce, action: 'continue' });
    const code = (res.redirect.mock.calls[0][1] as string).split('code=')[1];

    // The exchange code is not a confirmation nonce either.
    expectErrorPage((await submit({ nonce: code, action: 'continue' })).res, 401);
    expect(mobilePairingService.redeem(code, VERIFIER)).toBe(7);
  });
});
