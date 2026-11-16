/**
 * Day By Day view - add a journal entry for a day
 *
 * Test cases:
 * - DJA-001: "Add journal entry" opens the journal form with Entry Date set to the day being viewed
 * - DJA-002: The date follows the day navigator (day 3 gives the third calendar day, not a shifted one)
 * - DJA-003: "Draft with AI" opens the same form already in the unsaved AI-draft state for that day
 * - DJA-004: A view-only user sees neither action; an editor does
 * - DJA-005: Saving creates one entry, invalidates the journal query, and reloads the view's data
 * - DJA-006: A second click while the form is open does not open a second form
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  journal: {
    getJournalEntriesByTrip: vi.fn(),
    createJournalEntry: vi.fn(),
    updateJournalEntry: vi.fn(),
    deleteJournalEntry: vi.fn(),
    generateDayDraft: vi.fn(),
  },
  permission: vi.fn(),
  activities: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  autoSaveEnabled: [] as boolean[],
}));

vi.mock('../../../services/journalEntry.service', () => ({ default: h.journal }));
vi.mock('../../../services/collaboration.service', () => ({
  default: { getPermissionLevel: h.permission },
}));
vi.mock('../../../services/activity.service', () => ({ default: { getActivitiesByTrip: h.activities } }));
vi.mock('../../../services/transportation.service', () => ({ default: { getTransportationByTrip: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../../services/lodging.service', () => ({ default: { getLodgingByTrip: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../../services/location.service', () => ({ default: { getLocationsByTrip: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../../services/customItem.service', () => ({ default: { getCustomItemsByTrip: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../../services/photo.service', () => ({ default: { getAlbumsByTrip: vi.fn().mockResolvedValue({ albums: [] }) } }));
vi.mock('../../../services/entityLink.service', () => ({
  default: {
    getTripLinkSummary: vi.fn().mockResolvedValue({}),
    getLinksByTargetType: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../../services/weather.service', () => ({ default: { getWeatherForTrip: vi.fn().mockResolvedValue([]) } }));
vi.mock('react-hot-toast', () => ({ default: h.toast, toast: h.toast }));
vi.mock('../../../hooks/useTripLinkSummary', () => ({
  useTripLinkSummary: () => ({ getLinkSummary: () => null, invalidate: vi.fn() }),
}));
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
vi.mock('../../../hooks/useAutoSaveDraft', () => ({
  useAutoSaveDraft: (_data: unknown, options: { enabled?: boolean }) => {
    h.autoSaveEnabled.push(options.enabled ?? true);
    return autoSaveResult;
  },
}));

import DailyView from '../DailyView';

const renderView = (queryClient = new QueryClient()) => {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DailyView
          tripId={7}
          tripTitle="Lisbon"
          tripTimezone="America/Los_Angeles"
          tripStartDate="2026-06-01T00:00:00.000Z"
          tripEndDate="2026-06-03T00:00:00.000Z"
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return queryClient;
};

// The form is lazy-loaded; the first open pays the module transform, which can exceed the 1s default.
const dateField = () => screen.findByLabelText(/entry date/i, undefined, { timeout: 15000 });
const nextDay = () => fireEvent.click(screen.getByRole('button', { name: /next day/i }));

describe('DailyView journal actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.autoSaveEnabled.length = 0;
    h.permission.mockResolvedValue({ isOwner: true, permissionLevel: null });
    h.activities.mockResolvedValue([]);
    h.journal.getJournalEntriesByTrip.mockResolvedValue([]);
    h.journal.createJournalEntry.mockResolvedValue({ id: 1 });
    h.journal.generateDayDraft.mockResolvedValue({
      title: 'A day in Alfama',
      body: 'We walked up the hill.',
      date: '2026-06-01',
      truncated: false,
    });
  });

  it('DJA-001: Add journal entry opens the form on the viewed day', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /add journal entry/i }));

    expect(await dateField()).toHaveValue('2026-06-01');
    expect(screen.getByLabelText(/^title/i)).toHaveValue('');
    expect(screen.queryByTestId('ai-draft-banner')).not.toBeInTheDocument();
    expect(h.journal.generateDayDraft).not.toHaveBeenCalled();
  }, 20000);

  it('DJA-002: the date follows the navigator', async () => {
    renderView();
    await screen.findByRole('button', { name: /add journal entry/i });
    nextDay();
    nextDay();
    fireEvent.click(screen.getByRole('button', { name: /add journal entry/i }));

    expect(await dateField()).toHaveValue('2026-06-03');
  });

  it('DJA-003: Draft with AI lands in the unsaved draft state for that day', async () => {
    renderView();
    await screen.findByRole('button', { name: /add journal entry/i });
    nextDay();
    fireEvent.click(screen.getAllByRole('button', { name: /draft with ai/i })[0]);

    await waitFor(() => expect(h.journal.generateDayDraft).toHaveBeenCalledWith(7, '2026-06-02'));
    expect(await screen.findByDisplayValue('A day in Alfama')).toBeInTheDocument();
    expect(await dateField()).toHaveValue('2026-06-02');
    expect(screen.getByTestId('ai-draft-banner')).toHaveTextContent(/nothing is saved/i);
    expect(h.journal.createJournalEntry).not.toHaveBeenCalled();
    expect(h.autoSaveEnabled[h.autoSaveEnabled.length - 1]).toBe(false);
  });

  it('DJA-003: with no AI key the form opens and shows the setup guidance', async () => {
    const failure = Object.assign(new Error('failed'), {
      isAxiosError: true,
      response: { status: 503, data: { message: 'AI features are not configured.' } },
    });
    h.journal.generateDayDraft.mockRejectedValue(failure);
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /draft with ai/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/set up/i);
    expect(await dateField()).toHaveValue('2026-06-01');
  });

  it('DJA-004: view-only users see no actions', async () => {
    h.permission.mockResolvedValue({ isOwner: false, permissionLevel: 'view' });
    renderView();
    await waitFor(() => expect(h.permission).toHaveBeenCalled());
    await screen.findByRole('button', { name: /next day/i });
    expect(screen.queryByRole('button', { name: /add journal entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /draft with ai/i })).not.toBeInTheDocument();
  });

  it('DJA-004: an editor collaborator sees the actions', async () => {
    h.permission.mockResolvedValue({ isOwner: false, permissionLevel: 'edit' });
    renderView();
    expect(await screen.findByRole('button', { name: /add journal entry/i })).toBeInTheDocument();
  });

  it('DJA-005: saving creates one entry, invalidates the journal query and reloads the view', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderView(queryClient);
    fireEvent.click(await screen.findByRole('button', { name: /add journal entry/i }));
    await dateField();
    // Only the day view loads activities, so this counts its data loads.
    const loadsBefore = h.activities.mock.calls.length;

    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'Day one' } });
    fireEvent.change(screen.getByPlaceholderText(/write your journal entry/i), { target: { value: 'We arrived.' } });
    fireEvent.click(screen.getByRole('button', { name: /create entry/i }));

    await waitFor(() => expect(h.journal.createJournalEntry).toHaveBeenCalledTimes(1));
    expect(h.journal.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 7, title: 'Day one', entryDate: '2026-06-01' })
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['journal', 7] }));
    // The form closes, and the view loads the trip's journal entries again.
    await waitFor(() => expect(screen.queryByLabelText(/entry date/i)).not.toBeInTheDocument());
    await waitFor(() => expect(h.activities.mock.calls.length).toBe(loadsBefore + 1));
  });

  it('DJA-006: a second click does not open a second form', async () => {
    renderView();
    const button = await screen.findByRole('button', { name: /add journal entry/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await dateField();
    expect(screen.getAllByLabelText(/entry date/i)).toHaveLength(1);
  });
});
