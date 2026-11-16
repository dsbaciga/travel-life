/**
 * Share Service Tests
 *
 * share.service.ts builds the ONLY unauthenticated view of a trip, and its
 * field-exclusion list (:206-214) plus path containment (:352-386) are the
 * template two other open findings want copied. These tests lock both in.
 *
 * Covers:
 * - enable / rotate / disable share, and the owner-only guard
 * - the public payload OMITS cost/currency, confirmation numbers, booking
 *   references/URLs, seat numbers, addresses, companions and account data
 * - getPublicPhotoFilePath rejects traversal and anything outside uploads/
 * - the 64-hex share-token shape is validated before any query runs
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

jest.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) {
        this.value = String(value);
      }
      toString(): string {
        return this.value;
      }
      toNumber(): number {
        return parseFloat(this.value);
      }
    },
  },
}));

import { mockPrismaClient, resetPrismaMocks } from '../../__tests__/mocks/prisma';

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrismaClient,
}));

import shareService from '../share.service';
import { config } from '../../config';
import { AppError } from '../../errors/errors';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'a1b2c3d4'.repeat(8); // 64 hex chars
const UPLOADS_ROOT = path.resolve(config.upload.dir);

/** The photo columns getPublicTrip reads; both file paths are nullable. */
interface TripRowPhoto {
  id: number;
  caption: string | null;
  takenAt: Date | null;
  localPath: string | null;
  thumbnailPath: string | null;
  source: string;
  mediaType: string;
  immichAssetId: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * A trip row shaped like what Prisma returns, deliberately carrying EVERY
 * sensitive field the public payload is supposed to drop.
 */
function buildSensitiveTripRow() {
  return {
    id: 7,
    userId: 3,
    title: 'Italy',
    description: 'Two weeks in Rome',
    startDate: new Date('2026-07-01T00:00:00Z'),
    endDate: new Date('2026-07-15T00:00:00Z'),
    timezone: 'Europe/Rome',
    tripType: 'Vacation',
    tripTypeEmoji: '🏖️',
    shareToken: VALID_TOKEN,
    shareEnabled: true,
    // --- must never be exposed ---
    budget: 12345,
    currency: 'EUR',
    notes: 'private owner notes',
    coverImagePath: '/uploads/covers/cover-7-abc.jpg',
    locations: [
      {
        id: 11,
        name: 'Colosseum',
        category: { name: 'Landmark' },
        latitude: 41.8902,
        longitude: 12.4922,
        notes: 'Book ahead',
        excludeFromMap: false,
        address: '  Piazza del Colosseo 1',
        cost: 18,
        currency: 'EUR',
        confirmationNumber: 'LOC-CONF-1',
        bookingReference: 'LOC-BOOK-1',
        bookingUrl: 'https://booking.example.com/loc',
      },
    ],
    activities: [
      {
        id: 21,
        name: 'Colosseum tour',
        category: 'Sightseeing',
        allDay: false,
        startTime: new Date('2026-07-02T09:00:00Z'),
        endTime: new Date('2026-07-02T12:00:00Z'),
        timezone: 'Europe/Rome',
        notes: 'Meet at the arch',
        cost: 65,
        currency: 'EUR',
        confirmationNumber: 'ACT-CONF-9',
        bookingReference: 'ACT-BOOK-9',
        bookingUrl: 'https://booking.example.com/act',
      },
    ],
    transportation: [
      {
        id: 31,
        type: 'flight',
        scheduledStart: new Date('2026-07-01T08:00:00Z'),
        scheduledEnd: new Date('2026-07-01T20:00:00Z'),
        startTimezone: 'America/New_York',
        endTimezone: 'Europe/Rome',
        startLocation: { name: 'JFK' },
        endLocation: { name: 'FCO' },
        startLocationText: 'New York',
        endLocationText: 'Rome',
        cost: 780.5,
        currency: 'USD',
        confirmationNumber: 'TRN-CONF-5',
        referenceNumber: 'AZ609',
        bookingReference: 'TRN-BOOK-5',
        bookingUrl: 'https://airline.example.com/booking',
        seatNumber: '14C',
        company: 'Alitalia',
      },
    ],
    lodging: [
      {
        id: 41,
        name: 'Hotel Roma',
        type: 'hotel',
        checkInDate: new Date('2026-07-01T00:00:00Z'),
        checkOutDate: new Date('2026-07-15T00:00:00Z'),
        timezone: 'Europe/Rome',
        address: 'Via Nazionale 7, Rome',
        cost: 2100,
        currency: 'EUR',
        confirmationNumber: 'LDG-CONF-2',
        bookingReference: 'LDG-BOOK-2',
        bookingUrl: 'https://hotels.example.com/roma',
        roomNumber: '512',
      },
    ],
    journalEntries: [
      {
        id: 51,
        title: 'Day one',
        content: 'Arrived in Rome!',
        date: new Date('2026-07-01T00:00:00Z'),
        entryType: 'daily',
        mood: 'happy',
        isPrivate: true,
      },
    ],
    photos: [
      {
        id: 61,
        caption: 'Forum at sunset',
        takenAt: new Date('2026-07-02T18:30:00Z'),
        isFavorite: true,
        localPath: '/uploads/photos/abc.jpg',
        thumbnailPath: '/uploads/thumbnails/thumb-abc.jpg',
        source: 'local',
        mediaType: 'image',
        immichAssetId: 'immich-asset-1',
        latitude: 41.89,
        longitude: 12.48,
      },
    ] as TripRowPhoto[],
    entityLinks: [
      { sourceType: 'ACTIVITY', sourceId: 21, targetId: 11 },
    ],
  };
}

beforeEach(() => {
  resetPrismaMocks();
});

// ===========================================================================
// Owner-scoped share management
// ===========================================================================

describe('ShareService — share management', () => {
  it('enableShare generates a token on first use and returns the share path', async () => {
    mockPrismaClient.trip.findFirst.mockResolvedValue({
      id: 7,
      shareToken: null,
      shareEnabled: false,
    });
    mockPrismaClient.trip.update.mockImplementation((args: unknown) => {
      const data = (args as { data: { shareToken: string; shareEnabled: boolean } }).data;
      return Promise.resolve({ shareToken: data.shareToken, shareEnabled: data.shareEnabled });
    });

    const result = await shareService.enableShare(3, 7);

    expect(result.shareEnabled).toBe(true);
    expect(result.shareToken).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sharePath).toBe(`/share/${result.shareToken}`);
    expect(mockPrismaClient.trip.findFirst).toHaveBeenCalledWith({
      where: { id: 7, userId: 3 },
      select: { id: true, shareToken: true, shareEnabled: true },
    });
  });

  it('enableShare reuses the existing token so a disabled link can be restored', async () => {
    mockPrismaClient.trip.findFirst.mockResolvedValue({
      id: 7,
      shareToken: VALID_TOKEN,
      shareEnabled: false,
    });
    mockPrismaClient.trip.update.mockResolvedValue({
      shareToken: VALID_TOKEN,
      shareEnabled: true,
    });

    const result = await shareService.enableShare(3, 7);

    expect(result.shareToken).toBe(VALID_TOKEN);
    const updateArgs = mockPrismaClient.trip.update.mock.calls[0][0] as {
      data: { shareToken: string };
    };
    expect(updateArgs.data.shareToken).toBe(VALID_TOKEN);
  });

  it('rotateShareToken replaces the token with a fresh 64-hex value', async () => {
    mockPrismaClient.trip.findFirst.mockResolvedValue({
      id: 7,
      shareToken: VALID_TOKEN,
      shareEnabled: true,
    });
    mockPrismaClient.trip.update.mockImplementation((args: unknown) => {
      const data = (args as { data: { shareToken: string } }).data;
      return Promise.resolve({ shareToken: data.shareToken, shareEnabled: true });
    });

    const result = await shareService.rotateShareToken(3, 7);

    expect(result.shareToken).toMatch(/^[a-f0-9]{64}$/);
    expect(result.shareToken).not.toBe(VALID_TOKEN);
    expect(result.shareEnabled).toBe(true);
  });

  it('disableShare keeps the token but turns sharing off', async () => {
    mockPrismaClient.trip.findFirst.mockResolvedValue({
      id: 7,
      shareToken: VALID_TOKEN,
      shareEnabled: true,
    });
    mockPrismaClient.trip.update.mockResolvedValue({
      shareToken: VALID_TOKEN,
      shareEnabled: false,
    });

    const result = await shareService.disableShare(3, 7);

    expect(result).toEqual({
      shareEnabled: false,
      shareToken: VALID_TOKEN,
      sharePath: `/share/${VALID_TOKEN}`,
    });
    const updateArgs = mockPrismaClient.trip.update.mock.calls[0][0] as { data: unknown };
    expect(updateArgs.data).toEqual({ shareEnabled: false });
  });

  it.each([
    ['enableShare'],
    ['rotateShareToken'],
    ['disableShare'],
  ] as const)('%s 404s for a trip the user does not own', async (method) => {
    mockPrismaClient.trip.findFirst.mockResolvedValue(null);

    await expect(shareService[method](999, 7)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Trip not found or you do not have permission to manage sharing',
    });
    expect(mockPrismaClient.trip.update).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Public payload — field exclusion
// ===========================================================================

describe('ShareService.getPublicTrip — sensitive field exclusion', () => {
  beforeEach(() => {
    mockPrismaClient.trip.findFirst.mockResolvedValue(buildSensitiveTripRow());
  });

  it('404s when no trip matches the token or sharing is disabled', async () => {
    mockPrismaClient.trip.findFirst.mockResolvedValue(null);

    await expect(shareService.getPublicTrip(VALID_TOKEN)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Shared trip not found',
    });
  });

  it('queries only for the exact token WITH shareEnabled: true', async () => {
    await shareService.getPublicTrip(VALID_TOKEN);

    const args = mockPrismaClient.trip.findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({ shareToken: VALID_TOKEN, shareEnabled: true });
  });

  it('omits every cost, currency, confirmation, booking and seat field from the whole payload', async () => {
    const payload = await shareService.getPublicTrip(VALID_TOKEN);

    const serialised = JSON.stringify(payload);

    // Field names must not appear anywhere in the payload.
    for (const field of [
      'cost',
      'currency',
      'confirmationNumber',
      'referenceNumber',
      'bookingReference',
      'bookingUrl',
      'seatNumber',
      'roomNumber',
      'address',
      'budget',
      'userId',
      'immichAssetId',
      'localPath',
      'thumbnailPath',
      'shareToken',
    ]) {
      expect(serialised).not.toContain(`"${field}"`);
    }

    // Nor must their VALUES leak under a different key.
    for (const value of [
      'ACT-CONF-9',
      'ACT-BOOK-9',
      'LDG-CONF-2',
      'LDG-BOOK-2',
      'TRN-CONF-5',
      'TRN-BOOK-5',
      'LOC-CONF-1',
      'LOC-BOOK-1',
      '14C',
      '512',
      'Via Nazionale 7, Rome',
      'https://booking.example.com/act',
      'https://hotels.example.com/roma',
      'https://airline.example.com/booking',
      'immich-asset-1',
      'private owner notes',
      '12345',
      '780.5',
      '2100',
    ]) {
      expect(serialised).not.toContain(value);
    }
  });

  it('exposes exactly the whitelisted keys on each collection item', async () => {
    const payload = await shareService.getPublicTrip(VALID_TOKEN);

    expect(Object.keys(payload).sort()).toEqual(
      [
        'activities',
        'description',
        'endDate',
        'journalEntries',
        'locations',
        'lodging',
        'photos',
        'startDate',
        'timezone',
        'title',
        'tripType',
        'tripTypeEmoji',
        'transportation',
      ].sort()
    );

    expect(Object.keys(payload.locations[0]).sort()).toEqual(
      ['category', 'excludeFromMap', 'id', 'latitude', 'longitude', 'name', 'notes'].sort()
    );
    expect(Object.keys(payload.activities[0]).sort()).toEqual(
      [
        'allDay',
        'category',
        'endTime',
        'id',
        'locationName',
        'name',
        'notes',
        'startTime',
        'timezone',
      ].sort()
    );
    expect(Object.keys(payload.transportation[0]).sort()).toEqual(
      ['endTimezone', 'from', 'id', 'scheduledEnd', 'scheduledStart', 'startTimezone', 'to', 'type'].sort()
    );
    expect(Object.keys(payload.lodging[0]).sort()).toEqual(
      ['checkInDate', 'checkOutDate', 'id', 'name', 'timezone', 'type'].sort()
    );
    expect(Object.keys(payload.journalEntries[0]).sort()).toEqual(
      ['content', 'date', 'entryType', 'id', 'mood', 'title'].sort()
    );
    expect(Object.keys(payload.photos[0]).sort()).toEqual(
      ['caption', 'id', 'isFavorite', 'takenAt', 'thumbnailUrl', 'url'].sort()
    );
  });

  it('copies the safe fields through correctly', async () => {
    const payload = await shareService.getPublicTrip(VALID_TOKEN);

    expect(payload.title).toBe('Italy');
    expect(payload.startDate).toBe('2026-07-01');
    expect(payload.endDate).toBe('2026-07-15');
    expect(payload.locations[0]).toEqual({
      id: 11,
      name: 'Colosseum',
      category: 'Landmark',
      latitude: 41.8902,
      longitude: 12.4922,
      notes: 'Book ahead',
      excludeFromMap: false,
    });
    // Activity->location association comes from EntityLink, not a FK.
    expect(payload.activities[0].locationName).toBe('Colosseum');
    expect(payload.transportation[0].from).toBe('JFK');
    expect(payload.transportation[0].to).toBe('FCO');
  });

  it('exposes the favorite flag on shared photos', async () => {
    const payload = await shareService.getPublicTrip(VALID_TOKEN);
    expect(payload.photos[0].isFavorite).toBe(true);
  });

  it('exposes photos only through token-scoped API paths, never the stored file path', async () => {
    const payload = await shareService.getPublicTrip(VALID_TOKEN);

    expect(payload.photos[0].url).toBe(
      `/api/public/trips/${VALID_TOKEN}/photos/61/file`
    );
    expect(payload.photos[0].thumbnailUrl).toBe(
      `/api/public/trips/${VALID_TOKEN}/photos/61/thumbnail`
    );
  });

  it('falls back to the full-size URL when a photo has no thumbnail', async () => {
    const row = buildSensitiveTripRow();
    row.photos[0].thumbnailPath = null;
    mockPrismaClient.trip.findFirst.mockResolvedValue(row);

    const payload = await shareService.getPublicTrip(VALID_TOKEN);

    expect(payload.photos[0].thumbnailUrl).toBe(
      `/api/public/trips/${VALID_TOKEN}/photos/61/file`
    );
  });

  it('drops photos with no local file (Immich assets are never exposed)', async () => {
    const row = buildSensitiveTripRow();
    row.photos[0].localPath = null;
    mockPrismaClient.trip.findFirst.mockResolvedValue(row);

    const payload = await shareService.getPublicTrip(VALID_TOKEN);

    expect(payload.photos).toEqual([]);
  });

  it('restricts the photo query to local images', async () => {
    await shareService.getPublicTrip(VALID_TOKEN);

    const args = mockPrismaClient.trip.findFirst.mock.calls[0][0] as {
      include: { photos: { where: Record<string, unknown> } };
    };
    expect(args.include.photos.where).toEqual({ source: 'local', mediaType: 'image' });
  });
});

// ===========================================================================
// Token shape
// ===========================================================================

describe('ShareService — share token shape', () => {
  it('generated tokens are 64 lowercase hex characters (32 random bytes)', async () => {
    mockPrismaClient.trip.findFirst.mockResolvedValue({
      id: 7,
      shareToken: null,
      shareEnabled: false,
    });

    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      mockPrismaClient.trip.update.mockImplementationOnce((args: unknown) => {
        const data = (args as { data: { shareToken: string } }).data;
        return Promise.resolve({ shareToken: data.shareToken, shareEnabled: true });
      });
      const { shareToken } = await shareService.enableShare(3, 7);
      expect(shareToken).toMatch(/^[a-f0-9]{64}$/);
      // `?? ''` keeps the type honest; a null token already failed the regex above.
      expect(seen.has(shareToken ?? '')).toBe(false);
      seen.add(shareToken ?? '');
    }
  });

  it('sharePath is null while no token has been generated', async () => {
    mockPrismaClient.trip.findFirst.mockResolvedValue({
      id: 7,
      shareToken: null,
      shareEnabled: true,
    });
    mockPrismaClient.trip.update.mockResolvedValue({ shareToken: null, shareEnabled: false });

    const result = await shareService.disableShare(3, 7);
    expect(result.sharePath).toBeNull();
  });
});

// ===========================================================================
// getPublicPhotoFilePath — path containment
// ===========================================================================

describe('ShareService.getPublicPhotoFilePath', () => {
  it('resolves a well-formed stored path inside the uploads root', async () => {
    mockPrismaClient.photo.findFirst.mockResolvedValue({
      localPath: '/uploads/photos/abc.jpg',
      thumbnailPath: '/uploads/thumbnails/thumb-abc.jpg',
    });

    const full = await shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'full');
    const thumb = await shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'thumbnail');

    expect(full).toBe(path.join(UPLOADS_ROOT, 'photos', 'abc.jpg'));
    expect(thumb).toBe(path.join(UPLOADS_ROOT, 'thumbnails', 'thumb-abc.jpg'));
  });

  it('scopes the lookup to a local image on a trip with this exact enabled token', async () => {
    mockPrismaClient.photo.findFirst.mockResolvedValue({
      localPath: '/uploads/photos/abc.jpg',
      thumbnailPath: null,
    });

    await shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'full');

    const args = mockPrismaClient.photo.findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({
      id: 61,
      source: 'local',
      mediaType: 'image',
      trip: { shareToken: VALID_TOKEN, shareEnabled: true },
    });
  });

  it('falls back to the full-size file when the thumbnail is missing', async () => {
    mockPrismaClient.photo.findFirst.mockResolvedValue({
      localPath: '/uploads/photos/abc.jpg',
      thumbnailPath: null,
    });

    const result = await shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'thumbnail');
    expect(result).toBe(path.join(UPLOADS_ROOT, 'photos', 'abc.jpg'));
  });

  it('404s when the photo does not belong to the shared trip', async () => {
    mockPrismaClient.photo.findFirst.mockResolvedValue(null);

    await expect(
      shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'full')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    ['/uploads/../../etc/passwd', 'traversal escaping the uploads root'],
    ['/uploads/photos/../../../../etc/passwd', 'deep traversal'],
    ['/uploads/photos/../../secrets.env', 'traversal into a sibling directory'],
    ['/uploads/../uploads-private/secret.jpg', 'traversal into a sibling prefixed directory'],
  ])('rejects %s (%s)', async (storedPath) => {
    mockPrismaClient.photo.findFirst.mockResolvedValue({
      localPath: storedPath,
      thumbnailPath: null,
    });

    let thrown: unknown;
    try {
      await shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'full');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).statusCode).toBe(404);
  });

  it('rejects a traversal supplied via the THUMBNAIL path', async () => {
    mockPrismaClient.photo.findFirst.mockResolvedValue({
      localPath: '/uploads/photos/abc.jpg',
      thumbnailPath: '/uploads/../../etc/shadow',
    });

    await expect(
      shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'thumbnail')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    ['/etc/passwd', 'absolute path outside uploads'],
    ['../../etc/passwd', 'relative traversal'],
    ['uploads/photos/abc.jpg', 'missing leading slash'],
    ['/uploadsevil/photos/abc.jpg', 'prefix-confusable directory'],
    ['/var/uploads/photos/abc.jpg', 'uploads not at the start'],
    ['', 'empty string'],
  ])('rejects %s (%s) before touching the filesystem', async (storedPath) => {
    mockPrismaClient.photo.findFirst.mockResolvedValue({
      localPath: storedPath,
      thumbnailPath: null,
    });

    await expect(
      shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'full')
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('never returns a path outside the uploads root for any input it accepts', async () => {
    const candidates = [
      '/uploads/photos/a.jpg',
      '/uploads/thumbnails/t.jpg',
      '/uploads/covers/c.jpg',
      '/uploads/photos/./a.jpg',
      '/uploads/photos/nested/deep/a.jpg',
    ];

    for (const stored of candidates) {
      mockPrismaClient.photo.findFirst.mockResolvedValue({
        localPath: stored,
        thumbnailPath: null,
      });
      const resolved = await shareService.getPublicPhotoFilePath(VALID_TOKEN, 61, 'full');
      expect(resolved.startsWith(UPLOADS_ROOT + path.sep)).toBe(true);
    }
  });
});
