import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { hashPassword, comparePassword } from '../auth/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { AppError } from '../middleware/errorHandler';
import logger from '../config/logger';
import { RegisterInput, LoginInput, AuthResponse } from '../types/auth.types';
import { companionService } from './companion.service';
import { claimToken, hashToken } from './tokenBlacklist.service';

/**
 * Remaining lifetime (ms) of a JWT from its `exp` claim.
 * Falls back to null when the token carries no usable exp.
 */
const getRemainingTtlMs = (token: string): number | null => {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== 'object' || typeof decoded.exp !== 'number') return null;
  const remainingMs = decoded.exp * 1000 - Date.now();
  return remainingMs > 0 ? remainingMs : 0;
};

type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  user: { id: number; username: string; email: string; avatarUrl: string | null; timezone: string | null };
};

/**
 * Results of very recent rotations, keyed by the hash of the token that was
 * consumed.
 *
 * A second request arriving with the same refresh cookie inside the grace
 * window is answered from here with the *identical* pair the winner got, so
 * concurrent tabs converge on one session instead of one of them invalidating
 * the other. Replaying the same pair (rather than minting a new one) means the
 * window cannot be used to multiply live tokens.
 *
 * In-memory and deliberately never persisted: it holds real tokens, unlike the
 * blacklist which only ever stores hashes.
 */
const recentRotations = new Map<string, { result: RefreshResult; expiresAt: number }>();

/** Matches the grace window in tokenBlacklist.service. */
const ROTATION_MEMO_TTL_MS = 30 * 1000;

const pruneRotationMemo = (now: number): void => {
  for (const [key, entry] of recentRotations) {
    if (entry.expiresAt <= now) recentRotations.delete(key);
  }
};

export class AuthService {
  async register(data: RegisterInput): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existingUser) {
      // One generic message for both collision cases: distinguishing "email
      // taken" from "username taken" turns registration into an unauthenticated
      // account-enumeration oracle. Matches userInvitation.service.ts.
      throw new AppError('Unable to create account with the provided information', 400);
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash,
      },
    });

    // Create "Myself" companion for new user
    await companionService.createMyselfCompanion(user.id, user.username);

    // Generate tokens (new user always starts at passwordVersion 0)
    const accessToken = generateAccessToken({ id: user.id, userId: user.id, email: user.email, passwordVersion: 0 });
    const refreshToken = generateRefreshToken({ id: user.id, userId: user.id, email: user.email, passwordVersion: 0 });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(data: LoginInput): Promise<AuthResponse> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    // Verify password
    const isPasswordValid = await comparePassword(data.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Ensure "Myself" companion exists for existing users (migration support)
    await companionService.createMyselfCompanion(user.id, user.username);

    // Generate tokens with passwordVersion to support invalidation on password change
    const accessToken = generateAccessToken({ id: user.id, userId: user.id, email: user.email, passwordVersion: user.passwordVersion ?? 0 });
    const refreshToken = generateRefreshToken({ id: user.id, userId: user.id, email: user.email, passwordVersion: user.passwordVersion ?? 0 });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
      },
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string; user: { id: number; username: string; email: string; avatarUrl: string | null; timezone: string | null } }> {
    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(token);

      // Reuse detection. Refresh tokens are single-use, and the token is claimed
      // ATOMICALLY here — a synchronous check-and-set that no concurrent request
      // can interleave with. Claiming up front (rather than checking now and
      // revoking after the DB round-trips) is what closes the check-then-act race
      // that previously let two simultaneous refreshes with the same token both
      // succeed.
      //
      // A `false` result means the token was already revoked, i.e. the family is
      // compromised: a captured token replayed, or one replayed after the
      // legitimate holder already rotated it. Bump passwordVersion to invalidate
      // every outstanding token for that user.
      //
      // Claiming before the user lookup also means a token that fails the checks
      // below stays revoked — correct, since in each of those cases (user gone,
      // password changed) the token should not be usable anyway.
      const remainingMs = getRemainingTtlMs(token);
      const claimOutcome = claimToken(token, remainingMs ?? undefined);
      const tokenKey = hashToken(token);

      if (claimOutcome === 'replayed-within-grace') {
        // Honest concurrency, not theft: two tabs restored at launch send the
        // same cookie within milliseconds of each other. Answer the loser with
        // the winner's tokens so both converge on one session.
        pruneRotationMemo(Date.now());
        const memo = recentRotations.get(tokenKey);
        if (memo) {
          logger.debug(
            `Concurrent refresh for user ${decoded.userId}; replaying the in-flight rotation result`
          );
          return memo.result;
        }

        // Inside the window but the result is gone (process restarted, or the
        // winner has not finished yet). Reject this one attempt — but do NOT
        // treat it as reuse: bumping passwordVersion here would log the user
        // out everywhere over a race they did not cause.
        logger.warn(
          `Concurrent refresh for user ${decoded.userId} with no recorded result; rejecting without invalidating sessions`
        );
        throw new AppError('Refresh token has been revoked', 401);
      }

      if (claimOutcome === 'revoked') {
        logger.warn(
          `Refresh token reuse detected for user ${decoded.userId}; invalidating all sessions for that user`
        );
        await prisma.user.update({
          where: { id: decoded.userId },
          data: { passwordVersion: { increment: 1 } },
        });
        throw new AppError('Refresh token has been revoked', 401);
      }

      // Verify user still exists and fetch current passwordVersion
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          email: true,
          avatarUrl: true,
          timezone: true,
          passwordVersion: true,
        },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Reject refresh if password was changed since this token was issued
      const tokenPasswordVersion = decoded.passwordVersion ?? 0;
      if (tokenPasswordVersion !== user.passwordVersion) {
        throw new AppError('Password has been changed. Please log in again.', 401);
      }

      // Generate new tokens with current passwordVersion
      const accessToken = generateAccessToken({ id: user.id, userId: user.id, email: user.email, passwordVersion: user.passwordVersion });
      const refreshToken = generateRefreshToken({ id: user.id, userId: user.id, email: user.email, passwordVersion: user.passwordVersion });

      // The consumed token was already revoked by the atomic claim above, so
      // there is nothing to revoke here. Rotation without revocation would leave
      // a captured refresh token valid for its full lifetime (default 7 days)
      // with no reuse signal at all.

      const result: RefreshResult = {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatarUrl,
          timezone: user.timezone,
        }
      };

      // Remember this rotation briefly so a concurrent request holding the same
      // cookie is answered with these tokens rather than tripping reuse
      // detection. See `recentRotations`.
      const now = Date.now();
      pruneRotationMemo(now);
      recentRotations.set(tokenKey, { result, expiresAt: now + ROTATION_MEMO_TTL_MS });

      return result;
    } catch (error) {
      throw new AppError('Invalid refresh token', 401);
    }
  }

  /**
   * Mint a fresh access/refresh pair for an already-authenticated identity.
   *
   * Used when the proof of identity is something other than a password: a
   * redeemed mobile pairing token or a mobile OIDC exchange code. The caller is
   * responsible for having verified that proof.
   *
   * @param userId - The user to issue tokens for
   * @throws {AppError} 404 if the user no longer exists
   */
  async issueTokensForUser(userId: number): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found', 404);
    }
    const payload = {
      id: user.id,
      userId: user.id,
      email: user.email,
      passwordVersion: user.passwordVersion ?? 0,
    };
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
      },
      accessToken: generateAccessToken(payload),
      refreshToken: generateRefreshToken(payload),
    };
  }

  async getCurrentUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        timezone: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }
}

export default new AuthService();
