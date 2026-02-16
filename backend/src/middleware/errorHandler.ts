import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../config/logger';
import { AppError as UtilsAppError } from '../utils/errors';
import { isPrismaError, PrismaError } from '../types/prisma-helpers';

// Re-export AppError from utils/errors for backwards compatibility
export { AppError } from '../utils/errors';

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
const sanitizeForLogging = (obj: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!obj || typeof obj !== 'object') return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('apikey') || lowerKey.includes('api_key') || lowerKey.includes('authorization')) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'object' && item !== null ? sanitizeForLogging(item as Record<string, unknown>) : item
      );
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
  const prismaErrorInfo = isPrismaError(err)
    ? { code: (err as PrismaError).code, meta: (err as PrismaError).meta }
    : {};

  // Enhanced logging with error details (sensitive data redacted)
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    params: req.params,
    // Only log sanitized body in development for debugging
    body: process.env.NODE_ENV === 'development' ? sanitizeForLogging(req.body as Record<string, unknown>) : undefined,
    // Prisma errors have a 'code' property
    ...prismaErrorInfo,
  });

  // Zod validation errors - return only field names, not full schema details
  if (err instanceof ZodError) {
    const fieldNames = err.errors.map(e => e.path.join('.')).filter(Boolean);
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      fields: fieldNames.length > 0 ? fieldNames : undefined,
    });
  }

  // Prisma errors - use the type guard
  if (isPrismaError(err)) {
    const prismaError = err as PrismaError;

    // P2002: Unique constraint violation
    if (prismaError.code === 'P2002') {
      return res.status(400).json({
        status: 'error',
        message: 'A record with this value already exists',
        field: prismaError.meta?.target?.[0],
      });
    }

    // P2003: Foreign key constraint violation
    if (prismaError.code === 'P2003') {
      return res.status(400).json({
        status: 'error',
        message: 'Referenced record does not exist',
      });
    }

    // P2025: Record not found
    if (prismaError.code === 'P2025') {
      return res.status(404).json({
        status: 'error',
        message: 'Record not found',
      });
    }

    // Other Prisma errors
    logger.error('Unhandled Prisma error:', {
      code: prismaError.code,
      meta: prismaError.meta,
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
    message: 'Internal server error',
  });
};
