/**
 * User Service Tests
 *
 * Test cases:
 * - USR-001: Get user by ID
 * - USR-002: Get user by ID - not found
 * - USR-003: Update user settings
 * - USR-004: Update Immich settings
 * - USR-005: Get Immich settings
 * - USR-006: Update weather settings
 * - USR-007: Get weather settings
 * - USR-008: Update username
 * - USR-009: Update username - already taken
 * - USR-010: Update password
 * - USR-011: Update password - wrong current password
 * - USR-012: Update password - user not found
 * - USR-013: Search users
 * - USR-014: Search users - short query
 * - USR-015: Get aviationstack settings
 * - USR-016: Get openrouteservice settings
 * - USR-017: Rename trip type
 * - USR-018: Delete trip type
 */

// Mock @prisma/client BEFORE any imports that depend on it
jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) { this.value = String(value); }
      toString(): string { return this.value; }
      toNumber(): number { return parseFloat(this.value); }
      valueOf(): number { return this.toNumber(); }
    },
  },
  EntityType: {
    PHOTO: 'PHOTO',
    LOCATION: 'LOCATION',
    ACTIVITY: 'ACTIVITY',
    LODGING: 'LODGING',
    TRANSPORTATION: 'TRANSPORTATION',
    JOURNAL_ENTRY: 'JOURNAL_ENTRY',
    PHOTO_ALBUM: 'PHOTO_ALBUM',
  },
}));

// Mock the database config
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  trip: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((callback: unknown) => {
    if (typeof callback === 'function') {
      return (callback as (tx: typeof mockPrisma) => unknown)(mockPrisma);
    }
    return Promise.resolve(callback);
  }),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Mock companion service
jest.mock('../companion.service', () => ({
  companionService: {
    updateMyselfCompanionName: jest.fn(),
  },
}));

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  invalidatePasswordVersionCache: jest.fn(),
}));

import userService from '../user.service';
import bcrypt from 'bcrypt';
import { companionService } from '../companion.service';
import { invalidatePasswordVersionCache } from '../../middleware/auth';
import { encryptSecret, decryptSecret } from '../../security/encryption';

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup $transaction mock after clearAllMocks
    mockPrisma.$transaction.mockImplementation((callback: unknown) => {
      if (typeof callback === 'function') {
        return (callback as (tx: typeof mockPrisma) => unknown)(mockPrisma);
      }
      return Promise.resolve(callback);
    });
  });

  const mockUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    avatarUrl: null,
    timezone: 'America/New_York',
    activityCategories: [{ name: 'Sightseeing', emoji: '🏛️' }],
    tripTypes: [{ name: 'Vacation', emoji: '🏖️' }],
    dietaryPreferences: [],
    useCustomMapStyle: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // ============================================================
  // USR-001: Get user by ID
  // ============================================================
  describe('USR-001: Get user by ID', () => {
    it('should return user profile when found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await userService.getUserById(1);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.objectContaining({
          id: true,
          username: true,
          email: true,
          avatarUrl: true,
          timezone: true,
        }),
      });
      expect(result.id).toBe(1);
      expect(result.username).toBe('testuser');
    });
  });

  // ============================================================
  // USR-002: Get user by ID - not found
  // ============================================================
  describe('USR-002: Get user by ID - not found', () => {
    it('should throw 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.getUserById(999)).rejects.toThrow('User not found');
    });
  });

  // ============================================================
  // USR-003: Update user settings
  // ============================================================
  describe('USR-003: Update user settings', () => {
    it('should update user settings successfully', async () => {
      const updatedUser = { ...mockUser, timezone: 'Europe/London' };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUserSettings(1, { timezone: 'Europe/London' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ timezone: 'Europe/London' }),
        select: expect.any(Object),
      });
      expect(result.timezone).toBe('Europe/London');
    });

    it('should update activity categories', async () => {
      const newCategories = [{ name: 'Dining', emoji: '🍽️' }];
      const updatedUser = { ...mockUser, activityCategories: newCategories };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUserSettings(1, {
        activityCategories: newCategories,
      });

      expect(result.activityCategories).toEqual(newCategories);
    });
  });

  // ============================================================
  // USR-004: Update Immich settings
  // ============================================================
  describe('USR-004: Update Immich settings', () => {
    it('should encrypt Immich API key at rest when updating settings', async () => {
      const updatedUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        immichApiUrl: 'http://localhost:2283',
        immichApiKey: 'enc:v1:encrypted',
      };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await userService.updateImmichSettings(1, {
        immichApiUrl: 'http://localhost:2283',
        immichApiKey: 'test-key',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          immichApiUrl: 'http://localhost:2283',
          immichApiKey: expect.stringMatching(/^enc:v1:/),
        }),
        select: expect.any(Object),
      });
      const savedKey = mockPrisma.user.update.mock.calls[0][0].data.immichApiKey as string;
      expect(decryptSecret(savedKey)).toBe('test-key');
      expect(result.immichApiUrl).toBe('http://localhost:2283');
    });

    it('should clear Immich settings by setting null', async () => {
      const updatedUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        immichApiUrl: null,
        immichApiKey: null,
      };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      const result = await userService.updateImmichSettings(1, {
        immichApiUrl: null,
        immichApiKey: null,
      });

      expect(result.immichApiUrl).toBeNull();
    });
  });

  // ============================================================
  // USR-005: Get Immich settings
  // ============================================================
  describe('USR-005: Get Immich settings', () => {
    it('should return Immich settings status when configured', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        immichApiUrl: 'http://localhost:2283',
        immichApiKey: 'test-key',
      });

      const result = await userService.getImmichSettings(1);

      expect(result.immichApiUrl).toBe('http://localhost:2283');
      expect(result.immichApiKeySet).toBe(true);
      expect(result.immichConfigured).toBe(true);
    });

    it('should return unconfigured status when not set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        immichApiUrl: null,
        immichApiKey: null,
      });

      const result = await userService.getImmichSettings(1);

      expect(result.immichApiKeySet).toBe(false);
      expect(result.immichConfigured).toBe(false);
    });

    it('should throw 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.getImmichSettings(999)).rejects.toThrow('User not found');
    });
  });

  // ============================================================
  // USR-006: Update weather settings
  // ============================================================
  describe('USR-006: Update weather settings', () => {
    it('should encrypt weather API key at rest', async () => {
      const updatedUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        weatherApiKey: 'enc:v1:encrypted',
      };
      mockPrisma.user.update.mockResolvedValue(updatedUser);

      await userService.updateWeatherSettings(1, {
        weatherApiKey: 'new-weather-key',
      });

      const savedKey = mockPrisma.user.update.mock.calls[0][0].data.weatherApiKey as string;
      expect(savedKey).toMatch(/^enc:v1:/);
      expect(decryptSecret(savedKey)).toBe('new-weather-key');
    });
  });

  // ============================================================
  // USR-007: Get weather settings
  // ============================================================
  describe('USR-007: Get weather settings', () => {
    it('should return weather key set status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        weatherApiKey: 'some-key',
      });

      const result = await userService.getWeatherSettings(1);

      expect(result.weatherApiKeySet).toBe(true);
    });

    it('should return false when weather key not set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        weatherApiKey: null,
      });

      const result = await userService.getWeatherSettings(1);

      expect(result.weatherApiKeySet).toBe(false);
    });

    it('should throw 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.getWeatherSettings(999)).rejects.toThrow('User not found');
    });
  });

  // ============================================================
  // USR-008: Update username
  // ============================================================
  describe('USR-008: Update username', () => {
    it('should update username when not taken', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const updatedUser = { ...mockUser, username: 'newusername' };
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      (companionService.updateMyselfCompanionName as jest.Mock).mockResolvedValue(null);

      const result = await userService.updateUsername(1, 'newusername');

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          username: 'newusername',
          id: { not: 1 },
        },
      });
      expect(result.username).toBe('newusername');
      expect(companionService.updateMyselfCompanionName).toHaveBeenCalledWith(1, 'newusername');
    });
  });

  // ============================================================
  // USR-009: Update username - already taken
  // ============================================================
  describe('USR-009: Update username - already taken', () => {
    it('should throw error when username is taken', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 2, username: 'taken' });

      await expect(userService.updateUsername(1, 'taken')).rejects.toThrow(
        'Username is already taken'
      );
    });
  });

  // ============================================================
  // USR-010: Update password
  // ============================================================
  describe('USR-010: Update password', () => {
    it('should update password when current password is correct', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: '$2b$10$hashvalue',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$newhash');
      mockPrisma.user.update.mockResolvedValue({});

      await userService.updatePassword(1, 'oldpass', 'newpass');

      expect(bcrypt.compare).toHaveBeenCalledWith('oldpass', '$2b$10$hashvalue');
      // Hashing routes through the shared hashPassword() helper, whose cost
      // factor is 12 (raised from 10).
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass', 12);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          passwordHash: '$2b$10$newhash',
          passwordVersion: { increment: 1 },
        },
      });
      expect(invalidatePasswordVersionCache).toHaveBeenCalledTimes(2);
      expect(invalidatePasswordVersionCache).toHaveBeenCalledWith(1);
    });
  });

  // ============================================================
  // USR-011: Update password - wrong current password
  // ============================================================
  describe('USR-011: Update password - wrong current password', () => {
    it('should throw error when current password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 1,
        passwordHash: '$2b$10$hashvalue',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(userService.updatePassword(1, 'wrongpass', 'newpass')).rejects.toThrow(
        'Current password is incorrect'
      );
    });
  });

  // ============================================================
  // USR-012: Update password - user not found
  // ============================================================
  describe('USR-012: Update password - user not found', () => {
    it('should throw 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.updatePassword(999, 'old', 'new')).rejects.toThrow(
        'User not found'
      );
    });
  });

  // ============================================================
  // USR-013: Search users
  // ============================================================
  describe('USR-013: Search users', () => {
    it('should search users by email or username (without leaking email in response)', async () => {
      const foundUsers = [
        { id: 2, username: 'johndoe', avatarUrl: null },
        { id: 3, username: 'janedoe', avatarUrl: null },
      ];
      mockPrisma.user.findMany.mockResolvedValue(foundUsers);

      const result = await userService.searchUsers(1, 'doe');

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { not: 1 },
          OR: [
            // Email matches on `equals`, not `contains`: substring matching let
            // any user harvest addresses by probing common fragments. You now
            // have to already know the full address to match on it.
            { email: { equals: 'doe', mode: 'insensitive' } },
            { username: { contains: 'doe', mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
        },
        take: 10,
      });
      expect(result).toHaveLength(2);
      // Security: response must not contain email
      expect(result[0]).not.toHaveProperty('email');
    });
  });

  // ============================================================
  // USR-014: Search users - short query
  // ============================================================
  describe('USR-014: Search users - short query', () => {
    it('should return empty array for query shorter than 3 chars', async () => {
      const result = await userService.searchUsers(1, 'ab');

      expect(result).toEqual([]);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('should return empty array for empty query', async () => {
      const result = await userService.searchUsers(1, '');

      expect(result).toEqual([]);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // USR-015: Get aviationstack settings
  // ============================================================
  describe('USR-015: Get aviationstack settings', () => {
    it('should return aviationstack key set status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        aviationstackApiKey: 'some-key',
      });

      const result = await userService.getAviationstackSettings(1);

      expect(result.aviationstackApiKeySet).toBe(true);
    });

    it('should throw 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.getAviationstackSettings(999)).rejects.toThrow('User not found');
    });
  });

  // ============================================================
  // USR-016: Get openrouteservice settings
  // ============================================================
  describe('USR-016: Get openrouteservice settings', () => {
    it('should return openrouteservice key set status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        openrouteserviceApiKey: 'some-key',
      });

      const result = await userService.getOpenrouteserviceSettings(1);

      expect(result.openrouteserviceApiKeySet).toBe(true);
    });

    it('should throw 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.getOpenrouteserviceSettings(999)).rejects.toThrow('User not found');
    });
  });

  // ============================================================
  // USR-017: Rename trip type
  // ============================================================
  describe('USR-017: Rename trip type', () => {
    it('should rename a trip type and update trips', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        tripTypes: [
          { name: 'Vacation', emoji: '🏖️' },
          { name: 'Business', emoji: '💼' },
        ],
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.trip.updateMany.mockResolvedValue({ count: 2 });

      const result = await userService.renameTripType(1, 'Vacation', 'Holiday');

      expect(result).toEqual([
        { name: 'Holiday', emoji: '🏖️' },
        { name: 'Business', emoji: '💼' },
      ]);
    });

    it('should throw 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.renameTripType(999, 'Old', 'New')).rejects.toThrow(
        'User not found'
      );
    });
  });

  // ============================================================
  // USR-018: Delete trip type
  // ============================================================
  describe('USR-018: Delete trip type', () => {
    it('should delete a trip type and clear from trips', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        tripTypes: [
          { name: 'Vacation', emoji: '🏖️' },
          { name: 'Business', emoji: '💼' },
        ],
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.trip.updateMany.mockResolvedValue({ count: 1 });

      const result = await userService.deleteTripType(1, 'Vacation');

      expect(result).toEqual([{ name: 'Business', emoji: '💼' }]);
      expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
        where: { userId: 1, tripType: 'Vacation' },
        data: { tripType: null, tripTypeEmoji: null },
      });
    });
  });

  // ============================================================
  // USR-019: Encrypt and decrypt per-user API keys & SMTP password
  // ============================================================
  describe('USR-019: Per-user secret encryption and decryption', () => {
    it('encrypts aviationstack, openrouteservice, llm API keys and smtpPassword on save', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await userService.updateAviationstackSettings(1, { aviationstackApiKey: 'av-secret' });
      const savedAv = mockPrisma.user.update.mock.calls[0][0].data.aviationstackApiKey as string;
      expect(savedAv).toMatch(/^enc:v1:/);
      expect(decryptSecret(savedAv)).toBe('av-secret');

      await userService.updateOpenrouteserviceSettings(1, { openrouteserviceApiKey: 'ors-secret' });
      const savedOrs = mockPrisma.user.update.mock.calls[1][0].data.openrouteserviceApiKey as string;
      expect(savedOrs).toMatch(/^enc:v1:/);
      expect(decryptSecret(savedOrs)).toBe('ors-secret');

      await userService.updateLlmSettings(1, { llmApiKey: 'sk-llm-secret' });
      const savedLlm = mockPrisma.user.update.mock.calls[2][0].data.llmApiKey as string;
      expect(savedLlm).toMatch(/^enc:v1:/);
      expect(decryptSecret(savedLlm)).toBe('sk-llm-secret');

      await userService.updateSmtpSettings(1, { smtpPassword: 'smtp-password-123' });
      const savedSmtp = mockPrisma.user.update.mock.calls[3][0].data.smtpPassword as string;
      expect(savedSmtp).toMatch(/^enc:v1:/);
      expect(decryptSecret(savedSmtp)).toBe('smtp-password-123');
    });

    it('decrypts encrypted smtpPassword in getEffectiveSmtpConfig', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'user@example.com',
        smtpPassword: encryptSecret('super-secret-smtp-pass'),
        smtpFrom: 'Travel Life <user@example.com>',
      });

      const smtpConfig = await userService.getEffectiveSmtpConfig(1);
      expect(smtpConfig).not.toBeNull();
      expect(smtpConfig?.password).toBe('super-secret-smtp-pass');
    });
  });
});
