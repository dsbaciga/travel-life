/**
 * Navbar mobile menu tests
 *
 * Test cases:
 * - NAV-001: The mobile menu opens and shows the links, Settings and Logout
 * - NAV-002: The drawer and its overlay are not inside the backdrop-blurred <nav>
 * - NAV-003: Choosing Settings or the overlay closes the menu
 *
 * NAV-002 is the regression guard. A backdrop-filter makes an element the
 * containing block for position:fixed descendants, so a drawer inside the nav is
 * sized to the 64px navbar instead of the screen (a short panel whose link list
 * collapses to nothing, with no dimming over the page). jsdom does not lay
 * anything out, so the test checks the structure that causes it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../store/authStore', () => ({
  useUser: () => ({ id: 1, username: 'Daniel', email: 'daniel@example.com' }),
  useLogout: () => vi.fn(),
}));
vi.mock('../../store/scrollStore', () => ({ useClearPosition: () => vi.fn() }));
vi.mock('../../services/pdfImport.service', () => ({
  default: { getPendingCount: vi.fn(async () => ({ count: 0 })) },
}));
vi.mock('../../services/savedLink.service', () => ({
  default: { getInboxCount: vi.fn(async () => ({ count: 0 })) },
}));
vi.mock('../GlobalSearch', () => ({ default: () => null }));
vi.mock('../BrandLogo', () => ({ default: () => null }));

import Navbar from '../Navbar';

function renderNavbar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

describe('Navbar mobile menu', () => {
  it('NAV-001: opens and shows the links, Settings and Logout', () => {
    renderNavbar();
    openMenu();

    const menu = screen.getByRole('navigation', { name: 'Menu' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  it('NAV-002: the drawer and overlay are not inside the backdrop-blurred nav', () => {
    const { container } = renderNavbar();
    openMenu();

    const blurredBar = container.querySelector('nav.backdrop-blur-md');
    expect(blurredBar).not.toBeNull();

    const settings = screen.getByRole('link', { name: 'Settings' });
    const drawerLinks = screen.getByRole('navigation', { name: 'Menu' });
    expect(blurredBar?.contains(settings)).toBe(false);
    expect(blurredBar?.contains(drawerLinks)).toBe(false);

    const overlay = container.querySelector('div.fixed.inset-0');
    expect(overlay).not.toBeNull();
    expect(blurredBar?.contains(overlay)).toBe(false);
  });

  it('NAV-003: choosing Settings or the overlay closes the menu', () => {
    const { container } = renderNavbar();

    openMenu();
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(container.querySelector('div.fixed.inset-0')).toBeNull();

    openMenu();
    expect(container.querySelector('div.fixed.inset-0')).not.toBeNull();
    fireEvent.click(container.querySelector('div.fixed.inset-0') as Element);
    expect(container.querySelector('div.fixed.inset-0')).toBeNull();
  });
});
