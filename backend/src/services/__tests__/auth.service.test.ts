/**
 * Auth Service Tests
 *
 * Test cases:
 * AUTH-001: Register user with valid credentials
 * AUTH-002: Reject registration with duplicate email
 * AUTH-003: Reject registration with duplicate username
 * AUTH-004: Reject registration with weak password (handled by Zod validation in controller, not service)
 * AUTH-005: Login with valid credentials
 * AUTH-006: Reject login with invalid email
 * AUTH-007: Reject login with wrong password
 * AUTH-008: Generate access token with correct expiry (15min)
 * AUTH-009: Generate refresh token with correct expiry (7 days)
 * AUTH-010: Refresh token rotation on refresh
 * AUTH-011: Blacklist the consumed refresh token on rotation (single-use tokens)
 * AUTH-012: Reject replayed (blacklisted) refresh tokens and treat reuse as theft
 * AUTH-013: Silent refresh from httpOnly cookie (controller concern - covered by refresh token test)
 * AUTH-014: Prevent race conditions in silent refresh (tested via token generation consistency)
 * AUTH-015: CSRF token validation (not implemented in current service - skipped)
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

// Mock the config module before importing the service
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

// Mock Prisma
const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    // Refresh-token reuse bumps passwordVersion to kill every live session.
    update: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock companion service
const mockCompanionService = {
  createMyselfCompanion: jest.fn(),
};

jest.mock('../companion.service', () => ({
  companionService: mockCompanionService,
}));

// Mock password utilities
jest.mock('../../auth/password', () => ({
  hashPassword: jest.fn(async (password: string) => `hashed_${password}`),
  comparePassword: jest.fn(async (password: string, hash: string) => hash === `hashed_${password}`),
}));

// Import after mocks are set up
import { AuthService } from '../auth.service';
import { AppError } from '../../middleware/errorHandler';
import { _clearBlacklist, isBlacklisted } from '../tokenBlacklist.service';

// Registration reports one generic message for BOTH email and username
// collisions so it cannot be used to enumerate existing accounts.
const GENERIC_REGISTRATION_CONFLICT = 'Unable to create account with the provided information';

/** A decoded JWT body whose time claims are known to be present. */
type TimedJwtPayload = jwt.JwtPayload & { exp: number; iat: number };

/**
 * Decodes a token and validates it really is a payload object carrying `exp`
 * and `iat`. Failing loudly here beats an assertion that silently types a
 * malformed token as a payload and produces a confusing NaN downstream.
 */
function decodePayload(token: string): TimedJwtPayload {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') {
    throw new Error(`Expected a JwtPayload object, got: ${String(decoded)}`);
  }
  const { exp, iat } = decoded;
  if (typeof exp !== 'number' || typeof iat !== 'number') {
    throw new Error('Expected the decoded token to carry numeric exp and iat claims');
  }
  // Rebuilding with the narrowed claims means the return needs no assertion.
  return { ...decoded, exp, iat };
}

describe('AuthService', () => {
  let authService: AuthService;
  let nowSpy: jest.SpiedFunction<typeof Date.now> | null = null;

  /**
   * jwt `iat`/`exp` have one-second resolution and the refresh payload carries
   * no nonce, so two refresh tokens minted for the same user within the same
   * wall-clock second are byte-identical. Tests that need to observe rotation
   * push the clock forward rather than relying on real elapsed time.
   */
  const advanceClock = (seconds: number): void => {
    const target = Date.now() + seconds * 1000;
    nowSpy?.mockRestore();
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(target);
  };

  afterEach(() => {
    nowSpy?.mockRestore();
    nowSpy = null;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Users have not chosen a measurement system unless a test says otherwise.
    mockPrisma.userPreferences.findUnique.mockResolvedValue({ userId: 1, measurementSystem: null });
    // Refresh tokens are single-use, and the blacklist is module-level state
    // that also persists to disk. Clear it so one test's consumed token cannot
    // make another test's (identically-signed) token look replayed.
    _clearBlacklist();
    authService = new AuthService();
  });

  describe('register', () => {
    const validRegisterData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'SecureP@ss123',
    };

    // AUTH-001: Register user with valid credentials
    it('AUTH-001: should register a new user with valid credentials', async () => {
      // Setup mocks
      mockPrisma.user.findFirst.mockResolvedValue(null); // No existing user
      mockPrisma.user.create.mockResolvedValue({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed_SecureP@ss123',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockCompanionService.createMyselfCompanion.mockResolvedValue({
        id: 1,
        name: 'Myself (testuser)',
        isMyself: true,
        userId: 1,
      });

      const result = await authService.register(validRegisterData);

      // Verify result
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.username).toBe('testuser');
      expect(result.user.email).toBe('test@example.com');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');

      // Verify calls
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ email: validRegisterData.email }, { username: validRegisterData.username }],
        },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          username: validRegisterData.username,
          email: validRegisterData.email,
          passwordHash: 'hashed_SecureP@ss123',
          // Both settings rows are created in the same statement as the user.
          integrations: { create: {} },
          preferences: { create: {} },
        },
      });
      expect(mockCompanionService.createMyselfCompanion).toHaveBeenCalledWith(1, 'testuser');
    });

    // AUTH-002: Reject registration with duplicate email
    it('AUTH-002: should reject registration with duplicate email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        username: 'existinguser',
      });

      await expect(authService.register(validRegisterData)).rejects.toThrow(AppError);
      // Deliberately generic: distinguishing "email taken" from "username taken"
      // turns registration into an unauthenticated account-enumeration oracle.
      await expect(authService.register(validRegisterData)).rejects.toThrow(
        GENERIC_REGISTRATION_CONFLICT
      );
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    // AUTH-003: Reject registration with duplicate username
    it('AUTH-003: should reject registration with duplicate username', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'other@example.com',
        username: 'testuser',
      });

      await expect(authService.register(validRegisterData)).rejects.toThrow(AppError);
      await expect(authService.register(validRegisterData)).rejects.toThrow(
        GENERIC_REGISTRATION_CONFLICT
      );
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    // The email-collision and username-collision paths must be indistinguishable
    // to the caller, otherwise the generic message buys nothing.
    it('AUTH-002/003: email and username collisions are indistinguishable', async () => {
      const messageFor = async (existing: { email: string; username: string }) => {
        mockPrisma.user.findFirst.mockResolvedValue({ id: 1, ...existing });
        try {
          await authService.register(validRegisterData);
          throw new Error('expected registration to be rejected');
        } catch (error) {
          // Narrow rather than assert: if registration ever rejects with a
          // non-AppError, this should fail loudly instead of reading `.message`
          // off an unknown value.
          expect(error).toBeInstanceOf(AppError);
          if (!(error instanceof AppError)) throw error;
          return error.message;
        }
      };

      const emailCollision = await messageFor({
        email: validRegisterData.email,
        username: 'someoneelse',
      });
      const usernameCollision = await messageFor({
        email: 'someoneelse@example.com',
        username: validRegisterData.username,
      });

      expect(emailCollision).toBe(GENERIC_REGISTRATION_CONFLICT);
      expect(usernameCollision).toBe(emailCollision);
    });

    // AUTH-004: Weak password validation (note: this is handled by Zod schema in controller/types)
    it('AUTH-004: should accept password that passes to service (validation is at controller layer)', async () => {
      // The service does not validate password strength - that's done by Zod schema in types
      // This test verifies the service accepts any password passed to it
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed_short',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });

      const result = await authService.register({
        ...validRegisterData,
        password: 'short', // Would be rejected by Zod, but service doesn't validate
      });

      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'SecureP@ss123',
    };

    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: 'hashed_SecureP@ss123',
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // AUTH-005: Login with valid credentials
    it('AUTH-005: should login with valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });

      const result = await authService.login(validLoginData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.id).toBe(1);
      expect(result.user.username).toBe('testuser');
      expect(result.user.email).toBe('test@example.com');

      // Verify the access token is valid JWT
      expect(result.accessToken.split('.')).toHaveLength(3);
      expect(result.refreshToken.split('.')).toHaveLength(3);
    });

    it('carries the measurement system in the session user (null when never chosen)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ userId: 1, measurementSystem: 'metric' });
      const chosen = await authService.login(validLoginData);
      expect(chosen.user.measurementSystem).toBe('metric');

      mockPrisma.userPreferences.findUnique.mockResolvedValue({ userId: 1, measurementSystem: null });
      const legacy = await authService.login(validLoginData);
      expect(legacy.user.measurementSystem).toBeNull();
    });

    // AUTH-006: Reject login with invalid email
    it('AUTH-006: should reject login with invalid/non-existent email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.login({
        email: 'nonexistent@example.com',
        password: 'anypassword',
      })).rejects.toThrow(AppError);
      await expect(authService.login({
        email: 'nonexistent@example.com',
        password: 'anypassword',
      })).rejects.toThrow("That email and password don't match. Check them and try again.");
    });

    it('does a password comparison even when the email has no account', async () => {
      // Otherwise "unknown email" answers faster than "wrong password".
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const { comparePassword } = jest.requireMock('../../auth/password') as {
        comparePassword: jest.Mock;
      };
      comparePassword.mockClear();

      await expect(
        authService.login({ email: 'nobody@example.com', password: 'whatever-1' })
      ).rejects.toThrow("That email and password don't match. Check them and try again.");

      expect(comparePassword).toHaveBeenCalledTimes(1);
      expect(comparePassword).toHaveBeenCalledWith('whatever-1', expect.any(String));
    });

    // AUTH-007: Reject login with wrong password
    it('AUTH-007: should reject login with wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(authService.login({
        email: 'test@example.com',
        password: 'WrongPassword123',
      })).rejects.toThrow(AppError);
      await expect(authService.login({
        email: 'test@example.com',
        password: 'WrongPassword123',
      })).rejects.toThrow("That email and password don't match. Check them and try again.");
    });

    // AUTH-008: Generate access token with correct expiry (15min)
    it('AUTH-008: should generate access token with correct expiry (15 minutes)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });

      const result = await authService.login(validLoginData);

      // Decode the token to check expiry
      const decoded = decodePayload(result.accessToken);
      expect(decoded).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();

      // Check that expiry is approximately 15 minutes from issued time
      // 15 minutes = 900 seconds
      const expiryDuration = decoded.exp - decoded.iat;
      expect(expiryDuration).toBe(900); // 15 minutes in seconds
    });

    // AUTH-009: Generate refresh token with correct expiry (7 days)
    it('AUTH-009: should generate refresh token with correct expiry (7 days)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });

      const result = await authService.login(validLoginData);

      // Decode the token to check expiry
      const decoded = decodePayload(result.refreshToken);
      expect(decoded).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();

      // Check that expiry is approximately 7 days from issued time
      // 7 days = 604800 seconds
      const expiryDuration = decoded.exp - decoded.iat;
      expect(expiryDuration).toBe(604800); // 7 days in seconds
    });

    // AUTH-014: Login should create "Myself" companion for migration support
    it('should ensure Myself companion exists on login (migration support)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });

      await authService.login(validLoginData);

      expect(mockCompanionService.createMyselfCompanion).toHaveBeenCalledWith(1, 'testuser');
    });
  });

  describe('refreshToken', () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      avatarUrl: null,
      passwordVersion: 0,
    };

    // AUTH-010: Refresh token rotation on refresh
    it('AUTH-010: should rotate tokens on refresh', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });

      // First, login to get initial tokens
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: 'hashed_password',
      });

      // Reset mock for findUnique to work for refreshToken
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Generate a valid refresh token for testing
      const { generateRefreshToken } = await import('../../auth/jwt');
      const originalRefreshToken = generateRefreshToken({ id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 });

      const result = await authService.refreshToken(originalRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');

      // New tokens should be different from original (due to timing)
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe(1);
    });

    // AUTH-011 & AUTH-012: Token blacklisting is not implemented in current service
    it('AUTH-011/012: should throw error for invalid refresh token', async () => {
      await expect(authService.refreshToken('invalid-token')).rejects.toThrow(AppError);
      await expect(authService.refreshToken('invalid-token')).rejects.toThrow('You were signed out. Sign in again to continue.');
    });

    // AUTH-013: Token refresh should work (silent refresh is controller/frontend concern)
    it('AUTH-013: should return user info along with new tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const { generateRefreshToken } = await import('../../auth/jwt');
      const validToken = generateRefreshToken({ id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 });

      const result = await authService.refreshToken(validToken);

      expect(result.user).toEqual({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: null,
        measurementSystem: null,
      });
    });

    // Test refresh token for non-existent user
    it('should reject refresh if user no longer exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const { generateRefreshToken } = await import('../../auth/jwt');
      const validToken = generateRefreshToken({ id: 999, userId: 999, email: 'deleted@example.com', passwordVersion: 0 });

      await expect(authService.refreshToken(validToken)).rejects.toThrow('You were signed out. Sign in again to continue.');
    });

    // AUTH-011: The consumed token is revoked, making refresh tokens single-use.
    it('AUTH-011: should blacklist the refresh token it consumed', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const { generateRefreshToken } = await import('../../auth/jwt');
      const validToken = generateRefreshToken({ id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 });

      expect(isBlacklisted(validToken)).toBe(false);

      // `iat` has one-second resolution and the refresh payload carries no
      // nonce, so a token minted in the same wall-clock second as `validToken`
      // is byte-identical to it. Advance the clock so rotation is observable.
      advanceClock(2);
      const result = await authService.refreshToken(validToken);

      // Rotation without revocation would leave a captured refresh token valid
      // for its full lifetime and give no reuse signal at all.
      expect(isBlacklisted(validToken)).toBe(true);
      expect(result.refreshToken).not.toBe(validToken);
    });

    // AUTH-012: Replaying a consumed token is treated as token theft — but
    // only once it falls outside the concurrency grace window, which is the
    // only thing distinguishing a replay from two honest tabs racing.
    it('AUTH-012: should treat a late replay of a consumed token as theft', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, passwordVersion: 1 });

      const { generateRefreshToken } = await import('../../auth/jwt');
      const validToken = generateRefreshToken({ id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 });

      await authService.refreshToken(validToken);

      // Push past the grace window so this is unambiguously a replay.
      advanceClock(60);

      // Second use of the same token must fail...
      await expect(authService.refreshToken(validToken)).rejects.toThrow(AppError);

      // ...and bump passwordVersion, which invalidates every live session for
      // that user rather than just rejecting this one request.
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordVersion: { increment: 1 } },
      });
    });

    // AUTH-012b: Two tabs restored at launch send the same refresh cookie
    // within milliseconds. That must not read as theft — bumping
    // passwordVersion there logs the user out everywhere (and 404s /uploads via
    // passwordVersionMatches) over a race they did not cause.
    it('AUTH-012b: should answer a concurrent refresh with the same tokens, not a session wipe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, passwordVersion: 1 });

      const { generateRefreshToken } = await import('../../auth/jwt');
      const validToken = generateRefreshToken({ id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 });

      const winner = await authService.refreshToken(validToken);
      const loser = await authService.refreshToken(validToken);

      // Both callers converge on one session rather than one invalidating the
      // other. Replaying the same pair also means the window cannot be used to
      // multiply live tokens.
      expect(loser.accessToken).toBe(winner.accessToken);
      expect(loser.refreshToken).toBe(winner.refreshToken);

      // Crucially, no family-wide invalidation.
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    // AUTH-014: Each successful refresh mints a fresh, distinct token pair and
    // retires the one it consumed, so a rotation chain never reissues a token
    // that is already revoked.
    it('AUTH-014: should mint a distinct token on each refresh in a rotation chain', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const { generateRefreshToken } = await import('../../auth/jwt');
      const first = generateRefreshToken({ id: 1, userId: 1, email: 'test@example.com', passwordVersion: 0 });

      advanceClock(2);
      const result1 = await authService.refreshToken(first);

      advanceClock(4);
      const result2 = await authService.refreshToken(result1.refreshToken);

      expect(result1.refreshToken).not.toBe(first);
      expect(result2.refreshToken).not.toBe(result1.refreshToken);

      // Every consumed link in the chain is retired.
      expect(isBlacklisted(first)).toBe(true);
      expect(isBlacklisted(result1.refreshToken)).toBe(true);

      // ...but the token currently held by the client is still usable.
      expect(isBlacklisted(result2.refreshToken)).toBe(false);
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user by ID', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: null,
        timezone: 'Europe/London',
        createdAt: new Date('2024-01-01'),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.getCurrentUser(1);

      expect(result).toEqual({ ...mockUser, measurementSystem: null });
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          username: true,
          email: true,
          avatarUrl: true,
          timezone: true,
          createdAt: true,
        },
      });
    });

    it('should throw error if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.getCurrentUser(999)).rejects.toThrow(AppError);
      await expect(authService.getCurrentUser(999)).rejects.toThrow('User not found');
    });
  });

  describe('Token Structure', () => {
    it('should include correct payload in access token', async () => {
      const mockUser = {
        id: 42,
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        avatarUrl: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password',
      });

      const decoded = decodePayload(result.accessToken);
      expect(decoded.id).toBe(42);
      expect(decoded.userId).toBe(42);
      expect(decoded.email).toBe('test@example.com');
    });

    it('should include correct payload in refresh token', async () => {
      const mockUser = {
        id: 42,
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        avatarUrl: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockCompanionService.createMyselfCompanion.mockResolvedValue({ id: 1 });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password',
      });

      const decoded = decodePayload(result.refreshToken);
      expect(decoded.id).toBe(42);
      expect(decoded.userId).toBe(42);
      expect(decoded.email).toBe('test@example.com');
    });
  });
});
