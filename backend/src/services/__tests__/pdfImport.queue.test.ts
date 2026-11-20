/**
 * PDF import: the fair parse queue, cancel, restart recovery, and the reader's own LLM settings
 *
 * Test cases:
 * - PDFQ-001: While a PDF is being read, another user's upload waits in line and runs next
 * - PDFQ-002: A user cannot have two PDFs in the queue at once (409), and can again once it finishes
 * - PDFQ-003: An upload that fails before it is queued does not hold the user's place
 * - PDFQ-004: "Try again" (reparse) waits its turn; an import already in the queue cannot be reparsed
 * - PDFQ-005: Parsing uses the uploading user's LLM settings
 * - PDFQ-006: A stuck import is only reset well after the LLM timeout
 * - PDFQ-007: Cancelling the PDF being read aborts the LLM call and starts the next in line
 * - PDFQ-008: Cancelling a waiting PDF takes it out of line without touching the one being read
 * - PDFQ-009: A user on their own LLM server is neither blocked by nor blocks the shared one
 * - PDFQ-010: The parse uses the LLM config resolved when it was queued, even if Settings change
 * - PDFQ-011: Spelling variants of the shared server's URL wait in the same line
 * - PDFQ-012: Turns alternate between users: a quick re-upload goes to the back of the line
 * - PDFQ-013: getPdfImportById reports the queue position
 * - PDFQ-014: After a restart, waiting and mid-read imports are re-queued oldest first
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPdfImportCreate = jest.fn();
const mockPdfImportUpdate = jest.fn();
const mockPdfImportUpdateMany = jest.fn();
const mockPdfImportFindFirst = jest.fn();
const mockPdfImportFindMany = jest.fn();
const mockPendingDeleteMany = jest.fn();
const mockEntityLinkFindMany = jest.fn();
const mockPdfImportDelete = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    pdfImport: {
      create: (...args: unknown[]) => mockPdfImportCreate(...args),
      update: (...args: unknown[]) => mockPdfImportUpdate(...args),
      updateMany: (...args: unknown[]) => mockPdfImportUpdateMany(...args),
      findFirst: (...args: unknown[]) => mockPdfImportFindFirst(...args),
      findMany: (...args: unknown[]) => mockPdfImportFindMany(...args),
    },
    pendingEntity: {
      deleteMany: (...args: unknown[]) => mockPendingDeleteMany(...args),
    },
    entityLink: {
      findMany: (...args: unknown[]) => mockEntityLinkFindMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ pdfImport: { delete: (...args: unknown[]) => mockPdfImportDelete(...args) } }),
  },
}));

jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/** The LLM server each user's PDFs go to; the instance-wide one unless overridden. */
type LlmConfig = { baseUrl: string; apiKey: string | null; model: string; maxTokens: number };
const llmAt = (baseUrl: string): LlmConfig => ({ baseUrl, apiKey: null, model: 'llama3.1', maxTokens: 2048 });
const SHARED_LLM = llmAt('http://ollama.lan:11434/v1');
const mockResolveLlm = jest.fn<(userId?: number) => Promise<LlmConfig | null>>();
type ParseOpts = { userId?: number; llmConfig?: LlmConfig; signal?: AbortSignal };
const mockExtractText = jest.fn<(path: string) => Promise<string>>();
const mockParseDocument = jest.fn<
  (text: string, filename: string, opts?: ParseOpts) => Promise<{ entities: [] }>
>();

jest.mock('../pdfParser.service', () => ({
  pdfParserService: {
    resolveLlm: (userId?: number) => mockResolveLlm(userId),
    extractText: (path: string) => mockExtractText(path),
    parseDocument: (text: string, filename: string, opts?: ParseOpts) =>
      mockParseDocument(text, filename, opts),
  },
}));

import { pdfImportService, isPdfParsingBusy } from '../pdfImport.service';
import { pdfParseQueue, PDF_USER_BUSY_MESSAGE } from '../pdfParseQueue';
import { config } from '../../config';

const pdfFile = (name = 'hotel.pdf') => ({
  originalname: name,
  buffer: Buffer.from('%PDF-1.4 test'),
  size: 13,
  mimetype: 'application/pdf',
});

/**
 * Parses that only finish when the test says so, standing in for a slow local
 * model. Each call to the parser takes the next one; finish them by user id.
 */
function holdParses() {
  const pending = new Map<number, () => void>();
  mockParseDocument.mockImplementation(
    (_text, _filename, opts) =>
      new Promise((resolve, reject) => {
        pending.set(opts?.userId ?? -1, () => resolve({ entities: [] }));
        opts?.signal?.addEventListener('abort', () => reject(new Error('canceled')));
      })
  );
  return {
    finish: (userId: number) => {
      const done = pending.get(userId);
      if (!done) throw new Error(`no parse running for user ${userId}`);
      pending.delete(userId);
      done();
    },
    usersStarted: () => mockParseDocument.mock.calls.map((call) => call[2]?.userId),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const settle = async () => {
  for (let i = 0; i < 10; i++) await flush();
};

async function waitUntilIdle() {
  for (let i = 0; i < 40 && isPdfParsingBusy(); i++) await flush();
  expect(isPdfParsingBusy()).toBe(false);
}

let nextId = 1;

beforeEach(async () => {
  jest.clearAllMocks();
  pdfParseQueue.reset();
  mockResolveLlm.mockResolvedValue(SHARED_LLM);
  mockExtractText.mockResolvedValue('Booking text');
  mockParseDocument.mockResolvedValue({ entities: [] });
  mockPdfImportCreate.mockImplementation(async (args) => ({
    id: nextId++,
    ...((args as { data: object }).data),
  }));
  mockPdfImportUpdate.mockResolvedValue({});
  mockPdfImportUpdateMany.mockResolvedValue({ count: 1 });
  mockPendingDeleteMany.mockResolvedValue({ count: 0 });
  mockEntityLinkFindMany.mockResolvedValue([]);
  mockPdfImportDelete.mockResolvedValue({});
});

describe('PDF parse queue', () => {
  it('PDFQ-001: another user waits in line while a PDF is being read, then runs next', async () => {
    const parses = holdParses();
    const first = await pdfImportService.uploadAndProcess(1, pdfFile('a.pdf'));
    await settle();
    expect(first.queuePosition).toBe(0);

    const second = await pdfImportService.uploadAndProcess(2, pdfFile('b.pdf'));
    expect(second.queuePosition).toBe(1);
    await settle();
    expect(parses.usersStarted()).toEqual([1]); // only one at a time on the machine

    parses.finish(1);
    await settle();
    expect(parses.usersStarted()).toEqual([1, 2]);

    parses.finish(2);
    await waitUntilIdle();
  });

  it('PDFQ-002: one PDF per user in the queue at a time', async () => {
    const parses = holdParses();
    await pdfImportService.uploadAndProcess(1, pdfFile());
    await settle();

    await expect(pdfImportService.uploadAndProcess(1, pdfFile())).rejects.toMatchObject({
      statusCode: 409,
      message: PDF_USER_BUSY_MESSAGE,
    });
    expect(mockPdfImportCreate).toHaveBeenCalledTimes(1);

    parses.finish(1);
    await waitUntilIdle();
    await expect(pdfImportService.uploadAndProcess(1, pdfFile())).resolves.toBeDefined();
    await settle();
    parses.finish(1);
    await waitUntilIdle();
  });

  it('PDFQ-003: an upload rejected before it is queued does not hold the place', async () => {
    const notAPdf = { ...pdfFile(), buffer: Buffer.from('hello') };
    await expect(pdfImportService.uploadAndProcess(1, notAPdf)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(pdfParseQueue.hasUser(1)).toBe(false);

    mockResolveLlm.mockResolvedValueOnce(null);
    await expect(pdfImportService.uploadAndProcess(1, pdfFile())).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(pdfParseQueue.hasUser(1)).toBe(false);
  });

  it('PDFQ-004: reparse waits its turn; a queued import cannot be reparsed', async () => {
    const parses = holdParses();
    await pdfImportService.uploadAndProcess(1, pdfFile());
    await settle();

    // User 2 retries a failed import while user 1's PDF is being read: it queues.
    mockPdfImportFindFirst.mockResolvedValue({
      id: 99,
      userId: 2,
      status: 'PARSE_FAILED',
      storedPath: 'pdfs/2/old.pdf',
      originalName: 'old.pdf',
    });
    await pdfImportService.reparseImport(2, 99);
    expect(mockPdfImportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99 }, data: expect.objectContaining({ status: 'UPLOADED' }) })
    );
    expect(pdfParseQueue.position(99)).toBe(1);

    // Asking again while it waits is refused.
    mockPdfImportFindFirst.mockResolvedValue({ id: 99, userId: 2, status: 'UPLOADED', storedPath: 'pdfs/2/old.pdf', originalName: 'old.pdf' });
    await expect(pdfImportService.reparseImport(2, 99)).rejects.toMatchObject({ statusCode: 409 });

    parses.finish(1);
    await settle();
    expect(mockParseDocument).toHaveBeenLastCalledWith('Booking text', 'old.pdf', {
      userId: 2,
      llmConfig: SHARED_LLM,
      signal: expect.any(AbortSignal),
    });
    parses.finish(2);
    await waitUntilIdle();
  });

  it("PDFQ-005: parses with the uploading user's LLM settings", async () => {
    await pdfImportService.uploadAndProcess(42, pdfFile());
    await waitUntilIdle();
    expect(mockParseDocument).toHaveBeenCalledWith('Booking text', 'hotel.pdf', {
      userId: 42,
      llmConfig: SHARED_LLM,
      signal: expect.any(AbortSignal),
    });
  });

  it('PDFQ-007: cancelling the PDF being read aborts the LLM call and starts the next', async () => {
    const parses = holdParses();
    const first = await pdfImportService.uploadAndProcess(1, pdfFile('a.pdf'));
    await pdfImportService.uploadAndProcess(2, pdfFile('b.pdf'));
    await settle();
    const firstSignal = mockParseDocument.mock.calls[0][2]?.signal;

    mockPdfImportFindFirst.mockResolvedValue({ id: first.id, userId: 1, storedPath: 'pdfs/1/a.pdf' });
    await pdfImportService.deletePdfImport(1, first.id);
    await settle();

    expect(firstSignal?.aborted).toBe(true);
    expect(mockPdfImportDelete).toHaveBeenCalledWith({ where: { id: first.id } });
    // The cancelled read writes no "failed" status over the import being deleted.
    expect(mockPdfImportUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: first.id } })
    );
    expect(parses.usersStarted()).toEqual([1, 2]);
    expect(pdfParseQueue.hasUser(1)).toBe(false);

    parses.finish(2);
    await waitUntilIdle();
  });

  it('PDFQ-008: cancelling a waiting PDF takes it out of line only', async () => {
    const parses = holdParses();
    await pdfImportService.uploadAndProcess(1, pdfFile('a.pdf'));
    const waiting = await pdfImportService.uploadAndProcess(2, pdfFile('b.pdf'));
    await settle();

    mockPdfImportFindFirst.mockResolvedValue({ id: waiting.id, userId: 2, storedPath: 'pdfs/2/b.pdf' });
    await pdfImportService.deletePdfImport(2, waiting.id);

    expect(pdfParseQueue.position(waiting.id)).toBeNull();
    expect(pdfParseQueue.hasUser(2)).toBe(false);
    expect(mockParseDocument.mock.calls[0][2]?.signal?.aborted).toBe(false);

    parses.finish(1);
    await waitUntilIdle();
    expect(parses.usersStarted()).toEqual([1]); // user 2's never ran
  });

  it('PDFQ-009: a user on their own LLM server neither blocks nor is blocked by the shared one', async () => {
    mockResolveLlm.mockImplementation(async (userId) =>
      userId === 9 ? llmAt('https://my-own-llm.example/v1') : SHARED_LLM
    );
    const parses = holdParses();
    const own = await pdfImportService.uploadAndProcess(9, pdfFile());
    const shared = await pdfImportService.uploadAndProcess(1, pdfFile());
    await settle();

    expect(own.queuePosition).toBe(0);
    expect(shared.queuePosition).toBe(0);
    expect(isPdfParsingBusy('my-own-llm.example')).toBe(true);
    expect(isPdfParsingBusy('ollama.lan')).toBe(true);

    parses.finish(9);
    parses.finish(1);
    await waitUntilIdle();
  });

  it('PDFQ-010: the parse goes where it was queued for, even after a Settings change', async () => {
    const parses = holdParses();
    await pdfImportService.uploadAndProcess(1, pdfFile());
    await pdfImportService.uploadAndProcess(5, pdfFile()); // waits behind user 1
    await settle();

    // User 5 now points Settings elsewhere; their queued parse must not follow.
    mockResolveLlm.mockResolvedValue(llmAt('https://elsewhere.example/v1'));
    parses.finish(1);
    await settle();

    expect(mockParseDocument).toHaveBeenLastCalledWith(
      'Booking text',
      'hotel.pdf',
      expect.objectContaining({ userId: 5, llmConfig: SHARED_LLM })
    );
    parses.finish(5);
    await waitUntilIdle();
  });

  it("PDFQ-011: spelling variants of the shared server's URL wait in the same line", async () => {
    const parses = holdParses();
    await pdfImportService.uploadAndProcess(1, pdfFile());
    await settle();

    const variants = [
      'http://OLLAMA.LAN:11434/v1/',
      'http://ollama.lan:8080/v1',
      'http://user:pw@ollama.lan:11434/v1?x=1#y',
      'https://ollama.lan./api/v1',
    ];
    for (const [index, variant] of variants.entries()) {
      mockResolveLlm.mockResolvedValueOnce(llmAt(variant));
      const queued = await pdfImportService.uploadAndProcess(10 + index, pdfFile());
      expect(queued.queuePosition).toBe(index + 1);
    }
    expect(parses.usersStarted()).toEqual([1]);

    for (const user of [1, 10, 11, 12, 13]) {
      await settle();
      parses.finish(user);
    }
    await waitUntilIdle();
  });

  it('PDFQ-012: turns alternate between users; a re-upload goes to the back of the line', async () => {
    const parses = holdParses();
    await pdfImportService.uploadAndProcess(1, pdfFile()); // A reads
    await pdfImportService.uploadAndProcess(2, pdfFile()); // B waits
    await pdfImportService.uploadAndProcess(3, pdfFile()); // C waits
    await settle();

    parses.finish(1);
    await settle();
    // A uploads again straight away: behind C, not ahead of them.
    const again = await pdfImportService.uploadAndProcess(1, pdfFile());
    expect(again.queuePosition).toBe(2);

    for (const user of [2, 3, 1]) {
      await settle();
      parses.finish(user);
    }
    await waitUntilIdle();
    expect(parses.usersStarted()).toEqual([1, 2, 3, 1]);
  });

  it('PDFQ-013: getPdfImportById reports where the import is in the queue', async () => {
    const parses = holdParses();
    const first = await pdfImportService.uploadAndProcess(1, pdfFile());
    const second = await pdfImportService.uploadAndProcess(2, pdfFile());
    await settle();

    mockPdfImportFindFirst.mockResolvedValueOnce({ id: first.id, status: 'PARSING' });
    expect(await pdfImportService.getPdfImportById(1, first.id)).toMatchObject({ queuePosition: 0 });
    mockPdfImportFindFirst.mockResolvedValueOnce({ id: second.id, status: 'UPLOADED' });
    expect(await pdfImportService.getPdfImportById(2, second.id)).toMatchObject({ queuePosition: 1 });
    mockPdfImportFindFirst.mockResolvedValueOnce({ id: 555, status: 'PARSED' });
    expect(await pdfImportService.getPdfImportById(1, 555)).toMatchObject({ queuePosition: null });

    parses.finish(1);
    await settle();
    parses.finish(2);
    await waitUntilIdle();
  });

  it('PDFQ-014: after a restart, waiting and mid-read imports are re-queued oldest first', async () => {
    const parses = holdParses();
    mockPdfImportFindMany.mockResolvedValueOnce([
      { id: 201, userId: 1, storedPath: 'pdfs/1/a.pdf', originalName: 'a.pdf' }, // was PARSING
      { id: 202, userId: 2, storedPath: 'pdfs/2/b.pdf', originalName: 'b.pdf' }, // was UPLOADED
      { id: 203, userId: 1, storedPath: 'pdfs/1/c.pdf', originalName: 'c.pdf' }, // user 1 again
    ]);

    expect(await pdfImportService.requeueAfterRestart()).toBe(2);
    expect(mockPdfImportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['UPLOADED', 'PARSING'] } },
        orderBy: { createdAt: 'asc' },
      })
    );
    expect(pdfParseQueue.position(201)).toBe(0);
    expect(pdfParseQueue.position(202)).toBe(1);
    // A second one for the same user is failed so "Try again" can re-queue it.
    expect(mockPdfImportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 203 },
        data: expect.objectContaining({ status: 'PARSE_FAILED' }),
      })
    );

    await settle();
    parses.finish(1);
    await settle();
    parses.finish(2);
    await waitUntilIdle();
    expect(parses.usersStarted()).toEqual([1, 2]);
  });
});

describe('resetStaleParsing', () => {
  it('PDFQ-006: only resets imports older than twice the LLM timeout (at least 10 minutes)', async () => {
    mockPdfImportFindMany.mockResolvedValue([]);
    const before = Date.now();

    await pdfImportService.resetStaleParsing();

    const where = (mockPdfImportFindMany.mock.calls[0][0] as {
      where: { updatedAt: { lt: Date } };
    }).where;
    const ageMs = before - where.updatedAt.lt.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(2 * config.llm.timeoutMs - 1000);
    expect(ageMs).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
  });
});
