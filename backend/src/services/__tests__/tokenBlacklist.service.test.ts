/**
 * Token Blacklist Service Tests
 *
 * Test cases:
 * - TBL-001: Blacklist a token
 * - TBL-002: Check non-blacklisted token
 * - TBL-003: Check blacklisted token
 * - TBL-004: Expired token removed on check
 * - TBL-005: Cleanup expired entries
 * - TBL-006: Get blacklist size
 * - TBL-007: Get blacklist stats
 * - TBL-008: Clear blacklist (test utility)
 * - TBL-009: Start and stop cleanup interval
 */

// Mock fs modules BEFORE importing the service
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock logger to suppress output
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import service after mocks
import {
  blacklistToken,
  isBlacklisted,
  cleanupExpired,
  getBlacklistSize,
  getBlacklistStats,
  _clearBlacklist,
  startCleanupInterval,
  stopCleanupInterval,
} from '../tokenBlacklist.service';

describe('TokenBlacklistService', () => {
  beforeEach(() => {
    // Clear the blacklist before each test for isolation
    _clearBlacklist();
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Stop cleanup interval to prevent Jest from hanging
    stopCleanupInterval();
  });

  // ============================================================
  // TBL-001: Blacklist a token
  // ============================================================
  describe('TBL-001: Blacklist a token', () => {
    it('should add a token to the blacklist', () => {
      blacklistToken('test-token-123', 60000);

      expect(getBlacklistSize()).toBe(1);
      expect(isBlacklisted('test-token-123')).toBe(true);
    });

    it('should use default expiry when not specified', () => {
      blacklistToken('default-expiry-token');

      expect(isBlacklisted('default-expiry-token')).toBe(true);
    });

    it('should allow blacklisting multiple tokens', () => {
      blacklistToken('token-1', 60000);
      blacklistToken('token-2', 60000);
      blacklistToken('token-3', 60000);

      expect(getBlacklistSize()).toBe(3);
      expect(isBlacklisted('token-1')).toBe(true);
      expect(isBlacklisted('token-2')).toBe(true);
      expect(isBlacklisted('token-3')).toBe(true);
    });
  });

  // ============================================================
  // TBL-002: Check non-blacklisted token
  // ============================================================
  describe('TBL-002: Check non-blacklisted token', () => {
    it('should return false for a token not in the blacklist', () => {
      expect(isBlacklisted('non-existent-token')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isBlacklisted('')).toBe(false);
    });
  });

  // ============================================================
  // TBL-003: Check blacklisted token
  // ============================================================
  describe('TBL-003: Check blacklisted token', () => {
    it('should return true for a blacklisted token', () => {
      blacklistToken('valid-blacklisted-token', 60000);

      expect(isBlacklisted('valid-blacklisted-token')).toBe(true);
    });

    it('should return true for a token with long expiry', () => {
      blacklistToken('long-lived-token', 7 * 24 * 60 * 60 * 1000);

      expect(isBlacklisted('long-lived-token')).toBe(true);
    });
  });

  // ============================================================
  // TBL-004: Expired token removed on check
  // ============================================================
  describe('TBL-004: Expired token removed on check', () => {
    it('should return false and remove expired token on check', () => {
      // Blacklist with 0ms expiry (immediately expired)
      blacklistToken('expired-token', 0);

      // Wait a tiny bit to ensure Date.now() > expiresAt
      // The token is set with expiresAt = Date.now() + 0 = Date.now()
      // Since isBlacklisted checks entry.expiresAt < Date.now(),
      // we need the time to actually pass
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 1);

      expect(isBlacklisted('expired-token')).toBe(false);

      Date.now = originalDateNow;
    });
  });

  // ============================================================
  // TBL-005: Cleanup expired entries
  // ============================================================
  describe('TBL-005: Cleanup expired entries', () => {
    it('should remove expired entries and return count', () => {
      // Add tokens with already-expired timestamps
      blacklistToken('expired-1', 0);
      blacklistToken('expired-2', 0);
      blacklistToken('valid-token', 60000);

      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 1);

      const removed = cleanupExpired();

      Date.now = originalDateNow;

      expect(removed).toBe(2);
      expect(getBlacklistSize()).toBe(1);
      expect(isBlacklisted('valid-token')).toBe(true);
    });

    it('should return 0 when no expired entries', () => {
      blacklistToken('valid-1', 60000);
      blacklistToken('valid-2', 60000);

      const removed = cleanupExpired();

      expect(removed).toBe(0);
      expect(getBlacklistSize()).toBe(2);
    });

    it('should return 0 for empty blacklist', () => {
      const removed = cleanupExpired();

      expect(removed).toBe(0);
    });
  });

  // ============================================================
  // TBL-006: Get blacklist size
  // ============================================================
  describe('TBL-006: Get blacklist size', () => {
    it('should return 0 for empty blacklist', () => {
      expect(getBlacklistSize()).toBe(0);
    });

    it('should return correct count after adding tokens', () => {
      blacklistToken('token-a', 60000);
      blacklistToken('token-b', 60000);

      expect(getBlacklistSize()).toBe(2);
    });

    it('should return correct count after clearing', () => {
      blacklistToken('token-x', 60000);
      _clearBlacklist();

      expect(getBlacklistSize()).toBe(0);
    });
  });

  // ============================================================
  // TBL-007: Get blacklist stats
  // ============================================================
  describe('TBL-007: Get blacklist stats', () => {
    it('should return size and null oldest for empty blacklist', () => {
      const stats = getBlacklistStats();

      expect(stats.size).toBe(0);
      expect(stats.oldestExpiresAt).toBeNull();
    });

    it('should return correct stats with entries', () => {
      blacklistToken('token-early', 10000);
      blacklistToken('token-late', 60000);

      const stats = getBlacklistStats();

      expect(stats.size).toBe(2);
      expect(stats.oldestExpiresAt).toBeDefined();
      expect(typeof stats.oldestExpiresAt).toBe('number');
    });

    it('should track the oldest expiry time', () => {
      const now = Date.now();
      blacklistToken('short-lived', 1000); // expires soonest
      blacklistToken('long-lived', 100000);

      const stats = getBlacklistStats();

      // The oldest (soonest to expire) should be close to now + 1000
      expect(stats.oldestExpiresAt).toBeLessThanOrEqual(now + 1001);
    });
  });

  // ============================================================
  // TBL-008: Clear blacklist (test utility)
  // ============================================================
  describe('TBL-008: Clear blacklist', () => {
    it('should clear all entries from the blacklist', () => {
      blacklistToken('token-1', 60000);
      blacklistToken('token-2', 60000);
      blacklistToken('token-3', 60000);

      expect(getBlacklistSize()).toBe(3);

      _clearBlacklist();

      expect(getBlacklistSize()).toBe(0);
      expect(isBlacklisted('token-1')).toBe(false);
      expect(isBlacklisted('token-2')).toBe(false);
      expect(isBlacklisted('token-3')).toBe(false);
    });
  });

  // ============================================================
  // TBL-009: Start and stop cleanup interval
  // ============================================================
  describe('TBL-009: Start and stop cleanup interval', () => {
    it('should start and stop cleanup interval without error', () => {
      expect(() => {
        stopCleanupInterval();
        startCleanupInterval();
        stopCleanupInterval();
      }).not.toThrow();
    });

    it('should handle multiple start calls gracefully', () => {
      expect(() => {
        stopCleanupInterval();
        startCleanupInterval();
        startCleanupInterval(); // Should not create duplicate interval
        stopCleanupInterval();
      }).not.toThrow();
    });

    it('should handle stop when not started', () => {
      expect(() => {
        stopCleanupInterval();
        stopCleanupInterval();
      }).not.toThrow();
    });
  });
});
