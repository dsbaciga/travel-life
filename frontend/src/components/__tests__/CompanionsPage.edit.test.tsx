/**
 * CompanionsPage: Edit opens the form in a dialog, so it is on screen wherever the page is scrolled.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import CompanionsPage from '../../pages/CompanionsPage';
import companionService from '../../services/companion.service';

vi.mock('../../services/companion.service', () => {
  const svc = { getCompanionsByUser: vi.fn(), updateCompanion: vi.fn() };
  return { default: svc, companionService: svc };
});
vi.mock('../../services/immich.service', () => ({
  default: { getAssets: vi.fn().mockRejectedValue(new Error('off')) },
}));
vi.mock('../../services/trip.service', () => ({ default: { getTrips: vi.fn() } }));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

const companions = [
  { id: 1, name: 'Zed', isMyself: false, email: 'zed@example.com', _count: { tripAssignments: 0 } },
];

describe('CompanionsPage edit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(companionService.getCompanionsByUser).mockResolvedValue(companions as never);
  });

  it('opens a prefilled dialog from Edit', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CompanionsPage />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Edit Zed' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Edit companion');
    expect(screen.getByLabelText('Name *')).toHaveValue('Zed');
  });
});
