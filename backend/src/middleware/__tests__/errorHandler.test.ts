import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ZodError, ZodIssue } from 'zod';

// Mock the logger to avoid file system and config dependencies
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the isPrismaError type guard - default to returning false
const mockIsPrismaError = jest.fn().mockReturnValue(false);
jest.mock('../../types/prisma-helpers', () => ({
  isPrismaError: (...args: unknown[]) => mockIsPrismaError(...args),
}));

// Import after mocks
import { errorHandler, AppError } from '../errorHandler';
import { AppError as UtilsAppError } from '../../errors/errors';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  MockRequest,
  MockResponse,
  MockNextFunction,
} from '../../__tests__/mockBuilders/requests';

/**
 * The shape every errorHandler response follows. Declaring it (rather than
 * asserting at each capture site) means a drift in the envelope shows up as a
 * type error instead of being silenced.
 */
interface ErrorEnvelope {
  status: string;
  message: string;
  fields?: string[];
}

describe('errorHandler', () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: MockNextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    // The shared factories already return real Express types, so nothing here
    // needs a cast.
    mockRequest = createMockRequest({
      params: {},
      body: {},
      originalUrl: '/test',
      method: 'GET',
    });
    mockResponse = createMockResponse();
    mockNext = createMockNext();

    mockJson = mockResponse.json;
    mockStatus = mockResponse.status;

    // Reset mocks
    mockIsPrismaError.mockReturnValue(false);
  });

  describe('AppError handling', () => {
    it('should return correct status and message for AppError', () => {
      const error = new UtilsAppError('Not found', 404);

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Not found',
      });
    });

    it('should handle 400 Bad Request AppError', () => {
      const error = new UtilsAppError('Bad request', 400);

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Bad request',
      });
    });

    it('should handle 401 Unauthorized AppError', () => {
      const error = new UtilsAppError('Sign in to continue.', 401);

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Sign in to continue.',
      });
    });

    it('should handle 403 Forbidden AppError', () => {
      const error = new UtilsAppError('Forbidden', 403);

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Forbidden',
      });
    });

    it('should handle 500 AppError', () => {
      const error = new UtilsAppError('Internal error', 500);

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Internal error',
      });
    });
  });

  describe('Unknown error handling', () => {
    it('should return 500 for generic Error', () => {
      const error = new Error('Something unexpected');

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Internal server error',
      });
    });

    it('should not expose internal error messages for non-operational errors', () => {
      const error = new Error('Database connection pool exhausted');

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Internal server error',
      });
    });
  });

  describe('ZodError handling', () => {
    it('should format Zod validation errors with 400 status', () => {
      const zodIssues: ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Expected string, received number',
        },
      ];
      const error = new ZodError(zodIssues);

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(400);
      // The response names the offending fields but does NOT echo the raw Zod
      // issues: those carry `received`, i.e. the caller's own input, back out
      // in the error body.
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        fields: ['email'],
      });

      const responseBody: ErrorEnvelope = mockJson.mock.calls[0][0];
      expect(responseBody).not.toHaveProperty('errors');
      expect(JSON.stringify(responseBody)).not.toContain('received');
    });

    it('should report every invalid field', () => {
      const zodIssues: ZodIssue[] = [
        {
          code: 'too_small',
          minimum: 3,
          type: 'string',
          inclusive: true,
          exact: false,
          path: ['username'],
          message: 'String must contain at least 3 character(s)',
        },
        {
          code: 'invalid_string',
          validation: 'email',
          path: ['email'],
          message: 'Invalid email',
        },
      ];
      const error = new ZodError(zodIssues);

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(400);
      const responseBody: ErrorEnvelope = mockJson.mock.calls[0][0];
      expect(responseBody.fields).toEqual(['username', 'email']);
    });

    it('should omit `fields` when no issue carries a path', () => {
      const error = new ZodError([
        {
          code: 'custom',
          path: [],
          message: 'Invalid payload',
        },
      ]);

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        fields: undefined,
      });
    });
  });

  describe('AppError class (re-exported)', () => {
    it('should re-export AppError from errors/errors', () => {
      // The errorHandler module re-exports AppError for backwards compatibility
      expect(AppError).toBe(UtilsAppError);
    });

    it('should create AppError with correct properties', () => {
      const error = new AppError('Test error', 422);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(422);
      expect(error.isOperational).toBe(true);
    });

    it('should have a stack trace', () => {
      const error = new AppError('Test error', 500);

      expect(error.stack).toBeDefined();
    });
  });

  describe('Operational error with statusCode property', () => {
    it('should handle non-AppError objects with isOperational and statusCode', () => {
      // Create an error-like object that has isOperational and statusCode
      // but is not an instance of AppError
      const error = new Error('Custom operational error');
      Object.assign(error, { isOperational: true, statusCode: 409 });

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({
        status: 'error',
        message: 'Custom operational error',
      });
    });
  });
});
