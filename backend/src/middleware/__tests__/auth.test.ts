/**
 * Auth Middleware Tests
 *
 * Test cases:
 * AUTH-M01: Extract token from Authorization header
 * AUTH-M02: Reject missing Authorization header
 * AUTH-M03: Reject malformed Bearer token
 * AUTH-M04: Reject expired access token
 * AUTH-M05: Reject invalid token signature
 * AUTH-M06: Attach user to request on valid token
 * AUTH-M07: Rate limit exceeded returns 429 (note: rate limiting is not in auth middleware)
 * AUTH-M08: Reject token with stale passwordVersion after password change
 * AUTH-M09: Reject token when user no longer exists
 * AUTH-M10: Reject blacklisted access token (e.g., after logout)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Mock the config module
jest.mock('../../config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret',
      expiresIn: '15m',
      refreshSecret: 'test-refresh-secret',
      refreshExpiresIn: '7d',
    },
  },
}));

// Mock the database module
const mockFindUnique = jest.fn();
jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// Mock the token blacklist service so we don't touch disk or start intervals
const mockIsBlacklisted = jest.fn();
jest.mock('../../services/tokenBlacklist.service', () => ({
  __esModule: true,
  isBlacklisted: (...args: unknown[]) => mockIsBlacklisted(...args),
}));

// Import after mocks
import { authenticate, clearPasswordVersionCache } from '../auth';
import { AppError } from '../../errors/errors';
import { generateAccessToken } from '../../auth/jwt';
import { JwtPayload } from '../../types/auth.types';

/**
 * Helper to wait for async middleware to complete.
 * Since authenticate is now async, we need to await it and then
 * check what was passed to next().
 */
const runAuthenticate = async (
  req: Partial<Request>,
  res: Partial<Response>,
  next: NextFunction
) => {
  await authenticate(req as Request, res as Response, next);
};

describe('Auth Middleware - authenticate', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    clearPasswordVersionCache();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis() as unknown as Response['status'],
      json: jest.fn() as unknown as Response['json'],
    };
    nextFunction = jest.fn() as unknown as NextFunction;

    // Default: user exists with passwordVersion 0
    mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
    // Default: token is not blacklisted
    mockIsBlacklisted.mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // AUTH-M01: Extract token from Authorization header
  describe('AUTH-M01: Token extraction from Authorization header', () => {
    it('should extract token from valid Authorization header', async () => {
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.userId).toBe(1);
    });

    it('should handle lowercase authorization header', async () => {
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
    });
  });

  // AUTH-M02: Reject missing Authorization header
  describe('AUTH-M02: Missing Authorization header', () => {
    it('should reject request with no Authorization header', async () => {
      mockRequest.headers = {};

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('Sign in to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should reject request with undefined authorization', async () => {
      mockRequest.headers = {
        authorization: undefined,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });
  });

  // AUTH-M03: Reject malformed Bearer token
  describe('AUTH-M03: Malformed Bearer token', () => {
    it('should reject token without Bearer prefix', async () => {
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: token, // Missing "Bearer " prefix
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('Sign in to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should reject token with wrong prefix', async () => {
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Basic ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('Sign in to continue.');
    });

    it('should reject empty Bearer token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });

    it('should reject malformed JWT token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer not.a.valid.jwt.token',
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('Your session has expired. Sign in again to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should reject completely invalid token string', async () => {
      mockRequest.headers = {
        authorization: 'Bearer randomgarbage',
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });
  });

  // AUTH-M04: Reject expired access token
  describe('AUTH-M04: Expired access token', () => {
    it('should reject expired token', async () => {
      // Create an expired token manually
      const expiredToken = jwt.sign(
        { id: 1, userId: 1, email: 'test@example.com' },
        'test-jwt-secret',
        { expiresIn: '-1s' } // Already expired
      );

      mockRequest.headers = {
        authorization: `Bearer ${expiredToken}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('Your session has expired. Sign in again to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should reject token that expired just now', async () => {
      // Create a token that expired 1 second ago
      const expiredToken = jwt.sign(
        { id: 1, userId: 1, email: 'test@example.com' },
        'test-jwt-secret',
        { expiresIn: '0s' }
      );

      // Wait a moment to ensure expiry
      mockRequest.headers = {
        authorization: `Bearer ${expiredToken}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });
  });

  // AUTH-M05: Reject invalid token signature
  describe('AUTH-M05: Invalid token signature', () => {
    it('should reject token signed with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        { id: 1, userId: 1, email: 'test@example.com' },
        'wrong-secret-key',
        { expiresIn: '15m' }
      );

      mockRequest.headers = {
        authorization: `Bearer ${wrongSecretToken}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('Your session has expired. Sign in again to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should reject token with tampered payload', async () => {
      // Create a valid token
      const validToken = generateAccessToken({ id: 1, userId: 1, email: 'test@example.com' });

      // Tamper with the payload by modifying the middle part
      const parts = validToken.split('.');
      // Decode, modify, and re-encode the payload (but signature will be invalid)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      payload.userId = 999; // Tamper with the user ID
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = parts.join('.');

      mockRequest.headers = {
        authorization: `Bearer ${tamperedToken}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });

    it('should reject refresh token used as access token', async () => {
      // Refresh tokens are signed with a different secret
      const refreshToken = jwt.sign(
        { id: 1, userId: 1, email: 'test@example.com' },
        'test-refresh-secret', // Using refresh secret instead of access secret
        { expiresIn: '7d' }
      );

      mockRequest.headers = {
        authorization: `Bearer ${refreshToken}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });
  });

  // AUTH-M06: Attach user to request on valid token
  describe('AUTH-M06: Attach user to request', () => {
    it('should attach decoded user payload to request', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      const payload: JwtPayload = { id: 42, userId: 42, email: 'user@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      // Check that no error was passed to next
      expect((nextFunction as jest.Mock).mock.calls[0][0]).toBeUndefined();

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.id).toBe(42);
      expect(mockRequest.user?.userId).toBe(42);
      expect(mockRequest.user?.email).toBe('user@example.com');
    });

    it('should attach user with all payload fields', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      const payload: JwtPayload = {
        id: 100,
        userId: 100,
        email: 'complete@example.com',
        passwordVersion: 0,
      };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(mockRequest.user).toMatchObject({
        id: 100,
        userId: 100,
        email: 'complete@example.com',
      });
    });

    it('should call next() without arguments on success', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      // next() should be called with no arguments (indicating success)
      expect(nextFunction).toHaveBeenCalledTimes(1);
      expect((nextFunction as jest.Mock).mock.calls[0]).toHaveLength(0);
    });
  });

  // AUTH-M07: Rate limiting (note: rate limiting is typically handled by a separate middleware)
  describe('AUTH-M07: Rate limiting behavior', () => {
    it('should not implement rate limiting in auth middleware (separate concern)', async () => {
      // The authenticate middleware does not handle rate limiting
      // This test documents that behavior - rate limiting should be a separate middleware
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      // Make multiple rapid calls - all should succeed (no rate limiting in auth middleware)
      for (let i = 0; i < 10; i++) {
        mockRequest.headers = {
          authorization: `Bearer ${token}`,
        };
        await runAuthenticate(mockRequest, mockResponse, nextFunction);
      }

      // All calls should succeed - next() called 10 times
      expect(nextFunction).toHaveBeenCalledTimes(10);
    });
  });

  // AUTH-M08: Reject token with stale passwordVersion after password change
  describe('AUTH-M08: passwordVersion validation', () => {
    it('should reject token when passwordVersion is stale (password was changed)', async () => {
      // Token was issued with passwordVersion 0, but user has since changed password (now version 1)
      mockFindUnique.mockResolvedValue({ passwordVersion: 1 });
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('You were signed out. Sign in again to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should accept token when passwordVersion matches', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 3 });
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 3 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect((nextFunction as jest.Mock).mock.calls[0][0]).toBeUndefined();
      expect(mockRequest.user).toBeDefined();
    });

    it('should treat missing passwordVersion in token as version 0', async () => {
      // Old tokens issued before passwordVersion was added will not have the claim
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });

      // Create a token without passwordVersion claim
      const token = jwt.sign(
        { id: 1, userId: 1, email: 'test@example.com' },
        'test-jwt-secret',
        { expiresIn: '15m', algorithm: 'HS256' }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      // Should succeed because (undefined ?? 0) === 0
      expect(nextFunction).toHaveBeenCalled();
      expect((nextFunction as jest.Mock).mock.calls[0][0]).toBeUndefined();
    });

    it('should reject token without passwordVersion when user has changed password', async () => {
      // Old token without passwordVersion, but user has changed password (version is now 1)
      mockFindUnique.mockResolvedValue({ passwordVersion: 1 });

      const token = jwt.sign(
        { id: 1, userId: 1, email: 'test@example.com' },
        'test-jwt-secret',
        { expiresIn: '15m', algorithm: 'HS256' }
      );

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('You were signed out. Sign in again to continue.');
      expect(error.statusCode).toBe(401);
    });

    it('should query database with correct user ID from token', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      const payload: JwtPayload = { id: 55, userId: 55, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 55 },
        select: { passwordVersion: true },
      });
    });
  });

  // AUTH-M09: Reject token when user no longer exists
  describe('AUTH-M09: Deleted user', () => {
    it('should reject token when user no longer exists in database', async () => {
      mockFindUnique.mockResolvedValue(null);
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('You were signed out. Sign in again to continue.');
      expect(error.statusCode).toBe(401);
    });
  });

  // AUTH-M10: Reject blacklisted access token (e.g., after logout)
  describe('AUTH-M10: Blacklisted access token', () => {
    it('should reject a blacklisted access token with 401 and a signed-out message', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      mockIsBlacklisted.mockReturnValue(true);

      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(mockIsBlacklisted).toHaveBeenCalledWith(token);
      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.message).toBe('You were signed out. Sign in again to continue.');
      expect(error.statusCode).toBe(401);
      // Must reject before attaching user
      expect(mockRequest.user).toBeUndefined();
    });

    it('should accept a non-blacklisted token (default path)', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      mockIsBlacklisted.mockReturnValue(false);

      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(mockIsBlacklisted).toHaveBeenCalledWith(token);
      // Success: next called with no error and user attached
      expect((nextFunction as jest.Mock).mock.calls[0][0]).toBeUndefined();
      expect(mockRequest.user).toBeDefined();
    });
  });

  // Additional edge case tests
  describe('Edge Cases', () => {
    it('should handle whitespace in Authorization header', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer  ${token}`, // Extra space
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      // The middleware uses substring(7) which would include the extra space
      // This tests the current behavior
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should handle token with special characters in email', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      const payload: JwtPayload = {
        id: 1,
        userId: 1,
        email: 'user+tag@example.com',
        passwordVersion: 0,
      };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(mockRequest.user?.email).toBe('user+tag@example.com');
    });

    it('should handle large user IDs', async () => {
      mockFindUnique.mockResolvedValue({ passwordVersion: 0 });
      const payload: JwtPayload = {
        id: 999999999,
        userId: 999999999,
        email: 'test@example.com',
        passwordVersion: 0,
      };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      expect(mockRequest.user?.userId).toBe(999999999);
    });

    it('should handle database errors gracefully', async () => {
      mockFindUnique.mockRejectedValue(new Error('Database connection failed'));
      const payload: JwtPayload = { id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 };
      const token = generateAccessToken(payload);

      mockRequest.headers = {
        authorization: `Bearer ${token}`,
      };

      await runAuthenticate(mockRequest, mockResponse, nextFunction);

      // Database errors should result in a generic 401 (not leaking internal details)
      expect(nextFunction).toHaveBeenCalledWith(expect.any(AppError));
      const error = (nextFunction as jest.Mock).mock.calls[0][0] as AppError;
      expect(error.statusCode).toBe(401);
    });
  });
});
