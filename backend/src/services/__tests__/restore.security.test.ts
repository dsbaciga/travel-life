/**
 * Restore Security Tests
 *
 * Adversarial coverage for the restore path. A backup file is fully
 * attacker-controlled input whose stored file paths eventually reach
 * fs.unlink(), and whose contents are written straight into the user's records.
 *
 * Covers:
 * - isStoredUploadPath / StoredUploadPathSchema reject traversal strings,
 *   absolute paths outside /uploads, and anything that is not a
 *   server-generated /uploads/<subdir>/<filename> value
 * - BackupDataSchema REJECTS a poisoned localPath, thumbnailPath, avatarUrl,
 *   coverImagePath or coverImageThumbnailPath outright
 * - restore.service's sanitizeStoredPath is a working second layer: a poisoned
 *   value that bypasses the schema is NEVER persisted
 * - the restore endpoint refuses a backup with no `integrity` HMAC, unless
 *   ALLOW_UNSIGNED_BACKUP_RESTORE=true
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

jest.mock('@prisma/client', () => {
  class MockDecimal {
    private value: string;
    constructor(value: string | number) {
      this.value = String(value);
    }
    toString(): string { return this.value; }
    toNumber(): number { return parseFloat(this.value); }
    valueOf(): number { return this.toNumber(); }
  }
  return { Prisma: { Decimal: MockDecimal, JsonNull: 'JsonNull' } };
});

// ---------------------------------------------------------------------------
// Transaction mock
// ---------------------------------------------------------------------------

const MODELS = [
  'user', 'trip', 'tripTag', 'tripTagAssignment', 'travelCompanion', 'tripCompanion',
  'locationCategory', 'checklist', 'travelDocument', 'loyaltyProgram', 'tripSeries', 'location', 'photo',
  'activity', 'transportation', 'flightTracking', 'lodging', 'journalEntry', 'photoAlbum',
  'photoAlbumAssignment', 'weatherData', 'entityLink', 'tripLanguage', 'savedLink',
] as const;

type MockDelegate = Record<string, jest.Mock>;

const mockTx: Record<string, MockDelegate> = {};
for (const model of MODELS) {
  mockTx[model] = {
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  };
}

const mockPrisma = {
  $transaction: jest.fn((callback: unknown) => {
    if (typeof callback === 'function') {
      return (callback as (tx: unknown) => Promise<unknown>)(mockTx);
    }
    return Promise.resolve(callback);
  }),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

// urlValidation would otherwise attempt real DNS for any URL in the backup.
jest.mock('../../security/urlValidation', () => ({
  validateUrlNotInternal: jest.fn(async () => undefined),
  validateUrlNotInternalSync: jest.fn(),
}));

import { restoreFromBackup } from '../restore.service';
import {
  BackupData,
  BackupDataSchema,
  isStoredUploadPath,
} from '../../types/backup.types';
import { restoreFromBackup as restoreController } from '../../controllers/backup.controller';
import config from '../../config';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  AuthenticatedRequest,
  MockResponse,
  MockNextFunction,
} from '../../__tests__/mockBuilders/requests';
import { createAuthenticatedUser } from '../../__tests__/mockBuilders/auth';
import { testUsers } from '../../__tests__/fixtures/users';

// ---------------------------------------------------------------------------
// Express adapters
//
// Express's Request/Response carry ~100 members each; the shared test helpers
// build structural stand-ins with only the ones the controller touches.
// Narrowing them to the real interfaces requires an assertion — the repo-wide
// convention (see prisma/__tests__/crudHelpers.test.ts) — confined here to
// three one-line adapters so no test body contains a cast.
// ---------------------------------------------------------------------------

const asRequest = (req: Partial<AuthenticatedRequest>): Request => req as unknown as Request;
const asResponse = (res: MockResponse): Response => res as unknown as Response;
const asNext = (next: MockNextFunction): NextFunction => next as unknown as NextFunction;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 42;

/** Values a poisoned backup could carry in any stored-path field. */
const TRAVERSAL_PATHS = [
  '../../etc/passwd',
  '/uploads/../../etc/passwd',
  '/uploads/photos/../../../../etc/shadow',
  '/uploads/photos/..%2f..%2fetc/passwd',
  '/etc/passwd',
  'C:\\Windows\\System32\\config\\SAM',
  '/uploads/photos/../secret.jpg',
  '/uploads/../uploads-private/secret.jpg',
  '/var/lib/secrets/key.pem',
  '\\\\attacker\\share\\payload.jpg',
  '/uploads/photos/sub/dir/file.jpg',
  '/uploads/evil/file.jpg',
  'uploads/photos/file.jpg',
  '/uploads/photos/',
  '/uploads/photos/..',
];

const VALID_PATHS = [
  '/uploads/photos/1a2b3c4d.jpg',
  '/uploads/videos/1a2b3c4d.mp4',
  '/uploads/thumbnails/thumb-1a2b3c4d.jpg',
  '/uploads/covers/cover-7-1a2b3c4d.jpg',
  '/uploads/avatars/companion-3-1700000000.jpg',
];

function baseBackup(): BackupData {
  return {
    version: '1.4.0',
    exportDate: '2026-07-01T00:00:00Z',
    user: {
      username: 'victim',
      email: 'victim@example.com',
      timezone: 'UTC',
      activityCategories: [],
      immichApiUrl: null,
      immichApiKey: null,
      weatherApiKey: null,
    },
    tags: [],
    companions: [],
    locationCategories: [],
    checklists: [],
    trips: [],
  };
}

/** A backup carrying `poison` in every stored-path field simultaneously. */
function poisonedBackup(poison: string): BackupData {
  return {
    ...baseBackup(),
    companions: [{ name: 'Mallory', avatarUrl: poison }],
    trips: [
      {
        title: 'Poisoned',
        status: 'Planning',
        privacyLevel: 'Private',
        coverImagePath: poison,
        coverImageThumbnailPath: poison,
        photos: [
          { id: 1, source: 'local', localPath: poison, thumbnailPath: poison },
        ],
      },
    ],
  };
}

function resetTx(): void {
  for (const model of MODELS) {
    for (const method of Object.keys(mockTx[model])) {
      mockTx[model][method].mockReset();
    }
  }
  mockPrisma.$transaction.mockClear();

  // Sensible defaults so the restore walk can complete.
  mockTx.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
  mockTx.user.update.mockResolvedValue({ id: USER_ID });
  mockTx.trip.create.mockResolvedValue({ id: 100 });
  mockTx.trip.update.mockResolvedValue({ id: 100 });
  mockTx.travelCompanion.create.mockResolvedValue({ id: 200 });
  mockTx.tripTag.create.mockResolvedValue({ id: 300 });
  mockTx.locationCategory.create.mockResolvedValue({ id: 400 });
  mockTx.photo.create.mockResolvedValue({ id: 500 });
  mockTx.location.create.mockResolvedValue({ id: 600 });
  mockTx.activity.create.mockResolvedValue({ id: 700 });
  mockTx.tripSeries.create.mockResolvedValue({ id: 800 });
  mockTx.travelDocument.findFirst.mockResolvedValue(null);
}

beforeEach(() => {
  resetTx();
});

// ===========================================================================
// isStoredUploadPath
// ===========================================================================

describe('isStoredUploadPath', () => {
  it.each(VALID_PATHS)('accepts the server-generated path %s', (value) => {
    expect(isStoredUploadPath(value)).toBe(true);
  });

  it.each(TRAVERSAL_PATHS)('rejects %s', (value) => {
    expect(isStoredUploadPath(value)).toBe(false);
  });

  it.each([
    [null],
    [undefined],
    [42],
    [{}],
    [['/uploads/photos/a.jpg']],
    [true],
  ])('rejects the non-string value %p', (value) => {
    expect(isStoredUploadPath(value)).toBe(false);
  });

  it('rejects a path whose filename embeds "..", even inside an allowed subdir', () => {
    expect(isStoredUploadPath('/uploads/photos/a..b.jpg')).toBe(false);
  });

  it('rejects a subdirectory that is not one of the five generated ones', () => {
    expect(isStoredUploadPath('/uploads/documents/a.jpg')).toBe(false);
    expect(isStoredUploadPath('/uploads/a.jpg')).toBe(false);
  });
});

// ===========================================================================
// Schema-level rejection
// ===========================================================================

describe('BackupDataSchema — stored path validation', () => {
  it('accepts a backup whose stored paths are all server-generated', () => {
    const backup: BackupData = {
      ...baseBackup(),
      companions: [{ name: 'Alice', avatarUrl: '/uploads/avatars/companion-3-1700000000.jpg' }],
      trips: [
        {
          title: 'Fine',
          status: 'Planning',
          privacyLevel: 'Private',
          coverImagePath: '/uploads/covers/cover-7-abc.jpg',
          coverImageThumbnailPath: '/uploads/covers/thumb-cover-7-abc.jpg',
          photos: [
            {
              id: 1,
              source: 'local',
              localPath: '/uploads/photos/abc.jpg',
              thumbnailPath: '/uploads/thumbnails/thumb-abc.jpg',
            },
          ],
        },
      ],
    };

    expect(() => BackupDataSchema.parse(backup)).not.toThrow();
  });

  const FIELD_SETTERS: Array<[string, (backup: BackupData, value: string | null) => void]> = [
    [
      'companion.avatarUrl',
      (b, v) => { b.companions = [{ name: 'Mallory', avatarUrl: v }]; },
    ],
    [
      'trip.coverImagePath',
      (b, v) => {
        b.trips = [{ title: 'T', status: 'Planning', privacyLevel: 'Private', coverImagePath: v }];
      },
    ],
    [
      'trip.coverImageThumbnailPath',
      (b, v) => {
        b.trips = [{ title: 'T', status: 'Planning', privacyLevel: 'Private', coverImageThumbnailPath: v }];
      },
    ],
    [
      'photo.localPath',
      (b, v) => {
        b.trips = [{
          title: 'T', status: 'Planning', privacyLevel: 'Private',
          photos: [{ id: 1, source: 'local', localPath: v }],
        }];
      },
    ],
    [
      'photo.thumbnailPath',
      (b, v) => {
        b.trips = [{
          title: 'T', status: 'Planning', privacyLevel: 'Private',
          photos: [{ id: 1, source: 'local', thumbnailPath: v }],
        }];
      },
    ],
  ];

  for (const [field, setValue] of FIELD_SETTERS) {
    describe(field, () => {
      it.each(TRAVERSAL_PATHS)('rejects the backup when it is %s', (poison) => {
        const backup = baseBackup();
        setValue(backup, poison);

        const result = BackupDataSchema.safeParse(backup);
        expect(result.success).toBe(false);
      });

      it('accepts null', () => {
        const backup = baseBackup();
        setValue(backup, null);
        expect(BackupDataSchema.safeParse(backup).success).toBe(true);
      });
    });
  }

  it('reports a helpful message naming the expected shape', () => {
    const backup = baseBackup();
    backup.companions = [{ name: 'Mallory', avatarUrl: '../../etc/passwd' }];

    const result = BackupDataSchema.safeParse(backup);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('/uploads/<subdir>/<filename>');
    }
  });
});

// ===========================================================================
// Service-level second layer (sanitizeStoredPath)
// ===========================================================================

describe('restoreFromBackup — stored paths that bypass the schema are never persisted', () => {
  it.each(TRAVERSAL_PATHS)('nulls out %s in every path field rather than writing it', async (poison) => {
    // Deliberately cast past the schema: this is the "schema loosened or bypassed"
    // scenario sanitizeStoredPath exists to survive.
    await restoreFromBackup(USER_ID, poisonedBackup(poison), {
      clearExistingData: false,
      importPhotos: true,
    });

    const companionData = (mockTx.travelCompanion.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(companionData.avatarUrl).toBeNull();

    const tripData = (mockTx.trip.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(tripData.coverImagePath).toBeNull();
    expect(tripData.coverImageThumbnailPath).toBeNull();

    const photoData = (mockTx.photo.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(photoData.localPath).toBeNull();
    expect(photoData.thumbnailPath).toBeNull();

    // And the poison string appears nowhere in anything written to the database.
    const everythingWritten = JSON.stringify([
      mockTx.travelCompanion.create.mock.calls,
      mockTx.trip.create.mock.calls,
      mockTx.trip.update.mock.calls,
      mockTx.photo.create.mock.calls,
    ]);
    expect(everythingWritten).not.toContain(poison.replace(/\\/g, '\\\\'));
  });

  it('preserves legitimate server-generated paths untouched', async () => {
    const backup: BackupData = {
      ...baseBackup(),
      companions: [{ name: 'Alice', avatarUrl: '/uploads/avatars/companion-3-17.jpg' }],
      trips: [
        {
          title: 'Fine',
          status: 'Planning',
          privacyLevel: 'Private',
          coverImagePath: '/uploads/covers/cover-7-abc.jpg',
          coverImageThumbnailPath: '/uploads/covers/thumb-cover-7-abc.jpg',
          photos: [
            {
              id: 1,
              source: 'local',
              localPath: '/uploads/photos/abc.jpg',
              thumbnailPath: '/uploads/thumbnails/thumb-abc.jpg',
            },
          ],
        },
      ],
    };

    await restoreFromBackup(USER_ID, backup, {
      clearExistingData: false,
      importPhotos: true,
    });

    const photoData = (mockTx.photo.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(photoData.localPath).toBe('/uploads/photos/abc.jpg');
    expect(photoData.thumbnailPath).toBe('/uploads/thumbnails/thumb-abc.jpg');

    const tripData = (mockTx.trip.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(tripData.coverImagePath).toBe('/uploads/covers/cover-7-abc.jpg');

    const companionData = (mockTx.travelCompanion.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(companionData.avatarUrl).toBe('/uploads/avatars/companion-3-17.jpg');
  });

  it('rejects an unsupported backup version before any write happens', async () => {
    await expect(
      restoreFromBackup(USER_ID, { ...baseBackup(), version: '9.9.9' }, {
        clearExistingData: false,
        importPhotos: true,
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Integrity signature enforcement (restore endpoint)
// ===========================================================================

describe('restore endpoint — backup integrity signature', () => {
  const originalAllowUnsigned = process.env.ALLOW_UNSIGNED_BACKUP_RESTORE;

  const signBackup = (data: unknown): { algorithm: string; signature: string } => ({
    algorithm: 'hmac-sha256',
    signature: crypto
      .createHmac('sha256', config.jwt.secret)
      .update(JSON.stringify(data))
      .digest('hex'),
  });

  const callRestore = async (backupData: unknown) => {
    const req = createMockRequest({
      user: createAuthenticatedUser(testUsers.user1),
      method: 'POST',
      path: '/backup/restore',
      body: { backupData, options: { clearExistingData: false, importPhotos: true } },
    });
    const res = createMockResponse();
    const next = createMockNext();

    restoreController(asRequest(req), asResponse(res), asNext(next));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    return { res, next };
  };

  afterEach(() => {
    if (originalAllowUnsigned === undefined) {
      delete process.env.ALLOW_UNSIGNED_BACKUP_RESTORE;
    } else {
      process.env.ALLOW_UNSIGNED_BACKUP_RESTORE = originalAllowUnsigned;
    }
  });

  it('accepts a correctly signed backup and restores it', async () => {
    delete process.env.ALLOW_UNSIGNED_BACKUP_RESTORE;
    const data = baseBackup();
    const { res, next } = await callRestore({ ...data, integrity: signBackup(data) });

    expect(next).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0] as { status: string };
    expect(body.status).toBe('success');
  });

  it('REFUSES a backup with no integrity field', async () => {
    delete process.env.ALLOW_UNSIGNED_BACKUP_RESTORE;
    const { res, next } = await callRestore(baseBackup());

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as { statusCode: number; message: string };
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('no integrity signature');
    // Nothing was written.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('permits an unsigned backup when ALLOW_UNSIGNED_BACKUP_RESTORE=true', async () => {
    process.env.ALLOW_UNSIGNED_BACKUP_RESTORE = 'true';
    const { res, next } = await callRestore(baseBackup());

    expect(next).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0] as { status: string };
    expect(body.status).toBe('success');
  });

  it.each(['false', 'TRUE', '1', 'yes', ''])(
    'still refuses an unsigned backup when the override is %p',
    async (value) => {
      process.env.ALLOW_UNSIGNED_BACKUP_RESTORE = value;
      const { next } = await callRestore(baseBackup());

      expect(next).toHaveBeenCalledTimes(1);
      expect((next.mock.calls[0][0] as { statusCode: number }).statusCode).toBe(400);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    }
  );

  it('rejects a backup whose signature does not cover its contents (tampering)', async () => {
    delete process.env.ALLOW_UNSIGNED_BACKUP_RESTORE;
    const data = baseBackup();
    const integrity = signBackup(data);

    // Sign the clean file, then swap in poisoned contents.
    const tampered = { ...poisonedBackup('/uploads/../../etc/passwd'), integrity };
    const { next } = await callRestore(tampered);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as { statusCode: number; message: string };
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('integrity check failed');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unsupported integrity algorithm', async () => {
    const data = baseBackup();
    const { next } = await callRestore({
      ...data,
      integrity: { algorithm: 'md5', signature: 'ab'.repeat(16) },
    });

    const error = next.mock.calls[0][0] as { statusCode: number; message: string };
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('Unsupported integrity algorithm');
  });

  it('rejects a malformed (non-hex) signature', async () => {
    const data = baseBackup();
    const { next } = await callRestore({
      ...data,
      integrity: { algorithm: 'hmac-sha256', signature: 'not-hex-at-all' },
    });

    const error = next.mock.calls[0][0] as { statusCode: number; message: string };
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('missing or malformed');
  });

  it('rejects a signed backup that still carries a traversal path (schema is the next gate)', async () => {
    delete process.env.ALLOW_UNSIGNED_BACKUP_RESTORE;
    // A legitimately signed file is not automatically a safe one: an operator
    // with the JWT secret, or a future signing bug, must still not get a
    // traversal path past validation.
    const data = poisonedBackup('/uploads/../../etc/passwd');
    const { next } = await callRestore({ ...data, integrity: signBackup(data) });

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
