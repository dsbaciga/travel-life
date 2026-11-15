/**
 * DeadlinesManager Tests
 *
 * Test cases:
 * - DLM-001: Add Deadline is available even when the trip has no bookings
 * - DLM-002: With no booking chosen, the form asks for a title and sends a standalone deadline
 * - DLM-003: A standalone deadline without a title is refused before anything is sent
 * - DLM-004: Choosing a booking hides the title and sends the booking
 * - DLM-005: A standalone deadline is listed under its own title
 * - DLM-006: The dashboard widget shows a standalone deadline under its own title
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import toast from 'react-hot-toast';

vi.mock('../../services/bookingDeadline.service', () => ({
  default: {
    getDeadlinesByTrip: vi.fn(),
    getUpcoming: vi.fn(),
    createDeadline: vi.fn(),
    updateDeadline: vi.fn(),
    deleteDeadline: vi.fn(),
  },
}));
vi.mock('../../services/lodging.service', () => ({ default: { getLodgingByTrip: vi.fn() } }));
vi.mock('../../services/transportation.service', () => ({ default: { getTransportationByTrip: vi.fn() } }));
vi.mock('../../services/activity.service', () => ({ default: { getActivitiesByTrip: vi.fn() } }));
vi.mock('../../hooks/useTimezoneResolver', () => ({
  useTimezoneResolver: () => (...candidates: Array<string | null | undefined>) =>
    candidates.find(Boolean) ?? 'UTC',
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import DeadlinesManager from '../DeadlinesManager';
import DeadlinesWidget from '../widgets/DeadlinesWidget';
import bookingDeadlineService from '../../services/bookingDeadline.service';
import lodgingService from '../../services/lodging.service';
import transportationService from '../../services/transportation.service';
import activityService from '../../services/activity.service';
import type { BookingDeadline, UpcomingBookingDeadline } from '../../types/bookingDeadline';

const TRIP_ID = 1;

const standalone: BookingDeadline = {
  id: 1,
  tripId: TRIP_ID,
  entityType: null,
  entityId: null,
  title: 'Renew passport',
  kind: 'other',
  dueAt: '2026-12-01T12:00:00.000Z',
  note: null,
  dismissedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function renderManager() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DeadlinesManager tripId={TRIP_ID} tripTimezone="Europe/Paris" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Add Deadline' }));
  return screen.findByLabelText(/booking \(optional\)/i);
}

describe('DeadlinesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bookingDeadlineService.getDeadlinesByTrip).mockResolvedValue([]);
    vi.mocked(bookingDeadlineService.createDeadline).mockResolvedValue(standalone);
    vi.mocked(lodgingService.getLodgingByTrip).mockResolvedValue([]);
    vi.mocked(transportationService.getTransportationByTrip).mockResolvedValue([]);
    vi.mocked(activityService.getActivitiesByTrip).mockResolvedValue([]);
  });

  it('DLM-001: Add Deadline is available even when the trip has no bookings', async () => {
    renderManager();

    const add = await screen.findByRole('button', { name: 'Add Deadline' });
    expect(add).toBeEnabled();

    const booking = await openForm();
    expect(booking).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Not attached to a booking' })).toBeInTheDocument();
  });

  it('DLM-002: with no booking chosen, asks for a title and sends a standalone deadline', async () => {
    renderManager();
    await openForm();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '  Renew passport ' } });
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-12-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Deadline' }));

    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
    const [tripId, input] = vi.mocked(bookingDeadlineService.createDeadline).mock.calls[0];
    expect(tripId).toBe(TRIP_ID);
    expect(input).toMatchObject({ title: 'Renew passport', kind: 'cancellation', note: null });
    // No booking, so neither half of the target is sent.
    expect(input).not.toHaveProperty('entityType');
    expect(input).not.toHaveProperty('entityId');
  });

  it('DLM-003: a standalone deadline without a title is refused before anything is sent', async () => {
    renderManager();
    await openForm();

    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-12-01T10:00' } });
    // Submit the form directly so the browser's own required-field check is not what stops it.
    fireEvent.submit(screen.getByLabelText('Due').closest('form') as HTMLFormElement);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Give the deadline a title'));
    expect(bookingDeadlineService.createDeadline).not.toHaveBeenCalled();
  });

  it('DLM-004: choosing a booking hides the title and sends the booking', async () => {
    vi.mocked(lodgingService.getLodgingByTrip).mockResolvedValue([
      { id: 7, name: 'Hotel Roma', timezone: 'Europe/Rome' } as never,
    ]);
    renderManager();
    const booking = await openForm();
    await screen.findByRole('option', { name: 'Lodging: Hotel Roma' });

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    fireEvent.change(booking, { target: { value: 'lodging:7' } });
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Due/), { target: { value: '2026-12-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Deadline' }));

    await waitFor(() => expect(bookingDeadlineService.createDeadline).toHaveBeenCalledTimes(1));
    const [, input] = vi.mocked(bookingDeadlineService.createDeadline).mock.calls[0];
    expect(input).toMatchObject({ entityType: 'lodging', entityId: 7, kind: 'cancellation' });
    expect(input).not.toHaveProperty('title');
  });

  it('DLM-005: a standalone deadline is listed under its own title', async () => {
    vi.mocked(bookingDeadlineService.getDeadlinesByTrip).mockResolvedValue([standalone]);
    renderManager();

    expect(await screen.findByText('Renew passport')).toBeInTheDocument();
    // The line under it says what kind it is rather than naming a booking.
    expect(screen.getByText(/Other deadline/)).toBeInTheDocument();
  });

  it('DLM-006: the dashboard widget shows a standalone deadline under its own title', async () => {
    const upcoming: UpcomingBookingDeadline = {
      ...standalone,
      trip: { id: TRIP_ID, title: 'Iceland 2027', timezone: null },
    };
    vi.mocked(bookingDeadlineService.getUpcoming).mockResolvedValue([upcoming]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DeadlinesWidget />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Renew passport')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark Renew passport done' })).toBeInTheDocument();
    expect(screen.getByText('Iceland 2027')).toBeInTheDocument();
  });
});
