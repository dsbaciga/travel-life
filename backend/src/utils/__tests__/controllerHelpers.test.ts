import { describe, it, expect } from '@jest/globals';
import { Request } from 'express';
import { requireUser, requireUserId } from '../controllerHelpers';
import { AppError } from '../errors';

describe('controllerHelpers', () => {
  describe('requireUser', () => {
    it('should return the user when user is present on the request', () => {
      const mockUser = { id: 1, userId: 1, email: 'test@example.com' };
      const req = { user: mockUser } as unknown as Request;

      const result = requireUser(req);

      expect(result).toBe(mockUser);
      expect(result.userId).toBe(1);
      expect(result.email).toBe('test@example.com');
    });

    it('should throw AppError with 401 when user is missing', () => {
      const req = {} as Request;

      expect(() => requireUser(req)).toThrow(AppError);
      expect(() => requireUser(req)).toThrow('Unauthorized');
    });

    it('should throw AppError with 401 status code when user is undefined', () => {
      const req = { user: undefined } as unknown as Request;

      try {
        requireUser(req);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(401);
        expect((error as AppError).message).toBe('Unauthorized');
      }
    });

    it('should return user with all JWT payload fields', () => {
      const mockUser = {
        id: 42,
        userId: 42,
        email: 'admin@example.com',
        passwordVersion: 3,
      };
      const req = { user: mockUser } as unknown as Request;

      const result = requireUser(req);

      expect(result.id).toBe(42);
      expect(result.userId).toBe(42);
      expect(result.email).toBe('admin@example.com');
    });
  });

  describe('requireUserId', () => {
    it('should return userId when user is present on the request', () => {
      const mockUser = { id: 5, userId: 5, email: 'test@example.com' };
      const req = { user: mockUser } as unknown as Request;

      const result = requireUserId(req);

      expect(result).toBe(5);
    });

    it('should return the correct userId for different users', () => {
      const mockUser = { id: 999, userId: 999, email: 'other@example.com' };
      const req = { user: mockUser } as unknown as Request;

      const result = requireUserId(req);

      expect(result).toBe(999);
    });

    it('should throw AppError with 401 when user is missing', () => {
      const req = {} as Request;

      expect(() => requireUserId(req)).toThrow(AppError);
      expect(() => requireUserId(req)).toThrow('Unauthorized');
    });

    it('should throw AppError with 401 status code when user is undefined', () => {
      const req = { user: undefined } as unknown as Request;

      try {
        requireUserId(req);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(401);
      }
    });
  });
});
