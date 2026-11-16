/**
 * Journal AI service tests
 *
 * Test cases:
 * - JEA-001: The trip summary resolves the LLM for the requesting user (their own key/endpoint counts)
 * - JEA-002: The entry enhancement resolves the LLM for the requesting user
 * - JEA-003: Not configured for that user answers 503 and never calls the model
 */
jest.mock('@prisma/client', () => ({ Prisma: {} }));

const mockPrisma = {
  trip: { findUnique: jest.fn() },
  journalEntry: { findMany: jest.fn(), findUnique: jest.fn() },
};
jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerifyTrip = jest.fn();
const mockVerifyEntity = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerifyTrip(...args),
  verifyEntityAccessWithPermission: (...args: unknown[]) => mockVerifyEntity(...args),
}));

class MockLlmError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}
const mockLlm = { isConfigured: jest.fn(), chat: jest.fn() };
jest.mock('../llm.service', () => ({ __esModule: true, llmService: mockLlm, LlmError: MockLlmError }));

import { journalEntryAiService } from '../journalEntryAi.service';

describe('JournalEntryAiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyTrip.mockResolvedValue(undefined);
    mockVerifyEntity.mockResolvedValue(undefined);
    mockLlm.isConfigured.mockResolvedValue(true);
  });

  it('JEA-001: the trip summary asks the LLM service on behalf of the user', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({ title: 'Italy', startDate: null, endDate: null });
    mockPrisma.journalEntry.findMany.mockResolvedValue([
      { date: new Date('2026-06-01T00:00:00Z'), title: 'Day 1', content: 'Arrived', entryType: 'daily' },
    ]);
    mockLlm.chat.mockResolvedValue('A lovely trip.');

    const summary = await journalEntryAiService.generateTripSummary(7, 10);

    expect(summary).toBe('A lovely trip.');
    expect(mockLlm.isConfigured).toHaveBeenCalledWith(7);
    expect(mockLlm.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ userId: 7 })
    );
  });

  it('JEA-002: the enhancement asks the LLM service on behalf of the user', async () => {
    mockPrisma.journalEntry.findUnique.mockResolvedValue({ title: null, content: 'Sunset at the pier', mood: null });
    mockLlm.chat.mockResolvedValue('{"title": "Pier at Sunset", "mood": "grateful"}');

    const result = await journalEntryAiService.suggestEntryEnhancements(7, 33);

    expect(result).toEqual({ title: 'Pier at Sunset', mood: 'grateful' });
    expect(mockLlm.isConfigured).toHaveBeenCalledWith(7);
    expect(mockLlm.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ userId: 7 })
    );
  });

  it('JEA-003: not configured for that user answers 503 and never calls the model', async () => {
    mockLlm.isConfigured.mockResolvedValue(false);

    await expect(journalEntryAiService.generateTripSummary(7, 10)).rejects.toMatchObject({ statusCode: 503 });
    await expect(journalEntryAiService.suggestEntryEnhancements(7, 33)).rejects.toMatchObject({ statusCode: 503 });
    expect(mockLlm.chat).not.toHaveBeenCalled();
  });
});
