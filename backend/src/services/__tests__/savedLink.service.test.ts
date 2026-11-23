/**
 * SavedLink Service Tests
 *
 * Test cases:
 * - SL-001: Create a link in the inbox (no trip)
 * - SL-002: Create a link assigned to a trip (checks edit permission)
 * - SL-003: Create strips tracking params before storing
 * - SL-004: Create rejects an internal/private URL
 * - SL-005: List the inbox (tripId: 'none')
 * - SL-006: List by trip id (checks view permission)
 * - SL-007: Update assigns a trip
 * - SL-008: Unassigning to the inbox drops entity links
 * - SL-009: Reassigning to a different trip drops the old trip's entity links
 * - SL-010: Changing the URL clears stale metadata
 * - SL-011: Delete removes entity links first
 * - SL-012: Ownership errors (404 for another user's link)
 * - SL-013: populateMetadata writes FETCHED on success, FAILED on miss
 * - SL-014: Inbox count
 * - SL-015: Bulk delete removes entity links for assigned links only
 * - SL-016: Bulk delete 404s if any id is not owned by the user
 * - SL-017: Delete-all-unassigned only touches links with no trip
 */

const mockPrisma = {
  savedLink: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

const mockVerifyTripAccessWithPermission = jest.fn();
const mockCleanupEntityLinks = jest.fn();
jest.mock('../../services/_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) =>
    mockVerifyTripAccessWithPermission(...args),
}));
jest.mock('../../services/_shared/entityLinkCleanup', () => ({
  cleanupEntityLinks: (...args: unknown[]) => mockCleanupEntityLinks(...args),
}));

const mockAssertFetchable = jest.fn();
const mockFetchMetadata = jest.fn();
jest.mock('../linkMetadata.service', () => ({
  __esModule: true,
  default: {
    assertFetchable: (url: string) => mockAssertFetchable(url),
    fetch: (url: string) => mockFetchMetadata(url),
  },
  // Use the real implementation so SL-003 exercises actual stripping.
  stripTrackingParams: jest.requireActual('../linkMetadata.service')
    .stripTrackingParams,
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import savedLinkService from '../savedLink.service';
import { AppError } from '../../errors/errors';

const USER_ID = 7;

function createMockLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: USER_ID,
    tripId: null,
    url: 'https://example.com/page',
    title: null,
    description: null,
    siteName: null,
    imageUrl: null,
    notes: null,
    source: 'MANUAL',
    metadataStatus: 'PENDING',
    metadataFetchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SavedLinkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTripAccessWithPermission.mockResolvedValue(undefined);
    mockCleanupEntityLinks.mockResolvedValue(undefined);
    mockAssertFetchable.mockResolvedValue(undefined);
    mockFetchMetadata.mockResolvedValue(null);
    // Background metadata population is fire-and-forget; keep it inert.
    mockPrisma.savedLink.findUnique.mockResolvedValue(null);
  });

  describe('createSavedLink', () => {
    it('SL-001: creates a link in the inbox with no trip', async () => {
      mockPrisma.savedLink.create.mockResolvedValue(createMockLink());

      await savedLinkService.createSavedLink(USER_ID, {
        url: 'https://example.com/page',
      });

      expect(mockVerifyTripAccessWithPermission).not.toHaveBeenCalled();
      expect(mockPrisma.savedLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: USER_ID,
          tripId: null,
          url: 'https://example.com/page',
          source: 'MANUAL',
          metadataStatus: 'PENDING',
        }),
      });
    });

    it('SL-002: checks edit permission when assigning a trip', async () => {
      mockPrisma.savedLink.create.mockResolvedValue(createMockLink({ tripId: 42 }));

      await savedLinkService.createSavedLink(USER_ID, {
        url: 'https://example.com/page',
        tripId: 42,
      });

      expect(mockVerifyTripAccessWithPermission).toHaveBeenCalledWith(
        USER_ID,
        42,
        'edit'
      );
    });

    it('SL-003: strips tracking params before storing', async () => {
      mockPrisma.savedLink.create.mockResolvedValue(createMockLink());

      await savedLinkService.createSavedLink(USER_ID, {
        url: 'https://example.com/page?utm_source=email&fbclid=xyz&q=keep',
      });

      expect(mockPrisma.savedLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          url: 'https://example.com/page?q=keep',
        }),
      });
      // The stripped URL is what gets SSRF-validated, too.
      expect(mockAssertFetchable).toHaveBeenCalledWith(
        'https://example.com/page?q=keep'
      );
    });

    it('SL-004: rejects an internal/private URL', async () => {
      mockAssertFetchable.mockRejectedValue(
        new AppError('URLs pointing to localhost are not allowed', 400)
      );

      await expect(
        savedLinkService.createSavedLink(USER_ID, {
          url: 'http://localhost:5000/api/trips',
        })
      ).rejects.toThrow(AppError);

      expect(mockPrisma.savedLink.create).not.toHaveBeenCalled();
    });
  });

  describe('getSavedLinks', () => {
    it("SL-005: lists the inbox for tripId 'none'", async () => {
      mockPrisma.savedLink.findMany.mockResolvedValue([]);

      await savedLinkService.getSavedLinks(USER_ID, { tripId: 'none' });

      expect(mockPrisma.savedLink.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, tripId: null },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('SL-006: checks view permission when filtering by trip', async () => {
      mockPrisma.savedLink.findMany.mockResolvedValue([]);

      await savedLinkService.getSavedLinks(USER_ID, { tripId: 42 });

      expect(mockVerifyTripAccessWithPermission).toHaveBeenCalledWith(
        USER_ID,
        42,
        'view'
      );
      expect(mockPrisma.savedLink.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, tripId: 42 },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('updateSavedLink', () => {
    it('SL-007: assigns a trip', async () => {
      mockPrisma.savedLink.findFirst.mockResolvedValue(createMockLink());
      mockPrisma.savedLink.update.mockResolvedValue(createMockLink({ tripId: 42 }));

      await savedLinkService.updateSavedLink(USER_ID, 1, { tripId: 42 });

      expect(mockVerifyTripAccessWithPermission).toHaveBeenCalledWith(
        USER_ID,
        42,
        'edit'
      );
      expect(mockPrisma.savedLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ tripId: 42 }),
      });
      // Nothing to clean up: the link had no trip before.
      expect(mockCleanupEntityLinks).not.toHaveBeenCalled();
    });

    it('SL-008: unassigning to the inbox drops entity links', async () => {
      mockPrisma.savedLink.findFirst.mockResolvedValue(
        createMockLink({ tripId: 42 })
      );
      mockPrisma.savedLink.update.mockResolvedValue(createMockLink());

      await savedLinkService.updateSavedLink(USER_ID, 1, { tripId: null });

      expect(mockCleanupEntityLinks).toHaveBeenCalledWith(42, 'SAVED_LINK', 1);
      expect(mockPrisma.savedLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ tripId: null }),
      });
    });

    it("SL-009: reassigning drops the old trip's entity links", async () => {
      mockPrisma.savedLink.findFirst.mockResolvedValue(
        createMockLink({ tripId: 42 })
      );
      mockPrisma.savedLink.update.mockResolvedValue(createMockLink({ tripId: 99 }));

      await savedLinkService.updateSavedLink(USER_ID, 1, { tripId: 99 });

      expect(mockCleanupEntityLinks).toHaveBeenCalledWith(42, 'SAVED_LINK', 1);
    });

    it('SL-010: changing the URL clears stale metadata', async () => {
      mockPrisma.savedLink.findFirst.mockResolvedValue(
        createMockLink({
          title: 'Old Title',
          description: 'Old description',
          siteName: 'old.com',
          imageUrl: 'https://old.com/img.png',
          metadataStatus: 'FETCHED',
        })
      );
      mockPrisma.savedLink.update.mockResolvedValue(createMockLink());

      await savedLinkService.updateSavedLink(USER_ID, 1, {
        url: 'https://new.example.com/other',
      });

      expect(mockPrisma.savedLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          url: 'https://new.example.com/other',
          metadataStatus: 'PENDING',
          title: null,
          description: null,
          siteName: null,
          imageUrl: null,
        }),
      });
    });

    it('strips tracking params on update too', async () => {
      mockPrisma.savedLink.findFirst.mockResolvedValue(createMockLink());
      mockPrisma.savedLink.update.mockResolvedValue(createMockLink());

      await savedLinkService.updateSavedLink(USER_ID, 1, {
        url: 'https://new.example.com/x?utm_campaign=spring',
      });

      expect(mockPrisma.savedLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ url: 'https://new.example.com/x' }),
      });
    });
  });

  describe('deleteSavedLink', () => {
    it('SL-011: removes entity links before deleting', async () => {
      mockPrisma.savedLink.findFirst.mockResolvedValue(
        createMockLink({ tripId: 42 })
      );
      mockPrisma.savedLink.delete.mockResolvedValue(createMockLink());

      await savedLinkService.deleteSavedLink(USER_ID, 1);

      expect(mockCleanupEntityLinks).toHaveBeenCalledWith(42, 'SAVED_LINK', 1);
      expect(mockPrisma.savedLink.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('skips link cleanup for an inbox link with no trip', async () => {
      mockPrisma.savedLink.findFirst.mockResolvedValue(createMockLink());
      mockPrisma.savedLink.delete.mockResolvedValue(createMockLink());

      await savedLinkService.deleteSavedLink(USER_ID, 1);

      expect(mockCleanupEntityLinks).not.toHaveBeenCalled();
    });
  });

  describe('bulkDeleteSavedLinks', () => {
    /** Runs the transaction callback against a stubbed tx client. */
    function stubTransaction(deletedCount: number) {
      const txDeleteMany = jest.fn().mockResolvedValue({ count: deletedCount });
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({ savedLink: { deleteMany: txDeleteMany } })
      );
      return txDeleteMany;
    }

    it('SL-015: cleans up entity links for assigned links only', async () => {
      mockPrisma.savedLink.findMany.mockResolvedValue([
        { id: 1, tripId: null },
        { id: 2, tripId: 42 },
      ]);
      const txDeleteMany = stubTransaction(2);

      const result = await savedLinkService.bulkDeleteSavedLinks(USER_ID, {
        ids: [1, 2],
      });

      expect(mockCleanupEntityLinks).toHaveBeenCalledTimes(1);
      expect(mockCleanupEntityLinks).toHaveBeenCalledWith(
        42,
        'SAVED_LINK',
        2,
        expect.anything()
      );
      expect(txDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] }, userId: USER_ID },
      });
      expect(result).toEqual({ success: true, deletedCount: 2 });
    });

    it('deduplicates repeated ids before counting matches', async () => {
      mockPrisma.savedLink.findMany.mockResolvedValue([{ id: 1, tripId: null }]);
      stubTransaction(1);

      await expect(
        savedLinkService.bulkDeleteSavedLinks(USER_ID, { ids: [1, 1] })
      ).resolves.toEqual({ success: true, deletedCount: 1 });
    });

    it("SL-016: 404s when an id isn't the user's, deleting nothing", async () => {
      // Only one of the two requested ids comes back owner-scoped.
      mockPrisma.savedLink.findMany.mockResolvedValue([{ id: 1, tripId: null }]);

      await expect(
        savedLinkService.bulkDeleteSavedLinks(USER_ID, { ids: [1, 999] })
      ).rejects.toThrow(AppError);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockCleanupEntityLinks).not.toHaveBeenCalled();
    });
  });

  describe('deleteUnassignedSavedLinks', () => {
    it('SL-017: deletes only the caller\'s links with no trip', async () => {
      mockPrisma.savedLink.deleteMany.mockResolvedValue({ count: 3 });

      const result = await savedLinkService.deleteUnassignedSavedLinks(USER_ID);

      expect(mockPrisma.savedLink.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, tripId: null },
      });
      // Inbox links can't have entity links, so no cleanup is attempted.
      expect(mockCleanupEntityLinks).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, deletedCount: 3 });
    });
  });

  describe('ownership', () => {
    it("SL-012: 404s for another user's link", async () => {
      mockPrisma.savedLink.findFirst.mockResolvedValue(null);

      await expect(
        savedLinkService.updateSavedLink(USER_ID, 999, { notes: 'x' })
      ).rejects.toThrow("We couldn't find that saved link.");

      await expect(
        savedLinkService.deleteSavedLink(USER_ID, 999)
      ).rejects.toThrow("We couldn't find that saved link.");

      // Ownership is enforced in the query, not after the fact.
      expect(mockPrisma.savedLink.findFirst).toHaveBeenCalledWith({
        where: { id: 999, userId: USER_ID },
      });
    });
  });

  describe('populateMetadata', () => {
    it('SL-013a: writes FETCHED with scraped values on success', async () => {
      mockPrisma.savedLink.findUnique.mockResolvedValue(createMockLink());
      mockFetchMetadata.mockResolvedValue({
        title: 'Scraped Title',
        description: 'Scraped description',
        siteName: 'example.com',
        imageUrl: 'https://example.com/img.png',
      });

      await savedLinkService.populateMetadata(1);

      expect(mockPrisma.savedLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          title: 'Scraped Title',
          siteName: 'example.com',
          metadataStatus: 'FETCHED',
        }),
      });
    });

    it('SL-013b: keeps a user-supplied title over the scraped one', async () => {
      mockPrisma.savedLink.findUnique.mockResolvedValue(
        createMockLink({ title: 'My Own Title' })
      );
      mockFetchMetadata.mockResolvedValue({
        title: 'Scraped Title',
        description: null,
        siteName: null,
        imageUrl: null,
      });

      await savedLinkService.populateMetadata(1);

      expect(mockPrisma.savedLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ title: 'My Own Title' }),
      });
    });

    it('SL-013c: writes FAILED when metadata cannot be fetched', async () => {
      mockPrisma.savedLink.findUnique.mockResolvedValue(createMockLink());
      mockFetchMetadata.mockResolvedValue(null);

      await savedLinkService.populateMetadata(1);

      expect(mockPrisma.savedLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ metadataStatus: 'FAILED' }),
      });
    });

    it('SL-013d: swallows fetch errors so a dead URL keeps its row', async () => {
      mockPrisma.savedLink.findUnique.mockResolvedValue(createMockLink());
      mockFetchMetadata.mockRejectedValue(new Error('boom'));
      mockPrisma.savedLink.update.mockResolvedValue(createMockLink());

      await expect(savedLinkService.populateMetadata(1)).resolves.toBeUndefined();

      expect(mockPrisma.savedLink.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ metadataStatus: 'FAILED' }),
      });
    });
  });

  it('SL-014: counts unassigned inbox links', async () => {
    mockPrisma.savedLink.count.mockResolvedValue(3);

    const result = await savedLinkService.getInboxCount(USER_ID);

    expect(result).toEqual({ count: 3 });
    expect(mockPrisma.savedLink.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, tripId: null },
    });
  });
});
