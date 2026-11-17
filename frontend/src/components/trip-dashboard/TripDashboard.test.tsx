/**
 * TripDashboard: one clock, not two.
 *
 * - TDC-001: the local time widget is hidden while the Today card shows its own clocks
 * - TDC-002: the local time widget shows when the Today card is not showing clocks
 * - TDC-003: a domestic trip never shows the local time widget
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { useEffect } from 'react';
import TripDashboard from './TripDashboard';
import { createMockTrip } from '../../test/fixtures';
import { TripStatus } from '../../types/trip';
import type { Checklist } from '../../types/checklist';

const HOME_ZONE = 'America/New_York';

vi.mock('../../hooks/useTimezoneResolver', () => ({
  useTimezoneResolver:
    () =>
    (...candidates: Array<string | null | undefined>) =>
      candidates.find((candidate) => candidate) ?? HOME_ZONE,
}));

// What the Today card reports is under test elsewhere; here it is just a switch.
let todayShowsClocks = true;
vi.mock('./TodayModeCard', () => ({
  default: function MockTodayModeCard({
    onClocksShownChange,
  }: {
    onClocksShownChange?: (shown: boolean) => void;
  }) {
    useEffect(() => {
      onClocksShownChange?.(todayShowsClocks);
    }, [onClocksShownChange]);
    return <div data-testid="today-card" />;
  },
}));

// The rest of the overview is irrelevant to this behaviour.
vi.mock('../TripStats', () => ({ default: () => null }));
vi.mock('./RecentActivityCard', () => ({ default: () => null }));
vi.mock('./TodaysItinerary', () => ({ default: () => null }));
vi.mock('./ChecklistsWidget', () => ({
  default: ({ onNavigateToChecklists }: { onNavigateToChecklists: () => void }) => (
    <button onClick={onNavigateToChecklists}>Go to Checklists</button>
  ),
}));
vi.mock('./CompanionsWidget', () => ({ default: () => null }));
vi.mock('./MapPreviewWidget', () => ({ default: () => null }));
vi.mock('./CountdownTimerWidget', () => ({ default: () => null }));
vi.mock('./BudgetSummaryWidget', () => ({ default: () => null }));
vi.mock('./WeatherForecastWidget', () => ({ default: () => null }));
vi.mock('./FlightStatusWidget', () => ({ default: () => null }));
vi.mock('./TripDayByDay', () => ({ default: () => null }));
vi.mock('./UpcomingBookings', () => ({ default: () => null }));
vi.mock('../TripHealthCheck', () => ({ default: () => null }));
vi.mock('./LocalTimeWidget', () => ({ default: () => <div data-testid="local-time-widget" /> }));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderDashboard(timezone: string, checklists: Checklist[] = []) {
  return render(
    <MemoryRouter initialEntries={['/trips/1']}>
      <LocationProbe />
      <Routes>
        <Route
          path="/trips/1"
          element={
    <TripDashboard
      trip={createMockTrip({ status: TripStatus.IN_PROGRESS, timezone })}
      activities={[]}
      transportation={[]}
      lodging={[]}
      locations={[]}
      journalEntries={[]}
      photos={[]}
      photosCount={0}
      checklists={checklists}
      companions={[]}
      onNavigateToTab={vi.fn()}
      onToggleChecklistItem={vi.fn()}
      onNavigateToEntity={vi.fn()}
    />
          }
        />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TripDashboard clocks', () => {
  beforeEach(() => {
    todayShowsClocks = true;
  });

  it('TDC-001: hides the local time widget while the Today card shows its clocks', () => {
    renderDashboard('Europe/Paris');
    expect(screen.getByTestId('today-card')).toBeInTheDocument();
    expect(screen.queryByTestId('local-time-widget')).not.toBeInTheDocument();
  });

  it('TDC-002: shows the local time widget when the Today card has no clocks', () => {
    todayShowsClocks = false;
    renderDashboard('Europe/Paris');
    expect(screen.getByTestId('local-time-widget')).toBeInTheDocument();
  });

  it('TDC-003: a trip in the home timezone never shows the local time widget', () => {
    todayShowsClocks = false;
    renderDashboard(HOME_ZONE);
    expect(screen.queryByTestId('local-time-widget')).not.toBeInTheDocument();
  });

  it('opens the checklists pages from the checklists card', async () => {
    const user = userEvent.setup();
    const list = (id: number) => ({ id, name: `List ${id}` }) as Checklist;

    const single = renderDashboard('Europe/Paris', [list(5)]);
    await user.click(screen.getByRole('button', { name: 'Go to Checklists' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/checklists/5');
    single.unmount();

    renderDashboard('Europe/Paris', [list(5), list(6)]);
    await user.click(screen.getByRole('button', { name: 'Go to Checklists' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/checklists$/);
  });
});
