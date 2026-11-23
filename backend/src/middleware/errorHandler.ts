import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../config/logger';
import { AppError as UtilsAppError } from '../errors/errors';
import { isPrismaError } from '../types/prisma-helpers';

// Extract the first column name from a Prisma constraint violation's `meta.target`.
// Prisma types `meta` as Record<string, unknown>; verify the shape at runtime.
const getConstraintTarget = (meta: Record<string, unknown> | undefined): string | undefined => {
  if (!meta) return undefined;
  const target = meta.target;
  if (Array.isArray(target) && typeof target[0] === 'string') return target[0];
  return undefined;
};

// Re-export AppError from errors/errors for backwards compatibility
export { AppError } from '../errors/errors';

// Sensitive field names that should never be logged
const SENSITIVE_FIELDS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'secret',
  'authorization',
  'credential',
  'credentials',
]);

// Sanitize an object by redacting sensitive fields
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const sanitizeForLogging = (input: unknown): unknown => {
  if (!isPlainObject(input)) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('apikey') || lowerKey.includes('api_key') || lowerKey.includes('authorization')) {
      sanitized[key] = '[REDACTED]';
    } else if (isPlainObject(value)) {
      sanitized[key] = sanitizeForLogging(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => isPlainObject(item) ? sanitizeForLogging(item) : item);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Type for operational errors with status code
 */
interface OperationalError {
  isOperational: boolean;
  statusCode: number;
  message: string;
}

/**
 * Type guard for checking if an error has operational properties (like AppError)
 * Validates that statusCode is within valid HTTP status code range (100-599)
 */
function isOperationalError(err: unknown): err is OperationalError {
  return (
    err !== null &&
    typeof err === 'object' &&
    'isOperational' in err &&
    (err as OperationalError).isOperational === true &&
    'statusCode' in err &&
    typeof (err as OperationalError).statusCode === 'number' &&
    (err as OperationalError).statusCode >= 100 &&
    (err as OperationalError).statusCode <= 599
  );
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Extract Prisma error properties if available
  const errInfo = isPrismaError(err)
    ? { code: err.code, meta: err.meta }
    : {};

  // Enhanced logging with error details (sensitive data redacted)
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    params: req.params,
    // Only log sanitized body in development for debugging
    body: process.env.NODE_ENV === 'development' ? sanitizeForLogging(req.body) : undefined,
    // Prisma errors have a 'code' property
    ...errInfo,
  });

  // Zod validation errors - return only field names, not full schema details
  if (err instanceof ZodError) {
    const fieldNames = err.issues.map(e => e.path.join('.')).filter(Boolean);
    return res.status(400).json({
      status: 'error',
      message: "Some of those details aren't valid. Check them and try again.",
      fields: fieldNames.length > 0 ? fieldNames : undefined,
    });
  }

  // Prisma errors - use the type guard
  if (isPrismaError(err)) {
    // P2002: Unique constraint violation
    if (err.code === 'P2002') {
      return res.status(400).json({
        status: 'error',
        message: 'That value is already in use.',
        field: getConstraintTarget(err.meta),
      });
    }

    // P2003: Foreign key constraint violation
    if (err.code === 'P2003') {
      return res.status(400).json({
        status: 'error',
        message: 'Something this refers to no longer exists.',
      });
    }

    // P2025: Record not found
    if (err.code === 'P2025') {
      return res.status(404).json({
        status: 'error',
        message: "We couldn't find that.",
      });
    }

    // Other Prisma errors
    logger.error('Unhandled Prisma error:', {
      code: err.code,
      meta: err.meta,
    });
  }

  // Operational errors (expected) - check for AppError from both locations
  if (err instanceof UtilsAppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // Check for other operational errors with statusCode property
  if (isOperationalError(err)) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // Programming or unknown errors
  return res.status(500).json({
    status: 'error',
    message: "Couldn't finish that. Try again, and reload the page if it keeps happening.",
  });
};
