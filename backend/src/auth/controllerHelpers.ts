import { Request } from 'express';
import { JwtPayload } from '../types/auth.types';
import { AppError } from '../errors/errors';

/**
 * Extracts the authenticated user from the request.
 * This provides type-safe access to req.user without non-null assertions.
 *
 * The authenticate middleware guarantees req.user exists on protected routes,
 * but TypeScript's type system doesn't know this. This function provides
 * runtime validation and type narrowing.
 *
 * @param req - Express request object
 * @returns The authenticated user's JWT payload
 * @throws AppError with 401 status if user is not authenticated
 *
 * @example
 * ```typescript
 * // Before (using non-null assertion):
 * const userId = req.user!.userId;
 *
 * // After (type-safe):
 * const user = requireUser(req);
 * const userId = user.userId;
 * ```
 */
export function requireUser(req: Request): JwtPayload {
  if (!req.user) {
    throw new AppError('Sign in to continue.', 401);
  }
  return req.user;
}

/**
 * Extracts just the userId from the authenticated user.
 * Convenience function for the most common use case.
 *
 * @param req - Express request object
 * @returns The authenticated user's ID
 * @throws AppError with 401 status if user is not authenticated
 *
 * @example
 * ```typescript
 * // Before:
 * const userId = req.user!.userId;
 *
 * // After:
 * const userId = requireUserId(req);
 * ```
 */
export function requireUserId(req: Request): number {
  return requireUser(req).userId;
}
