import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import TripActionsMenu from '../TripActionsMenu';
import type { Trip } from '../../types/trip';

const makeTrip = (archived: boolean) => ({ id: 7, title: 'Lisbon', archived }) as unknown as Trip;

function setup(trip: Trip) {
  const onArchiveToggle = vi.fn();
  const onDelete = vi.fn();
  render(
    <MemoryRouter>
      <TripActionsMenu trip={trip} onArchiveToggle={onArchiveToggle} onDelete={onDelete} />
    </MemoryRouter>
  );
  return { onArchiveToggle, onDelete };
}

describe('TripActionsMenu', () => {
  it('offers Archive for an active trip and calls back, closing the menu', async () => {
    const user = userEvent.setup();
    const { onArchiveToggle } = setup(makeTrip(false));
    await user.click(screen.getByRole('button', { name: 'Actions for Lisbon' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onArchiveToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers Unarchive for an archived trip', async () => {
    const user = userEvent.setup();
    setup(makeTrip(true));
    await user.click(screen.getByRole('button', { name: 'Actions for Lisbon' }));
    expect(screen.getByRole('menuitem', { name: 'Unarchive' })).toBeTruthy();
  });

  it('calls onDelete with the trip id', async () => {
    const user = userEvent.setup();
    const { onDelete } = setup(makeTrip(false));
    await user.click(screen.getByRole('button', { name: 'Actions for Lisbon' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(7);
  });
});
