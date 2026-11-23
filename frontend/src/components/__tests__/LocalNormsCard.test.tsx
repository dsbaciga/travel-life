/**
 * LocalNormsCard Component Tests
 *
 * Test IDs:
 * - NORMS-001: Single-country trip renders that country's norms from bundled data
 * - NORMS-002: Multi-country trip is first-class — a chip per country, switchable
 * - NORMS-003: Unresolved country offers a manual picker instead of an empty card
 * - NORMS-004: The stored Trip.countryCode drives what is shown
 * - NORMS-005: A stored choice outside the detected set is explained, not silent
 * - NORMS-006: Missing emergency numbers are "unconfirmed", never "no such service"
 * - NORMS-007: A country with no confirmed numbers at all still says so usefully
 * - NORMS-008: Mixed-grid countries (JP, BR) are not presented as uniform
 * - NORMS-009: Reverting to "detected" clears the stored override
 * - NORMS-010: Switching the viewed country never rewrites the shared override
 * - NORMS-011: A failed save is reported rather than silently swallowed
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LocalNormsCard from '../LocalNormsCard';
import tripService from '../../services/trip.service';
import toast from 'react-hot-toast';

vi.mock('../../services/trip.service', () => {
  const mockService = { updateTrip: vi.fn() };
  return { tripService: mockService, default: mockService };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const TRIP_ID = 42;

const JAPAN_ADDRESS = '1-1 Chiyoda, Chiyoda City, Tokyo, Japan';
const FRANCE_ADDRESS = '5 Avenue Anatole France, Paris, France';
const BRAZIL_ADDRESS = 'Avenida Atlantica, Rio de Janeiro, Brazil';
const UK_ADDRESS = '221B Baker Street, London, United Kingdom';
const UNRESOLVABLE_ADDRESS = 'Platform 9 3/4';

/** Locations only need an address — the component reads nothing else. */
const at = (address: string | null) => ({ address });

const mockUpdateTrip = vi.mocked(tripService.updateTrip);

/**
 * The country override now lives on the trip, so the card needs a query client
 * (it invalidates the trip after a write) and takes the stored code as a prop.
 */
function renderCard(
  locations: readonly { address: string | null }[],
  countryCode: string | null = null
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LocalNormsCard tripId={TRIP_ID} locations={locations} countryCode={countryCode} />
    </QueryClientProvider>
  );
}

describe('LocalNormsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateTrip.mockResolvedValue({} as never);
  });

  it('NORMS-001: renders the norms for a single-country trip', () => {
    renderCard([at(UK_ADDRESS)]);

    expect(screen.getByText(/Practical conventions in United Kingdom/i)).toBeInTheDocument();

    // Emergency number, plugs, voltage, water, driving side, tipping all present.
    // The UK routes all four services to 999, so all four rows render the number.
    const ukNumbers = screen.getAllByRole('link', { name: '999' });
    expect(ukNumbers).toHaveLength(4);
    expect(ukNumbers[0]).toHaveAttribute('href', 'tel:999');
    expect(screen.getByText('Type G')).toBeInTheDocument();
    expect(screen.getByText('230 V')).toBeInTheDocument();
    expect(screen.getByText('50 Hz')).toBeInTheDocument();
    expect(screen.getByText('Safe to drink')).toBeInTheDocument();
    expect(screen.getByText('Drives on the left')).toBeInTheDocument();
    expect(screen.getByText(/10-12.5% at restaurants/i)).toBeInTheDocument();

    // A single-country trip gets no chip row.
    expect(
      screen.queryByRole('group', { name: /Countries on this trip/i })
    ).not.toBeInTheDocument();
  });

  it('NORMS-002: treats a multi-country trip as first-class and switches between them', async () => {
    const user = userEvent.setup();
    renderCard([at(FRANCE_ADDRESS), at(JAPAN_ADDRESS), at(FRANCE_ADDRESS)]);

    const chips = screen.getByRole('group', { name: /Countries on this trip/i });
    const franceChip = within(chips).getByRole('button', { name: /France/i });
    const japanChip = within(chips).getByRole('button', { name: /Japan/i });

    // France has two locations to Japan's one, so it leads and is shown first.
    expect(franceChip).toHaveAttribute('aria-pressed', 'true');
    expect(japanChip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Practical conventions in France/i)).toBeInTheDocument();

    await user.click(japanChip);

    expect(screen.getByText(/Practical conventions in Japan/i)).toBeInTheDocument();
    expect(screen.getByText(/Do not tip/i)).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: /Japan/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('NORMS-003: offers a country picker rather than an empty card when nothing resolves', async () => {
    const user = userEvent.setup();
    renderCard([at(UNRESOLVABLE_ADDRESS), at(null)]);

    expect(screen.getByText(/could not work out which country/i)).toBeInTheDocument();
    // No norms are invented in the meantime.
    expect(screen.queryByRole('heading', { name: /Tap water/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Emergency numbers/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Choose a country/i), 'FR');

    // The choice is a correction to the trip, not a local toggle, so it is saved
    // to the one column the emergency card reads too.
    await waitFor(() => {
      expect(mockUpdateTrip).toHaveBeenCalledWith(TRIP_ID, { countryCode: 'FR' });
    });
  });

  it('NORMS-004: renders the country stored on the trip', () => {
    renderCard([at(UNRESOLVABLE_ADDRESS)], 'JP');

    expect(screen.getByText(/Practical conventions in Japan/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not work out which country/i)).not.toBeInTheDocument();
  });

  it('NORMS-005: explains a stored choice that disagrees with the detected countries', () => {
    renderCard([at(FRANCE_ADDRESS), at(JAPAN_ADDRESS)], 'BR');

    expect(screen.getByText(/Practical conventions in Brazil/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Showing Brazil because you chose it\..*France.*Japan/i)
    ).toBeInTheDocument();
  });

  it('NORMS-006: omits unknown emergency numbers and calls them unconfirmed, not absent', () => {
    // Japan's dataset entry has police/ambulance/fire but no universal number.
    renderCard([at(JAPAN_ADDRESS)]);

    expect(screen.getByRole('link', { name: '110' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '119' })).toHaveLength(2); // ambulance + fire

    // The unknown one is not rendered as a row at all...
    expect(screen.queryByText('All emergencies')).not.toBeInTheDocument();

    // ...and the reason is stated explicitly: unknown, not non-existent.
    const caveat = screen.getByText(/Not listed: all emergencies/i);
    expect(caveat).toHaveTextContent(/not that the service does not exist/i);

    // No "none"/"n\/a" style rendering anywhere in the card.
    expect(screen.queryByText(/^(none|n\/a|not available)$/i)).not.toBeInTheDocument();
  });

  it('NORMS-007: every country renders at least one number, so the empty fallback stays defensive', async () => {
    const { COUNTRY_FACTS } = await import('../../constants/countryFacts');

    // The "no confirmed numbers" copy in the card is a guard against a future
    // dataset edit. If this assertion ever fails, that path has gone live and
    // its wording deserves a fresh look rather than a silent blank section.
    const withoutAnyNumber = Object.values(COUNTRY_FACTS).filter(
      (facts) => Object.keys(facts.emergency).length === 0
    );
    expect(withoutAnyNumber).toEqual([]);

    renderCard([at(JAPAN_ADDRESS)]);
    expect(
      screen.queryByText(/is confirmed in this offline dataset/i)
    ).not.toBeInTheDocument();
  });

  it('NORMS-008: does not present mixed-grid countries as having one uniform supply', () => {
    // Japan: dataset records 50 Hz, but the west of the country runs 60 Hz.
    const japan = renderCard([at(JAPAN_ADDRESS)]);
    expect(screen.getByText('50 Hz')).toBeInTheDocument();
    expect(
      screen.getByText(/split grid.*50 Hz in the east.*60 Hz in the west/i)
    ).toBeInTheDocument();
    japan.unmount();

    // Brazil: dataset records 127 V, but much of the country is 220 V.
    const brazil = renderCard([at(BRAZIL_ADDRESS)]);
    expect(screen.getByText(/Practical conventions in Brazil/i)).toBeInTheDocument();
    expect(screen.getByText('127 V')).toBeInTheDocument();
    expect(screen.getByText(/mixed voltages.*127 V.*220 V/i)).toBeInTheDocument();
    brazil.unmount();

    // A single-grid country gets the generic caveat instead of a regional one.
    renderCard([at(UK_ADDRESS)]);
    expect(screen.getByText(/Dominant national values/i)).toBeInTheDocument();
    expect(screen.queryByText(/split grid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mixed voltages/i)).not.toBeInTheDocument();
  });

  it('NORMS-009: reverting to "detected" clears the stored override', async () => {
    const user = userEvent.setup();
    renderCard([at(FRANCE_ADDRESS)], 'BR');

    expect(screen.getByText(/Practical conventions in Brazil/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Show country/i), '');

    await waitFor(() => {
      expect(mockUpdateTrip).toHaveBeenCalledWith(TRIP_ID, { countryCode: null });
    });
  });

  it('NORMS-010: viewing another detected country does not rewrite the trip', async () => {
    const user = userEvent.setup();
    renderCard([at(FRANCE_ADDRESS), at(JAPAN_ADDRESS)]);

    const chips = screen.getByRole('group', { name: /Countries on this trip/i });
    await user.click(within(chips).getByRole('button', { name: /Japan/i }));

    expect(screen.getByText(/Practical conventions in Japan/i)).toBeInTheDocument();

    // Looking at Japan's norms on a France-and-Japan trip is a view, not a claim
    // that the trip is in Japan. Persisting it would silently move the emergency
    // card's numbers to the wrong country — and would need a network round-trip
    // for what must stay an offline interaction.
    expect(mockUpdateTrip).not.toHaveBeenCalled();
  });

  it('NORMS-011: reports a failed save instead of pretending it worked', async () => {
    const user = userEvent.setup();
    mockUpdateTrip.mockRejectedValue(new Error('offline'));

    renderCard([at(UNRESOLVABLE_ADDRESS)]);
    await user.selectOptions(screen.getByLabelText(/Choose a country/i), 'FR');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Couldn't save the country for this trip. Try again.");
    });
  });
});
