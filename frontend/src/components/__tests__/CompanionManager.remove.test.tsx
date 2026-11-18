/**
 * CompanionManager: removing a companion from a trip asks first.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanionManager from '../CompanionManager';
import companionService from '../../services/companion.service';

vi.mock('../../services/companion.service', () => {
  const svc = {
    getCompanionsByTrip: vi.fn(),
    getCompanionsByUser: vi.fn(),
    unlinkCompanionFromTrip: vi.fn(),
  };
  return { default: svc, companionService: svc };
});

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

const companion = {
  id: 7,
  name: 'Alexandria Montgomery-Fitzgerald',
  isMyself: false,
  dietaryPreferences: [],
};

describe('CompanionManager remove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(companionService.getCompanionsByTrip).mockResolvedValue([companion] as never);
    vi.mocked(companionService.getCompanionsByUser).mockResolvedValue([companion] as never);
    vi.mocked(companionService.unlinkCompanionFromTrip).mockResolvedValue(undefined as never);
  });

  it('does not unlink until the confirmation is accepted', async () => {
    const user = userEvent.setup();
    render(<CompanionManager tripId={1} />);

    await user.click(await screen.findByRole('button', { name: /Remove companion Alexandria/ }));
    expect(companionService.unlinkCompanionFromTrip).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(companionService.unlinkCompanionFromTrip).toHaveBeenCalledWith(1, 7)
    );
  });

  it('keeps the companion when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    render(<CompanionManager tripId={1} />);

    await user.click(await screen.findByRole('button', { name: /Remove companion Alexandria/ }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(companionService.unlinkCompanionFromTrip).not.toHaveBeenCalled();
  });
});
