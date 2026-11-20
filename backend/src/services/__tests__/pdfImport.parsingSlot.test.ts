/**
 * PDF import: one document read at a time, and the reader's own LLM settings
 *
 * Test cases:
 * - PDFQ-001: A second upload is refused with 409 while the first is being read
 * - PDFQ-002: The slot frees when parsing finishes, so the next upload goes through
 * - PDFQ-003: An upload that fails before parsing starts does not hold the slot
 * - PDFQ-004: "Try again" (reparse) also waits its turn
 * - PDFQ-005: Parsing uses the uploading user's LLM settings
 * - PDFQ-006: A stuck import is only reset well after the LLM timeout
 * - PDFQ-007: Deleting an import mid-parse aborts the LLM request and frees the slot
 * - PDFQ-008: A user with their own LLM endpoint is not blocked by the shared one (and vice versa)
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
const SHARED_ENDPOINT = 'http://ollama.lan:11434/v1';
const mockEndpointKey = jest.fn<(userId?: number) => Promise<string | null>>();
const mockExtractText = jest.fn<(path: string) => Promise<string>>();
const mockParseDocument = jest.fn<
  (text: string, filename: string, userId?: number, signal?: AbortSignal) => Promise<{ entities: [] }>
>();

jest.mock('../pdfParser.service', () => ({
  pdfParserService: {
    endpointKey: (userId?: number) => mockEndpointKey(userId),
    extractText: (path: string) => mockExtractText(path),
    parseDocument: (text: string, filename: string, userId?: number, signal?: AbortSignal) =>
      signal === undefined
        ? mockParseDocument(text, filename, userId)
        : mockParseDocument(text, filename, userId, signal),
  },
}));

import { pdfImportService, isPdfParsingBusy, PDF_PARSE_BUSY_MESSAGE } from '../pdfImport.service';
import { config } from '../../config';

const pdfFile = () => ({
  originalname: 'hotel.pdf',
  buffer: Buffer.from('%PDF-1.4 test'),
  size: 13,
  mimetype: 'application/pdf',
});

/** A parse the test finishes by hand, standing in for a slow local model. */
function holdParsing(): () => void {
  let finish: (value: { entities: [] }) => void = () => {};
  mockParseDocument.mockImplementationOnce(
    () => new Promise((resolve) => { finish = resolve; })
  );
  return () => finish({ entities: [] });
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function waitUntilIdle() {
  for (let i = 0; i < 20 && isPdfParsingBusy(); i++) await flush();
  expect(isPdfParsingBusy()).toBe(false);
}

describe('PDF parsing slot', () => {
  let nextId = 1;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEndpointKey.mockResolvedValue(SHARED_ENDPOINT);
    mockExtractText.mockResolvedValue('Booking text');
    mockParseDocument.mockResolvedValue({ entities: [] });
    mockPdfImportCreate.mockImplementation(async () => ({ id: nextId++ }));
    mockPdfImportUpdate.mockResolvedValue({});
    mockPdfImportUpdateMany.mockResolvedValue({ count: 1 });
    mockPendingDeleteMany.mockResolvedValue({ count: 0 });
    await waitUntilIdle();
  });

  it('PDFQ-001: refuses a second upload while the first is being read', async () => {
    const finish = holdParsing();
    await pdfImportService.uploadAndProcess(1, pdfFile());
    expect(isPdfParsingBusy()).toBe(true);

    // A different user on the same LLM server is refused too: the hardware is shared.
    await expect(pdfImportService.uploadAndProcess(2, pdfFile())).rejects.toMatchObject({
      statusCode: 409,
      message: PDF_PARSE_BUSY_MESSAGE,
    });
    expect(mockPdfImportCreate).toHaveBeenCalledTimes(1);

    finish();
    await waitUntilIdle();
  });

  it('PDFQ-002: frees the slot when parsing finishes', async () => {
    const finish = holdParsing();
    await pdfImportService.uploadAndProcess(1, pdfFile());
    finish();
    await waitUntilIdle();

    await expect(pdfImportService.uploadAndProcess(1, pdfFile())).resolves.toBeDefined();
    await waitUntilIdle();
  });

  it('PDFQ-003: an upload rejected before parsing does not hold the slot', async () => {
    const notAPdf = { ...pdfFile(), buffer: Buffer.from('hello') };
    await expect(pdfImportService.uploadAndProcess(1, notAPdf)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(isPdfParsingBusy()).toBe(false);

    mockEndpointKey.mockResolvedValueOnce(null);
    await expect(pdfImportService.uploadAndProcess(1, pdfFile())).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(isPdfParsingBusy()).toBe(false);
  });

  it('PDFQ-004: reparse waits its turn and frees the slot afterwards', async () => {
    const finish = holdParsing();
    await pdfImportService.uploadAndProcess(1, pdfFile());

    mockPdfImportFindFirst.mockResolvedValue({
      id: 99,
      userId: 1,
      status: 'PARSE_FAILED',
      storedPath: 'pdfs/1/old.pdf',
      originalName: 'old.pdf',
    });
    await expect(pdfImportService.reparseImport(1, 99)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPendingDeleteMany).not.toHaveBeenCalled();

    finish();
    await waitUntilIdle();

    await pdfImportService.reparseImport(1, 99);
    await waitUntilIdle();
    expect(mockParseDocument).toHaveBeenLastCalledWith('Booking text', 'old.pdf', 1, expect.any(AbortSignal));
  });

  it('PDFQ-008: a user on their own LLM server neither blocks nor is blocked by the shared one', async () => {
    // User 9 pointed Settings at their own (slow, possibly hostile) server.
    mockEndpointKey.mockImplementation(async (userId) =>
      userId === 9 ? 'https://my-own-llm.example/v1' : SHARED_ENDPOINT
    );
    const finishOwn = holdParsing();
    await pdfImportService.uploadAndProcess(9, pdfFile());
    expect(isPdfParsingBusy('https://my-own-llm.example/v1')).toBe(true);

    // Everyone else can still use the shared server...
    const finishShared = holdParsing();
    await expect(pdfImportService.uploadAndProcess(1, pdfFile())).resolves.toBeDefined();
    // ...and user 9 still gets only one at a time on their own server.
    await expect(pdfImportService.uploadAndProcess(9, pdfFile())).rejects.toMatchObject({
      statusCode: 409,
    });

    finishOwn();
    finishShared();
    await waitUntilIdle();
  });

  it("PDFQ-005: parses with the uploading user's LLM settings", async () => {
    await pdfImportService.uploadAndProcess(42, pdfFile());
    await waitUntilIdle();
    expect(mockParseDocument).toHaveBeenCalledWith('Booking text', 'hotel.pdf', 42, expect.any(AbortSignal));
  });
});

describe('cancelling', () => {
  it('PDFQ-007: deleting an import mid-parse aborts the LLM call and frees the slot', async () => {
    jest.clearAllMocks();
    mockEndpointKey.mockResolvedValue(SHARED_ENDPOINT);
    mockExtractText.mockResolvedValue('Booking text');
    mockPdfImportCreate.mockResolvedValue({ id: 500 });
    mockPdfImportUpdateMany.mockResolvedValue({ count: 1 });
    mockEntityLinkFindMany.mockResolvedValue([]);
    mockPdfImportDelete.mockResolvedValue({});

    // A slow model that only stops when its request is aborted.
    let seenSignal: AbortSignal | undefined;
    mockParseDocument.mockImplementationOnce((_t, _f, _u, signal) => {
      seenSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('canceled')));
      });
    });

    await pdfImportService.uploadAndProcess(1, pdfFile());
    await flush();
    expect(isPdfParsingBusy()).toBe(true);

    mockPdfImportFindFirst.mockResolvedValue({ id: 500, userId: 1, storedPath: 'pdfs/1/x.pdf' });
    await pdfImportService.deletePdfImport(1, 500);

    expect(seenSignal?.aborted).toBe(true);
    await waitUntilIdle();
    expect(mockPdfImportDelete).toHaveBeenCalledWith({ where: { id: 500 } });
    // No "failed" status written over the import being deleted.
    expect(mockPdfImportUpdate).not.toHaveBeenCalled();
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
