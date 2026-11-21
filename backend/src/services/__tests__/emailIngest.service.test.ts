/**
 * EmailIngest Service Tests
 *
 * imapflow and mailparser are mocked out entirely so the message-handling logic
 * is what gets exercised, not the IMAP protocol.
 *
 * Test cases:
 * - EI-001: isConfigured reflects IMAP credentials
 * - EI-002: pollOnce is a no-op when unconfigured
 * - EI-003: Accepts a message whose From matches a user's account email
 * - EI-004: Accepts a message from a configured trusted alias
 * - EI-005: Rejects an unrecognised sender, creates no links, still archives
 * - EI-006: A re-delivered message is archived without reprocessing
 * - EI-007: NO_LINKS when the body yields nothing usable
 * - EI-008: One SSRF-rejected URL does not abort the rest of the message
 * - EI-009: Processing failure is recorded as FAILED and still archived
 * - EI-010: Archiving uses messageMove, never \Deleted + expunge
 * - EI-011: Sweeper resets stale PROCESSING rows to FAILED
 */

const mockPrisma = {
  emailIngest: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
  userPreferences: {
    findMany: jest.fn(),
  },
};

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: mockPrisma,
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mutable so individual tests can flip credentials on and off.
const mockConfig = {
  imap: {
    host: 'imap.gmail.com',
    port: 993,
    user: 'travellifecc@gmail.com',
    password: 'app-password',
    archiveFolder: '[Gmail]/All Mail',
    pollCron: '*/5 * * * *',
    maxLinksPerMessage: 20,
  },
};
jest.mock('../../config', () => ({
  __esModule: true,
  default: mockConfig,
  config: mockConfig,
}));

const mockCreateFromEmail = jest.fn();
jest.mock('../savedLink.service', () => ({
  __esModule: true,
  default: {
    createFromEmail: (...args: unknown[]) => mockCreateFromEmail(...args),
  },
}));

const mockExtractLinks = jest.fn();
jest.mock('../emailLinkExtractor.service', () => ({
  extractLinksFromEmail: (...args: unknown[]) => mockExtractLinks(...args),
}));

// --- IMAP client double -------------------------------------------------------
const mockMessageMove = jest.fn();
const mockFetchOne = jest.fn();
const mockLockRelease = jest.fn();
const mockConnect = jest.fn();
const mockLogout = jest.fn();
let mockUidsInInbox: number[] = [];

jest.mock('imapflow', () => ({
  ImapFlow: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    logout: mockLogout,
    getMailboxLock: jest.fn().mockResolvedValue({ release: mockLockRelease }),
    // pollOnce iterates this to collect UIDs.
    fetch: function* () {
      for (const uid of mockUidsInInbox) yield { uid };
    },
    fetchOne: mockFetchOne,
    messageMove: mockMessageMove,
  })),
}));

const mockSimpleParser = jest.fn();
jest.mock('mailparser', () => ({
  simpleParser: (...args: unknown[]) => mockSimpleParser(...args),
}));

import emailIngestService from '../emailIngest.service';

const USER_ID = 7;

/** Minimal ParsedMail shape for the fields the service reads. */
function makeParsed(overrides: Record<string, unknown> = {}) {
  return {
    messageId: '<abc123@mail.example.com>',
    subject: 'Great ramen spot',
    date: new Date('2026-07-25T12:00:00Z'),
    from: { value: [{ address: 'dsbaciga@gmail.com' }] },
    to: { value: [{ address: 'travellifecc@gmail.com' }] },
    html: '<a href="https://example.com/ramen">Ramen</a>',
    text: null,
    ...overrides,
  };
}

/** Drives one message through pollOnce. */
function stageMessage(parsed: Record<string, unknown>) {
  mockUidsInInbox = [101];
  mockFetchOne.mockResolvedValue({ source: Buffer.from('raw') });
  mockSimpleParser.mockResolvedValue(parsed);
}

describe('EmailIngestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUidsInInbox = [];

    mockConfig.imap.user = 'travellifecc@gmail.com';
    mockConfig.imap.password = 'app-password';

    mockPrisma.emailIngest.findUnique.mockResolvedValue(null);
    mockPrisma.emailIngest.create.mockResolvedValue({ id: 1 });
    mockPrisma.emailIngest.update.mockResolvedValue({ id: 1 });
    mockPrisma.user.findFirst.mockResolvedValue({ id: USER_ID });
    mockPrisma.userPreferences.findMany.mockResolvedValue([]);
    mockExtractLinks.mockReturnValue(['https://example.com/ramen']);
    mockCreateFromEmail.mockResolvedValue({ id: 55 });
    mockConnect.mockResolvedValue(undefined);
    mockLogout.mockResolvedValue(undefined);
    mockMessageMove.mockResolvedValue(undefined);
  });

  describe('configuration', () => {
    it('EI-001: reflects IMAP credentials', () => {
      expect(emailIngestService.isConfigured()).toBe(true);

      mockConfig.imap.password = '';
      expect(emailIngestService.isConfigured()).toBe(false);
    });

    it('EI-002: pollOnce is a no-op when unconfigured', async () => {
      mockConfig.imap.user = '';

      const handled = await emailIngestService.pollOnce();

      expect(handled).toBe(0);
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  describe('sender resolution', () => {
    it('EI-003: accepts a From matching a account email', async () => {
      stageMessage(makeParsed());

      await emailIngestService.pollOnce();

      expect(mockCreateFromEmail).toHaveBeenCalledWith(
        USER_ID,
        'https://example.com/ramen',
        1
      );
      expect(mockPrisma.emailIngest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'PROCESSED',
          userId: USER_ID,
          linkCount: 1,
        }),
      });
    });

    it('EI-004: accepts a configured trusted alias', async () => {
      // No user owns this address directly...
      mockPrisma.user.findFirst.mockResolvedValue(null);
      // ...but one lists it as a trusted forwarding address.
      mockPrisma.userPreferences.findMany.mockResolvedValue([
        { userId: USER_ID, linkIngestSenders: ['work@company.com'] },
      ]);

      stageMessage(
        makeParsed({ from: { value: [{ address: 'Work@Company.com' }] } })
      );

      await emailIngestService.pollOnce();

      expect(mockCreateFromEmail).toHaveBeenCalledWith(
        USER_ID,
        'https://example.com/ramen',
        1
      );
    });

    it('EI-005: rejects an unknown sender but still archives', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.userPreferences.findMany.mockResolvedValue([
        { userId: USER_ID, linkIngestSenders: [] },
      ]);

      stageMessage(
        makeParsed({ from: { value: [{ address: 'stranger@evil.com' }] } })
      );

      await emailIngestService.pollOnce();

      expect(mockCreateFromEmail).not.toHaveBeenCalled();
      expect(mockPrisma.emailIngest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'REJECTED_SENDER' }),
      });
      // Archived regardless, so it can't be retried forever.
      expect(mockMessageMove).toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    it('EI-006: a re-delivered message is archived without reprocessing', async () => {
      mockPrisma.emailIngest.findUnique.mockResolvedValue({ id: 99 });
      stageMessage(makeParsed());

      await emailIngestService.pollOnce();

      expect(mockPrisma.emailIngest.create).not.toHaveBeenCalled();
      expect(mockCreateFromEmail).not.toHaveBeenCalled();
      expect(mockMessageMove).toHaveBeenCalled();
    });

    it('EI-007: records NO_LINKS when nothing usable is found', async () => {
      mockExtractLinks.mockReturnValue([]);
      stageMessage(makeParsed());

      await emailIngestService.pollOnce();

      expect(mockCreateFromEmail).not.toHaveBeenCalled();
      expect(mockPrisma.emailIngest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'NO_LINKS' }),
      });
    });

    it('EI-008: one rejected URL does not abort the rest of the message', async () => {
      mockExtractLinks.mockReturnValue([
        'https://example.com/a',
        'http://169.254.169.254/meta',
        'https://example.com/c',
      ]);
      // createFromEmail returns null for URLs that fail SSRF validation.
      mockCreateFromEmail
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 3 });

      stageMessage(makeParsed());

      await emailIngestService.pollOnce();

      expect(mockCreateFromEmail).toHaveBeenCalledTimes(3);
      expect(mockPrisma.emailIngest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'PROCESSED', linkCount: 2 }),
      });
    });

    it('EI-009: records FAILED and still archives on a processing error', async () => {
      mockCreateFromEmail.mockRejectedValue(new Error('database exploded'));
      stageMessage(makeParsed());

      await emailIngestService.pollOnce();

      expect(mockPrisma.emailIngest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'database exploded',
        }),
      });
      expect(mockMessageMove).toHaveBeenCalled();
    });

    it('EI-010: archives with messageMove, never \\Deleted + expunge', async () => {
      stageMessage(makeParsed());

      await emailIngestService.pollOnce();

      // Gmail's handling of \Deleted depends on a per-account Auto-Expunge
      // preference, so an explicit move is the only deterministic archive.
      expect(mockMessageMove).toHaveBeenCalledWith(
        '101',
        '[Gmail]/All Mail',
        { uid: true }
      );
    });

    it('falls back to a generated id when Message-ID is absent', async () => {
      stageMessage(makeParsed({ messageId: undefined }));

      await emailIngestService.pollOnce();

      expect(mockPrisma.emailIngest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: expect.stringContaining('generated:101:'),
        }),
      });
    });
  });

  describe('resetStaleProcessing', () => {
    it('EI-011: resets stale PROCESSING rows to FAILED', async () => {
      mockPrisma.emailIngest.findMany.mockResolvedValue([
        { id: 5, messageId: '<stuck@example.com>' },
      ]);

      await emailIngestService.resetStaleProcessing();

      expect(mockPrisma.emailIngest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [5] }, status: 'PROCESSING' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Processing timed out and was reset on server restart',
        }),
      });
    });

    it('does nothing when there is nothing stale', async () => {
      mockPrisma.emailIngest.findMany.mockResolvedValue([]);

      await emailIngestService.resetStaleProcessing();

      expect(mockPrisma.emailIngest.updateMany).not.toHaveBeenCalled();
    });
  });
});
