import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from './errorHandler';
import { JwtPayload } from '../types/auth.types';
import prisma from '../config/database';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * In-memory cache for passwordVersion per user.
 * Avoids a DB query on every authenticated request.
 * Entries expire after CACHE_TTL_MS so password changes propagate quickly.
 * Capped at MAX_CACHE_SIZE to prevent unbounded growth.
 */
const passwordVersionCache = new Map<number, { version: number; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds
const MAX_CACHE_SIZE = 1000;

function getCachedPasswordVersion(userId: number): number | undefined {
  const entry = passwordVersionCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    passwordVersionCache.delete(userId);
    return undefined;
  }
  // LRU: Move accessed entry to the end (most recently used) by re-inserting
  passwordVersionCache.delete(userId);
  passwordVersionCache.set(userId, entry);
  return entry.version;
}

function setCachedPasswordVersion(userId: number, version: number): void {
  // Evict expired entries if cache is at capacity
  if (passwordVersionCache.size >= MAX_CACHE_SIZE) {
    const now = Date.now();
    for (const [key, entry] of passwordVersionCache) {
      if (now > entry.expiresAt) passwordVersionCache.delete(key);
    }
    // If still at capacity after purging expired, drop least recently used entry (LRU)
    if (passwordVersionCache.size >= MAX_CACHE_SIZE) {
      const lruKey = passwordVersionCache.keys().next().value;
      if (lruKey !== undefined) passwordVersionCache.delete(lruKey);
    }
  }
  passwordVersionCache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Invalidate cache for a user (call after password change). */
export function invalidatePasswordVersionCache(userId: number): void {
  passwordVersionCache.delete(userId);
}

/** Clear entire cache (for testing only). */
export function clearPasswordVersionCache(): void {
  passwordVersionCache.clear();
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const decoded = verifyAccessToken(token);

    // Check passwordVersion to reject tokens issued before a password change.
    // Uses a short-TTL cache to avoid a DB query on every request.
    const tokenPwVersion = decoded.passwordVersion ?? 0;
    let dbPwVersion = getCachedPasswordVersion(decoded.userId);

    if (dbPwVersion === undefined) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { passwordVersion: true },
      });

      if (!user) {
        throw new AppError('Token invalidated. Please log in again.', 401);
      }

      dbPwVersion = user.passwordVersion ?? 0;
      setCachedPasswordVersion(decoded.userId, dbPwVersion);
    }

    if (tokenPwVersion !== dbPwVersion) {
      throw new AppError('Token invalidated. Please log in again.', 401);
    }

    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Invalid or expired token', 401));
    }
  }
};
