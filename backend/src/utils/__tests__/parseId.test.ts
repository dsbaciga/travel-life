import { describe, it, expect } from '@jest/globals';
import { parseId } from '../parseId';
import { AppError } from '../errors';

describe('parseId', () => {
  describe('valid inputs', () => {
    it('should parse a valid numeric string and return a number', () => {
      expect(parseId('1')).toBe(1);
    });

    it('should parse large numeric strings', () => {
      expect(parseId('999999')).toBe(999999);
    });

    it('should parse single digit strings', () => {
      expect(parseId('5')).toBe(5);
    });
  });

  describe('invalid inputs', () => {
    it('should throw AppError for non-numeric string', () => {
      expect(() => parseId('abc')).toThrow(AppError);
      expect(() => parseId('abc')).toThrow('Invalid id: must be a positive integer');
    });

    it('should throw AppError for empty string', () => {
      expect(() => parseId('')).toThrow(AppError);
    });

    it('should throw AppError for floating point string', () => {
      expect(() => parseId('1.5')).toThrow(AppError);
      expect(() => parseId('1.5')).toThrow('Invalid id: must be a positive integer');
    });

    it('should throw AppError with status 400', () => {
      try {
        parseId('abc');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(400);
      }
    });
  });

  describe('zero and negative IDs', () => {
    it('should throw AppError for zero', () => {
      expect(() => parseId('0')).toThrow(AppError);
      expect(() => parseId('0')).toThrow('Invalid id: must be a positive integer');
    });

    it('should throw AppError for negative numbers', () => {
      expect(() => parseId('-1')).toThrow(AppError);
      expect(() => parseId('-1')).toThrow('Invalid id: must be a positive integer');
    });

    it('should throw AppError for large negative numbers', () => {
      expect(() => parseId('-999')).toThrow(AppError);
    });
  });

  describe('custom field name in error message', () => {
    it('should use custom field name in error message', () => {
      expect(() => parseId('abc', 'tripId')).toThrow('Invalid tripId: must be a positive integer');
    });

    it('should use custom field name for zero value', () => {
      expect(() => parseId('0', 'locationId')).toThrow('Invalid locationId: must be a positive integer');
    });

    it('should use default field name "id" when not specified', () => {
      expect(() => parseId('abc')).toThrow('Invalid id: must be a positive integer');
    });
  });

  describe('edge cases', () => {
    it('should parse strings with surrounding whitespace (Number coercion trims)', () => {
      // Number(' 1 ') === 1, which is a valid positive integer
      expect(parseId(' 1 ')).toBe(1);
    });

    it('should throw for strings with mixed content', () => {
      expect(() => parseId('12abc')).toThrow(AppError);
    });

    it('should throw for special characters', () => {
      expect(() => parseId('!@#')).toThrow(AppError);
    });

    it('should throw for Infinity', () => {
      expect(() => parseId('Infinity')).toThrow(AppError);
    });

    it('should throw for NaN string', () => {
      expect(() => parseId('NaN')).toThrow(AppError);
    });
  });
});
