/**
 * RoutePlanner Tests (Multi-City Trip Planner)
 *
 * Test cases:
 * - RPL-001: Stops are listed in order with distance and estimated time between them, and totals
 * - RPL-002: Arrival/departure dates are derived from the trip start date (calendar dates, no zone shift)
 * - RPL-003: A warning shows when the nights exceed the trip length
 * - RPL-004: The move buttons send the full new order to the server
 * - RPL-005: Optimise proposes a shorter order with the saving and changes nothing until confirmed
 * - RPL-006: Applying the proposal saves the order, and Undo restores the previous one
 * - RPL-007: Keeping the first stop fixed is respected by the proposal
 * - RPL-008: A failed reorder rolls the list back and reports it
 * - RPL-009: Adding a stop from a place search appends it
 * - RPL-010: Optimise is disabled with fewer than three stops
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import toast from 'react-hot-toast';

vi.mock('../../services/tripStop.service', () => ({
  default: {
    getStopsByTrip: vi.fn(),
    createStop: vi.fn(),
    updateStop: vi.fn(),
    deleteStop: vi.fn(),
    reorderStops: vi.fn(),
  },
}));
vi.mock('../../services/geocoding.service', () => ({
  default: { searchPlaces: vi.fn(), reverseGeocode: vi.fn() },
}));
vi.mock('../route-planner/RoutePlannerMap', () => ({
  default: ({ stops }: { stops: Array<{ id: number; name: string }> }) => (
    <div data-testid="route-map">{stops.map((s) => s.name).join(',')}</div>
  ),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import RoutePlanner from '../route-planner/RoutePlanner';
import tripStopService from '../../services/tripStop.service';
import geocodingService from '../../services/geocoding.service';
import type { TripStop } from '../../types/tripStop';

const TRIP_ID = 1;

const stop = (id: number, name: string, latitude: number, longitude: number, nights: number | null = null): TripStop => ({
  id,
  tripId: TRIP_ID,
  locationId: null,
  name,
  latitude,
  longitude,
  position: id - 1,
  nights,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

// A zig-zag across Europe: Lisbon, Warsaw, Madrid, Berlin, Paris.
const zigzag = (): TripStop[] => [
  stop(1, 'Lisbon', 38.72, -9.14, 3),
  stop(2, 'Warsaw', 52.23, 21.01, 2),
  stop(3, 'Madrid', 40.42, -3.7, 2),
  stop(4, 'Berlin', 52.52, 13.4, 1),
  stop(5, 'Paris', 48.86, 2.35, 2),
];

const mocks = vi.mocked(tripStopService);

function renderPlanner(stops: TripStop[], props: { start?: string | null; end?: string | null } = {}) {
  mocks.getStopsByTrip.mockResolvedValue(stops);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RoutePlanner
        tripId={TRIP_ID}
        tripStartDate={props.start === undefined ? '2026-03-10T00:00:00.000Z' : props.start}
        tripEndDate={props.end === undefined ? '2026-03-20T00:00:00.000Z' : props.end}
      />
    </QueryClientProvider>
  );
}

/** The names in the list, in order. */
const listNames = () =>
  within(screen.getByRole('list', { name: 'Trip stops in order' }))
    .getAllByText(/^(Lisbon|Warsaw|Madrid|Berlin|Paris|Rome)$/)
    .map((el) => el.textContent);

/** Echoes a reorder back the way the server would. */
const echoReorder = () =>
  mocks.reorderStops.mockImplementation(async (_tripId, ids) => {
    const all = zigzag();
    return ids.map((id, position) => ({ ...all.find((s) => s.id === id)!, position }));
  });

describe('RoutePlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('RPL-001: lists stops with legs and totals', async () => {
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    expect(listNames()).toEqual(['Lisbon', 'Warsaw', 'Madrid', 'Berlin', 'Paris']);
    // Lisbon to Warsaw is about 2,800 km: a flight.
    expect(screen.getByLabelText(/from Lisbon to Warsaw/)).toHaveTextContent(/flight \(est\.\)/);
    expect(screen.getAllByText(/\(est\.\)/).length).toBeGreaterThanOrEqual(4);
    const totals = screen.getByText('Distance').parentElement!;
    expect(totals).toHaveTextContent(/[\d,]+ km/);
    expect(await screen.findByTestId('route-map')).toHaveTextContent('Lisbon,Warsaw,Madrid,Berlin,Paris');
  });

  it('RPL-002: derives arrival and departure from the trip start date', async () => {
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    // 3 nights from Mar 10, then 2 more from Mar 13.
    expect(screen.getByText('Mar 10 to Mar 13')).toBeInTheDocument();
    expect(screen.getByText('Mar 13 to Mar 15')).toBeInTheDocument();
  });

  it('RPL-002: asks for trip dates when the trip has no start date', async () => {
    renderPlanner(zigzag(), { start: null, end: null });
    await screen.findByText('Lisbon');

    expect(screen.getAllByText('Set trip dates to see arrival dates').length).toBe(5);
  });

  it('RPL-003: warns when nights exceed the trip length', async () => {
    // 10 nights of stops in a 10-night trip is fine; 11 is not.
    const stops = zigzag();
    stops[0] = { ...stops[0], nights: 4 };
    renderPlanner(stops);
    await screen.findByText('Lisbon');

    expect(screen.getByRole('alert')).toHaveTextContent(/11 nights but the trip is only 10/);
  });

  it('RPL-003: no warning when the stops fit', async () => {
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('RPL-004: the move buttons send the full new order', async () => {
    echoReorder();
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    fireEvent.click(screen.getByRole('button', { name: 'Move Lisbon later' }));

    await waitFor(() => expect(mocks.reorderStops).toHaveBeenCalledWith(TRIP_ID, [2, 1, 3, 4, 5]));
    await waitFor(() => expect(listNames()).toEqual(['Warsaw', 'Lisbon', 'Madrid', 'Berlin', 'Paris']));
  });

  it('RPL-005: Optimise proposes a shorter order and changes nothing until confirmed', async () => {
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    fireEvent.click(screen.getByRole('button', { name: 'Optimise route' }));

    const proposal = await screen.findByRole('region', { name: 'Proposed route' });
    expect(proposal).toHaveTextContent(/km shorter/);
    expect(mocks.reorderStops).not.toHaveBeenCalled();
    expect(listNames()).toEqual(['Lisbon', 'Warsaw', 'Madrid', 'Berlin', 'Paris']);

    fireEvent.click(screen.getByRole('button', { name: 'Keep my order' }));
    expect(screen.queryByRole('region', { name: 'Proposed route' })).not.toBeInTheDocument();
    expect(mocks.reorderStops).not.toHaveBeenCalled();
  });

  it('RPL-006: Apply saves the proposal and Undo restores the previous order', async () => {
    echoReorder();
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    fireEvent.click(screen.getByRole('button', { name: 'Optimise route' }));
    await screen.findByRole('region', { name: 'Proposed route' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply this order' }));

    await waitFor(() => expect(mocks.reorderStops).toHaveBeenCalledTimes(1));
    const applied = mocks.reorderStops.mock.calls[0][1];
    expect(applied[0]).toBe(1); // first stop kept by default
    expect([...applied].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(applied).not.toEqual([1, 2, 3, 4, 5]);

    const undo = await screen.findByRole('button', { name: 'Undo' });
    fireEvent.click(undo);

    await waitFor(() => expect(mocks.reorderStops).toHaveBeenCalledTimes(2));
    expect(mocks.reorderStops.mock.calls[1][1]).toEqual([1, 2, 3, 4, 5]);
    await waitFor(() => expect(listNames()).toEqual(['Lisbon', 'Warsaw', 'Madrid', 'Berlin', 'Paris']));
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('RPL-007: the proposal keeps the first stop when asked, and the last when asked', async () => {
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    fireEvent.click(screen.getByLabelText('Keep last stop'));
    fireEvent.click(screen.getByRole('button', { name: 'Optimise route' }));
    const proposal = await screen.findByRole('region', { name: 'Proposed route' });

    const names = within(proposal)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(names[0]).toBe('Lisbon');
    expect(names[names.length - 1]).toBe('Paris');
  });

  it('RPL-008: a failed reorder rolls the list back and reports it', async () => {
    mocks.reorderStops.mockRejectedValue(new Error('boom'));
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    fireEvent.click(screen.getByRole('button', { name: 'Move Lisbon later' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save the new order'));
    await waitFor(() => expect(listNames()).toEqual(['Lisbon', 'Warsaw', 'Madrid', 'Berlin', 'Paris']));
  });

  it('RPL-009: adding a stop from a place search appends it', async () => {
    vi.mocked(geocodingService.searchPlaces).mockResolvedValue([
      { place_id: 1, display_name: 'Rome, Lazio, Italy', lat: '41.9', lon: '12.5' },
    ]);
    mocks.createStop.mockResolvedValue(stop(6, 'Rome', 41.9, 12.5));
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    fireEvent.change(screen.getByLabelText('Add a stop'), { target: { value: 'Rome' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Rome, Lazio, Italy' }, { timeout: 3000 }));

    await waitFor(() =>
      expect(mocks.createStop).toHaveBeenCalledWith(TRIP_ID, { name: 'Rome', latitude: 41.9, longitude: 12.5 })
    );
    await waitFor(() => expect(listNames()).toEqual(['Lisbon', 'Warsaw', 'Madrid', 'Berlin', 'Paris', 'Rome']));
  });

  it('RPL-010: Optimise is disabled with fewer than three stops', async () => {
    renderPlanner(zigzag().slice(0, 2));
    await screen.findByText('Lisbon');

    expect(screen.getByRole('button', { name: 'Optimise route' })).toBeDisabled();
  });

  it('shows an empty state with no stops', async () => {
    renderPlanner([]);
    expect(await screen.findByText('No stops yet')).toBeInTheDocument();
  });
});
