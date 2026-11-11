/**
 * Auth Controller — native client tests
 *
 * Test cases:
 * - AUTH-MOB-001: login with X-Client-Platform: mobile returns refreshToken in the body and sets no cookies
 * - AUTH-MOB-002: login without the header keeps the cookie behaviour and omits refreshToken from the body
 * - AUTH-MOB-003: register with the mobile header returns refreshToken in the body, 201
 * - AUTH-MOB-004: refresh (mobile) reads the token from the body, never the cookie, and returns the rotated pair
 * - AUTH-MOB-005: refresh (mobile) propagates a service failure without touching cookies
 * - AUTH-MOB-006: logout (mobile) blacklists the refresh token sent in the body
 * - AUTH-MOB-007: createPairingToken requires auth and returns token, expiry and server URL
 * - AUTH-MOB-008: redeemPairingToken issues tokens for the paired user
 * - AUTH-MOB-009: redeemPairingToken rejects a malformed token before touching the pairing store
 * - AUTH-MOB-010: redeemPairingToken propagates an invalid/expired token as 401
 * - AUTH-MOB-011: header value matching is case-insensitive and exact
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshToken: jest.fn(),
  getCurrentUser: jest.fn(),
  issueTokensForUser: jest.fn(),
};
jest.mock('../../services/auth.service', () => ({ __esModule: true, default: mockAuthService }));

const mockPairing = { createPairingToken: jest.fn(), redeem: jest.fn() };
jest.mock('../../services/mobilePairing.service', () => ({ __esModule: true, default: mockPairing }));

const mockBlacklistToken = jest.fn();
jest.mock('../../services/tokenBlacklist.service', () => ({
  __esModule: true,
  blacklistToken: mockBlacklistToken,
  isBlacklisted: jest.fn(),
}));

const mockSetRefreshTokenCookie = jest.fn();
const mockClearRefreshTokenCookie = jest.fn();
const mockGetRefreshTokenFromCookie = jest.fn();
jest.mock('../../http/cookies', () => ({
  setRefreshTokenCookie: mockSetRefreshTokenCookie,
  clearRefreshTokenCookie: mockClearRefreshTokenCookie,
  getRefreshTokenFromCookie: mockGetRefreshTokenFromCookie,
}));

const mockSetCsrfCookie = jest.fn();
const mockClearCsrfCookie = jest.fn();
jest.mock('../../security/csrf', () => ({
  generateCsrfToken: () => 'mock-csrf',
  setCsrfCookie: mockSetCsrfCookie,
  clearCsrfCookie: mockClearCsrfCookie,
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { authController } from '../auth.controller';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createAuthenticatedControllerArgs,
  expectAppError,
} from '../../__tests__/mockBuilders/requests';
import { testUsers, validLoginInput, validRegistrationInput } from '../../__tests__/fixtures/users';
import { AppError } from '../../errors/errors';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const MOBILE = { 'x-client-platform': 'mobile' };
const VALID_PAIRING_TOKEN = 'ab'.repeat(32);

const authResponse = {
  user: {
    id: testUsers.user1.id,
    username: testUsers.user1.username,
    email: testUsers.user1.email,
    avatarUrl: testUsers.user1.avatarUrl,
    timezone: 'Europe/Rome',
  },
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
};

/** The `data` object of the single JSON response a handler produced. */
function responseData(res: ReturnType<typeof createMockResponse>): Record<string, unknown> {
  expect(res.json).toHaveBeenCalledTimes(1);
  const body = res.json.mock.calls[0][0] as { status: string; data: Record<string, unknown> };
  expect(body.status).toBe('success');
  return body.data;
}

describe('AuthController — native clients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRefreshTokenFromCookie.mockReturnValue(undefined);
  });

  it('AUTH-MOB-001: mobile login returns refreshToken in the body and sets no cookies', async () => {
    mockAuthService.login.mockResolvedValue(authResponse as never);
    const req = createMockRequest({ body: validLoginInput, headers: MOBILE });
    const res = createMockResponse();
    const next = createMockNext();

    authController.login(req as never, res as never, next as never);
    await flushPromises();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(responseData(res)).toEqual({
      user: authResponse.user,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
    expect(mockSetCsrfCookie).not.toHaveBeenCalled();
  });

  it('AUTH-MOB-002: browser login keeps cookies and omits refreshToken from the body', async () => {
    mockAuthService.login.mockResolvedValue(authResponse as never);
    const req = createMockRequest({ body: validLoginInput });
    const res = createMockResponse();

    authController.login(req as never, res as never, createMockNext() as never);
    await flushPromises();

    const data = responseData(res);
    expect(data).not.toHaveProperty('refreshToken');
    expect(data.accessToken).toBe('access-1');
    expect(mockSetRefreshTokenCookie).toHaveBeenCalledWith(res, 'refresh-1');
    expect(mockSetCsrfCookie).toHaveBeenCalled();
  });

  it('AUTH-MOB-003: mobile register returns refreshToken in the body with 201', async () => {
    mockAuthService.register.mockResolvedValue(authResponse as never);
    const req = createMockRequest({ body: validRegistrationInput, headers: MOBILE });
    const res = createMockResponse();

    authController.register(req as never, res as never, createMockNext() as never);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(201);
    expect(responseData(res).refreshToken).toBe('refresh-1');
    expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
  });

  it('AUTH-MOB-004: mobile refresh uses the body token, ignores cookies, returns the rotated pair', async () => {
    // A cookie is present on the request, but a native client must never have it used.
    mockGetRefreshTokenFromCookie.mockReturnValue('cookie-token');
    mockAuthService.refreshToken.mockResolvedValue({
      user: authResponse.user,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    } as never);
    const req = createMockRequest({ body: { refreshToken: 'body-token' }, headers: MOBILE });
    const res = createMockResponse();

    authController.refreshToken(req as never, res as never, createMockNext() as never);
    await flushPromises();

    expect(mockAuthService.refreshToken).toHaveBeenCalledWith('body-token');
    expect(responseData(res)).toEqual({
      user: authResponse.user,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
    expect(mockSetCsrfCookie).not.toHaveBeenCalled();
  });

  it('AUTH-MOB-005: mobile refresh propagates a service failure without touching cookies', async () => {
    mockAuthService.refreshToken.mockRejectedValue(new AppError('Invalid refresh token', 401) as never);
    const req = createMockRequest({ body: { refreshToken: 'stale' }, headers: MOBILE });
    const res = createMockResponse();
    const next = createMockNext();

    authController.refreshToken(req as never, res as never, next as never);
    await flushPromises();

    expectAppError(next, 401, 'Invalid refresh token');
    expect(mockClearRefreshTokenCookie).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('AUTH-MOB-006: mobile logout blacklists the refresh token sent in the body', async () => {
    const req = createMockRequest({ body: { refreshToken: 'body-refresh' }, headers: MOBILE });
    const res = createMockResponse();

    authController.logout(req as never, res as never, createMockNext() as never);
    await flushPromises();

    expect(mockBlacklistToken).toHaveBeenCalledWith('body-refresh');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('AUTH-MOB-006b: a browser logout does not read a refresh token from the body', async () => {
    const req = createMockRequest({ body: { refreshToken: 'someone-elses-token' } });
    const res = createMockResponse();

    authController.logout(req as never, res as never, createMockNext() as never);
    await flushPromises();

    expect(mockBlacklistToken).not.toHaveBeenCalled();
  });

  it('AUTH-MOB-007: createPairingToken requires auth and returns token, expiry and server URL', async () => {
    const expiresAt = new Date('2026-11-11T12:05:00.000Z');
    mockPairing.createPairingToken.mockReturnValue({ token: VALID_PAIRING_TOKEN, expiresAt });

    const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);
    authController.createPairingToken(req as never, res as never, next as never);
    await flushPromises();

    expect(mockPairing.createPairingToken).toHaveBeenCalledWith(testUsers.user1.id);
    expect(res.status).toHaveBeenCalledWith(201);
    const data = responseData(res);
    expect(data.pairingToken).toBe(VALID_PAIRING_TOKEN);
    expect(data.expiresAt).toBe('2026-11-11T12:05:00.000Z');
    expect(typeof data.serverUrl).toBe('string');

    // Unauthenticated: rejected before any token is minted.
    jest.clearAllMocks();
    const anonNext = createMockNext();
    authController.createPairingToken(
      createMockRequest() as never,
      createMockResponse() as never,
      anonNext as never
    );
    await flushPromises();
    expect(mockPairing.createPairingToken).not.toHaveBeenCalled();
    expect(anonNext).toHaveBeenCalledTimes(1);
  });

  it('AUTH-MOB-008: redeemPairingToken issues tokens for the paired user', async () => {
    mockPairing.redeem.mockReturnValue(testUsers.user1.id);
    mockAuthService.issueTokensForUser.mockResolvedValue(authResponse as never);
    const req = createMockRequest({ body: { pairingToken: VALID_PAIRING_TOKEN } });
    const res = createMockResponse();

    authController.redeemPairingToken(req as never, res as never, createMockNext() as never);
    await flushPromises();

    expect(mockPairing.redeem).toHaveBeenCalledWith(VALID_PAIRING_TOKEN);
    expect(mockAuthService.issueTokensForUser).toHaveBeenCalledWith(testUsers.user1.id);
    expect(responseData(res).refreshToken).toBe('refresh-1');
    expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
  });

  it('AUTH-MOB-009: redeemPairingToken rejects a malformed token before the pairing store', async () => {
    const next = createMockNext();
    authController.redeemPairingToken(
      createMockRequest({ body: { pairingToken: 'not-hex' } }) as never,
      createMockResponse() as never,
      next as never
    );
    await flushPromises();

    expect(mockPairing.redeem).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('AUTH-MOB-010: redeemPairingToken propagates an invalid/expired token as 401', async () => {
    mockPairing.redeem.mockImplementation(() => {
      throw new AppError('Pairing code is invalid or has expired', 401);
    });
    const next = createMockNext();
    authController.redeemPairingToken(
      createMockRequest({ body: { pairingToken: VALID_PAIRING_TOKEN } }) as never,
      createMockResponse() as never,
      next as never
    );
    await flushPromises();

    expectAppError(next, 401, 'Pairing code is invalid or has expired');
    expect(mockAuthService.issueTokensForUser).not.toHaveBeenCalled();
  });

  it('AUTH-MOB-011: header value matching is case-insensitive and exact', async () => {
    mockAuthService.login.mockResolvedValue(authResponse as never);

    const loginWith = async (value: string): Promise<Record<string, unknown>> => {
      const res = createMockResponse();
      authController.login(
        createMockRequest({ body: validLoginInput, headers: { 'x-client-platform': value } }) as never,
        res as never,
        createMockNext() as never
      );
      await flushPromises();
      return responseData(res);
    };

    expect(await loginWith(' Mobile ')).toHaveProperty('refreshToken');
    expect(await loginWith('web')).not.toHaveProperty('refreshToken');
    expect(await loginWith('mobile-ish')).not.toHaveProperty('refreshToken');
  });
});
