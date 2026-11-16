/**
 * Journal day draft service tests
 *
 * Test cases:
 * - JDD-001: Requires edit permission on the trip (a denied caller never reaches the data or the LLM)
 * - JDD-002: An empty day answers 422 and never calls the LLM
 * - JDD-003: Not configured answers 503 and never calls the LLM
 * - JDD-004: Returns a parsed title and body, calls the LLM with the user id, and writes nothing
 * - JDD-005: Provider failures become a 502
 * - JDD-006: An empty reply becomes a 502
 * - JDD-007: Dates outside the trip (plus one day of grace each side) are rejected before any data read or LLM call
 * - JDD-008: Trips with no dates, or only one bound, are open on the missing side
 */
jest.mock('@prisma/client', () => ({ Prisma: {} }));

const mockPrisma = {
  trip: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  activity: { findMany: jest.fn() },
  transportation: { findMany: jest.fn() },
  lodging: { findMany: jest.fn() },
  location: { findMany: jest.fn() },
  photo: { findMany: jest.fn() },
  foodLogEntry: { findMany: jest.fn() },
  weatherData: { findMany: jest.fn() },
  journalEntry: { create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
};
jest.mock('../../config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockVerify = jest.fn();
jest.mock('../_shared/tripAccess', () => ({
  verifyTripAccessWithPermission: (...args: unknown[]) => mockVerify(...args),
}));

class MockLlmError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}
const mockLlm = { isConfigured: jest.fn(), chat: jest.fn() };
jest.mock('../llm.service', () => ({ __esModule: true, llmService: mockLlm, LlmError: MockLlmError }));

import { journalDayDraftService } from '../journalDayDraft.service';

const withActivity = () =>
  mockPrisma.activity.findMany.mockResolvedValue([
    {
      id: 1, name: 'Dinner', description: null, category: 'dining', allDay: false,
      startTime: new Date('2026-06-02T01:30:00Z'), endTime: null, timezone: 'America/New_York', notes: null,
    },
  ]);

describe('JournalDayDraftService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockVerify.mockResolvedValue({});
    mockPrisma.trip.findUnique.mockResolvedValue({ title: 'NYC', timezone: null });
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'UTC' });
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.transportation.findMany.mockResolvedValue([]);
    mockPrisma.lodging.findMany.mockResolvedValue([]);
    mockPrisma.location.findMany.mockResolvedValue([]);
    mockPrisma.photo.findMany.mockResolvedValue([]);
    mockPrisma.foodLogEntry.findMany.mockResolvedValue([]);
    mockPrisma.weatherData.findMany.mockResolvedValue([]);
    mockLlm.isConfigured.mockResolvedValue(true);
    mockLlm.chat.mockResolvedValue('TITLE: Dinner in the city\n\nWe had dinner.');
  });

  it('JDD-001: requires edit permission', async () => {
    mockVerify.mockRejectedValue(new Error('denied'));
    await expect(journalDayDraftService.generateDayDraft(2, 5, '2026-06-01')).rejects.toThrow('denied');
    expect(mockVerify).toHaveBeenCalledWith(2, 5, 'edit');
    expect(mockPrisma.activity.findMany).not.toHaveBeenCalled();
    expect(mockLlm.chat).not.toHaveBeenCalled();
  });

  it('JDD-002: empty day -> 422, no LLM call', async () => {
    await expect(journalDayDraftService.generateDayDraft(1, 5, '2026-06-01')).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(mockLlm.chat).not.toHaveBeenCalled();
  });

  it('JDD-003: not configured -> 503', async () => {
    withActivity();
    mockLlm.isConfigured.mockResolvedValue(false);
    await expect(journalDayDraftService.generateDayDraft(1, 5, '2026-06-01')).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(mockLlm.isConfigured).toHaveBeenCalledWith(1);
    expect(mockLlm.chat).not.toHaveBeenCalled();
  });

  it('JDD-004: returns a draft for the local day and writes nothing', async () => {
    withActivity();
    const draft = await journalDayDraftService.generateDayDraft(1, 5, '2026-06-01');
    expect(draft).toEqual({
      title: 'Dinner in the city',
      body: 'We had dinner.',
      date: '2026-06-01',
      truncated: false,
    });
    expect(mockLlm.chat).toHaveBeenCalledTimes(1);
    const [, userPrompt, options] = mockLlm.chat.mock.calls[0];
    expect(userPrompt).toContain('Dinner');
    expect(options).toMatchObject({ userId: 1 });
    expect(mockPrisma.journalEntry.create).not.toHaveBeenCalled();
    expect(mockPrisma.journalEntry.update).not.toHaveBeenCalled();
    expect(mockPrisma.journalEntry.upsert).not.toHaveBeenCalled();
  });

  it('JDD-004: the same instant is not on the next UTC day for a western user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'America/New_York' });
    mockPrisma.activity.findMany.mockResolvedValue([
      {
        id: 1, name: 'Dinner', description: null, category: null, allDay: false,
        startTime: new Date('2026-06-02T01:30:00Z'), endTime: null, timezone: null, notes: null,
      },
    ]);
    await expect(journalDayDraftService.generateDayDraft(1, 5, '2026-06-02')).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(journalDayDraftService.generateDayDraft(1, 5, '2026-06-01')).resolves.toMatchObject({
      date: '2026-06-01',
    });
  });

  it('JDD-005: provider failure -> 502', async () => {
    withActivity();
    mockLlm.chat.mockRejectedValue(new MockLlmError('timeout of 30000ms exceeded'));
    await expect(journalDayDraftService.generateDayDraft(1, 5, '2026-06-01')).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('JDD-006: empty reply -> 502', async () => {
    withActivity();
    mockLlm.chat.mockResolvedValue('');
    await expect(journalDayDraftService.generateDayDraft(1, 5, '2026-06-01')).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  describe('trip date window', () => {
    // Trip dates are @db.Date values: UTC midnight, never shifted by a timezone.
    const trip = (startDate: string | null, endDate: string | null) =>
      mockPrisma.trip.findUnique.mockResolvedValue({
        title: 'NYC',
        timezone: null,
        startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : null,
        endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : null,
      });

    // An activity at 15:00 UTC on the asked day, so the day has something to write about.
    const withActivityOnRequestedDay = (date: string) =>
      mockPrisma.activity.findMany.mockResolvedValue([
        {
          id: 1, name: 'Walk', description: null, category: null, allDay: false,
          startTime: new Date(`${date}T15:00:00Z`), endTime: null, timezone: null, notes: null,
        },
      ]);
    const draftFor = async (date: string) => {
      withActivityOnRequestedDay(date);
      return journalDayDraftService.generateDayDraft(1, 5, date);
    };

    const rejected = async (date: string) => {
      mockPrisma.activity.findMany.mockClear();
      mockLlm.isConfigured.mockClear();
      mockLlm.chat.mockClear();
      await expect(journalDayDraftService.generateDayDraft(1, 5, date)).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining('2026-06-03 to 2026-06-07'),
      });
      expect(mockPrisma.activity.findMany).not.toHaveBeenCalled();
      expect(mockLlm.isConfigured).not.toHaveBeenCalled();
      expect(mockLlm.chat).not.toHaveBeenCalled();
    };

    it('JDD-007: first and last day are inclusive', async () => {
      trip('2026-06-03', '2026-06-07');
      await expect(draftFor('2026-06-03')).resolves.toMatchObject({ date: '2026-06-03' });
      await expect(draftFor('2026-06-07')).resolves.toMatchObject({ date: '2026-06-07' });
    });

    it('JDD-007: the day before and the day after are allowed for travel days', async () => {
      trip('2026-06-03', '2026-06-07');
      await expect(draftFor('2026-06-02')).resolves.toMatchObject({ date: '2026-06-02' });
      await expect(draftFor('2026-06-08')).resolves.toMatchObject({ date: '2026-06-08' });
    });

    it('JDD-007: two days before and two days after are rejected with no data read and no LLM call', async () => {
      trip('2026-06-03', '2026-06-07');
      await rejected('2026-06-01');
      await rejected('2026-06-09');
    });

    it('JDD-007: a user west of UTC gets the same window, not one shifted by a day', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ timezone: 'America/Los_Angeles' });
      trip('2026-06-03', '2026-06-07');
      await expect(draftFor('2026-06-03')).resolves.toMatchObject({ date: '2026-06-03' });
      await expect(draftFor('2026-06-07')).resolves.toMatchObject({ date: '2026-06-07' });
      await rejected('2026-06-01');
    });

    it('JDD-008: a trip with no dates is not restricted', async () => {
      trip(null, null);
      await expect(draftFor('2031-01-01')).resolves.toMatchObject({ date: '2031-01-01' });
    });

    it('JDD-008: only a start date bounds the lower side', async () => {
      trip('2026-06-03', null);
      await expect(draftFor('2030-01-01')).resolves.toMatchObject({ date: '2030-01-01' });
      await expect(draftFor('2026-06-01')).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining('starts 2026-06-03'),
      });
    });

    it('JDD-008: only an end date bounds the upper side', async () => {
      trip(null, '2026-06-07');
      await expect(draftFor('2020-01-01')).resolves.toMatchObject({ date: '2020-01-01' });
      await expect(draftFor('2026-06-09')).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining('ends 2026-06-07'),
      });
    });
  });
});
