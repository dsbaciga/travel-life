/**
 * TripHeaderActions: the phone overflow menu.
 *
 * Every item closes the menu, and the menu's contents are unmounted when it
 * closes. An item that opens a dialog must therefore keep that dialog outside
 * the menu, or the dialog is unmounted in the same click that opened it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripHeaderActions from '../TripHeaderActions';

const renderActions = (overrides: Partial<React.ComponentProps<typeof TripHeaderActions>> = {}) => {
  const props = {
    tripId: 7,
    tagsCount: 2,
    onManageTags: vi.fn(),
    onShare: vi.fn(),
    onDuplicate: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TripHeaderActions {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return props;
};

describe('TripHeaderActions phone menu', () => {
  it('opens the PDF import dialog and keeps it open after the menu closes', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Trip actions' }));
    const menu = screen.getByRole('menu');
    await user.click(within(menu, 'Import PDF'));

    // The menu is gone...
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // ...and the dialog it launched is still there.
    expect(await screen.findByText('Drop a booking confirmation PDF here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload & Parse' })).toBeInTheDocument();
  });

  it('opens the CSV import dialog and keeps it open after the menu closes', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Trip actions' }));
    await user.click(within(screen.getByRole('menu'), 'Import CSV'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(await screen.findByText('What are you importing?')).toBeInTheDocument();
  });

  it('closes the PDF import dialog on Cancel', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: 'Trip actions' }));
    await user.click(within(screen.getByRole('menu'), 'Import PDF'));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Drop a booking confirmation PDF here')).not.toBeInTheDocument();
  });

  it('runs the other menu actions and closes the menu', async () => {
    const user = userEvent.setup();
    const props = renderActions();

    await user.click(screen.getByRole('button', { name: 'Trip actions' }));
    await user.click(within(screen.getByRole('menu'), 'Duplicate trip'));

    expect(props.onDuplicate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

/** The item with this text inside the phone menu (the inline buttons repeat the labels). */
function within(menu: HTMLElement, text: string): HTMLElement {
  const match = Array.from(menu.querySelectorAll<HTMLElement>('button, a')).find((el) =>
    el.textContent?.trim().startsWith(text)
  );
  if (!match) throw new Error(`No menu item "${text}"`);
  return match;
}
