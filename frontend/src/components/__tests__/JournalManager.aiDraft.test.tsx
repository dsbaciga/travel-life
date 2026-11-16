/**
 * JournalManager - "Draft with AI"
 *
 * Test cases:
 * - JAD-001: The button is disabled until an entry date is set
 * - JAD-002: Drafting asks the server for the entry date's day and fills title/content, marked as an AI draft
 * - JAD-003: Nothing is created until the user saves
 * - JAD-004: Existing text is only replaced after the user confirms; declining keeps it and calls nothing
 * - JAD-005: A 503 shows the "no AI key" guidance with a link to Settings
 * - JAD-006: Other failures show the server's message
 * - JAD-007: Auto-save is paused while the AI text is untouched and resumes once the user edits it
 * - JAD-008: A date outside the trip (plus a day either side) turns the AI button off with a hint, but a manual entry still saves
 * - JAD-009: The first day, last day, day before and day after the trip stay draftable; a trip with no end date is open-ended
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AxiosError, type AxiosResponse } from 'axios';

const h = vi.hoisted(() => ({
  journal: {
    getJournalEntriesByTrip: vi.fn(),
    createJournalEntry: vi.fn(),
    updateJournalEntry: vi.fn(),
    deleteJournalEntry: vi.fn(),
    generateDayDraft: vi.fn(),
  },
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  autoSaveEnabled: [] as boolean[],
}));

vi.mock('../../services/journalEntry.service', () => ({ default: h.journal }));
vi.mock('react-hot-toast', () => ({ default: h.toast, toast: h.toast }));
vi.mock('../../hooks/useTripLinkSummary', () => ({
  useTripLinkSummary: () => ({ getLinkSummary: () => null, invalidate: vi.fn() }),
}));
// A stable result object: the real hook returns stable callbacks, and callers list `draft`
// in effect/callback dependencies.
const autoSaveResult = vi.hoisted(() => ({
  savedDraft: null,
  hasDraft: false,
  initialDraftExists: false,
  lastSavedAt: null,
  restoreDraft: () => null,
  restoreDraftAsync: async () => null,
  clearDraft: () => undefined,
  saveDraftNow: () => undefined,
  isSaving: false,
  isLoading: false,
}));
vi.mock('../../hooks/useAutoSaveDraft', () => ({
  useAutoSaveDraft: (_data: unknown, options: { enabled?: boolean }) => {
    h.autoSaveEnabled.push(options.enabled ?? true);
    return autoSaveResult;
  },
}));

import JournalManager from '../JournalManager';

const axiosFailure = (status: number, message: string) => {
  const error = new AxiosError('failed');
  error.response = { status, data: { status: 'error', message } } as AxiosResponse;
  return error;
};

const openForm = async () => {
  render(
    <MemoryRouter>
      <JournalManager tripId={7} tripStartDate="2026-06-01T00:00:00.000Z" />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole("button", { name: /new entry/i }));
  return screen.findByRole('button', { name: /draft with ai/i });
};

describe('JournalManager Draft with AI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.autoSaveEnabled.length = 0;
    h.journal.getJournalEntriesByTrip.mockResolvedValue([]);
    h.journal.generateDayDraft.mockResolvedValue({
      title: 'A day in Alfama',
      body: 'We walked up the hill.',
      date: '2026-06-01',
      truncated: false,
    });
  });

  it('JAD-001: disabled without a date', async () => {
    render(
      <MemoryRouter>
        <JournalManager tripId={7} tripStartDate={null} />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /new entry/i }));
    expect(await screen.findByRole('button', { name: /draft with ai/i })).toBeDisabled();
  });

  it('JAD-002/003: fills the form, marks it as an AI draft, creates nothing', async () => {
    const button = await openForm();
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(h.journal.generateDayDraft).toHaveBeenCalledWith(7, '2026-06-01'));
    expect(await screen.findByDisplayValue('A day in Alfama')).toBeInTheDocument();
    expect(screen.getByDisplayValue('We walked up the hill.')).toBeInTheDocument();
    expect(screen.getByTestId('ai-draft-banner')).toHaveTextContent(/AI draft/i);
    expect(screen.getByTestId('ai-draft-banner')).toHaveTextContent(/nothing is saved/i);
    expect(h.journal.createJournalEntry).not.toHaveBeenCalled();
  });

  it('JAD-004: asks before replacing text, and keeps it when declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const button = await openForm();
    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'My own title' } });

    fireEvent.click(button);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(h.journal.generateDayDraft).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('My own title')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('JAD-004: replaces the text once confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const button = await openForm();
    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'My own title' } });

    fireEvent.click(button);

    expect(await screen.findByDisplayValue('A day in Alfama')).toBeInTheDocument();
    expect(h.journal.generateDayDraft).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('JAD-005: no AI key shows setup guidance', async () => {
    h.journal.generateDayDraft.mockRejectedValue(axiosFailure(503, 'AI features are not configured.'));
    fireEvent.click(await openForm());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/isn't set up/i);
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings?tab=integrations');
  });

  it('JAD-006: other errors show the server message', async () => {
    h.journal.generateDayDraft.mockRejectedValue(
      axiosFailure(422, 'There is nothing recorded for this day yet.')
    );
    fireEvent.click(await openForm());

    expect(await screen.findByRole('alert')).toHaveTextContent('There is nothing recorded for this day yet.');
    expect(screen.queryByTestId('ai-draft-banner')).not.toBeInTheDocument();
  });

  it('JAD-007: auto-save pauses for untouched AI text and resumes after an edit', async () => {
    fireEvent.click(await openForm());
    await screen.findByDisplayValue('A day in Alfama');
    expect(h.autoSaveEnabled[h.autoSaveEnabled.length - 1]).toBe(false);

    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'A day in Alfama, edited' } });
    await waitFor(() => expect(h.autoSaveEnabled[h.autoSaveEnabled.length - 1]).toBe(true));
  });

  const openTripForm = async (start: string | null, end: string | null) => {
    render(
      <MemoryRouter>
        <JournalManager tripId={7} tripStartDate={start} tripEndDate={end} />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /new entry/i }));
    return screen.findByRole('button', { name: /draft with ai/i });
  };
  const setEntryDate = (value: string) =>
    fireEvent.change(screen.getByLabelText(/entry date/i), { target: { value } });

  it('JAD-008: outside the trip the AI button is off, and a manual entry still saves', async () => {
    h.journal.createJournalEntry.mockResolvedValue({ id: 1 });
    const button = await openTripForm('2026-06-03T00:00:00.000Z', '2026-06-07T00:00:00.000Z');
    setEntryDate('2026-06-20');

    expect(button).toBeDisabled();
    expect(screen.getByText(/draft with ai is off for this date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/entry date/i)).not.toHaveAttribute('min');
    expect(screen.getByLabelText(/entry date/i)).not.toHaveAttribute('max');
    fireEvent.click(button);
    expect(h.journal.generateDayDraft).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'Late postcard' } });
    fireEvent.change(screen.getByPlaceholderText(/write your journal entry/i), { target: { value: 'Written afterwards.' } });
    fireEvent.click(screen.getByRole('button', { name: /create entry/i }));
    await waitFor(() =>
      expect(h.journal.createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Late postcard', entryDate: '2026-06-20' })
      )
    );
  });

  it('JAD-009: first day, last day, day before and day after are draftable; two days out is not', async () => {
    const button = await openTripForm('2026-06-03T00:00:00.000Z', '2026-06-07T00:00:00.000Z');
    for (const day of ['2026-06-03', '2026-06-07', '2026-06-02', '2026-06-08']) {
      setEntryDate(day);
      expect(button).toBeEnabled();
    }
    setEntryDate('2026-06-01');
    expect(button).toBeDisabled();
    setEntryDate('2026-06-09');
    expect(button).toBeDisabled();
  });

  it('JAD-009: with only a start date the far future is still draftable', async () => {
    const button = await openTripForm('2026-06-03T00:00:00.000Z', null);
    setEntryDate('2030-01-01');
    expect(button).toBeEnabled();
    setEntryDate('2026-06-01');
    expect(button).toBeDisabled();
  });
});
