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
jest.mock('../../utils/cookies', () => ({
  setRefreshTokenCookie: mockSetRefreshTokenCookie,
  clearRefreshTokenCookie: mockClearRefreshTokenCookie,
  getRefreshTokenFromCookie: mockGetRefreshTokenFromCookie,
}));

// Mock csrf utils
const mockGenerateCsrfToken = jest.fn();
const mockSetCsrfCookie = jest.fn();
const mockClearCsrfCookie = jest.fn();
jest.mock('../../utils/csrf', () => ({
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
  createAuthenticatedControllerArgs,
  expectSuccessResponse,
} from '../../__tests__/helpers/requests';
import { testUsers, validRegistrationInput, validLoginInput } from '../../__tests__/fixtures/users';
import { AppError } from '../../utils/errors';

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
    it('should validate body, call authService.register, set cookies, and return 201', async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      const req = createMockRequest({
        body: validRegistrationInput as unknown as Record<string, unknown>,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.register(req as never, res as never, next);

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

      await authController.register(req as never, res as never, next);

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
        body: validRegistrationInput as unknown as Record<string, unknown>,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authController.register(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should not return refreshToken in the response body', async () => {
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      const req = createMockRequest({
        body: validRegistrationInput as unknown as Record<string, unknown>,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.register(req as never, res as never, next);

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
        body: validLoginInput as unknown as Record<string, unknown>,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.login(req as never, res as never, next);

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

      await authController.login(req as never, res as never, next);

      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should propagate service errors for invalid credentials', async () => {
      const serviceError = new AppError('Invalid email or password', 401);
      mockAuthService.login.mockRejectedValue(serviceError);

      const req = createMockRequest({
        body: validLoginInput as unknown as Record<string, unknown>,
      });
      const res = createMockResponse();
      const next = createMockNext();

      authController.login(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalledWith(serviceError);
    });

    it('should not return refreshToken in the response body', async () => {
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      const req = createMockRequest({
        body: validLoginInput as unknown as Record<string, unknown>,
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.login(req as never, res as never, next);

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

      await authController.refreshToken(req as never, res as never, next);

      expect(mockGetRefreshTokenFromCookie).toHaveBeenCalled();
      expect(mockIsBlacklisted).toHaveBeenCalledWith('cookie-refresh-token');
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

      await authController.refreshToken(req as never, res as never, next);

      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('body-refresh-token');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject blacklisted token', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('blacklisted-token');
      mockIsBlacklisted.mockReturnValue(true);

      const req = createMockRequest({
        cookies: { refreshToken: 'blacklisted-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.refreshToken(req as never, res as never, next);

      expect(mockIsBlacklisted).toHaveBeenCalledWith('blacklisted-token');
      expect(mockClearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(mockClearCsrfCookie).toHaveBeenCalledWith(res);
      expect(mockAuthService.refreshToken).not.toHaveBeenCalled();

      // Error passed to next via asyncHandler
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.message).toBe('Token has been revoked');
      expect(error.statusCode).toBe(401);
    });

    it('should propagate service errors via next()', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('expired-token');
      mockAuthService.refreshToken.mockRejectedValue(new AppError('Invalid refresh token', 401));

      const req = createMockRequest({
        cookies: { refreshToken: 'expired-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authController.refreshToken(req as never, res as never, next);
      await flushPromises();

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.message).toBe('Invalid refresh token');
    });
  });

  // =========================================================================
  // getCurrentUser
  // =========================================================================
  describe('getCurrentUser', () => {
    it('should call requireUserId and return current user data', async () => {
      mockAuthService.getCurrentUser.mockResolvedValue(mockCurrentUser);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      await authController.getCurrentUser(req as never, res as never, next);

      expect(mockAuthService.getCurrentUser).toHaveBeenCalledWith(testUsers.user1.id);
      expectSuccessResponse(res, 200, mockCurrentUser);
      expect(next).not.toHaveBeenCalled();
    });

    it('should propagate 401 when user is not authenticated', async () => {
      const req = createMockRequest({}); // No user attached
      const res = createMockResponse();
      const next = createMockNext();

      await authController.getCurrentUser(req as never, res as never, next);

      expect(mockAuthService.getCurrentUser).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0] as AppError;
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
    });

    it('should propagate service errors when user not found', async () => {
      const serviceError = new AppError('User not found', 404);
      mockAuthService.getCurrentUser.mockRejectedValue(serviceError);

      const { req, res, next } = createAuthenticatedControllerArgs(testUsers.user1);

      authController.getCurrentUser(req as never, res as never, next);
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

      await authController.logout(req as never, res as never, next);

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

      await authController.logout(req as never, res as never, next);

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

      await authController.logout(req as never, res as never, next);

      // Error propagated via asyncHandler -> next
      expect(next).toHaveBeenCalled();
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

      await authController.silentRefresh(req as never, res as never, next);

      expect(mockAuthService.refreshToken).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: null,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return null and clear cookies when token is blacklisted', async () => {
      mockGetRefreshTokenFromCookie.mockReturnValue('blacklisted-token');
      mockIsBlacklisted.mockReturnValue(true);

      const req = createMockRequest({
        cookies: { refreshToken: 'blacklisted-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authController.silentRefresh(req as never, res as never, next);

      expect(mockIsBlacklisted).toHaveBeenCalledWith('blacklisted-token');
      expect(mockClearRefreshTokenCookie).toHaveBeenCalledWith(res);
      expect(mockClearCsrfCookie).toHaveBeenCalledWith(res);
      expect(mockAuthService.refreshToken).not.toHaveBeenCalled();

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

      await authController.silentRefresh(req as never, res as never, next);

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

      await authController.silentRefresh(req as never, res as never, next);

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

      await authController.silentRefresh(req as never, res as never, next);

      expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
      expect(mockSetCsrfCookie).not.toHaveBeenCalled();
      expect(mockClearRefreshTokenCookie).not.toHaveBeenCalled();
      expect(mockClearCsrfCookie).not.toHaveBeenCalled();
    });
  });
});
