import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TodayModeCard, { TodayModeCardView } from './TodayModeCard';
import TodayClocks from './TodayClocks';
import type { Activity } from '../../types/activity';
import type { Transportation } from '../../types/transportation';
import type { Lodging } from '../../types/lodging';
import type { Location } from '../../types/location';
import { TripStatus, type TripStatusType } from '../../types/trip';
import type { MapsPlace } from '../../lib/mapsDeepLinks';
import entityLinkService from '../../services/entityLink.service';

// The user's own zone, which the real resolver reads from the auth session.
const HOME_ZONE = 'America/New_York';

vi.mock('../../hooks/useTimezoneResolver', () => ({
  useTimezoneResolver:
    () =>
    (...candidates: Array<string | null | undefined>) =>
      candidates.find((candidate) => candidate) ?? HOME_ZONE,
}));

// DirectionsButton fetches maps preferences; here we only need to see what it
// was asked to route.
vi.mock('../DirectionsButton', () => ({
  default: ({ destination, origin }: { destination: MapsPlace; origin?: MapsPlace | null }) => (
    <button type="button">
      Route to {destination.name ?? destination.address}
      {origin ? ` from ${origin.name ?? origin.address}` : ' from here'}
    </button>
  ),
}));

vi.mock('./NextUpCard', () => ({
  default: () => <div data-testid="existing-next-up-card" />,
}));

vi.mock('../../services/entityLink.service', () => ({
  default: { getLinksByTargetType: vi.fn() },
}));

const PARIS = 'Europe/Paris';
// 14:00 in Paris on 10 June 2026.
const NOW = '2026-06-10T12:00:00Z';

const activity = (over: Partial<Activity> & { id: number; name: string }): Activity => ({
  tripId: 1,
  parentId: null,
  locationId: null,
  description: null,
  category: null,
  allDay: false,
  startTime: null,
  endTime: null,
  timezone: PARIS,
  cost: null,
  currency: null,
  bookingUrl: null,
  bookingReference: null,
  notes: null,
  dietaryTags: null,
  manualOrder: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const leg = (over: Partial<Transportation> & { id: number }): Transportation => ({
  tripId: 1,
  type: 'train',
  fromLocationId: null,
  toLocationId: null,
  fromLocationName: null,
  toLocationName: null,
  departureTime: null,
  arrivalTime: null,
  startTimezone: PARIS,
  endTimezone: PARIS,
  carrier: null,
  vehicleNumber: null,
  confirmationNumber: null,
  cost: null,
  currency: null,
  notes: null,
  connectionGroupId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  loyaltyProgramId: null,
  ...over,
});

const stay = (over: Partial<Lodging> & { id: number; name: string }): Lodging => ({
  tripId: 1,
  locationId: null,
  type: 'hotel',
  address: null,
  checkInDate: null,
  checkOutDate: null,
  timezone: PARIS,
  confirmationNumber: null,
  cost: null,
  currency: null,
  bookingUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  loyaltyProgramId: null,
  ...over,
});

const place = (over: Partial<Location> & { id: number; name: string }): Location => ({
  tripId: 1,
  parentId: null,
  address: null,
  latitude: null,
  longitude: null,
  categoryId: null,
  visitDatetime: null,
  visitDurationMinutes: null,
  notes: null,
  isFavorite: false,
  excludeFromMap: false,
  openingHours: null,
  openingHoursSource: null,
  timezone: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

interface ViewProps {
  activities?: Activity[];
  transportation?: Transportation[];
  lodging?: Lodging[];
  locations?: Location[];
  locationLinks?: Array<{ sourceType: string; sourceId: number; targetId: number }>;
  tripStatus?: TripStatusType;
  tripStartDate?: string | null;
  onClocksShownChange?: (shown: boolean) => void;
}

function renderView(props: ViewProps = {}) {
  return render(
    <TodayModeCardView
      activities={props.activities ?? []}
      transportation={props.transportation ?? []}
      lodging={props.lodging ?? []}
      locations={props.locations ?? []}
      locationLinks={props.locationLinks ?? []}
      tripStatus={props.tripStatus ?? TripStatus.IN_PROGRESS}
      tripStartDate={props.tripStartDate ?? '2026-06-08'}
      tripEndDate="2026-06-20"
      tripTimezone={PARIS}
      onNavigateToTab={vi.fn()}
      onClocksShownChange={props.onClocksShownChange}
    />
  );
}

const louvre = (over: Partial<Activity> = {}) =>
  activity({
    id: 1,
    name: 'Louvre visit',
    startTime: '2026-06-10T13:20:00Z',
    endTime: '2026-06-10T15:00:00Z',
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TodayModeCard countdown', () => {
  it('counts down to the next item', () => {
    renderView({ activities: [louvre()] });
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByText('Louvre visit')).toBeInTheDocument();
    expect(screen.getByTestId('countdown')).toHaveTextContent('in 1h 20m');
  });

  it('ticks with the clock and never refetches', () => {
    renderView({ activities: [louvre()] });
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(screen.getByTestId('countdown')).toHaveTextContent('in 1h 10m');
  });

  it('says "Now" while the item is in progress, and names what comes after', () => {
    renderView({
      activities: [
        louvre(),
        activity({ id: 2, name: 'Dinner', startTime: '2026-06-10T18:00:00Z' }),
      ],
    });
    act(() => {
      vi.advanceTimersByTime(90 * 60_000); // 13:30Z, inside the visit
    });
    expect(screen.getByText('Happening now')).toBeInTheDocument();
    expect(screen.getByTestId('countdown')).toHaveTextContent('Now');
    expect(screen.getByText(/Then:/)).toHaveTextContent('Dinner in 4h 30m');
  });

  it('moves on to the next item once the current one ends', () => {
    renderView({
      activities: [
        louvre(),
        activity({ id: 2, name: 'Dinner', startTime: '2026-06-10T18:00:00Z' }),
      ],
    });
    act(() => {
      vi.advanceTimersByTime(4 * 60 * 60_000); // 16:00Z, visit over
    });
    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.queryByText('Louvre visit')).not.toBeInTheDocument();
    expect(screen.getByTestId('countdown')).toHaveTextContent('in 2h');
  });

  it('shows the start in the zone of the item, with its abbreviation', () => {
    renderView({ activities: [louvre()] });
    // 13:20Z is 15:20 in Paris (CEST).
    expect(screen.getByText(/3:20 PM/)).toBeInTheDocument();
  });
});

describe('TodayModeCard details', () => {
  it('shows the confirmation number and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderView({ activities: [louvre({ bookingReference: ' LV-4821 ' })] });
    expect(screen.getByText('LV-4821')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy confirmation number/i }));
    });
    expect(writeText).toHaveBeenCalledWith('LV-4821');
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('reports a failed copy instead of throwing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
      configurable: true,
    });
    renderView({ activities: [louvre({ bookingReference: 'LV-4821' })] });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy confirmation number/i }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
  });

  it('hides the confirmation row when the record has no number', () => {
    renderView({ activities: [louvre({ bookingReference: null })] });
    expect(screen.queryByText('Confirmation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy confirmation/i })).not.toBeInTheDocument();
  });

  it('hides the confirmation row when the number is only whitespace', () => {
    renderView({ activities: [louvre({ bookingReference: '   ' })] });
    expect(screen.queryByText('Confirmation')).not.toBeInTheDocument();
  });

  it('shows a transport leg\'s confirmation number', () => {
    renderView({
      transportation: [
        leg({
          id: 5,
          departureTime: '2026-06-10T13:20:00Z',
          fromLocationName: 'Gare du Nord',
          toLocationName: 'Brussels',
          confirmationNumber: 'TRAIN99',
        }),
      ],
    });
    expect(screen.getByText('Gare du Nord to Brussels')).toBeInTheDocument();
    expect(screen.getByText('TRAIN99')).toBeInTheDocument();
  });

  it('shows the lodging address and number on a check-in', () => {
    renderView({
      lodging: [
        stay({
          id: 3,
          name: 'Hotel Lumiere',
          address: '12 Rue de Rivoli, Paris',
          checkInDate: '2026-06-10T13:20:00Z',
          confirmationNumber: 'HL-77',
        }),
      ],
    });
    expect(screen.getByText('Check in: Hotel Lumiere')).toBeInTheDocument();
    expect(screen.getByTestId('next-up-address')).toHaveTextContent('12 Rue de Rivoli, Paris');
    expect(screen.getByText('HL-77')).toBeInTheDocument();
  });

  it('shows the address of the place linked to an activity', () => {
    renderView({
      activities: [louvre()],
      locations: [
        place({ id: 9, name: 'Louvre Museum', address: 'Rue de Rivoli, 75001 Paris', latitude: 48.86, longitude: 2.33 }),
      ],
      locationLinks: [{ sourceType: 'ACTIVITY', sourceId: 1, targetId: 9 }],
    });
    expect(screen.getByTestId('next-up-address')).toHaveTextContent('Rue de Rivoli, 75001 Paris');
  });
});

describe('TodayModeCard route', () => {
  it('routes from the nearest earlier item that has a place', () => {
    renderView({
      lodging: [
        stay({
          id: 3,
          name: 'Hotel Lumiere',
          address: '12 Rue de Rivoli, Paris',
          checkInDate: '2026-06-10T07:00:00Z',
        }),
      ],
      activities: [
        // No linked place: skipped as an origin.
        activity({ id: 4, name: 'Coffee', startTime: '2026-06-10T09:00:00Z', endTime: '2026-06-10T10:00:00Z' }),
        louvre(),
      ],
      locations: [place({ id: 9, name: 'Louvre Museum', latitude: 48.86, longitude: 2.33 })],
      locationLinks: [{ sourceType: 'ACTIVITY', sourceId: 1, targetId: 9 }],
    });
    expect(
      screen.getByRole('button', { name: 'Route to Louvre Museum from Hotel Lumiere' })
    ).toBeInTheDocument();
  });

  it('routes a transportation leg to its departure point, from where the last leg ended', () => {
    renderView({
      transportation: [
        leg({
          id: 5,
          type: 'flight',
          departureTime: '2026-06-10T06:00:00Z',
          arrivalTime: '2026-06-10T09:00:00Z',
          fromLocationName: 'Lisbon Airport',
          toLocationName: 'Paris CDG',
        }),
        leg({
          id: 6,
          departureTime: '2026-06-10T13:20:00Z',
          fromLocationName: 'Gare du Nord',
          toLocationName: 'Brussels',
        }),
      ],
    });
    expect(
      screen.getByRole('button', { name: 'Route to Gare du Nord from Paris CDG' })
    ).toBeInTheDocument();
  });

  it('offers no route when the item has no place at all', () => {
    renderView({ activities: [louvre()] });
    expect(screen.queryByRole('button', { name: /^Route to/ })).not.toBeInTheDocument();
  });
});

describe('TodayModeCard empty states', () => {
  it('shows the first item tomorrow when nothing is left today', () => {
    renderView({
      activities: [
        activity({ id: 1, name: 'Morning walk', startTime: '2026-06-10T07:00:00Z' }),
        activity({ id: 2, name: 'Breakfast', startTime: '2026-06-11T07:00:00Z' }),
      ],
    });
    expect(screen.getByText('Up next tomorrow')).toBeInTheDocument();
    expect(screen.getByText(/First up tomorrow/)).toBeInTheDocument();
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.queryByText('Morning walk')).not.toBeInTheDocument();
  });

  it('says nothing else is scheduled when only past items remain', () => {
    renderView({
      activities: [activity({ id: 1, name: 'Morning walk', startTime: '2026-06-10T07:00:00Z' })],
    });
    expect(screen.getByText('Nothing else is scheduled today.')).toBeInTheDocument();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
  });

  it('points at a later day without pretending it is tomorrow', () => {
    renderView({
      activities: [
        activity({ id: 1, name: 'Versailles', startTime: '2026-06-14T08:00:00Z' }),
        activity({ id: 2, name: 'Morning walk', startTime: '2026-06-10T07:00:00Z' }),
      ],
    });
    expect(screen.getByText('Nothing else is scheduled today.')).toBeInTheDocument();
    expect(screen.getByText(/Next: Versailles/)).toBeInTheDocument();
  });

  it('lists all-day items without a countdown', () => {
    renderView({
      activities: [
        activity({ id: 1, name: 'Free day', startTime: '2026-06-10T00:00:00Z', allDay: true }),
        louvre(),
      ],
    });
    expect(screen.getByText(/All day: Free day/)).toBeInTheDocument();
    expect(screen.getByText('Louvre visit')).toBeInTheDocument();
  });

  it('hands over to the existing card when the trip is not under way', () => {
    renderView({
      tripStatus: TripStatus.PLANNED,
      tripStartDate: '2026-07-01',
      activities: [louvre()],
    });
    expect(screen.getByTestId('existing-next-up-card')).toBeInTheDocument();
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
  });

  it('hands over to the existing card when the trip has nothing dated', () => {
    renderView({});
    expect(screen.getByTestId('existing-next-up-card')).toBeInTheDocument();
  });
});

describe('TodayModeCard offline', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    // The network is down: every request fails.
    vi.mocked(entityLinkService.getLinksByTargetType).mockRejectedValue(new Error('Network Error'));
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('renders the card and clocks from the data it was given when requests fail', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TodayModeCard
          tripId={1}
          activities={[louvre({ bookingReference: 'LV-4821' })]}
          transportation={[]}
          lodging={[]}
          locations={[]}
          tripStatus={TripStatus.IN_PROGRESS}
          tripStartDate="2026-06-08"
          tripEndDate="2026-06-20"
          tripTimezone={PARIS}
          onNavigateToTab={vi.fn()}
        />
      </QueryClientProvider>
    );

    // Let the failing request settle.
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Louvre visit')).toBeInTheDocument();
    expect(screen.getByTestId('countdown')).toHaveTextContent('in 1h 20m');
    expect(screen.getByText('LV-4821')).toBeInTheDocument();
    expect(screen.getByTestId('local-clock')).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/error|failed to load/i)).not.toBeInTheDocument();

    // And the countdown still moves with no network.
    act(() => {
      vi.advanceTimersByTime(20 * 60_000);
    });
    expect(screen.getByTestId('countdown')).toHaveTextContent('in 1h');
  });
});

describe('TodayModeCard clocks reporting', () => {
  it('reports true while it shows its own clocks, and false when it unmounts', () => {
    const onClocksShownChange = vi.fn();
    const { unmount } = renderView({ activities: [louvre()], onClocksShownChange });
    expect(screen.getByTestId('today-clocks')).toBeInTheDocument();
    expect(onClocksShownChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onClocksShownChange).toHaveBeenLastCalledWith(false);
  });

  it('reports false when it falls back to the existing Next Up card', () => {
    const onClocksShownChange = vi.fn();
    renderView({ activities: [], onClocksShownChange });
    expect(screen.getByTestId('existing-next-up-card')).toBeInTheDocument();
    expect(onClocksShownChange).toHaveBeenLastCalledWith(false);
    expect(onClocksShownChange).not.toHaveBeenCalledWith(true);
  });
});

describe('TodayClocks', () => {
  it('shows local and home time side by side when the offsets differ', () => {
    render(<TodayClocks now={new Date(NOW)} localTimezone={PARIS} homeTimezone={HOME_ZONE} />);
    expect(screen.getByTestId('local-clock')).toHaveTextContent('2:00 PM');
    expect(screen.getByTestId('home-clock')).toHaveTextContent('8:00 AM');
  });

  it('hides the home clock when both zones read the same right now', () => {
    render(<TodayClocks now={new Date(NOW)} localTimezone={PARIS} homeTimezone="Europe/Berlin" />);
    expect(screen.getByTestId('local-clock')).toHaveTextContent('2:00 PM');
    expect(screen.queryByTestId('home-clock')).not.toBeInTheDocument();
  });

  it('hides the home clock when the zone is the same', () => {
    render(<TodayClocks now={new Date(NOW)} localTimezone={HOME_ZONE} homeTimezone={HOME_ZONE} />);
    expect(screen.queryByTestId('home-clock')).not.toBeInTheDocument();
  });

  it('compares offsets at the current instant, not zone names', () => {
    // London and Abidjan share an offset in winter, and not in summer.
    const winter = render(
      <TodayClocks now={new Date('2026-01-15T12:00:00Z')} localTimezone="Europe/London" homeTimezone="Africa/Abidjan" />
    );
    expect(screen.queryByTestId('home-clock')).not.toBeInTheDocument();
    winter.unmount();

    render(
      <TodayClocks now={new Date('2026-07-15T12:00:00Z')} localTimezone="Europe/London" homeTimezone="Africa/Abidjan" />
    );
    expect(screen.getByTestId('home-clock')).toBeInTheDocument();
  });

  it('flags a home clock that is on a different day', () => {
    // 20:00Z: Tokyo has rolled over to Thursday, New York is still on Wednesday.
    render(
      <TodayClocks now={new Date('2026-06-10T20:00:00Z')} localTimezone="Asia/Tokyo" homeTimezone={HOME_ZONE} />
    );
    expect(screen.getByTestId('home-clock')).toHaveTextContent('Wed');
  });

  it('follows the clock as time passes', () => {
    const { rerender } = render(
      <TodayClocks now={new Date(NOW)} localTimezone={PARIS} homeTimezone={HOME_ZONE} />
    );
    rerender(
      <TodayClocks now={new Date('2026-06-10T12:07:00Z')} localTimezone={PARIS} homeTimezone={HOME_ZONE} />
    );
    expect(screen.getByTestId('local-clock')).toHaveTextContent('2:07 PM');
  });
});
