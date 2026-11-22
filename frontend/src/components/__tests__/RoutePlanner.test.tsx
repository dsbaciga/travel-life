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
 * - RPL-011: Distances follow the user's units: miles by default and for imperial, km for metric
 * - RPL-012: The optimise preview is in the chosen unit
 * - RPL-013: Picking a saved place sends its locationId; the list filters locally
 * - RPL-014: Saved places without coordinates are disabled, with a reason
 * - RPL-015: Places that are already stops are marked, and can be added again
 * - RPL-016: A linked stop links to its saved place, and a repeat shows as a return visit
 * - RPL-017: A view-only viewer sees the list, map, distances and totals but no editing controls
 * - RPL-018: No editing controls show while the permission is still loading
 * - RPL-019: Straight-line legs are labelled while the road figures have not arrived (or the server has none)
 * - RPL-020: Routed legs show road distance and driving time without the straight-line label
 * - RPL-021: A mixed result labels only the straight-line legs and the totals say so
 * - RPL-022: Road distances follow the user's units
 * - RPL-023: A failed legs request leaves the straight-line values in place
 * - RPL-024: The optimise preview says it compares straight-line distances
 * - RPL-025: A flight leg shows its distance and no time, and the totals leave it out ("plus N flights")
 * - RPL-026: A routed result never turns a flight leg into a road drive time (server mode, or the client's own classification)
 * - RPL-027: Drive legs keep their straight-line estimate and the totals count only them
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MemoryRouter } from 'react-router';
import { useAuthStore } from '../../store/authStore';

vi.mock('../../services/tripStop.service', () => ({
  default: {
    getStopsByTrip: vi.fn(),
    createStop: vi.fn(),
    updateStop: vi.fn(),
    deleteStop: vi.fn(),
    reorderStops: vi.fn(),
    getLegs: vi.fn(),
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
vi.mock('../../services/collaboration.service', () => ({
  default: { getPermissionLevel: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import RoutePlanner from '../route-planner/RoutePlanner';
import tripStopService from '../../services/tripStop.service';
import geocodingService from '../../services/geocoding.service';
import collaborationService from '../../services/collaboration.service';
import type { TripStop } from '../../types/tripStop';
import type { Location } from '../../types/location';

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

// A regional trip where every leg is a drive: Munich, Salzburg, Vienna, Budapest, Prague.
const regional = (): TripStop[] => [
  stop(1, 'Munich', 48.14, 11.58, 2),
  stop(2, 'Salzburg', 47.81, 13.05, 1),
  stop(3, 'Vienna', 48.21, 16.37, 2),
  stop(4, 'Budapest', 47.5, 19.04, 2),
  stop(5, 'Prague', 50.08, 14.44, 1),
];

// One drive (Munich to Salzburg), one flight (Salzburg to Lisbon), one drive (Lisbon to Madrid).
const mixed = (): TripStop[] => [
  stop(1, 'Munich', 48.14, 11.58, 1),
  stop(2, 'Salzburg', 47.81, 13.05, 1),
  stop(3, 'Lisbon', 38.72, -9.14, 1),
  stop(4, 'Madrid', 40.42, -3.7, 1),
];

const mocks = vi.mocked(tripStopService);

function renderPlanner(
  stops: TripStop[],
  props: { start?: string | null; end?: string | null; locations?: Location[] } = {}
) {
  mocks.getStopsByTrip.mockResolvedValue(stops);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
    <QueryClientProvider client={client}>
      <RoutePlanner
        tripId={TRIP_ID}
        tripStartDate={props.start === undefined ? '2026-03-10T00:00:00.000Z' : props.start}
        tripEndDate={props.end === undefined ? '2026-03-20T00:00:00.000Z' : props.end}
        locations={props.locations}
      />
    </QueryClientProvider>
    </MemoryRouter>
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

const setSystem = (measurementSystem: 'imperial' | 'metric' | null | undefined) =>
  useAuthStore.setState({
    user: { id: 1, username: 'u', email: 'u@x.y', avatarUrl: null, measurementSystem },
  });

const place = (over: Partial<Location>): Location =>
  ({
    id: 1,
    tripId: TRIP_ID,
    parentId: null,
    name: 'Place',
    address: null,
    latitude: 41.9,
    longitude: 12.5,
    categoryId: null,
    excludeFromMap: false,
    ...over,
  }) as Location;

describe('RoutePlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSystem('metric');
    // By default the server has no road figures: the planner shows its own straight-line values.
    mocks.getLegs.mockResolvedValue({ profile: 'driving-car', legs: [] });
    vi.mocked(collaborationService.getPermissionLevel).mockResolvedValue({
      isOwner: true,
      permissionLevel: 'admin',
    });
  });

  it('RPL-001: lists stops with legs and totals', async () => {
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');

    expect(listNames()).toEqual(['Lisbon', 'Warsaw', 'Madrid', 'Berlin', 'Paris']);
    // Lisbon to Warsaw is about 2,800 km: a flight, with a distance and no time.
    const flight = screen.getByLabelText(/from Lisbon to Warsaw/);
    expect(flight).toHaveTextContent(/[\d,]+ km/);
    expect(flight).toHaveTextContent('by air');
    expect(flight).not.toHaveTextContent(/\(est\.\)|\bmin\b|\d h\b/);
    const totals = screen.getByText('Distance').parentElement!;
    expect(totals).toHaveTextContent(/[\d,]+ km/);
    expect(totals).not.toHaveTextContent(/ mi\b/);
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

  it('RPL-011: shows miles for imperial and for a user who never chose, km for metric', async () => {
    setSystem('imperial');
    const { unmount } = renderPlanner(zigzag());
    await screen.findByText('Lisbon');
    expect(screen.getByLabelText(/from Lisbon to Warsaw/)).toHaveTextContent(/[\d,]+ mi/);
    expect(screen.getByText('Distance').parentElement).toHaveTextContent(/[\d,]+ mi/);
    expect(screen.getByText('Distance').parentElement).not.toHaveTextContent(/ km/);
    unmount();

    setSystem(null); // a legacy user with no stored choice gets the app default (imperial)
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');
    expect(screen.getByText('Distance').parentElement).toHaveTextContent(/[\d,]+ mi/);
  });

  it('RPL-011: the same leg is about 0.62 times the number in miles', async () => {
    const legNumber = (unit: 'km' | 'mi') =>
      Number(
        new RegExp(`([\\d,]+) ${unit}`)
          .exec(screen.getByLabelText(/from Lisbon to Warsaw/).getAttribute('aria-label') ?? '')![1]
          .replace(/,/g, '')
      );

    setSystem('metric');
    const metric = renderPlanner(zigzag());
    await screen.findByText('Lisbon');
    const km = legNumber('km');
    metric.unmount();

    setSystem('imperial');
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');
    const mi = legNumber('mi');
    expect(mi).toBeGreaterThan(km * 0.62);
    expect(mi).toBeLessThan(km * 0.625);
  });

  it('RPL-012: the optimise preview states the saving in the chosen unit', async () => {
    setSystem('imperial');
    renderPlanner(zigzag());
    await screen.findByText('Lisbon');
    fireEvent.click(screen.getByRole('button', { name: 'Optimise route' }));
    const proposal = await screen.findByRole('region', { name: 'Proposed route' });
    expect(proposal).toHaveTextContent(/[\d,]+ mi shorter/);
    expect(proposal).not.toHaveTextContent(/ km/);
  });

  it('RPL-013: picking a saved place sends its locationId and snapshot', async () => {
    mocks.createStop.mockResolvedValue({ ...stop(6, 'Colosseum', 41.89, 12.49), locationId: 7 });
    renderPlanner(zigzag(), {
      locations: [place({ id: 7, name: 'Colosseum', latitude: 41.89, longitude: 12.49, address: 'Rome' })],
    });
    await screen.findByText('Lisbon');

    fireEvent.click(screen.getByRole('button', { name: "This trip's places" }));
    fireEvent.click(await screen.findByRole('button', { name: /Colosseum/ }));

    await waitFor(() =>
      expect(mocks.createStop).toHaveBeenCalledWith(TRIP_ID, {
        locationId: 7,
        name: 'Colosseum',
        latitude: 41.89,
        longitude: 12.49,
      })
    );
  });

  it('RPL-013: the places list filters locally and shows address or category', async () => {
    renderPlanner(zigzag(), {
      locations: [
        place({ id: 1, name: 'Cafe Roma', address: 'Via Roma 1' }),
        place({ id: 2, name: 'Cafe Roma', address: 'Corso 9', category: { name: 'Restaurant' } as Location['category'] }),
        place({ id: 3, name: 'Museum' }),
      ],
    });
    await screen.findByText('Lisbon');
    fireEvent.click(screen.getByRole('button', { name: "This trip's places" }));

    expect(screen.getByText(/Via Roma 1/)).toBeInTheDocument();
    expect(screen.getByText(/Restaurant/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Add a stop from this trip/), { target: { value: 'museum' } });
    expect(screen.queryByText(/Via Roma 1/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Museum/ })).toBeInTheDocument();
    expect(geocodingService.searchPlaces).not.toHaveBeenCalled();
  });

  it('RPL-014: places without coordinates are disabled with a reason and never sent', async () => {
    renderPlanner(zigzag(), {
      locations: [place({ id: 8, name: 'Secret beach', latitude: null, longitude: null })],
    });
    await screen.findByText('Lisbon');
    fireEvent.click(screen.getByRole('button', { name: "This trip's places" }));

    const button = await screen.findByRole('button', { name: /Secret beach/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/No coordinates/);
    fireEvent.click(button);
    expect(mocks.createStop).not.toHaveBeenCalled();
  });

  it('RPL-015: places already on the route are marked, and can still be added again', async () => {
    const linked = { ...stop(1, 'Rome', 41.9, 12.5), locationId: 7 };
    mocks.createStop.mockResolvedValue({ ...stop(2, 'Rome', 41.9, 12.5), locationId: 7 });
    renderPlanner([linked, stop(3, 'Paris', 48.86, 2.35)], {
      locations: [place({ id: 7, name: 'Rome' }), place({ id: 9, name: 'Siena' })],
    });
    await screen.findByText('Paris');
    fireEvent.click(screen.getByRole('button', { name: "This trip's places" }));

    expect(screen.getByText('Already a stop')).toBeInTheDocument();
    const rome = screen.getByRole('button', { name: /^Rome/ });
    expect(rome).toBeEnabled();
    fireEvent.click(rome);

    await waitFor(() =>
      expect(mocks.createStop).toHaveBeenCalledWith(TRIP_ID, expect.objectContaining({ locationId: 7 }))
    );
  });

  it('RPL-016: a linked stop links to its saved place and a repeat is a return visit', async () => {
    renderPlanner([
      { ...stop(1, 'Rome', 41.9, 12.5), locationId: 7 },
      stop(2, 'Paris', 48.86, 2.35),
      { ...stop(3, 'Rome', 41.9, 12.5), locationId: 7 },
    ]);
    await screen.findByText('Paris');

    const links = screen.getAllByRole('link', { name: /Open Rome/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', `/trips/${TRIP_ID}?tab=locations&highlight=7`);
    expect(screen.getAllByText('Return visit')).toHaveLength(1);
  });

  it('RPL-017: a view-only viewer sees the plan but no editing controls', async () => {
    vi.mocked(collaborationService.getPermissionLevel).mockResolvedValue({
      isOwner: false,
      permissionLevel: 'view',
    });
    renderPlanner(zigzag());

    await screen.findByText('Lisbon');
    // Give the permission query time to settle so a late edit control would show.
    await waitFor(() => expect(collaborationService.getPermissionLevel).toHaveBeenCalled());

    expect(listNames()).toEqual(['Lisbon', 'Warsaw', 'Madrid', 'Berlin', 'Paris']);
    expect(screen.getByTestId('route-map')).toBeInTheDocument();
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('Nights')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /^Reorder / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move .* (earlier|later)$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Optimise route' })).not.toBeInTheDocument();
    expect(screen.queryByText('Optimise route')).not.toBeInTheDocument();
    expect(screen.queryByText('Keep first stop')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it('RPL-018: no editing controls flash while the permission is loading', async () => {
    vi.mocked(collaborationService.getPermissionLevel).mockReturnValue(new Promise(() => {}));
    renderPlanner(zigzag());

    await screen.findByText('Lisbon');

    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Optimise route' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('RPL-017b: an editor still gets the editing controls', async () => {
    renderPlanner(zigzag());

    expect(await screen.findByRole('button', { name: 'Remove Lisbon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Lisbon later' })).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Optimise route' })).toBeInTheDocument();
  });
  describe('road distances', () => {
    const legFor = (from: number, to: number, distanceKm: number, durationMinutes: number | null, routed: boolean) => ({
      fromStopId: from,
      toStopId: to,
      distanceKm,
      durationMinutes,
      routed,
    });
    const allRouted = () => ({
      profile: 'driving-car',
      legs: [
        legFor(1, 2, 340, 240, true),
        legFor(2, 3, 290, 180, true),
        legFor(3, 4, 230, 150, true),
        legFor(4, 5, 105, 60, true),
      ],
    });

    it('RPL-019: straight-line legs are labelled', async () => {
      renderPlanner(regional());
      await screen.findByText('Munich');

      const leg = screen.getByLabelText(/from Munich to Salzburg/);
      expect(leg).toHaveTextContent(/^\s*≈\s*[\d,]+ km/);
      expect(leg).toHaveTextContent('straight line');
      expect(screen.getAllByText('straight line')).toHaveLength(4);
      expect(screen.getByText('Distance').parentElement).toHaveTextContent(/^Distance≈/);
      expect(screen.getByText(/Distances are straight-line/)).toBeInTheDocument();
    });

    it('RPL-020: routed legs show road distance and drive time with no straight-line label', async () => {
      mocks.getLegs.mockResolvedValue(allRouted());
      renderPlanner(regional());
      await screen.findByText('Munich');

      await waitFor(() => expect(screen.queryByText('straight line')).not.toBeInTheDocument());
      const leg = screen.getByLabelText(/from Munich to Salzburg/);
      expect(leg).toHaveTextContent('340 km');
      expect(leg).toHaveTextContent('4 h drive');
      expect(leg).not.toHaveTextContent('≈');
      expect(leg).not.toHaveTextContent('(est.)');
      const totals = screen.getByText('Distance').parentElement!;
      expect(totals).toHaveTextContent('965 km');
      expect(totals).not.toHaveTextContent('≈');
      expect(screen.getByText(/Driving legs show road distances and driving times\./)).toBeInTheDocument();
    });

    it('RPL-021: only the straight-line legs are labelled in a mixed result', async () => {
      mocks.getLegs.mockResolvedValue({
        profile: 'driving-car',
        legs: [
          legFor(1, 2, 340, 240, true),
          legFor(2, 3, 290, null, false),
          legFor(3, 4, 230, 150, true),
          legFor(4, 5, 105, null, false),
        ],
      });
      renderPlanner(regional());
      await screen.findByText('Munich');

      await waitFor(() => expect(screen.getAllByText('straight line')).toHaveLength(2));
      expect(screen.getByLabelText(/from Munich to Salzburg/)).not.toHaveTextContent('straight line');
      expect(screen.getByLabelText(/from Salzburg to Vienna/)).toHaveTextContent('straight line');
      expect(screen.getByLabelText(/from Budapest to Prague/)).toHaveTextContent('straight line');
      expect(screen.getByText(/2 of 4 driving legs are straight-line estimates/)).toBeInTheDocument();
      expect(screen.getByText('Distance').parentElement).toHaveTextContent(/≈/);
    });

    it('RPL-022: road distances follow the units setting', async () => {
      setSystem('imperial');
      mocks.getLegs.mockResolvedValue(allRouted());
      renderPlanner(regional());
      await screen.findByText('Munich');

      await waitFor(() => expect(screen.queryByText('straight line')).not.toBeInTheDocument());
      const leg = screen.getByLabelText(/from Munich to Salzburg/);
      expect(leg).toHaveTextContent(/2\d\d mi/);
      expect(leg).not.toHaveTextContent(/ km/);
    });

    it('RPL-023: a failed legs request keeps the straight-line values', async () => {
      mocks.getLegs.mockRejectedValue(new Error('boom'));
      renderPlanner(regional());
      await screen.findByText('Munich');

      await waitFor(() => expect(mocks.getLegs).toHaveBeenCalled());
      expect(screen.getAllByText('straight line')).toHaveLength(4);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('RPL-024: the optimise preview compares straight-line distances', async () => {
      mocks.getLegs.mockResolvedValue(allRouted());
      renderPlanner(zigzag());
      await screen.findByText('Lisbon');

      fireEvent.click(screen.getByRole('button', { name: 'Optimise route' }));
      const region = await screen.findByRole('region', { name: 'Proposed route' });
      expect(region).toHaveTextContent('Compared by straight-line distance.');
    });

    it('RPL-025: a flight leg shows its distance and no time, and the totals leave it out', async () => {
      renderPlanner(mixed());
      await screen.findByText('Munich');

      const flight = screen.getByLabelText(/from Salzburg to Lisbon/);
      expect(flight.getAttribute('aria-label')).toMatch(/^Flight leg, /);
      expect(flight.getAttribute('aria-label')).not.toMatch(/about|\bmin\b|\d h\b/);
      expect(flight).toHaveTextContent(/[\d,]+ km/);
      expect(flight).toHaveTextContent('by air');
      expect(flight).not.toHaveTextContent(/drive|flight \(est|\bmin\b|\d h\b|straight line/);

      // The drive legs still show estimates; the flight is not in the travel total.
      expect(screen.getByLabelText(/from Munich to Salzburg/)).toHaveTextContent(/~.*drive \(est\.\)/);
      const travel = screen.getByText(/^Travel/).parentElement!;
      expect(travel).toHaveTextContent('plus 1 flight');
      expect(travel).not.toHaveTextContent('flights');
      // About 117 km and 500 km of road at 70 km/h with a 1.3 detour: well under a day, far from a flight's hours.
      expect(travel).toHaveTextContent(/~\d+ h/);
      // The distance total still includes the flight (over 2,000 km).
      expect(screen.getByText('Distance').parentElement).toHaveTextContent(/2,\d{3} km/);
      expect(screen.getByText(/shown as flights, by air, with no time estimate/)).toBeInTheDocument();
      expect(screen.queryByText(/airport time/)).not.toBeInTheDocument();
    });

    it('RPL-025b: with only flights the travel total is a dash plus the flight count', async () => {
      renderPlanner(zigzag());
      await screen.findByText('Lisbon');

      const travel = screen.getByText(/^Travel/).parentElement!;
      expect(travel).toHaveTextContent('plus 4 flights');
      expect(travel).toHaveTextContent('—');
      expect(travel).not.toHaveTextContent(/~|\bmin\b|\d h\b/);
    });

    it('RPL-026: a routed result never replaces a flight leg with a road drive time', async () => {
      // The server marks the flight leg (mode) and, to be hostile, even sends road-looking figures.
      mocks.getLegs.mockResolvedValue({
        profile: 'driving-car',
        legs: [
          legFor(1, 2, 117, 90, true),
          { ...legFor(2, 3, 2900, 2400, true), mode: 'flight' },
          legFor(3, 4, 630, 400, true),
        ],
      });
      renderPlanner(mixed());
      await screen.findByText('Munich');

      await waitFor(() => expect(screen.getByLabelText(/from Munich to Salzburg/)).toHaveTextContent('1 h 30 min drive'));
      const flight = screen.getByLabelText(/from Salzburg to Lisbon/);
      expect(flight.getAttribute('aria-label')).toMatch(/^Flight leg, /);
      expect(flight).toHaveTextContent('by air');
      expect(flight).not.toHaveTextContent(/drive|\bmin\b|\d h\b/);
      expect(screen.getByText(/^Travel/).parentElement).toHaveTextContent('plus 1 flight');
    });

    it('RPL-026b: an older server without mode is classified by the browser', async () => {
      mocks.getLegs.mockResolvedValue({
        profile: 'driving-car',
        legs: [legFor(1, 2, 117, 90, true), legFor(2, 3, 2900, 2400, true), legFor(3, 4, 630, 400, true)],
      });
      renderPlanner(mixed());
      await screen.findByText('Munich');

      await waitFor(() => expect(screen.getByLabelText(/from Munich to Salzburg/)).toHaveTextContent('1 h 30 min drive'));
      const flight = screen.getByLabelText(/from Salzburg to Lisbon/);
      expect(flight).toHaveTextContent('by air');
      expect(flight).not.toHaveTextContent(/drive|\bmin\b|\d h\b/);
    });

    it('RPL-027: drive legs keep the straight-line estimate when unrouted', async () => {
      renderPlanner(regional());
      await screen.findByText('Munich');

      const leg = screen.getByLabelText(/from Munich to Salzburg/);
      expect(leg).toHaveTextContent(/~.*drive \(est\.\)/);
      expect(leg.getAttribute('aria-label')).toMatch(/^Straight-line estimate, .*about .* by road/);
      expect(screen.getByText(/^Travel/).parentElement).not.toHaveTextContent('plus');
    });
  });
});
