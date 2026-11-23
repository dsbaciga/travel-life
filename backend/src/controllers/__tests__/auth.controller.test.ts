/**
 * Auth Controller Tests
 *
 * Tests the auth controller as a thin wrapper around authService.
 * Each test mocks the service layer and verifies:
 * - Correct service method is called with correct args
 * - Response has correct status code and { status: 'success', data } format
 * - Service errors propagate correctly via asyncHandler -> next()
 *
 * Test cases:
 * AUTH-CTRL-001: register - validates body, calls authService.register, sets cookies, returns 201
 * AUTH-CTRL-002: register - rejects invalid body (Zod validation error)
 * AUTH-CTRL-003: register - propagates service errors
 * AUTH-CTRL-004: login - validates body, calls authService.login, sets cookies, returns 200
 * AUTH-CTRL-005: login - rejects invalid body (Zod validation error)
 * AUTH-CTRL-006: login - propagates service errors
 * AUTH-CTRL-007: refreshToken - gets token from cookie, calls authService.refreshToken, returns 200
 * AUTH-CTRL-008: refreshToken - falls back to body token when no cookie
 * AUTH-CTRL-009: refreshToken - rejects blacklisted token
 * AUTH-CTRL-010: refreshToken - throws when no token provided
 * AUTH-CTRL-011: getCurrentUser - calls requireUserId, calls authService.getCurrentUser, returns user
 * AUTH-CTRL-012: getCurrentUser - throws when user not authenticated
 * AUTH-CTRL-013: getCurrentUser - propagates service errors
 * AUTH-CTRL-014: logout - blacklists refresh token, clears cookies, returns 200
 * AUTH-CTRL-015: logout - handles missing refresh token cookie gracefully
 * AUTH-CTRL-014b: logout - also blacklists access token from Authorization header
 * AUTH-CTRL-014c: logout - tolerates malformed access token (logs warning, succeeds)
 * AUTH-CTRL-016: silentRefresh - returns null when no cookie
 * AUTH-CTRL-017: silentRefresh - returns null for blacklisted token, clears cookies
 * AUTH-CTRL-018: silentRefresh - returns user and accessToken for valid token
 * AUTH-CTRL-019: silentRefresh - returns null and clears cookies on service error
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mock setup (must be before imports that use the mocked modules) ---

// Mock authService
const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshToken: jest.fn(),
  getCurrentUser: jest.fn(),
};
jest.mock('../../services/auth.service', () => ({
  __esModule: true,
  default: mockAuthService,
}));

// Mock tokenBlacklist service
const mockBlacklistToken = jest.fn();
const mockIsBlacklisted = jest.fn();
jest.mock('../../services/tokenBlacklist.service', () => ({
  __esModule: true,
  blacklistToken: mockBlacklistToken,
  isBlacklisted: mockIsBlacklisted,
}));

// Mock cookies utils
const mockSetRefreshTokenCookie = jest.fn();
const mockClearRefreshTokenCookie = jest.fn();
const mockGetRefreshTokenFromCookie = jest.fn();
jest.mock('../../http/cookies', () => ({
  setRefreshTokenCookie: mockSetRefreshTokenCookie,
  clearRefreshTokenCookie: mockClearRefreshTokenCookie,
  getRefreshTokenFromCookie: mockGetRefreshTokenFromCookie,
}));

// Mock csrf utils
const mockGenerateCsrfToken = jest.fn();
const mockSetCsrfCookie = jest.fn();
const mockClearCsrfCookie = jest.fn();
jest.mock('../../security/csrf', () => ({
  generateCsrfToken: mockGenerateCsrfToken,
  setCsrfCookie: mockSetCsrfCookie,
  clearCsrfCookie: mockClearCsrfCookie,
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// --- Imports (after mocks) ---
import { authController } from '../auth.controller';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  expectAppError,
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/mockBuilders/requests';
import { testUsers, validRegistrationInput, validLoginInput } from '../../__tests__/fixtures/users';
import { AppError } from '../../errors/errors';

// Helper to flush microtask queue so asyncHandler's .catch(next) resolves
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

// --- Test data ---
const mockAuthResponse = {
  user: {
    id: testUsers.user1.id,
    username: testUsers.user1.username,
    email: testUsers.user1.email,
    avatarUrl: testUsers.user1.avatarUrl,
  },
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
};

const mockRefreshResponse = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  user: {
    id: testUsers.user1.id,
    username: testUsers.user1.username,
    email: testUsers.user1.email,
    avatarUrl: testUsers.user1.avatarUrl,
  },
};

const mockCurrentUser = {
  id: testUsers.user1.id,
  username: testUsers.user1.username,
  email: testUsers.user1.email,
  avatarUrl: testUsers.user1.avatarUrl,
  createdAt: testUsers.user1.createdAt,
};

describe('AuthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateCsrfToken.mockReturnValue('mock-csrf-token');
    mockIsBlacklisted.mockReturnValue(false);
    mockGetRefreshTokenFromCookie.mockReturnValue(undefined);
  });

  // =========================================================================
  // register
  // =========================================================================
  describe('register', () => {
    it('refuses sign-up when DISABLE_REGISTRATION is on, before touching the service', async () => {
      const { config } = require('../../config') as typeof import('../../config');
      config.auth.registrationDisabled = true;
      try {
        const req = createMockRequest({ body: validRegistrationInput });
        const res = createMockResponse();
        const next = createMockNext();

        await authController.register(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        expect(mockAuthService.register).not.toHaveBeenCalled();
        expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
      } finally {
        config.auth.registrationDisabled = false;
      }
    });

    it('should validate body, call authService.register, set cookies, and return 201', async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      const req = createMockRequest({
        body: validRegistrationInput,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.register(req, res, next);

      // Service called with validated data
      expect(mockAuthService.register).toHaveBeenCalledWith(validRegistrationInput);

      // Refresh token cookie set
      expect(mockSetRefreshTokenCookie).toHaveBeenCalledWith(res, mockAuthResponse.refreshToken);

      // CSRF token set
      expect(mockGenerateCsrfToken).toHaveBeenCalled();
      expect(mockSetCsrfCookie).toHaveBeenCalledWith(res, 'mock-csrf-token');

      // Response
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          user: mockAuthResponse.user,
          accessToken: mockAuthResponse.accessToken,
        },
      });

      // next should not be called on success
      expect(next).not.toHaveBeenCalled();
    });

    it('should propagate Zod validation error for invalid body', async () => {
      const req = createMockRequest({
        body: { email: 'not-an-email', password: 'short', username: 'ab' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.register(req, res, next);

      // Service should not be called
      expect(mockAuthService.register).not.toHaveBeenCalled();

      // Error passed to next (Zod errors are caught by asyncHandler)
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeDefined();
    });

    it('should propagate service errors via next()', async () => {
      const serviceError = new AppError('Email already registered', 400);
      mockAuthService.register.mockRejectedValue(serviceError);

      const req = createMockRequest({
        body: validRegistrationInput,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authController.register(req, res, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should not return refreshToken in the response body', async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      const req = createMockRequest({
        body: validRegistrationInput,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.register(req, res, next);

      const jsonBody = res.json.mock.calls[0][0];
      expect(jsonBody.data).not.toHaveProperty('refreshToken');
    });
  });

  // =========================================================================
  // login
  // =========================================================================
  describe('login', () => {
    it('should validate body, call authService.login, set cookies, and return 200', async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      const req = createMockRequest({
        body: validLoginInput,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.login(req, res, next);

      // Service called with validated data
      expect(mockAuthService.login).toHaveBeenCalledWith(validLoginInput);

      // Refresh token cookie set
      expect(mockSetRefreshTokenCookie).toHaveBeenCalledWith(res, mockAuthResponse.refreshToken);

      // CSRF token set
      expect(mockGenerateCsrfToken).toHaveBeenCalled();
      expect(mockSetCsrfCookie).toHaveBeenCalledWith(res, 'mock-csrf-token');

      // Response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          user: mockAuthResponse.user,
          accessToken: mockAuthResponse.accessToken,
        },
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('should propagate Zod validation error for invalid body', async () => {
      const req = createMockRequest({
        body: { email: 'not-an-email', password: '' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.login(req, res, next);

      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should propagate service errors for invalid credentials', async () => {
      const serviceError = new AppError("That email and password don't match. Check them and try again.", 401);
      mockAuthService.login.mockRejectedValue(serviceError);

      const req = createMockRequest({
        body: validLoginInput,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authController.login(req, res, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should not return refreshToken in the response body', async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      const req = createMockRequest({
        body: validLoginInput,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.login(req, res, next);

      const jsonBody = res.json.mock.calls[0][0];
      expect(jsonBody.data).not.toHaveProperty('refreshToken');
    });
  });

  // =========================================================================
  // refreshToken
  // =========================================================================
  describe('refreshToken', () => {
    it('should get token from cookie and return new accessToken', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('cookie-refresh-token');
      mockAuthService.refreshToken.mockResolvedValue(mockRefreshResponse);

      const req = createMockRequest({
        cookies: { refreshToken: 'cookie-refresh-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.refreshToken(req, res, next);

      expect(mockGetRefreshTokenFromCookie).toHaveBeenCalled();
      // Revocation is no longer checked here; the controller delegates the whole
      // decision to authService.refreshToken().
      expect(mockIsBlacklisted).not.toHaveBeenCalled();
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('cookie-refresh-token');

      // New refresh token cookie set (rotation)
      expect(mockSetRefreshTokenCookie).toHaveBeenCalledWith(res, mockRefreshResponse.refreshToken);

      // CSRF token rotated
      expect(mockSetCsrfCookie).toHaveBeenCalledWith(res, 'mock-csrf-token');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          accessToken: mockRefreshResponse.accessToken,
        },
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('should fall back to body token when no cookie', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue(undefined);
      mockAuthService.refreshToken.mockResolvedValue(mockRefreshResponse);

      const req = createMockRequest({
        body: { refreshToken: 'body-refresh-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.refreshToken(req, res, next);

      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('body-refresh-token');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('should delegate revoked tokens to the service and clear cookies on rejection', async () => {
      // The controller deliberately does NOT short-circuit revoked tokens.
      // Refresh tokens are single-use, so a revoked one being replayed means the
      // token family is compromised, and authService.refreshToken() responds by
      // invalidating every outstanding token for that user. Short-circuiting
      // here would reject the replay but leave a thief's rotated session alive.
      mockGetRefreshTokenFromCookie.mockReturnValue('blacklisted-token');
      mockIsBlacklisted.mockReturnValue(true);
      mockAuthService.refreshToken.mockRejectedValue(
        new AppError('You were signed out. Sign in again to continue.', 401)
      );

      const req = createMockRequest({
        cookies: { refreshToken: 'blacklisted-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authController.refreshToken(req, res, next);
      await flushPromises();

      expect(mockIsBlacklisted).not.toHaveBeenCalled();
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('blacklisted-token');

      // Any refresh failure ends the session here.
      expect(mockClearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(mockClearCsrfCookie).toHaveBeenCalledWith(res);

      // Error passed to next via asyncHandler
      expect(next).toHaveBeenCalled();
      const error = expectAppError(next);
      expect(error.message).toBe('You were signed out. Sign in again to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should propagate service errors via next()', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('expired-token');
      mockAuthService.refreshToken.mockRejectedValue(new AppError('You were signed out. Sign in again to continue.', 401));

      const req = createMockRequest({
        cookies: { refreshToken: 'expired-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authController.refreshToken(req, res, next);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      const error = expectAppError(next);
      expect(error.message).toBe('You were signed out. Sign in again to continue.');
    });
  });

  // =========================================================================
  // getCurrentUser
  // =========================================================================
  describe('getCurrentUser', () => {
    it('should call requireUserId and return current user data', async () => {
      mockAuthService.getCurrentUser.mockResolvedValue(mockCurrentUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await authController.getCurrentUser(req, res, next);

      expect(mockAuthService.getCurrentUser).toHaveBeenCalledWith(testUsers.user1.id);
      expectSuccessResponse(res, 200, mockCurrentUser);
      expect(next).not.toHaveBeenCalled();
    });

    it('should propagate 401 when user is not authenticated', async () => {
      const req = createMockRequest({}); // No user attached
      const res = createMockResponse();
      const next = createMockNext();

      await authController.getCurrentUser(req, res, next);

      expect(mockAuthService.getCurrentUser).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const error = expectAppError(next);
      expect(error.message).toBe('Sign in to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should propagate service errors when user not found', async () => {
      const serviceError = new AppError('User not found', 404);
      mockAuthService.getCurrentUser.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      authController.getCurrentUser(req, res, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });
  });

  // =========================================================================
  // logout
  // =========================================================================
  describe('logout', () => {
    it('should blacklist refresh token, clear cookies, and return 200', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('active-refresh-token');

      const req = createMockRequest({
        cookies: { refreshToken: 'active-refresh-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.logout(req, res, next);

      // Token blacklisted
      expect(mockBlacklistToken).toHaveBeenCalledWith('active-refresh-token');

      // Cookies cleared
      expect(mockClearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(mockClearCsrfCookie).toHaveBeenCalledWith(res);

      // Response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Logged out successfully',
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('should handle missing refresh token cookie gracefully', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue(undefined);

      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      await authController.logout(req, res, next);

      // Should NOT blacklist anything
      expect(mockBlacklistToken).not.toHaveBeenCalled();

      // Cookies should still be cleared
      expect(mockClearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(mockClearCsrfCookie).toHaveBeenCalledWith(res);

      // Response still successful
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Logged out successfully',
      });

      expect(next).not.toHaveBeenCalled();
    });

    it('should still return success even if blacklistToken throws', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('token');
      mockBlacklistToken.mockImplementation(() => {
        throw new Error('Blacklist error');
      });

      const req = createMockRequest({
        cookies: { refreshToken: 'token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.logout(req, res, next);

      // Error propagated via asyncHandler -> next
      expect(next).toHaveBeenCalled();
    });

    // AUTH-CTRL-014b: Critical security fix - logout must blacklist access token too,
    // otherwise a stolen access token remains valid until natural expiry (~15 min)
    // even after the user has logged out.
    it('should also blacklist the access token from the Authorization header', async () => {
      // Reset any leftover throwing implementation from prior tests in this describe
      mockBlacklistToken.mockReset();
      mockGetRefreshTokenFromCookie.mockReturnValue('refresh-tok');

      // Build a real JWT with a future exp so getRemainingTtlMs returns > 0.
      // jwt.decode does not verify the signature, so the secret is irrelevant here.
      const jsonwebtoken = jest.requireActual<typeof import('jsonwebtoken')>('jsonwebtoken');
      const accessToken = jsonwebtoken.sign(
        { id: 1, userId: 1, email: 'test@example.com' },
        'any-secret-decode-doesnt-verify',
        { expiresIn: '15m' }
      );

      const req = createMockRequest({
        cookies: { refreshToken: 'refresh-tok' },
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.logout(req, res, next);

      // Refresh token blacklisted with default TTL (1 arg)
      expect(mockBlacklistToken).toHaveBeenCalledWith('refresh-tok');
      // Access token blacklisted with computed remaining TTL (2 args)
      const accessCall = mockBlacklistToken.mock.calls.find(
        (args: unknown[]) => args[0] === accessToken
      );
      expect(accessCall).toBeDefined();
      expect(typeof accessCall![1]).toBe('number');
      // Should be roughly 15 min (allow generous slack)
      expect(accessCall![1] as number).toBeGreaterThan(60_000);
      expect(accessCall![1] as number).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    // AUTH-CTRL-014c: a malformed/undecodable access token must not break logout
    it('should tolerate a malformed access token and still complete logout', async () => {
      mockBlacklistToken.mockReset();
      mockGetRefreshTokenFromCookie.mockReturnValue(undefined);

      const req = createMockRequest({
        headers: { authorization: 'Bearer not-a-jwt-at-all' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.logout(req, res, next);

      // No blacklist call at all (refresh token absent + access token undecodable)
      expect(mockBlacklistToken).not.toHaveBeenCalled();

      // Cookies cleared, success returned
      expect(mockClearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(mockClearCsrfCookie).toHaveBeenCalledWith(res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('should skip access-token blacklist when no Authorization header is present', async () => {
      mockBlacklistToken.mockReset();
      mockGetRefreshTokenFromCookie.mockReturnValue('refresh-tok');

      const req = createMockRequest({
        cookies: { refreshToken: 'refresh-tok' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.logout(req, res, next);

      // Only the refresh token gets blacklisted
      expect(mockBlacklistToken).toHaveBeenCalledTimes(1);
      expect(mockBlacklistToken).toHaveBeenCalledWith('refresh-tok');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // =========================================================================
  // silentRefresh
  // =========================================================================
  describe('silentRefresh', () => {
    it('should return null data when no refresh token cookie exists', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue(undefined);

      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      await authController.silentRefresh(req, res, next);

      expect(mockAuthService.refreshToken).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: null,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return null and clear cookies when the service rejects a revoked token', async () => {
      // As in `refreshToken`, revoked tokens are deliberately NOT short-circuited
      // here -- the service needs to see the replay so it can invalidate the
      // whole compromised token family. The client still degrades to
      // "no active session".
      mockGetRefreshTokenFromCookie.mockReturnValue('blacklisted-token');
      mockIsBlacklisted.mockReturnValue(true);
      mockAuthService.refreshToken.mockRejectedValue(
        new AppError('You were signed out. Sign in again to continue.', 401)
      );

      const req = createMockRequest({
        cookies: { refreshToken: 'blacklisted-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.silentRefresh(req, res, next);

      expect(mockIsBlacklisted).not.toHaveBeenCalled();
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('blacklisted-token');
      expect(mockClearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(mockClearCsrfCookie).toHaveBeenCalledWith(res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: null,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return user and accessToken for valid refresh token', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('valid-refresh-token');
      mockIsBlacklisted.mockReturnValue(false);
      mockAuthService.refreshToken.mockResolvedValue(mockRefreshResponse);

      const req = createMockRequest({
        cookies: { refreshToken: 'valid-refresh-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.silentRefresh(req, res, next);

      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('valid-refresh-token');

      // New tokens set in cookies
      expect(mockSetRefreshTokenCookie).toHaveBeenCalledWith(res, mockRefreshResponse.refreshToken);
      expect(mockSetCsrfCookie).toHaveBeenCalledWith(res, 'mock-csrf-token');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          user: mockRefreshResponse.user,
          accessToken: mockRefreshResponse.accessToken,
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return null and clear cookies when service throws error', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('expired-token');
      mockIsBlacklisted.mockReturnValue(false);
      mockAuthService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'));

      const req = createMockRequest({
        cookies: { refreshToken: 'expired-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.silentRefresh(req, res, next);

      expect(mockClearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(mockClearCsrfCookie).toHaveBeenCalledWith(res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: null,
      });

      // next should NOT be called - silentRefresh handles errors internally
      expect(next).not.toHaveBeenCalled();
    });

    it('should not set new cookies when no refresh token cookie exists', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue(undefined);

      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      await authController.silentRefresh(req, res, next);

      expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
      expect(mockSetCsrfCookie).not.toHaveBeenCalled();
      expect(mockClearRefreshTokenCookie).not.toHaveBeenCalled();
      expect(mockClearCsrfCookie).not.toHaveBeenCalled();
    });
  });
});
