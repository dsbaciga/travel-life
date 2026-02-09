// Mock config BEFORE any imports that transitively load config/index.ts
// jwt.ts imports config/index.ts which throws if DATABASE_URL is not set
jest.mock('../../config', () => ({
  __esModule: true,
  config: {
    jwt: {
      secret: 'test-jwt-secret',
      expiresIn: '15m',
      refreshSecret: 'test-jwt-refresh-secret',
      refreshExpiresIn: '7d',
    },
    nodeEnv: 'test',
    port: 5000,
    databaseUrl: 'postgresql://test:test@localhost:5432/test',
  },
}));

import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../jwt';
import { JwtPayload } from '../../types/auth.types';

describe('JWT utilities', () => {
  const mockPayload: JwtPayload = {
    id: 1,
    userId: 1,
    email: 'test@example.com',
  };

  describe('generateAccessToken', () => {
    it('should generate a valid access token', () => {
      const token = generateAccessToken(mockPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should generate tokens for different payloads', () => {
      const token1 = generateAccessToken(mockPayload);
      const token2 = generateAccessToken({ ...mockPayload, userId: 2, id: 2 });

      expect(token1).not.toBe(token2);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const token = generateRefreshToken(mockPayload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate tokens for different payloads', () => {
      const token1 = generateRefreshToken(mockPayload);
      const token2 = generateRefreshToken({ ...mockPayload, userId: 2, id: 2 });

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and decode a valid access token', () => {
      const token = generateAccessToken(mockPayload);
      const decoded = verifyAccessToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(mockPayload.userId);
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        verifyAccessToken('invalid.token.here');
      }).toThrow();
    });

    it('should throw error for empty token', () => {
      expect(() => {
        verifyAccessToken('');
      }).toThrow();
    });

    it('should throw error for refresh token verified as access token', () => {
      const refreshToken = generateRefreshToken(mockPayload);

      expect(() => {
        verifyAccessToken(refreshToken);
      }).toThrow();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify and decode a valid refresh token', () => {
      const token = generateRefreshToken(mockPayload);
      const decoded = verifyRefreshToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(mockPayload.userId);
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        verifyRefreshToken('invalid.token.here');
      }).toThrow();
    });

    it('should throw error for access token verified as refresh token', () => {
      const accessToken = generateAccessToken(mockPayload);

      expect(() => {
        verifyRefreshToken(accessToken);
      }).toThrow();
    });
  });

  describe('Token lifecycle', () => {
    it('should create and verify access token lifecycle', () => {
      const payload: JwtPayload = { id: 42, userId: 42, email: 'test@example.com' };
      const token = generateAccessToken(payload);
      const decoded = verifyAccessToken(token) as JwtPayload & { iat: number; exp: number };

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should create and verify refresh token lifecycle', () => {
      const payload: JwtPayload = { id: 42, userId: 42, email: 'test@example.com' };
      const token = generateRefreshToken(payload);
      const decoded = verifyRefreshToken(token) as JwtPayload & { iat: number; exp: number };

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });
  });
});
