/**
 * Units tests
 *
 * Test cases:
 * - UNS-001: Settings shows the user's current system and a user with none stored sees the default
 * - UNS-002: Choosing metric saves it and updates the session without a reload
 * - UNS-003: A failed save leaves the session unchanged and reports it
 * - UNS-004: An existing page (transportation stats) shows distance in the chosen system
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';

vi.mock('../../services/user.service', () => ({
  default: { updateSettings: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import UnitsSetting from '../settings/UnitsSetting';
import TransportationStats from '../TransportationStats';
import userService from '../../services/user.service';
import { useAuthStore } from '../../store/authStore';
import { useUnits } from '../../hooks/useUnits';
import type { Transportation } from '../../types/transportation';

const setSystem = (measurementSystem?: 'imperial' | 'metric' | null) =>
  useAuthStore.setState({
    user: { id: 1, username: 'u', email: 'u@x.y', avatarUrl: null, measurementSystem },
  });

/** Shows what an unrelated screen would see from the session. */
function Probe() {
  return <span data-testid="probe">{useUnits().system}</span>;
}

describe('UnitsSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UNS-001: shows the stored system, and the default when none is stored', () => {
    setSystem('metric');
    const first = render(<UnitsSetting />);
    expect(screen.getByRole('radio', { name: /Metric/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Imperial/ })).not.toBeChecked();
    first.unmount();

    setSystem(null);
    render(<UnitsSetting />);
    expect(screen.getByRole('radio', { name: /Imperial/ })).toBeChecked();
  });

  it('UNS-002: choosing metric saves it and updates the session without a reload', async () => {
    vi.mocked(userService.updateSettings).mockResolvedValue({} as never);
    setSystem('imperial');
    render(
      <>
        <UnitsSetting />
        <Probe />
      </>
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('imperial');

    fireEvent.click(screen.getByRole('radio', { name: /Metric/ }));

    await waitFor(() => expect(userService.updateSettings).toHaveBeenCalledWith({ measurementSystem: 'metric' }));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('metric'));
    expect(useAuthStore.getState().user?.measurementSystem).toBe('metric');
    expect(screen.getByRole('radio', { name: /Metric/ })).toBeChecked();
  });

  it('UNS-003: a failed save leaves the session as it was', async () => {
    vi.mocked(userService.updateSettings).mockRejectedValue(new Error('offline'));
    setSystem('imperial');
    render(<UnitsSetting />);

    fireEvent.click(screen.getByRole('radio', { name: /Metric/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to save units'));
    expect(useAuthStore.getState().user?.measurementSystem).toBe('imperial');
    expect(screen.getByRole('radio', { name: /Imperial/ })).toBeChecked();
  });

  it('UNS-004: transportation stats show distance in the chosen system', () => {
    const flight = {
      id: 1,
      tripId: 1,
      type: 'flight',
      calculatedDistance: 1000,
      isUpcoming: false,
    } as unknown as Transportation;

    setSystem('metric');
    const metric = render(<TransportationStats transportation={[flight]} />);
    const headline = () =>
      Array.from(document.querySelectorAll('.text-2xl.font-bold')).map((el) => el.textContent);
    expect(headline()).toContain('1,000 km');
    expect(headline()).not.toContain('621 mi');
    expect(screen.getAllByText('621 mi').length).toBeGreaterThan(0); // the other system, as a hint
    metric.unmount();

    setSystem('imperial');
    render(<TransportationStats transportation={[flight]} />);
    expect(headline()).toContain('621 mi');
    expect(headline()).not.toContain('1,000 km');
    expect(screen.getAllByText('1,000 km').length).toBeGreaterThan(0); // hint
  });
});
