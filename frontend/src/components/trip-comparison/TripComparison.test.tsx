/**
 * Trip comparison component tests
 *
 * Test cases:
 * - TCC-001: the table shows every metric per trip and reports excluded amounts
 * - TCC-002: date-only values are shown as the stored calendar day
 * - TCC-003: the timeline lists overlapping trips in text, not only by colour
 * - TCC-004: the page keeps the selection in the URL and gates on two trips
 * - TCC-005: the map legend names each trip and one marker is drawn per location
 * - TCC-006: total distance follows the user's Units setting (the API stays in km)
 * - TCC-007: cost per day is shown beside the total, with the excluded-amount caveat
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TripComparison, TripComparisonTrip } from '../../types/tripComparison';
import { useAuthStore } from '../../store/authStore';

vi.mock('../../services/trip.service', () => ({
  default: {
    getTrips: vi.fn(async () => ({
      trips: [
        { id: 1, title: 'Japan', startDate: '2025-03-01', endDate: '2025-03-10' },
        { id: 2, title: 'Peru', startDate: '2025-03-08', endDate: '2025-03-20' },
      ],
      total: 2,
      page: 1,
      limit: 1000,
      totalPages: 1,
    })),
  },
}));
vi.mock('../../services/collaboration.service', () => ({
  default: {
    getSharedTrips: vi.fn(async () => [
      { id: 3, title: 'Shared Iceland', startDate: null, endDate: null },
    ]),
  },
}));
const compareMock = vi.fn();
vi.mock('../../services/tripComparison.service', () => ({
  default: { compare: (ids: number[]) => compareMock(ids) },
}));
vi.mock('@changey/react-leaflet-markercluster', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import ComparisonTable from './ComparisonTable';
import ComparisonTimeline from './ComparisonTimeline';
import ComparisonMap from './ComparisonMap';
import TripComparisonPage from '../../pages/TripComparisonPage';

function makeTrip(id: number, overrides: Partial<TripComparisonTrip> = {}): TripComparisonTrip {
  return {
    id,
    title: `Trip ${id}`,
    status: 'Completed',
    startDate: '2025-03-01',
    endDate: '2025-03-10',
    days: 10,
    countryCode: 'JP',
    isOwner: true,
    locationCount: 2,
    activityCount: 5,
    photoCount: 40,
    transportationCount: 3,
    totalDistanceKm: 1200.5,
    cost: {
      currency: 'USD',
      spent: 1000,
      costPerDay: 100,
      breakdown: { lodging: 1000, transportation: 0, activities: 0, food: 0, other: 0 },
      summaryCurrency: 'USD',
      restated: false,
      unconverted: [],
      excludedTotal: null,
      isComplete: true,
    },
    ...overrides,
  };
}

function makeComparison(): TripComparison {
  return {
    currency: 'USD',
    trips: [
      makeTrip(1, { title: 'Japan' }),
      makeTrip(2, {
        title: 'Peru',
        startDate: '2025-03-08',
        endDate: '2025-03-20',
        days: 13,
        cost: {
          currency: 'USD',
          spent: null,
          costPerDay: null,
          breakdown: null,
          summaryCurrency: 'EUR',
          restated: false,
          unconverted: [{ currency: 'ISK', amount: 9000, count: 2 }],
          excludedTotal: { currency: 'EUR', amount: 500 },
          isComplete: false,
        },
      }),
    ],
    locations: [
      { id: 10, tripId: 1, name: 'Tokyo', address: null, latitude: 35.68, longitude: 139.69 },
      { id: 11, tripId: 2, name: 'Cusco', address: null, latitude: -13.53, longitude: -71.97 },
    ],
  };
}

function renderWithRouter(ui: ReactNode, initial = '/trips/compare') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function LocationProbe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

describe('trip comparison components', () => {
  const setSystem = (measurementSystem: 'imperial' | 'metric') =>
    useAuthStore.setState({
      user: { id: 1, username: 'u', email: 'u@x.y', avatarUrl: null, measurementSystem },
    });

  beforeEach(() => {
    compareMock.mockReset();
    setSystem('metric');
  });

  it('TCC-001: table shows metrics per trip and reports excluded amounts', () => {
    renderWithRouter(<ComparisonTable comparison={makeComparison()} />);

    const table = screen.getByTestId('comparison-table');
    expect(within(table).getByRole('link', { name: 'Japan' })).toHaveAttribute('href', '/trips/1');
    expect(within(table).getByText('10 days')).toBeInTheDocument();
    expect(within(table).getAllByText('1,201 km')).toHaveLength(2);
    expect(within(table).getByText('$1,000')).toBeInTheDocument();
    expect(within(table).getByText('Not available')).toBeInTheDocument();
    expect(within(table).getByText(/left out: no exchange rate to USD/)).toBeInTheDocument();
    expect(within(table).getByText(/2 items\) left out/)).toBeInTheDocument();
  });

  it('TCC-002: date-only values are not shifted by the local zone', () => {
    renderWithRouter(<ComparisonTable comparison={makeComparison()} />);
    expect(screen.getByText(/Mar 1, 2025 – Mar 10, 2025/)).toBeInTheDocument();
  });

  it('TCC-003: timeline names overlapping trips in text', () => {
    renderWithRouter(<ComparisonTimeline trips={makeComparison().trips} />);
    const summary = screen.getByTestId('timeline-summary');
    expect(summary).toHaveTextContent('Overlapping trips');
    expect(summary).toHaveTextContent('1. Japan and 2. Peru');
  });

  it('TCC-004: page keeps the selection in the URL and gates on two trips', async () => {
    compareMock.mockResolvedValue(makeComparison());
    renderWithRouter(
      <>
        <TripComparisonPage />
        <LocationProbe />
      </>
    );

    expect(await screen.findByLabelText(/Shared Iceland/)).toBeInTheDocument();
    expect(screen.getByText(/Shared with me/)).toBeInTheDocument();
    expect(screen.getByTestId('compare-hint')).toBeInTheDocument();
    expect(compareMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/Japan/));
    expect(compareMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Peru/));

    await waitFor(() => expect(compareMock).toHaveBeenCalledWith([1, 2]));
    expect(screen.getByTestId('search')).toHaveTextContent('?ids=1%2C2');
    expect(await screen.findByTestId('comparison-table')).toBeInTheDocument();
  });

  it('TCC-004b: page reads the selection from the URL and shows a rejected comparison', async () => {
    compareMock.mockRejectedValue({ message: 'Trip not found or access denied: 99' });
    renderWithRouter(<TripComparisonPage />, '/trips/compare?ids=1,99');

    await waitFor(() => expect(compareMock).toHaveBeenCalledWith([1, 99]));
    expect(await screen.findByRole('alert')).toHaveTextContent('access denied: 99');
  });

  it('TCC-005: map legend names each trip and one marker is drawn per location', async () => {
    const { container } = renderWithRouter(<ComparisonMap comparison={makeComparison()} />);

    const legend = screen.getByTestId('map-legend');
    expect(legend).toHaveTextContent('Japan');
    expect(legend).toHaveTextContent('Peru');
    await waitFor(() => {
      expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2);
    });
  });

  it('TCC-006: total distance follows the Units setting', () => {
    setSystem('imperial');
    renderWithRouter(<ComparisonTable comparison={makeComparison()} />);
    const table = screen.getByTestId('comparison-table');
    expect(within(table).getAllByText(/\d mi$/)).toHaveLength(2);
    expect(within(table).queryByText(/\d km$/)).not.toBeInTheDocument();
  });

  it('TCC-007: cost per day sits beside the total, and is a dash where the total is unavailable', () => {
    renderWithRouter(<ComparisonTable comparison={makeComparison()} />);
    const table = screen.getByTestId('comparison-table');
    const row = within(table).getByText(/^Cost per day/).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('$100');
    expect(cells[1]).toHaveTextContent('—');
    expect(within(table).getByText(/left out: no exchange rate to USD/)).toBeInTheDocument();
  });
});
