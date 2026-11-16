import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import sharp from 'sharp';
import path from 'path';

const mockVerifyAccess = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdateMany = jest.fn<(...args: unknown[]) => Promise<{ count: number }>>();
const mockUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDelete = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockMkdir = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockWriteFile = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockUnlink = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    mkdir: (...a: unknown[]) => mockMkdir(...a),
    writeFile: (...a: unknown[]) => mockWriteFile(...a),
    unlink: (...a: unknown[]) => mockUnlink(...a),
  },
}));

jest.mock('file-type', () => ({
  __esModule: true,
  fileTypeFromBuffer: async (buf: Buffer) =>
    buf.subarray(0, 4).toString('hex') === '89504e47' ? { mime: 'image/png', ext: 'png' } : undefined,
}), { virtual: true });

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    tripExpense: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
  },
}));

jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...a: unknown[]) => mockVerifyAccess(...a),
}));

jest.mock('../llm.service', () => ({ llmService: {}, LlmError: class extends Error {} }));
jest.mock('../exchangeRate.service', () => ({ __esModule: true, default: {}, normalizeCurrency: (c: string) => c }));

import receiptService, { deleteReceiptFiles } from '../expenseReceipt.service';
import expenseService from '../expense.service';

const RECEIPTS = path.join(process.cwd(), 'uploads', 'receipts');
const png = () =>
  sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#fff' } }).png().toBuffer();

const expenseRow = (receiptPath: string | null) => ({
  id: 5, tripId: 2, description: 'x', category: 'food', amount: 1, receiptPath,
});

describe('expense receipt storage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockVerifyAccess.mockResolvedValue({ trip: { userId: 1 } });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe('access', () => {
    it('requires edit access to attach and to remove (a viewer or stranger is refused)', async () => {
      mockVerifyAccess.mockRejectedValue(new Error('no edit access'));
      await expect(receiptService.attachReceipt(9, 2, 5, await png())).rejects.toThrow('no edit access');
      await expect(receiptService.removeReceipt(9, 2, 5)).rejects.toThrow('no edit access');
      expect(mockVerifyAccess).toHaveBeenNthCalledWith(1, 9, 2, 'edit');
      expect(mockVerifyAccess).toHaveBeenNthCalledWith(2, 9, 2, 'edit');
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it('404s for an expense that is not in the trip', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(receiptService.attachReceipt(1, 2, 5, await png())).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('upload guard', () => {
    beforeEach(() => mockFindFirst.mockResolvedValue(expenseRow(null)));

    it('rejects non-image bytes and missing files before anything is written', async () => {
      await expect(receiptService.attachReceipt(1, 2, 5, Buffer.from('<script>'))).rejects.toMatchObject({ statusCode: 400 });
      await expect(receiptService.attachReceipt(1, 2, 5, undefined)).rejects.toMatchObject({ statusCode: 400 });
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('rejects oversize uploads', async () => {
      await expect(receiptService.attachReceipt(1, 2, 5, Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toMatchObject({ statusCode: 413 });
    });
  });

  describe('attach / replace / remove', () => {
    it('stores a generated .jpg under uploads/receipts, 2400px at most, and records metadata', async () => {
      mockFindFirst.mockResolvedValueOnce(expenseRow(null)).mockResolvedValueOnce(expenseRow('/uploads/receipts/new.jpg'));
      await receiptService.attachReceipt(1, 2, 5, await png());

      const [file, bytes] = mockWriteFile.mock.calls[0] as [string, Buffer];
      expect(path.dirname(file)).toBe(RECEIPTS);
      expect(path.basename(file)).toMatch(/^[0-9a-f-]{36}\.jpg$/);
      const meta = await sharp(bytes).metadata();
      expect(meta.format).toBe('jpeg');
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2400);

      const data = (mockUpdateMany.mock.calls[0][0] as { data: Record<string, unknown> }).data;
      expect(data).toMatchObject({ receiptMimeType: 'image/jpeg', receiptSizeBytes: bytes.length });
      expect(data.receiptPath).toBe(`/uploads/receipts/${path.basename(file)}`);
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('deletes the old file when a receipt is replaced', async () => {
      mockFindFirst.mockResolvedValue(expenseRow('/uploads/receipts/old.jpg'));
      await receiptService.attachReceipt(1, 2, 5, await png());
      expect(mockUnlink).toHaveBeenCalledTimes(1);
      expect(mockUnlink).toHaveBeenCalledWith(path.join(RECEIPTS, 'old.jpg'));
    });

    it('deletes the new file, keeps the old one, when the row changed underneath', async () => {
      mockFindFirst.mockResolvedValue(expenseRow('/uploads/receipts/old.jpg'));
      mockUpdateMany.mockResolvedValue({ count: 0 });
      await expect(receiptService.attachReceipt(1, 2, 5, await png())).rejects.toMatchObject({ statusCode: 409 });
      const unlinked = mockUnlink.mock.calls.map((c) => path.basename(String(c[0])));
      expect(unlinked).toHaveLength(1);
      expect(unlinked[0]).not.toBe('old.jpg');
    });

    it('removing nulls the columns and deletes the file; a delete failure does not fail the request', async () => {
      mockFindFirst.mockResolvedValue(expenseRow('/uploads/receipts/old.jpg'));
      mockUpdate.mockResolvedValue(expenseRow(null));
      mockUnlink.mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }));
      await expect(receiptService.removeReceipt(1, 2, 5)).resolves.toBeDefined();
      expect((mockUpdate.mock.calls[0][0] as { data: unknown }).data).toEqual({
        receiptPath: null, receiptMimeType: null, receiptSizeBytes: null, receiptUploadedAt: null,
      });
      expect(mockUnlink).toHaveBeenCalledWith(path.join(RECEIPTS, 'old.jpg'));
    });
  });

  describe('deleteReceiptFiles', () => {
    it('refuses paths outside uploads/receipts', async () => {
      await deleteReceiptFiles([
        '/uploads/photos/a.jpg', '/uploads/receipts/../photos/a.jpg', '/etc/passwd', null, undefined,
      ]);
      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('expense deletion', () => {
    it('removes the receipt file of a deleted expense', async () => {
      mockFindFirst.mockResolvedValue(expenseRow('/uploads/receipts/gone.jpg'));
      mockDelete.mockResolvedValue({});
      await expenseService.deleteExpense(1, 2, 5);
      expect(mockDelete).toHaveBeenCalled();
      expect(mockUnlink).toHaveBeenCalledWith(path.join(RECEIPTS, 'gone.jpg'));
    });
  });
});
