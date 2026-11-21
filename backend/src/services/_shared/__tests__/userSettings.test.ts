/**
 * userSettings accessors: the one place that reads and writes user_integrations and user_preferences.
 *
 * - USS-001: a read returns the stored row untouched (ciphertext is never decrypted or re-encrypted)
 * - USS-002: a missing row is created with the column defaults; a missing user is a 404 and writes nothing
 * - USS-003: find* answers null for a missing user instead of throwing
 * - USS-004: a write upserts the row and stamps users.updated_at in the same transaction
 * - USS-005: a write for a user that no longer exists is a 404
 * - USS-006: a write inside a caller's transaction uses that client and opens no transaction of its own
 * - USS-007: defaultUserSettingsCreate creates both rows in the user's own statement
 * - USS-008: findUserIdBySender matches case-insensitively and answers the lowest user id
 */

import { Prisma } from '@prisma/client';

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  userIntegrations: { findUnique: jest.fn(), upsert: jest.fn() },
  userPreferences: { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('../../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

import {
  defaultUserSettingsCreate,
  findUserIdBySender,
  findUserIntegrations,
  findUserPreferences,
  getUserIntegrations,
  getUserPreferences,
  updateUserIntegrations,
  updateUserPreferences,
} from '../userSettings';

const CIPHERTEXT = 'enc:v1:0123456789abcdef:fedcba9876543210:00ff00ff';

describe('userSettings accessors', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) =>
      callback(mockPrisma)
    );
  });

  it('USS-001: returns the stored integrations row as it is, ciphertext included', async () => {
    const row = { userId: 1, immichApiUrl: 'https://immich.example.com', immichApiKey: CIPHERTEXT, smtpPassword: CIPHERTEXT };
    mockPrisma.userIntegrations.findUnique.mockResolvedValue(row);

    const result = await getUserIntegrations(1);

    expect(result).toBe(row);
    expect(result.immichApiKey).toBe(CIPHERTEXT);
    expect(mockPrisma.userIntegrations.findUnique).toHaveBeenCalledWith({ where: { userId: 1 } });
    expect(mockPrisma.userIntegrations.upsert).not.toHaveBeenCalled();
  });

  it('USS-001b: returns the stored preferences row', async () => {
    const row = { userId: 1, baseCurrency: 'EUR', measurementSystem: 'metric' };
    mockPrisma.userPreferences.findUnique.mockResolvedValue(row);

    expect(await getUserPreferences(1)).toBe(row);
    expect(mockPrisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('USS-002: a missing row is created with the column defaults', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 7 });
    mockPrisma.userPreferences.upsert.mockResolvedValue({ userId: 7, baseCurrency: null });

    const result = await getUserPreferences(7);

    expect(result.userId).toBe(7);
    // `create: { userId }` alone: every other column takes its database default.
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: 7 },
      update: {},
      create: { userId: 7 },
    });
  });

  it('USS-002b: the same for integrations', async () => {
    mockPrisma.userIntegrations.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 7 });
    mockPrisma.userIntegrations.upsert.mockResolvedValue({ userId: 7 });

    await getUserIntegrations(7);

    expect(mockPrisma.userIntegrations.upsert).toHaveBeenCalledWith({
      where: { userId: 7 },
      update: {},
      create: { userId: 7 },
    });
  });

  it('USS-002c: a user that does not exist is a 404 and nothing is created', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userIntegrations.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(getUserPreferences(999)).rejects.toMatchObject({ statusCode: 404, message: 'User not found' });
    await expect(getUserIntegrations(999)).rejects.toMatchObject({ statusCode: 404, message: 'User not found' });
    expect(mockPrisma.userPreferences.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.userIntegrations.upsert).not.toHaveBeenCalled();
  });

  it('USS-003: find* answers null for a user that does not exist', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userIntegrations.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    expect(await findUserPreferences(999)).toBeNull();
    expect(await findUserIntegrations(999)).toBeNull();
  });

  it('USS-004: a write upserts the row and stamps users.updated_at in one transaction', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 1 });
    mockPrisma.userIntegrations.upsert.mockResolvedValue({ userId: 1, weatherApiKey: CIPHERTEXT });

    const result = await updateUserIntegrations(1, { weatherApiKey: CIPHERTEXT });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { updatedAt: expect.any(Date) },
      select: { id: true },
    });
    // The value goes in exactly as given: no encryption or decryption happens in the accessor.
    expect(mockPrisma.userIntegrations.upsert).toHaveBeenCalledWith({
      where: { userId: 1 },
      update: { weatherApiKey: CIPHERTEXT },
      create: { userId: 1, weatherApiKey: CIPHERTEXT },
    });
    expect(result.weatherApiKey).toBe(CIPHERTEXT);
  });

  it('USS-004b: preferences are written the same way, JSON included', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 1 });
    mockPrisma.userPreferences.upsert.mockResolvedValue({ userId: 1 });
    const categories = [{ name: 'Hiking', emoji: 'h' }];

    await updateUserPreferences(1, { activityCategories: categories, baseCurrency: 'CHF' });

    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: 1 },
      update: { activityCategories: categories, baseCurrency: 'CHF' },
      create: { userId: 1, activityCategories: categories, baseCurrency: 'CHF' },
    });
  });

  it('USS-005: a write for a user that no longer exists is a 404', async () => {
    mockPrisma.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' })
    );

    await expect(updateUserPreferences(999, { baseCurrency: 'EUR' })).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('USS-006: inside a caller transaction the caller client is used and no new transaction opens', async () => {
    const tx = {
      user: { update: jest.fn().mockResolvedValue({ id: 1 }), findUnique: jest.fn() },
      userIntegrations: { upsert: jest.fn().mockResolvedValue({ userId: 1 }), findUnique: jest.fn() },
      userPreferences: { upsert: jest.fn().mockResolvedValue({ userId: 1 }), findUnique: jest.fn() },
    };

    await updateUserPreferences(1, { useCustomMapStyle: false }, tx as never);
    await updateUserIntegrations(1, { llmModel: 'm' }, tx as never);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.userPreferences.upsert).toHaveBeenCalledTimes(1);
    expect(tx.userIntegrations.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it('USS-007: defaultUserSettingsCreate asks for both rows with every default', () => {
    expect(defaultUserSettingsCreate).toEqual({
      integrations: { create: {} },
      preferences: { create: {} },
    });
  });

  it('USS-008: link ingest sender lookup is case-insensitive and picks the lowest user id', async () => {
    mockPrisma.userPreferences.findMany.mockResolvedValue([
      { userId: 2, linkIngestSenders: ['someone@else.com'] },
      { userId: 5, linkIngestSenders: [' Work@Company.com ', 42] },
      { userId: 9, linkIngestSenders: ['work@company.com'] },
    ]);

    expect(await findUserIdBySender('work@company.com')).toBe(5);
    expect(mockPrisma.userPreferences.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { userId: 'asc' } })
    );
    expect(await findUserIdBySender('nobody@nowhere.com')).toBeNull();
  });
});
