import { jest, describe, it, expect } from '@jest/globals';

const mockFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: { trip: { findFirst: (...a: unknown[]) => mockFindFirst(...a) } },
}));

import shareService from '../share.service';

describe('public share payload and receipts', () => {
  it('never loads expenses (and so no receipt fields) for the public trip', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(shareService.getPublicTrip('a'.repeat(64))).rejects.toBeDefined();

    const args = mockFindFirst.mock.calls[0][0] as { include?: Record<string, unknown>; select?: Record<string, unknown> };
    const loaded = JSON.stringify(args);
    expect(Object.keys(args.include ?? {})).not.toContain('expenses');
    expect(loaded).not.toMatch(/receipt/i);
    expect(loaded).not.toMatch(/expenses/);
  });
});
