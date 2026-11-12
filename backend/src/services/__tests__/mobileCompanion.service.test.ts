/**
 * Mobile companion backend tests: sync snapshot, receipt parsing, native push,
 * token issuance, and the vendored-module drift guard.
 *
 * Test cases:
 * - MSYNC-001: Full snapshot returns every kind, all ids, and the caller's permission
 * - MSYNC-002: Delta snapshot filters by updatedAt but still lists every id and every link
 * - MSYNC-003: Invalid `since` is a 400 before any entity query
 * - MSYNC-004: Access control - a denied trip reads nothing
 * - MSYNC-005: Decimals are converted to numbers
 * - RCPT-001: Heuristic parse uses the trip's currency as the default
 * - RCPT-002: LLM refinement overrides only validated fields
 * - RCPT-003: LLM failure or junk reply falls back to the heuristic result
 * - RCPT-004: useLlm=false never calls the LLM
 * - RCPT-005: Access control - edit permission is enforced
 * - RCPT-006: parseLlmReceiptReply tolerates wrappers and rejects bad fields
 * - MPUSH-001: saveMobileToken upserts by token and moves it to the new user
 * - MPUSH-002: removeMobileToken is scoped to the requesting user
 * - MPUSH-003: sendToUser delivers to native tokens without VAPID configured
 * - MPUSH-004: DeviceNotRegistered tickets prune the token
 * - MPUSH-005: A gateway failure is swallowed and counts as zero sent
 * - MPUSH-006: Deadline reminders do nothing (and stamp nothing) with no destination at all
 * - AUTH-ISS-001: issueTokensForUser returns a verifiable pair; unknown user is 404
 * - VEND-001: Vendored shared modules match their packages/shared sources
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';

const findManyMock = () => jest.fn<(args?: unknown) => Promise<unknown[]>>();

const mockPrisma = {
  trip: { findUnique: jest.fn(), findMany: jest.fn() },
  checklist: { findMany: findManyMock() },
  checklistItem: { findMany: findManyMock() },
  location: { findMany: findManyMock() },
  photoAlbum: { findMany: findManyMock() },
  lodging: { findMany: findManyMock() },
  transportation: { findMany: findManyMock() },
  activity: { findMany: findManyMock() },
  journalEntry: { findMany: findManyMock() },
  savedLink: { findMany: findManyMock() },
  customItem: { findMany: findManyMock() },
  foodLogEntry: { findMany: findManyMock() },
  tripExpense: { findMany: findManyMock() },
  photo: { findMany: findManyMock() },
  entityLink: { findMany: findManyMock() },
  mobilePushToken: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  pushSubscription: { findMany: jest.fn() },
  bookingDeadline: { findMany: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
};
jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
}));

const mockLlm = { isConfigured: jest.fn(), chat: jest.fn() };
jest.mock('../llm.service', () => ({ __esModule: true, llmService: mockLlm }));

const mockAxiosPost = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockAxiosPost(...args) },
}));

jest.mock('../companion.service', () => ({
  __esModule: true,
  companionService: { createMyselfCompanion: jest.fn() },
}));

import mobileSyncService from '../mobileSync.service';
import receiptService, { parseLlmReceiptReply } from '../receipt.service';
import pushNotificationService from '../pushNotification.service';
import authService from '../auth.service';
import { verifyAccessToken } from '../../auth/jwt';
import { AppError } from '../../errors/errors';

const USER = 1;
const TRIP = 10;

const ENTITY_MODELS = [
  'location',
  'photoAlbum',
  'lodging',
  'transportation',
  'activity',
  'journalEntry',
  'savedLink',
  'customItem',
  'foodLogEntry',
  'tripExpense',
  'photo',
  'checklist',
  'checklistItem',
  'entityLink',
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyTrip.mockResolvedValue({
    trip: { id: TRIP, userId: USER },
    isOwner: true,
    permissionLevel: 'admin',
  } as never);
  for (const model of ENTITY_MODELS) {
    mockPrisma[model].findMany.mockResolvedValue([]);
  }
});

// =============================================================================
// MOBILE SYNC
// =============================================================================

describe('MobileSyncService', () => {
  const tripRow = {
    id: TRIP,
    title: 'Venice',
    description: null,
    startDate: new Date('2026-06-01T00:00:00Z'),
    endDate: new Date('2026-06-05T00:00:00Z'),
    timezone: 'Europe/Rome',
    status: 'In Progress',
    countryCode: 'IT',
    budget: new Prisma.Decimal('1500.50'),
    budgetCurrency: 'EUR',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma.trip.findUnique.mockResolvedValue(tripRow as never);
  });

  it('MSYNC-001: full snapshot returns every kind, all ids, and the permission', async () => {
    mockPrisma.checklist.findMany.mockResolvedValue([{ id: 3 }]);
    mockPrisma.activity.findMany.mockResolvedValue([{ id: 7, name: 'Gondola' }]);
    mockPrisma.entityLink.findMany.mockResolvedValue([{ id: 99 }]);

    const snap = await mobileSyncService.getSnapshot(USER, TRIP);

    expect(mockVerifyTrip).toHaveBeenCalledWith(USER, TRIP, 'view');
    expect(snap.delta).toBe(false);
    expect(snap.trip.permission).toBe('owner');
    expect(Object.keys(snap.entities).sort()).toEqual(
      [
        'ACTIVITY',
        'CHECKLIST',
        'CHECKLIST_ITEM',
        'CUSTOM_ITEM',
        'EXPENSE',
        'FOOD_LOG',
        'JOURNAL_ENTRY',
        'LOCATION',
        'LODGING',
        'PHOTO',
        'PHOTO_ALBUM',
        'SAVED_LINK',
        'TRANSPORTATION',
      ].sort()
    );
    expect(snap.entities.ACTIVITY).toEqual([{ id: 7, name: 'Gondola' }]);
    expect(snap.ids.ACTIVITY).toEqual([7]);
    expect(snap.ids.CHECKLIST).toEqual([3]);
    expect(snap.linkIds).toEqual([99]);
    expect(Number.isNaN(new Date(snap.serverTime).getTime())).toBe(false);

    // No updatedAt filter on a full pull.
    const full = mockPrisma.activity.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(full.where).toEqual({ tripId: TRIP });
    // Checklist items are scoped through the trip's checklists.
    const items = mockPrisma.checklistItem.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(items.where).toEqual({ checklistId: { in: [3] } });
  });

  it('MSYNC-002: delta filters by updatedAt but lists every id and every link', async () => {
    const since = '2026-06-02T08:00:00.000Z';
    const snap = await mobileSyncService.getSnapshot(USER, TRIP, since);

    expect(snap.delta).toBe(true);
    const [dataCall, idCall] = mockPrisma.location.findMany.mock.calls as Array<
      [{ where: Record<string, unknown>; select?: unknown }]
    >;
    expect(dataCall[0].where).toEqual({ tripId: TRIP, updatedAt: { gt: new Date(since) } });
    expect(idCall[0].where).toEqual({ tripId: TRIP });
    expect(idCall[0].select).toEqual({ id: true });
    // Links have no updatedAt: always the whole set.
    const linkCall = mockPrisma.entityLink.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(linkCall.where).toEqual({ tripId: TRIP });
  });

  it('MSYNC-003: invalid `since` is a 400 before any entity query', async () => {
    await expect(mobileSyncService.getSnapshot(USER, TRIP, 'yesterday')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.activity.findMany).not.toHaveBeenCalled();
  });

  it('MSYNC-004: access control - a denied trip reads nothing', async () => {
    mockVerifyTrip.mockRejectedValue(new AppError('Trip not found or access denied', 404) as never);
    await expect(mobileSyncService.getSnapshot(2, TRIP)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.trip.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.activity.findMany).not.toHaveBeenCalled();
  });

  it('MSYNC-005: decimals are converted to numbers; collaborators get their level', async () => {
    mockVerifyTrip.mockResolvedValue({
      trip: { id: TRIP, userId: 2 },
      isOwner: false,
      permissionLevel: 'edit',
    } as never);
    mockPrisma.tripExpense.findMany.mockResolvedValue([
      { id: 1, amount: new Prisma.Decimal('12.50') },
    ]);

    const snap = await mobileSyncService.getSnapshot(USER, TRIP);

    expect(snap.trip.budget).toBe(1500.5);
    expect(snap.entities.EXPENSE[0].amount).toBe(12.5);
    expect(snap.trip.permission).toBe('edit');
  });
});

// =============================================================================
// RECEIPT PARSING
// =============================================================================

describe('ReceiptService', () => {
  const TEXT = 'Caffe Florian\n04/11/2026\nEspresso 6,50\nTOTALE 6,50';

  beforeEach(() => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      budgetCurrency: 'EUR',
      user: { baseCurrency: 'USD' },
    } as never);
    mockLlm.isConfigured.mockResolvedValue(false as never);
  });

  it('RCPT-001: heuristic parse uses the trip currency as the default', async () => {
    const result = await receiptService.parseReceipt(USER, TRIP, { text: TEXT });

    expect(mockVerifyTrip).toHaveBeenCalledWith(USER, TRIP, 'edit');
    expect(result).toMatchObject({
      amount: 6.5,
      currency: 'EUR',
      merchant: 'Caffe Florian',
      date: '2026-11-04',
      category: 'food',
      source: 'heuristic',
    });
    expect(mockLlm.chat).not.toHaveBeenCalled();

    // An explicit default wins over the trip's.
    const explicit = await receiptService.parseReceipt(USER, TRIP, {
      text: 'Shop\nTotal 10.00',
      defaultCurrency: 'CHF',
    });
    expect(explicit.currency).toBe('CHF');
  });

  it('RCPT-002: LLM refinement overrides only validated fields', async () => {
    mockLlm.isConfigured.mockResolvedValue(true as never);
    mockLlm.chat.mockResolvedValue(
      '```json\n{"amount": 7.25, "currency": "eur", "merchant": "Caffè Florian", "date": "not-a-date", "category": "nonsense"}\n```' as never
    );

    const result = await receiptService.parseReceipt(USER, TRIP, { text: TEXT });

    expect(result.source).toBe('llm');
    expect(result.amount).toBe(7.25);
    expect(result.currency).toBe('EUR');
    expect(result.merchant).toBe('Caffè Florian');
    // Invalid date and category from the model are ignored; heuristics stand.
    expect(result.date).toBe('2026-11-04');
    expect(result.category).toBe('food');

    // The OCR text is passed as delimited data, with the user's LLM config.
    const [system, user, options] = mockLlm.chat.mock.calls[0] as [string, string, { userId: number }];
    expect(system).toContain('untrusted');
    expect(user).toContain('<receipt_text>');
    expect(options.userId).toBe(USER);
  });

  it('RCPT-003: LLM failure or junk reply falls back to the heuristic result', async () => {
    mockLlm.isConfigured.mockResolvedValue(true as never);

    mockLlm.chat.mockRejectedValue(new Error('timeout') as never);
    const failed = await receiptService.parseReceipt(USER, TRIP, { text: TEXT });
    expect(failed).toMatchObject({ amount: 6.5, source: 'heuristic' });

    mockLlm.chat.mockResolvedValue('I could not read this receipt.' as never);
    const junk = await receiptService.parseReceipt(USER, TRIP, { text: TEXT });
    expect(junk).toMatchObject({ amount: 6.5, source: 'heuristic' });
  });

  it('RCPT-004: useLlm=false never calls the LLM', async () => {
    mockLlm.isConfigured.mockResolvedValue(true as never);
    const result = await receiptService.parseReceipt(USER, TRIP, { text: TEXT, useLlm: false });
    expect(result.source).toBe('heuristic');
    expect(mockLlm.chat).not.toHaveBeenCalled();
  });

  it('RCPT-005: access control - edit permission is enforced', async () => {
    mockVerifyTrip.mockRejectedValue(new AppError('Insufficient permissions', 403) as never);
    await expect(receiptService.parseReceipt(USER, TRIP, { text: TEXT })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockLlm.isConfigured).not.toHaveBeenCalled();
  });

  it('RCPT-006: parseLlmReceiptReply tolerates wrappers and rejects bad fields', () => {
    expect(parseLlmReceiptReply('Here you go: {"amount": 12, "currency": "USD"} Thanks!')).toEqual({
      amount: 12,
      currency: 'USD',
    });
    expect(parseLlmReceiptReply('{"amount": -5, "currency": "DOLLARS"}')).toBeNull();
    expect(parseLlmReceiptReply('{"amount": "12"}')).toBeNull();
    expect(parseLlmReceiptReply('{broken')).toBeNull();
    expect(parseLlmReceiptReply('')).toBeNull();
    expect(parseLlmReceiptReply('{"date": "2026-02-30"}')).toBeNull();
    expect(parseLlmReceiptReply('{"date": "2026-02-28"}')).toEqual({ date: '2026-02-28' });
  });
});

// =============================================================================
// NATIVE PUSH
// =============================================================================

describe('PushNotificationService — native tokens', () => {
  const TOKEN = 'ExponentPushToken[abc123]';

  it('MPUSH-001: saveMobileToken upserts by token and moves it to the new user', async () => {
    mockPrisma.mobilePushToken.upsert.mockResolvedValue({ id: 5, platform: 'android' } as never);

    const result = await pushNotificationService.saveMobileToken(USER, {
      token: TOKEN,
      platform: 'android',
      deviceName: 'Pixel 9',
    });

    expect(result).toEqual({ id: 5, platform: 'android' });
    const arg = mockPrisma.mobilePushToken.upsert.mock.calls[0][0] as {
      where: unknown;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(arg.where).toEqual({ token: TOKEN });
    expect(arg.create).toMatchObject({ userId: USER, token: TOKEN, platform: 'android', deviceName: 'Pixel 9' });
    expect(arg.update.userId).toBe(USER);
  });

  it('MPUSH-002: removeMobileToken is scoped to the requesting user', async () => {
    mockPrisma.mobilePushToken.deleteMany.mockResolvedValue({ count: 1 } as never);
    const result = await pushNotificationService.removeMobileToken(USER, { token: TOKEN });
    expect(result).toEqual({ removed: 1 });
    expect(mockPrisma.mobilePushToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER, token: TOKEN },
    });
  });

  it('MPUSH-003: sendToUser delivers to native tokens without VAPID configured', async () => {
    expect(pushNotificationService.isConfigured()).toBe(false);
    mockPrisma.mobilePushToken.findMany.mockResolvedValue([{ id: 1, token: TOKEN }] as never);
    mockAxiosPost.mockResolvedValue({ data: { data: [{ status: 'ok' }] } } as never);

    const sent = await pushNotificationService.sendToUser(USER, {
      title: 'Gate change',
      body: 'Now B12',
      url: '/trips/10',
      tag: 'flight-1',
    });

    expect(sent).toBe(1);
    const [url, messages] = mockAxiosPost.mock.calls[0] as [string, Array<Record<string, unknown>>];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(messages).toEqual([
      {
        to: TOKEN,
        title: 'Gate change',
        body: 'Now B12',
        sound: 'default',
        data: { url: '/trips/10', tag: 'flight-1' },
      },
    ]);
    // Web push is not configured, so browser subscriptions are never queried.
    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('MPUSH-004: DeviceNotRegistered tickets prune the token', async () => {
    mockPrisma.mobilePushToken.findMany.mockResolvedValue([
      { id: 1, token: TOKEN },
      { id: 2, token: 'ExponentPushToken[gone]' },
    ] as never);
    mockPrisma.mobilePushToken.delete.mockResolvedValue({} as never);
    mockAxiosPost.mockResolvedValue({
      data: {
        data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
      },
    } as never);

    const sent = await pushNotificationService.sendToUser(USER, { title: 't', body: 'b' });

    expect(sent).toBe(1);
    expect(mockPrisma.mobilePushToken.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.mobilePushToken.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it('MPUSH-005: a gateway failure is swallowed and counts as zero sent', async () => {
    mockPrisma.mobilePushToken.findMany.mockResolvedValue([{ id: 1, token: TOKEN }] as never);
    mockAxiosPost.mockRejectedValue(new Error('ECONNRESET') as never);

    await expect(pushNotificationService.sendToUser(USER, { title: 't', body: 'b' })).resolves.toBe(0);
    expect(mockPrisma.mobilePushToken.delete).not.toHaveBeenCalled();
  });

  it('MPUSH-006: deadline reminders stamp nothing when there is no destination at all', async () => {
    mockPrisma.mobilePushToken.count.mockResolvedValue(0 as never);

    await expect(pushNotificationService.sendDeadlineReminders()).resolves.toBe(0);
    expect(mockPrisma.bookingDeadline.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.bookingDeadline.update).not.toHaveBeenCalled();

    // With a registered phone the job runs even though VAPID is unset.
    mockPrisma.mobilePushToken.count.mockResolvedValue(1 as never);
    mockPrisma.bookingDeadline.findMany.mockResolvedValue([] as never);
    await pushNotificationService.sendDeadlineReminders();
    expect(mockPrisma.bookingDeadline.findMany).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// TOKEN ISSUANCE
// =============================================================================

describe('AuthService.issueTokensForUser', () => {
  it('AUTH-ISS-001: returns a verifiable pair; unknown user is 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 4,
      username: 'dana',
      email: 'dana@example.com',
      avatarUrl: null,
      timezone: 'Europe/Rome',
      passwordVersion: 3,
    } as never);

    const result = await authService.issueTokensForUser(4);

    expect(result.user).toEqual({
      id: 4,
      username: 'dana',
      email: 'dana@example.com',
      avatarUrl: null,
      timezone: 'Europe/Rome',
    });
    const decoded = verifyAccessToken(result.accessToken);
    expect(decoded.userId).toBe(4);
    // Carries passwordVersion, so a later password change still revokes it.
    expect(decoded.passwordVersion).toBe(3);
    expect(result.refreshToken).not.toBe(result.accessToken);

    mockPrisma.user.findUnique.mockResolvedValue(null as never);
    await expect(authService.issueTokensForUser(404)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// =============================================================================
// VENDORED MODULES
// =============================================================================

describe('vendored shared modules', () => {
  const HEADER_LINES = 4; // three comment lines + one blank
  const pairs: Array<[string, string]> = [
    ['utils/geo.ts', 'geo.ts'],
    ['receipt/receiptParser.ts', 'receiptParser.ts'],
  ];
  const sharedSrc = path.resolve(__dirname, '../../../../packages/shared/src');
  const vendoredDir = path.resolve(__dirname, '../_shared/vendored');
  const normalize = (text: string): string => text.replace(/\r\n/g, '\n');

  // The Docker image build has only `backend/` in its context; there the
  // sources are absent and there is nothing to compare against.
  const maybe = fs.existsSync(sharedSrc) ? it : it.skip;

  maybe('VEND-001: copies match their packages/shared sources', () => {
    for (const [from, to] of pairs) {
      const source = normalize(fs.readFileSync(path.join(sharedSrc, from), 'utf8'));
      const vendored = normalize(fs.readFileSync(path.join(vendoredDir, to), 'utf8'));
      const body = vendored.split('\n').slice(HEADER_LINES).join('\n');
      // Run `node packages/shared/scripts/sync-vendored.mjs` if this fails.
      expect(body).toBe(source);
      expect(vendored.startsWith('// GENERATED FILE - DO NOT EDIT.')).toBe(true);
    }
  });
});
