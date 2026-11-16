import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import sharp from 'sharp';

const mockVerifyAccess = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockIsConfigured = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const mockChatWithImage = jest.fn<(...args: unknown[]) => Promise<string>>();

jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyAccess(...args),
}));

// file-type is ESM-only; stub it with a signature sniffer covering what the tests use.
jest.mock(
  'file-type',
  () => ({
    __esModule: true,
    fileTypeFromBuffer: async (buf: Buffer) => {
      if (buf.subarray(0, 4).toString('hex') === '89504e47') return { mime: 'image/png', ext: 'png' };
      if (buf.subarray(0, 3).toString('hex') === 'ffd8ff') return { mime: 'image/jpeg', ext: 'jpg' };
      if (buf.subarray(0, 3).toString('ascii') === 'GIF') return { mime: 'image/gif', ext: 'gif' };
      return undefined;
    },
  }),
  { virtual: true }
);

jest.mock('../llm.service', () => {
  class LlmError extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
      this.name = 'LlmError';
    }
  }
  return {
    LlmError,
    llmService: {
      isConfigured: (...args: unknown[]) => mockIsConfigured(...args),
      chatWithImage: (...args: unknown[]) => mockChatWithImage(...args),
    },
  };
});

import receiptScanService, { assertReceiptImage, RECEIPT_MAX_BYTES } from '../receiptScan.service';
import { LlmError } from '../llm.service';

async function pngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer();
}

describe('assertReceiptImage (upload guard)', () => {
  it('rejects a missing file', async () => {
    await expect(assertReceiptImage(undefined)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects non-image bytes even if the client claimed an image type', async () => {
    await expect(assertReceiptImage(Buffer.from('<?php echo 1; ?>'))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects an image type outside the allow-list (GIF)', async () => {
    const gif = Buffer.from('474946383961010001000000002c00000000010001000002024401003b', 'hex');
    await expect(assertReceiptImage(gif)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects oversize files', async () => {
    await expect(assertReceiptImage(Buffer.alloc(RECEIPT_MAX_BYTES + 1))).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it('accepts a real PNG', async () => {
    await expect(assertReceiptImage(await pngBuffer())).resolves.toBe('image/png');
  });
});

describe('receiptScanService.scanReceipt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAccess.mockResolvedValue(undefined);
    mockIsConfigured.mockResolvedValue(true);
  });

  it('checks edit access before anything else', async () => {
    mockVerifyAccess.mockRejectedValue(new Error('forbidden'));
    await expect(receiptScanService.scanReceipt(1, 2, await pngBuffer())).rejects.toThrow('forbidden');
    expect(mockVerifyAccess).toHaveBeenCalledWith(1, 2, 'edit');
    expect(mockChatWithImage).not.toHaveBeenCalled();
  });

  it('returns 503 with guidance when no AI key is configured', async () => {
    mockIsConfigured.mockResolvedValue(false);
    await expect(receiptScanService.scanReceipt(1, 2, await pngBuffer())).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it('sends a downscaled JPEG data to the model and returns validated fields', async () => {
    mockChatWithImage.mockResolvedValue('{"merchant":"Cafe","amount":"8.40","currency":"CHF","date":"2026-11-01","category":"food"}');
    const result = await receiptScanService.scanReceipt(1, 2, await pngBuffer());
    expect(result).toEqual({ merchant: 'Cafe', amount: '8.40', currency: 'CHF', date: '2026-11-01', category: 'food' });
    const image = mockChatWithImage.mock.calls[0][2] as { mimeType: string; base64: string };
    expect(image.mimeType).toBe('image/jpeg');
    expect(Buffer.from(image.base64, 'base64').subarray(0, 2).toString('hex')).toBe('ffd8');
  });

  it('maps a provider failure to 502', async () => {
    mockChatWithImage.mockRejectedValue(new LlmError('boom', 500));
    await expect(receiptScanService.scanReceipt(1, 2, await pngBuffer())).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('maps unusable model output to 422', async () => {
    mockChatWithImage.mockResolvedValue('Sorry, I cannot help with that.');
    await expect(receiptScanService.scanReceipt(1, 2, await pngBuffer())).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('maps an undecodable image to 422', async () => {
    // Valid PNG signature but truncated body: passes the type check, fails to decode.
    const truncated = (await pngBuffer()).subarray(0, 30);
    await expect(receiptScanService.scanReceipt(1, 2, truncated)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(mockChatWithImage).not.toHaveBeenCalled();
  });
});
