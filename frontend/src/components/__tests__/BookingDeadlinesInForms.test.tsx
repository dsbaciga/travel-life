/**
 * Deadlines inside the booking forms (ActivityManager is the host; lodging and
 * transportation use the same hook and section).
 *
 * - BDF-001: a deadline staged on a new booking is created after it, with the new id
 * - BDF-002: the deadline's wall-clock time is read in the booking's own timezone
 * - BDF-003: the booking saves but a deadline fails: the user is told which one
 * - BDF-004: "Save & Add Another" saves the staged deadline, then starts empty
 * - BDF-005: editing shows current deadlines and persists add / change / remove
 * - BDF-006: apply never sends the same pending deadline twice
 * - BDF-007/008: the same staged-create flow for lodging and transportation
 * - BDF-009: a complete row left in the inline editor is added when the booking is saved
 * - BDF-010: an incomplete row blocks the save with a message on the row
 * - BDF-011/012: flushEditor reads the refs, so it is safe in the same tick as a submit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';

import ActivityManager from '../ActivityManager';
import LodgingManager from '../LodgingManager';
import TransportationManager from '../TransportationManager';
import lodgingService from '../../services/lodging.service';
import transportationService from '../../services/transportation.service';
import loyaltyProgramService from '../../services/loyaltyProgram.service';
import { activityService } from '../../services/activity.service';
import entityLinkService from '../../services/entityLink.service';
import userService from '../../services/user.service';
import bookingDeadlineService from '../../services/bookingDeadline.service';
import { useBookingDeadlineDrafts } from '../../hooks/useBookingDeadlineDrafts';
import { mockActivity, mockLocations, mockUser, createMockActivity } from '../../test/fixtures';
import type { BookingDeadline } from '../../types/bookingDeadline';

vi.mock('../../services/activity.service', () => {
  const mockService = {
    getActivitiesByTrip: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
    deleteActivity: vi.fn(),
  };
  return { activityService: mockService, default: mockService };
});
vi.mock('../../services/lodging.service', () => {
  const mockService = {
    getLodgingByTrip: vi.fn(),
    createLodging: vi.fn(),
    updateLodging: vi.fn(),
    deleteLodging: vi.fn(),
    bulkDeleteLodging: vi.fn(),
    bulkUpdateLodging: vi.fn(),
  };
  return { default: mockService, lodgingService: mockService };
});
vi.mock('../../services/transportation.service', () => {
  const mockService = {
    getTransportationByTrip: vi.fn(),
    createTransportation: vi.fn(),
    updateTransportation: vi.fn(),
    deleteTransportation: vi.fn(),
    bulkDeleteTransportation: vi.fn(),
    bulkUpdateTransportation: vi.fn(),
  };
  return { default: mockService, transportationService: mockService };
});
vi.mock('../../services/loyaltyProgram.service', () => ({ default: { getAll: vi.fn() } }));
vi.mock('../../services/entityLink.service', () => ({
  default: { getLinksFrom: vi.fn(), createLink: vi.fn(), deleteLink: vi.fn(), getTripLinkSummary: vi.fn() },
}));
vi.mock('../../services/user.service', () => ({ default: { getMe: vi.fn() } }));
vi.mock('../../services/bookingDeadline.service', () => ({
  default: {
    getDeadlinesByTrip: vi.fn(),
    createDeadline: vi.fn(),
    updateDeadline: vi.fn(),
    deleteDeadline: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));
vi.mock('../../hooks/useTripLinkSummary', () => ({
  useTripLinkSummary: () => ({ getLinkSummary: vi.fn().mockReturnValue(null), invalidate: vi.fn(), isLoading: false }),
}));

const TRIP_ID = 1;

const existing: BookingDeadline = {
  id: 900,
  tripId: TRIP_ID,
  entityType: 'activity',
  entityId: mockActivity.id,
  title: null,
  kind: 'payment',
  // 12:00 UTC is 14:00 in Paris (CEST) on this date.
  dueAt: '2026-07-10T12:00:00.000Z',
  note: 'Pay balance',
  dismissedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('deadlines in the activity form', () => {
  let queryClient: QueryClient;

  const renderManager = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ActivityManager tripId={TRIP_ID} locations={mockLocations} tripTimezone="Europe/Paris" tripStartDate="2024-06-01" />
        </BrowserRouter>
      </QueryClientProvider>
    );

  const openAddForm = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => expect(screen.getAllByRole('button', { name: /add activity/i })[0]).toBeInTheDocument());
    await user.click(screen.getAllByRole('button', { name: /add activity/i })[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  };

  /** Adds a "Free cancellation ends" deadline row through the section's editor. */
  const stageDeadline = async (user: ReturnType<typeof userEvent.setup>, due: string, note = '') => {
    await user.click(screen.getByRole('button', { name: /\+ add deadline/i }));
    fireEvent.change(screen.getByLabelText(/^due$/i), { target: { value: due } });
    if (note) fireEvent.change(screen.getByLabelText(/note \(optional\)/i), { target: { value: note } });
    await user.click(screen.getByRole('button', { name: /^add deadline$/i }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([]);
    vi.mocked(userService.getMe).mockResolvedValue(mockUser);
    vi.mocked(entityLinkService.getLinksFrom).mockResolvedValue([]);
    vi.mocked(entityLinkService.getTripLinkSummary).mockResolvedValue({});
    vi.mocked(bookingDeadlineService.getDeadlinesByTrip).mockResolvedValue([]);
    vi.mocked(bookingDeadlineService.createDeadline).mockResolvedValue(existing);
    vi.mocked(bookingDeadlineService.updateDeadline).mockResolvedValue(existing);
    vi.mocked(bookingDeadlineService.deleteDeadline).mockResolvedValue(undefined);
  });

  it('BDF-001/002: creates the staged deadline after the activity, with its id and the booking-local time', async () => {
    const user = userEvent.setup();
    vi.mocked(activityService.createActivity).mockResolvedValue(
      createMockActivity({ id: 71, name: 'Dinner', timezone: 'Europe/Paris' })
    );
    renderManager();
    await openAddForm(user);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Dinner' } });
    await stageDeadline(user, '2026-12-01T18:00', 'Cancel by 6pm');
    // Nothing is sent while the booking does not exist yet.
    expect(bookingDeadlineService.createDeadline).not.toHaveBeenCalled();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add activity$/i }));

    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(TRIP_ID, {
      entityType: 'activity',
      entityId: 71,
      kind: 'cancellation',
      // 18:00 in Paris (CET, UTC+1) in December.
      dueAt: expect.stringContaining('2026-12-01T17:00'),
      note: 'Cancel by 6pm',
    });
    expect(vi.mocked(activityService.createActivity).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(bookingDeadlineService.createDeadline).mock.invocationCallOrder[0]
    );
  });

  it('BDF-003: when a deadline fails the booking is kept and the failure names the deadline', async () => {
    const user = userEvent.setup();
    vi.mocked(activityService.createActivity).mockResolvedValue(createMockActivity({ id: 72, timezone: 'Europe/Paris' }));
    vi.mocked(bookingDeadlineService.createDeadline).mockRejectedValue(new Error('boom'));
    renderManager();
    await openAddForm(user);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Tour' } });
    await stageDeadline(user, '2026-12-01T18:00');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add activity$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const message = vi.mocked(toast.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(message).toContain('Free cancellation ends');
    expect(message).toContain('2026-12-01 18:00');
    // The booking was saved and is not reported as failed.
    expect(message).not.toMatch(/failed to add activity/i);
    expect(toast.success).toHaveBeenCalledWith('Activity added');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('BDF-004: Save & Add Another saves the staged deadline for that booking, then starts empty', async () => {
    const user = userEvent.setup();
    vi.mocked(activityService.createActivity)
      .mockResolvedValueOnce(createMockActivity({ id: 73, timezone: 'Europe/Paris' }))
      .mockResolvedValueOnce(createMockActivity({ id: 74, timezone: 'Europe/Paris' }));
    renderManager();
    await openAddForm(user);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'First' } });
    await stageDeadline(user, '2026-12-01T18:00');
    await user.click(screen.getByRole('button', { name: /save & add another/i }));

    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ entityId: 73 })
    );
    await waitFor(() => expect(screen.getByLabelText(/name/i)).toHaveValue(''));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The staged row is gone from the fresh form.
    expect(screen.queryByRole('list', { name: 'Deadlines' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Second' } });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add activity$/i }));
    await waitFor(() => expect(activityService.createActivity).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The second booking got nothing: the first one's deadline did not carry over.
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1);
  });

  it('BDF-005: editing shows the current deadlines and saves add, change and remove', async () => {
    const user = userEvent.setup();
    const second: BookingDeadline = { ...existing, id: 901, kind: 'check_in', note: null };
    vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);
    vi.mocked(activityService.updateActivity).mockResolvedValue(mockActivity);
    vi.mocked(bookingDeadlineService.getDeadlinesByTrip).mockResolvedValue([existing, second]);
    renderManager();

    await waitFor(() => expect(screen.getByText(mockActivity.name)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit activity/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const list = await screen.findByRole('list', { name: 'Deadlines' });
    expect(list).toHaveTextContent('Payment due');
    expect(list).toHaveTextContent('Pay balance');
    expect(list).toHaveTextContent('Online check-in opens');

    // Change the first one's note, remove the second, add a new one.
    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0]);
    fireEvent.change(screen.getByLabelText(/note \(optional\)/i), { target: { value: 'Paid in part' } });
    await user.click(screen.getByRole('button', { name: /^update deadline$/i }));
    await user.click(screen.getByRole('button', { name: /remove online check-in opens/i }));
    await stageDeadline(user, '2026-07-12T09:30');

    await user.click(screen.getByRole('button', { name: /update activity/i }));

    await waitFor(() => expect(bookingDeadlineService.deleteDeadline).toHaveBeenCalledWith(TRIP_ID, 901));
    expect(bookingDeadlineService.updateDeadline).toHaveBeenCalledWith(
      TRIP_ID,
      900,
      expect.objectContaining({
        kind: 'payment',
        note: 'Paid in part',
        // The time shown (14:00 in Paris) is unchanged, so it is sent back as the same instant.
        dueAt: expect.stringContaining('2026-07-10T12:00'),
      })
    );
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ entityType: 'activity', entityId: mockActivity.id, dueAt: expect.stringContaining('2026-07-12T07:30') })
    );
  });

  it('BDF-005b: an untouched deadline is not re-sent on save', async () => {
    const user = userEvent.setup();
    vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([mockActivity]);
    vi.mocked(activityService.updateActivity).mockResolvedValue(mockActivity);
    vi.mocked(bookingDeadlineService.getDeadlinesByTrip).mockResolvedValue([existing]);
    renderManager();

    await waitFor(() => expect(screen.getByText(mockActivity.name)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit activity/i }));
    await screen.findByRole('list', { name: 'Deadlines' });
    await user.click(screen.getByRole('button', { name: /update activity/i }));

    await waitFor(() => expect(activityService.updateActivity).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bookingDeadlineService.updateDeadline).not.toHaveBeenCalled();
    expect(bookingDeadlineService.createDeadline).not.toHaveBeenCalled();
    expect(bookingDeadlineService.deleteDeadline).not.toHaveBeenCalled();
  });
});

/** Adds a "Free cancellation ends" deadline row through the section editor. */
const stageDeadlineRow = async (user: ReturnType<typeof userEvent.setup>, due: string, note = '') => {
  await user.click(screen.getByRole('button', { name: /\+ add deadline/i }));
  fireEvent.change(screen.getByLabelText(/^due$/i), { target: { value: due } });
  if (note) fireEvent.change(screen.getByLabelText(/note \(optional\)/i), { target: { value: note } });
  await user.click(screen.getByRole('button', { name: /^add deadline$/i }));
};

/** Types into the inline editor but does not press "Add deadline". */
const typeDeadlineRow = async (user: ReturnType<typeof userEvent.setup>, due: string, note = '') => {
  await user.click(screen.getByRole('button', { name: /\+ add deadline/i }));
  if (due) fireEvent.change(screen.getByLabelText(/^due$/i), { target: { value: due } });
  if (note) fireEvent.change(screen.getByLabelText(/note \(optional\)/i), { target: { value: note } });
};

describe('deadlines in the lodging and transportation forms', () => {
  let queryClient: QueryClient;

  const savedLodging = {
    id: 81,
    locationId: null,
    tripId: TRIP_ID,
    type: 'hotel' as const,
    name: 'Grand Hotel',
    address: null,
    checkInDate: '2026-12-01T14:00:00.000Z',
    checkOutDate: '2026-12-03T10:00:00.000Z',
    timezone: 'Europe/Paris',
    confirmationNumber: null,
    loyaltyProgramId: null,
    cost: null,
    currency: null,
    bookingUrl: null,
    notes: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  const savedTransportation = {
    id: 82,
    tripId: TRIP_ID,
    type: 'train' as const,
    fromLocationId: null,
    toLocationId: null,
    fromLocationName: null,
    toLocationName: null,
    departureTime: null,
    arrivalTime: null,
    startTimezone: 'Europe/Paris',
    endTimezone: null,
    carrier: null,
    vehicleNumber: null,
    connectionGroupId: null,
    confirmationNumber: null,
    loyaltyProgramId: null,
    cost: null,
    currency: null,
    notes: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  const wrap = (node: ReactNode) =>
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{node}</BrowserRouter>
      </QueryClientProvider>
    );

  const renderLodging = () =>
    wrap(<LodgingManager tripId={TRIP_ID} locations={mockLocations} tripTimezone="Europe/Paris" tripStartDate="2026-12-01" />);
  const renderTransportation = () =>
    wrap(<TransportationManager tripId={TRIP_ID} locations={mockLocations} tripTimezone="Europe/Paris" tripStartDate="2026-12-01" />);

  const openLodging = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click((await screen.findAllByRole('button', { name: /add stay/i }))[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Grand Hotel' } });
  };
  const openTransportation = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click((await screen.findAllByRole('button', { name: /add transport/i }))[0]);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(userService.getMe).mockResolvedValue(mockUser);
    vi.mocked(entityLinkService.getLinksFrom).mockResolvedValue([]);
    vi.mocked(entityLinkService.getTripLinkSummary).mockResolvedValue({});
    vi.mocked(loyaltyProgramService.getAll).mockResolvedValue([]);
    vi.mocked(lodgingService.getLodgingByTrip).mockResolvedValue([]);
    vi.mocked(lodgingService.createLodging).mockResolvedValue(savedLodging);
    vi.mocked(transportationService.getTransportationByTrip).mockResolvedValue([]);
    vi.mocked(transportationService.createTransportation).mockResolvedValue(savedTransportation);
    vi.mocked(bookingDeadlineService.getDeadlinesByTrip).mockResolvedValue([]);
    vi.mocked(bookingDeadlineService.createDeadline).mockResolvedValue(existing);
  });

  it('BDF-007: a deadline staged on a new lodging is created after it, with the new id', async () => {
    const user = userEvent.setup();
    renderLodging();
    await openLodging(user);

    await stageDeadlineRow(user, '2026-12-01T18:00', 'Cancel by 6pm');
    expect(bookingDeadlineService.createDeadline).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add stay$/i }));

    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(TRIP_ID, {
      entityType: 'lodging',
      entityId: 81,
      kind: 'cancellation',
      // 18:00 in Paris (CET, UTC+1) in December.
      dueAt: expect.stringContaining('2026-12-01T17:00'),
      note: 'Cancel by 6pm',
    });
    expect(vi.mocked(lodgingService.createLodging).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(bookingDeadlineService.createDeadline).mock.invocationCallOrder[0]
    );
  });

  it('BDF-008: a deadline staged on a new transportation is created after it, with the new id', async () => {
    const user = userEvent.setup();
    renderTransportation();
    await openTransportation(user);

    await stageDeadlineRow(user, '2026-12-01T18:00', 'Cancel by 6pm');
    expect(bookingDeadlineService.createDeadline).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add transport$/i }));

    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(TRIP_ID, {
      entityType: 'transportation',
      entityId: 82,
      kind: 'cancellation',
      dueAt: expect.stringContaining('2026-12-01T17:00'),
      note: 'Cancel by 6pm',
    });
    expect(vi.mocked(transportationService.createTransportation).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(bookingDeadlineService.createDeadline).mock.invocationCallOrder[0]
    );
  });

  it('BDF-009: a complete row left in the editor is added when the booking is saved', async () => {
    const user = userEvent.setup();
    renderLodging();
    await openLodging(user);

    // Typed, but "Add deadline" is never pressed.
    await typeDeadlineRow(user, '2026-12-01T18:00', 'Left in the editor');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add stay$/i }));

    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ entityType: 'lodging', entityId: 81, note: 'Left in the editor' })
    );
  });

  it('BDF-009b: the same holds for transportation', async () => {
    const user = userEvent.setup();
    renderTransportation();
    await openTransportation(user);

    await typeDeadlineRow(user, '2026-12-01T18:00');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add transport$/i }));

    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ entityType: 'transportation', entityId: 82 })
    );
  });

  it('BDF-010: an incomplete row blocks the save with a message, and saves once it is finished', async () => {
    const user = userEvent.setup();
    renderLodging();
    await openLodging(user);

    // A note but no due date.
    await typeDeadlineRow(user, '', 'No date yet');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add stay$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a due date/i);
    expect(lodgingService.createLodging).not.toHaveBeenCalled();
    expect(bookingDeadlineService.createDeadline).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Finishing the row clears the message and lets the save through.
    fireEvent.change(screen.getByLabelText(/^due$/i), { target: { value: '2026-12-01T18:00' } });
    expect(screen.queryByText(/choose a due date to add/i)).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add stay$/i }));
    await waitFor(() => expect(lodgingService.createLodging).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
  });

  it('BDF-010b: an incomplete row also blocks a transportation save, and removing it lets the save through', async () => {
    const user = userEvent.setup();
    renderTransportation();
    await openTransportation(user);

    await typeDeadlineRow(user, '', 'No date yet');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add transport$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a due date/i);
    expect(transportationService.createTransportation).not.toHaveBeenCalled();

    // Cancel the deadline row (the only Cancel inside the Deadlines section is its own).
    const row = screen.getByLabelText(/^due$/i).closest('div.space-y-3') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /^cancel$/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add transport$/i }));
    await waitFor(() => expect(transportationService.createTransportation).toHaveBeenCalledTimes(1));
    expect(bookingDeadlineService.createDeadline).not.toHaveBeenCalled();
  });
});

describe('useBookingDeadlineDrafts', () => {
  it('BDF-011: flushEditor commits a complete row to the list apply reads, in the same tick', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    vi.mocked(bookingDeadlineService.createDeadline).mockClear();
    vi.mocked(bookingDeadlineService.createDeadline).mockResolvedValue(existing);
    const { result } = renderHook(
      () => useBookingDeadlineDrafts({ tripId: TRIP_ID, entityType: 'lodging', entityId: null, active: true, tripTimezone: 'Europe/Paris' }),
      { wrapper }
    );

    let allowed = false;
    await act(async () => {
      // No render between these calls: they read the refs, not state.
      result.current.setEditor({ key: null, kind: 'payment', dueLocal: '2026-12-01T10:00', note: ' pay ' });
      allowed = result.current.flushEditor();
      await result.current.apply(5, 'Europe/Paris');
    });

    expect(allowed).toBe(true);
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ entityId: 5, kind: 'payment', note: 'pay' })
    );
  });

  it('BDF-012: flushEditor ignores an untouched row and refuses an incomplete one', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useBookingDeadlineDrafts({ tripId: TRIP_ID, entityType: 'lodging', entityId: null, active: true, tripTimezone: 'Europe/Paris' }),
      { wrapper }
    );

    act(() => result.current.setEditor({ key: null, kind: 'cancellation', dueLocal: '', note: '' }));
    let allowed = false;
    act(() => {
      allowed = result.current.flushEditor();
    });
    expect(allowed).toBe(true);
    expect(result.current.editor).toBeNull();

    act(() => result.current.setEditor({ key: null, kind: 'cancellation', dueLocal: '', note: 'x' }));
    act(() => {
      allowed = result.current.flushEditor();
    });
    expect(allowed).toBe(false);
    expect(result.current.editorError).toMatch(/due date/i);
    expect(result.current.drafts).toEqual([]);
  });

  it('BDF-006: two overlapping applies send a pending deadline once', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    vi.mocked(bookingDeadlineService.getDeadlinesByTrip).mockResolvedValue([]);
    vi.mocked(bookingDeadlineService.createDeadline).mockClear();
    vi.mocked(bookingDeadlineService.createDeadline).mockResolvedValue(existing);

    const { result } = renderHook(
      () => useBookingDeadlineDrafts({ tripId: TRIP_ID, entityType: 'lodging', entityId: null, active: true, tripTimezone: 'Europe/Paris' }),
      { wrapper }
    );
    act(() => {
      result.current.change([
        { key: 'k1', kind: 'payment', dueLocal: '2026-12-01T10:00', note: '', done: false },
      ]);
    });

    await act(async () => {
      await Promise.all([result.current.apply(5, 'Europe/Paris'), result.current.apply(5, 'Europe/Paris')]);
    });

    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1);
    expect(bookingDeadlineService.createDeadline).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ entityType: 'lodging', entityId: 5 })
    );
    expect(result.current.drafts).toEqual([]);
  });
});
